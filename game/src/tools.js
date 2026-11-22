// The Midnight Teller — tools.js
// The thief's kit. Every tool costs loot money, so spending is a real
// decision, and every tool has a cooldown so it cannot be spammed.
//   1 Smoke bomb — a cloud that blocks all sightlines for 6 s.
//   2 EMP pulse  — kills every camera for 8 s, alarm decays 3x faster.
//   3 Decoy coin — clinks where it lands (mouse aim); the nearest guard
//                  walks over to check it out.
// Plus the signature tool: safe-cracking. Stand at the vault, press E, and
// stop the spinning dial inside the green zone three times. Miss and the
// alarm jumps; nail all three and the gold is yours.

import { CFG } from './config.js';
import { VENT, pointInRect } from './world.js';
import { SFX } from './audio.js';

export const TOOL_DEFS = [
  { key: '1', name: 'SMOKE', cost: CFG.SMOKE_COST, cd: CFG.SMOKE_CD },
  { key: '2', name: 'EMP', cost: CFG.EMP_COST, cd: CFG.EMP_CD },
  { key: '3', name: 'DECOY', cost: CFG.DECOY_COST, cd: CFG.DECOY_CD },
];

export function canAfford(state, n) {
  const def = TOOL_DEFS[n];
  return state.loot >= def.cost && (state.toolCd[n] || 0) <= 0;
}

export function useTool(state, n) {
  const def = TOOL_DEFS[n];
  if (!def) return false;
  if ((state.toolCd[n] || 0) > 0) {
    state.toast = `${def.name} recharging…`;
    state.toastT = 1.2;
    SFX.denied();
    return false;
  }
  if (state.loot < def.cost) {
    state.toast = `Need $${def.cost} loot for ${def.name}`;
    state.toastT = 1.4;
    SFX.denied();
    return false;
  }
  state.loot -= def.cost;
  state.toolCd[n] = def.cd;
  state.toolsUsed += 1;
  if (n === 0) {
    state.smokes.push({ x: state.player.x, y: state.player.y, r: CFG.SMOKE_R, t: CFG.SMOKE_S });
    state.toast = 'SMOKE OUT — sightlines blocked';
  } else if (n === 1) {
    for (const cam of state.cams) cam.disabledT = CFG.EMP_S;
    state.empT = CFG.EMP_S;
    state.toast = 'EMP — cameras down 8s';
  } else {
    const mx = state.input.mouse.x;
    const my = state.input.mouse.y;
    state.decoys.push({ x: mx, y: my, t: CFG.DECOY_S, claimedBy: null });
    state.toast = 'DECOY thrown — guards investigate';
  }
  state.toastT = 1.6;
  SFX.tool();
  return true;
}

export function updateTools(state, dt) {
  for (let i = 0; i < 3; i++) {
    if (state.toolCd[i] > 0) state.toolCd[i] -= dt;
  }
  if (state.empT > 0) state.empT -= dt;
  state.smokes = state.smokes.filter((s) => {
    s.t -= dt;
    return s.t > 0;
  });
  state.decoys = state.decoys.filter((d) => {
    d.t -= dt;
    return d.t > 0;
  });
  if (state.toastT > 0) state.toastT -= dt;
}

// ---- safe-cracking ------------------------------------------------------

export function nearSafe(state) {
  const p = state.player;
  const s = { x: 1050, y: 500, w: 110, h: 80 };
  const cx = Math.max(s.x, Math.min(p.x, s.x + s.w));
  const cy = Math.max(s.y, Math.min(p.y, s.y + s.h));
  return Math.hypot(p.x - cx, p.y - cy) < 78;
}

export function startCrack(state) {
  state.crack = {
    active: true,
    needle: 0, // angle, radians, spinning
    speed: 2.6,
    greenCenter: 0.6,
    greenHalf: 0.42,
    locked: 0, // tumblers locked: 0..3
    flash: 0,
    msg: 'STOP THE DIAL IN THE GREEN — SPACE',
  };
  state.mode = 'crack';
  SFX.tool();
}

function nextGreen(rng) {
  return rng() * Math.PI * 2;
}

export function updateCrack(state, dt) {
  const c = state.crack;
  if (!c || !c.active) return;
  c.needle += c.speed * dt;
  if (c.needle > Math.PI * 2) c.needle -= Math.PI * 2;
  if (c.flash > 0) c.flash -= dt;
}

// SPACE while cracking: lock a tumbler if the needle is in the green zone.
export function crackTap(state) {
  const c = state.crack;
  if (!c || !c.active) return;
  let d = c.needle - c.greenCenter;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= c.greenHalf) {
    c.locked += 1;
    c.flash = 0.5;
    if (c.locked >= 3) {
      c.active = false;
      state.vaultOpen = true;
      state.mode = 'play';
      state.toast = 'VAULT OPEN — grab the gold!';
      state.toastT = 2.5;
      SFX.vaultOpen();
    } else {
      c.greenCenter = nextGreen(state.rng);
      c.speed += 0.9; // each tumbler spins faster — the tension ramps
      c.msg = `TUMBLER ${c.locked}/3 LOCKED — AGAIN!`;
      SFX.crackOk();
    }
  } else {
    state.alarm = Math.min(CFG.ALARM_CAUGHT, state.alarm + CFG.CRACK_FAIL_ALARM);
    c.flash = -0.5; // red flash
    c.msg = 'MISSED — the safe clicks louder (+alarm)';
    SFX.crackBad();
  }
}

export function cancelCrack(state) {
  if (state.crack) state.crack.active = false;
  state.mode = 'play';
}

// ---- vent crawl ---------------------------------------------------------

export function nearGrate(state) {
  const p = state.player;
  for (const g of VENT.grates) {
    if (Math.hypot(p.x - g.x, p.y - g.y) < 46) return g;
  }
  return null;
}

export function startVent(state, grate) {
  const other = VENT.grates.find((g) => g !== grate);
  state.vent = { from: grate, to: other, t: 0, dur: CFG.VENT_CRAWL_S };
  state.player.inVent = true;
  state.toast = 'IN THE VENT — unseen…';
  state.toastT = 1.6;
  SFX.tool();
}

export function updateVent(state, dt) {
  const v = state.vent;
  if (!v) return;
  v.t += dt;
  const k = Math.min(1, v.t / v.dur);
  // Crawl along the duct: lobby grate -> top run -> vault grate.
  const pts = [v.from, { x: 500, y: 82 }, v.to];
  const seg = k * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(seg));
  const f = seg - i;
  state.player.x = pts[i].x + (pts[i + 1].x - pts[i].x) * f;
  state.player.y = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
  if (k >= 1) {
    state.player.x = v.to.x;
    state.player.y = v.to.y + 26; // step out below the grate
    state.player.inVent = false;
    state.vent = null;
  }
}

// What can the player interact with right now? (for the E prompt)
export function interactTarget(state) {
  if (nearSafe(state) && !state.vaultOpen) return 'CRACK THE SAFE  [E]';
  if (nearSafe(state) && state.vaultOpen) return 'GRAB THE GOLD';
  const g = nearGrate(state);
  if (g) return 'CRAWL THE VENT  [E]';
  return null;
}

export { pointInRect };
