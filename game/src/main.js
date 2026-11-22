// The Midnight Teller — main.js
// The game loop and the state machine: title -> play -> crack -> caught ->
// play ... -> win. One state object is shared by every system; each module
// owns one job (world, guards, cameras, tools, render, audio, input).
// Screenshot mode: ?shot=<name> stages a deterministic pose and freezes
// the gameplay while the frame stays alive (pulses and glow keep moving).

import { CFG } from './config.js';
import { makeRng } from './random.js';
import {
  EXTRACTION,
  LOOT_DEFS,
  SPAWN,
  clampToFloor,
  inShadow,
  moveCircle,
  pointInRect,
} from './world.js';
import { attachInput } from './input.js';
import { SFX } from './audio.js';
import { makeGuards, updateGuards } from './guards.js';
import { makeCams, updateCams } from './cctv.js';
import {
  cancelCrack,
  crackTap,
  interactTarget,
  nearGrate,
  nearSafe,
  startCrack,
  startVent,
  updateCrack,
  updateTools,
  updateVent,
  useTool,
} from './tools.js';
import { draw } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '7');
const shotName = params.get('shot');

function freshState() {
  return {
    mode: 'title',
    time: 0,
    alarm: 0,
    maxAlarm: 0,
    loot: 0,
    bestLoot: 0,
    toolsUsed: 0,
    player: {
      x: SPAWN.x,
      y: SPAWN.y,
      r: CFG.PLAYER_R,
      dir: -Math.PI / 2,
      inVent: false,
      moving: false,
    },
    guards: makeGuards(),
    cams: makeCams(),
    lootItems: LOOT_DEFS.map((d) => ({ ...d, taken: false })),
    smokes: [],
    decoys: [],
    toolCd: [0, 0, 0],
    empT: 0,
    vaultOpen: false,
    crack: null,
    vent: null,
    caughtBy: null,
    caughtT: 0,
    flashRed: 0,
    toast: '',
    toastT: 0,
    interactPrompt: null,
    ghostBonus: false,
    finalScore: 0,
    rng: makeRng(seed),
    input: null,
    shot: null,
  };
}

const state = freshState();
state.input = attachInput(canvas);

if (shotName) {
  stageShot(state, shotName);
}

function resetRun() {
  const keepBest = state.bestLoot;
  const next = freshState();
  next.bestLoot = keepBest;
  next.input = state.input;
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
  state.mode = 'play';
}

function enterCaught() {
  state.mode = 'caught';
  state.caughtT = 0;
  state.flashRed = 1.4;
  state.loot = Math.floor(state.loot * CFG.CAUGHT_LOOT_KEEP);
  SFX.caught();
}

function respawn() {
  state.player.x = SPAWN.x;
  state.player.y = SPAWN.y;
  state.player.dir = -Math.PI / 2;
  state.player.inVent = false;
  state.vent = null;
  state.alarm = CFG.ALARM_CAUGHT_RESET;
  state.caughtBy = null;
  for (const g of state.guards) {
    g.state = 'patrol';
    g.stateT = 0;
    g.lastSeen = null;
    g.investigate = null;
  }
  state.mode = 'play';
}

function enterWin() {
  state.mode = 'win';
  state.ghostBonus = state.maxAlarm < CFG.GHOST_ALARM_MAX;
  state.finalScore = state.loot + (state.ghostBonus ? CFG.GHOST_BONUS : 0);
  state.bestLoot = Math.max(state.bestLoot, state.loot);
  SFX.win();
}

function updatePlay(dt) {
  const input = state.input;
  const p = state.player;

  // --- movement (frozen while crawling the vent) ---
  if (!state.vent) {
    const mv = input.moveVector();
    const sprint = input.sprinting();
    const speed = sprint ? CFG.PLAYER_SPRINT : CFG.PLAYER_SPEED;
    if (mv.x !== 0 || mv.y !== 0) {
      p.dir = Math.atan2(mv.y, mv.x);
      p.moving = true;
      const pos = moveCircle(p.x, p.y, p.r, mv.x * speed * dt, mv.y * speed * dt);
      const clamped = clampToFloor(pos.x, pos.y, p.r);
      p.x = clamped.x;
      p.y = clamped.y;
    } else {
      p.moving = false;
    }
  }
  updateVent(state, dt);

  // --- tools ---
  if (input.wasPressed('1')) useTool(state, 0);
  if (input.wasPressed('2')) useTool(state, 1);
  if (input.wasPressed('3')) useTool(state, 2);
  updateTools(state, dt);

  // --- interact: safe-cracking or the vent ---
  if (input.wasPressed('e')) {
    if (nearSafe(state) && !state.vaultOpen) {
      startCrack(state);
    } else if (nearGrate(state)) {
      startVent(state, nearGrate(state));
    }
  }

  // --- loot pickup: walk over it ---
  for (const item of state.lootItems) {
    if (item.taken) continue;
    if (item.inVault && !state.vaultOpen) continue;
    if (Math.hypot(p.x - item.x, p.y - item.y) < 28) {
      item.taken = true;
      state.loot += item.value;
      state.bestLoot = Math.max(state.bestLoot, state.loot);
      state.toast = `+$${item.value} ${item.kind.toUpperCase()}`;
      state.toastT = 1.4;
      if (item.kind === 'diamond') SFX.pickup();
      else SFX.cash();
    }
  }

  // --- guards + cameras ---
  updateGuards(state, dt);
  updateCams(state, dt);

  // --- alarm: rises while seen, falls while hidden ---
  let seenRate = 0;
  for (const g of state.guards) {
    if (g.seeStrength > 0) seenRate += g.seeStrength * CFG.ALARM_GUARD_RATE;
  }
  for (const cam of state.cams) {
    if (cam.seeStrength > 0) seenRate += cam.seeStrength * CFG.ALARM_CAM_RATE;
  }
  if (seenRate > 0) {
    state.alarm += seenRate * dt;
    if (state.alarm > 55 && !state._spottedPing) {
      state._spottedPing = true;
      SFX.spotted();
    }
  } else {
    state._spottedPing = false;
    let decay = CFG.ALARM_DECAY;
    if (inShadow(p.x, p.y) || p.inVent) decay *= CFG.ALARM_SHADOW_DECAY_MULT;
    if (state.empT > 0) decay *= CFG.ALARM_EMP_DECAY_MULT;
    state.alarm -= decay * dt;
  }
  state.alarm = Math.max(0, Math.min(CFG.ALARM_CAUGHT, state.alarm));
  state.maxAlarm = Math.max(state.maxAlarm, state.alarm);
  SFX.alarmBed(state.alarm / 100);

  if (state.alarm >= CFG.ALARM_CAUGHT) {
    enterCaught();
    return;
  }

  // --- getaway: reach the van with enough loot ---
  if (pointInRect(p.x, p.y, EXTRACTION)) {
    if (state.loot >= CFG.WIN_LOOT_MIN) {
      enterWin();
      return;
    }
    if (!state._vanWarned) {
      state._vanWarned = true;
      state.toast = `Need $${CFG.WIN_LOOT_MIN} loot to escape (have $${state.loot})`;
      state.toastT = 2;
      SFX.denied();
    }
  } else {
    state._vanWarned = false;
  }

  state.interactPrompt = interactTarget(state);
}

function update(dt) {
  state.time += dt;
  if (state.flashRed > 0) state.flashRed -= dt;

  switch (state.mode) {
    case 'title': {
      // Living backdrop: guards patrol behind the title.
      updateGuards(state, dt);
      updateCams(state, dt);
      if (state.input.mouse.clicked) {
        state.input.mouse.clicked = false;
        state.mode = 'play';
        SFX.unlock();
        SFX.tool();
      }
      break;
    }
    case 'play':
      updatePlay(dt);
      break;
    case 'crack': {
      updateCrack(state, dt);
      if (state.input.wasPressed(' ')) crackTap(state);
      if (state.input.wasPressed('Escape')) cancelCrack(state);
      break;
    }
    case 'caught': {
      state.caughtT += dt;
      if (state.caughtT > CFG.CAUGHT_FREEZE_S) respawn();
      break;
    }
    case 'win': {
      if (state.input.mouse.clicked) {
        state.input.mouse.clicked = false;
        resetRun();
      }
      break;
    }
    default:
      break;
  }
}

// Screenshot mode: pose once, then only let the clock (pulses, glow) move.
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.shot) {
    state.time += dt * 0.4;
    if (state.flashRed > 0) state.flashRed -= dt * 0.4;
  } else {
    update(dt);
  }
  draw(state, ctx);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
