// The Midnight Teller — render.js
// Every pixel of the game. Draw order matters: floor first, then vision
// cones (so walls drawn over them occlude the cone, which is how the player
// reads cover), then walls and furniture, then loot and actors, then the HUD.
// The palette stays bright on purpose: the whole bank reads at a glance,
// even shrunk to a 768x480 contact sheet.

import { CFG, PAL } from './config.js';
import {
  COVER,
  EXTRACTION,
  LOS_WALLS,
  SHADOWS,
  VAULT_SAFE,
  VENT,
  WALLS,
  ZONES,
  pointInRect,
} from './world.js';
import { TOOL_DEFS } from './tools.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wedge(ctx, x, y, dir, halfAngle, range, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, dir - halfAngle, dir + halfAngle);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, dir - halfAngle, dir + halfAngle);
  ctx.stroke();
}

function label(ctx, text, x, y, size, color, align = 'left') {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function draw(state, ctx) {
  const W = CFG.W;
  const H = CFG.H;
  ctx.clearRect(0, 0, W, H);

  drawFloor(state, ctx);
  drawCones(state, ctx);
  drawWallsAndCover(state, ctx);
  drawLoot(state, ctx);
  drawSmokeAndDecoys(state, ctx);
  drawGuards(state, ctx);
  drawCams(state, ctx);
  drawPlayer(state, ctx);
  drawHud(state, ctx);
  drawOverlays(state, ctx);

  // Caught flash: brief red vignette.
  if (state.flashRed > 0) {
    ctx.fillStyle = `rgba(255, 40, 30, ${Math.min(0.35, state.flashRed * 0.3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawFloor(state, ctx) {
  // Zone floors (labels are drawn after the vent duct so nothing covers them).
  for (const z of ZONES) {
    ctx.fillStyle = z.fill;
    ctx.fillRect(z.x, z.y, z.w, z.h);
  }
  // Tile grid.
  ctx.strokeStyle = PAL.tileLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 64; x <= 1216; x += 48) {
    ctx.moveTo(x, 64);
    ctx.lineTo(x, 656);
  }
  for (let y = 64; y <= 656; y += 48) {
    ctx.moveTo(64, y);
    ctx.lineTo(1216, y);
  }
  ctx.stroke();

  // Shadow patches (hiding spots).
  for (const s of SHADOWS) {
    ctx.fillStyle = PAL.floorShadow;
    rr(ctx, s.x, s.y, s.w, s.h, 10);
    ctx.fill();
    label(ctx, 'SHADOW', s.x + s.w / 2, s.y + s.h / 2, 12, 'rgba(38, 64, 120, 0.5)', 'center');
  }

  // Vent duct along the top wall.
  ctx.fillStyle = PAL.floorVent;
  ctx.fillRect(100, 66, 800, 30);
  ctx.strokeStyle = '#7d8b84';
  ctx.lineWidth = 2;
  ctx.strokeRect(100, 66, 800, 30);
  ctx.beginPath();
  for (let x = 120; x < 880; x += 24) {
    ctx.moveTo(x, 70);
    ctx.lineTo(x, 92);
  }
  ctx.stroke();

  // Zone labels, drawn last in the floor pass so the duct never covers them.
  // Each zone carries its own label height so labels never sit on furniture.
  for (const z of ZONES) {
    label(ctx, z.label, z.x + 14, z.ly ?? z.y + 112, 13, 'rgba(60, 70, 60, 0.45)');
  }

  // Extraction: getaway van zone by the front door.
  const e = EXTRACTION;
  const pulse = 0.5 + 0.3 * Math.sin(state.time * 4);
  ctx.fillStyle = `rgba(47, 191, 113, ${0.25 + pulse * 0.15})`;
  rr(ctx, e.x, e.y, e.w, e.h, 8);
  ctx.fill();
  ctx.strokeStyle = PAL.van;
  ctx.lineWidth = 3;
  rr(ctx, e.x, e.y, e.w, e.h, 8);
  ctx.stroke();
  label(ctx, 'GETAWAY VAN', e.x + e.w / 2, e.y + 16, 13, '#137a44', 'center');
  label(ctx, 'loot $600+ to escape', e.x + e.w / 2, e.y + 34, 11, '#137a44', 'center');
  // Van glyph: simple van body + wheels, parked just outside the door.
  ctx.fillStyle = PAL.van;
  rr(ctx, 96, 664, 110, 14, 4);
  ctx.fill();
  ctx.fillStyle = '#17301f';
  ctx.beginPath();
  ctx.arc(118, 680, 7, 0, Math.PI * 2);
  ctx.arc(184, 680, 7, 0, Math.PI * 2);
  ctx.fill();

  // Front door gap marker in the bottom wall.
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(88, 656, 130, 6);
}

function drawCones(state, ctx) {
  // Guard vision cones: amber while calm, red while alerted/chasing.
  for (const g of state.guards) {
    const alerted = g.state === 'chase' || g.seeStrength > 0.4;
    wedge(
      ctx,
      g.x,
      g.y,
      g.dir,
      CFG.GUARD_HALF_ANGLE,
      CFG.GUARD_RANGE,
      alerted ? PAL.coneAlert : PAL.coneCalm,
      alerted ? PAL.coneAlertEdge : PAL.coneCalmEdge,
    );
  }
  // Camera sweep arcs.
  for (const cam of state.cams) {
    const off = cam.disabledT > 0;
    wedge(
      ctx,
      cam.x,
      cam.y,
      cam.angle,
      CFG.CAM_HALF_ANGLE,
      CFG.CAM_RANGE,
      off ? PAL.camOff : PAL.camArc,
      off ? 'rgba(120,130,140,0.6)' : PAL.camArcEdge,
    );
  }
}

function drawWallsAndCover(state, ctx) {
  // Walls: deep teal with a light top edge so rooms read as rooms.
  for (const w of WALLS) {
    ctx.fillStyle = PAL.wall;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = PAL.wallTop;
    if (w.h <= 24) ctx.fillRect(w.x, w.y, w.w, 5);
    else ctx.fillRect(w.x, w.y, 5, w.h);
  }

  // Teller counters: wood with a brass rail.
  for (const c of COVER) {
    const isSafe = c === VAULT_SAFE || (c.x === 1050 && c.y === 500);
    if (isSafe) continue;
    const isCounter = c.y === 210;
    ctx.fillStyle = isCounter ? PAL.counterWood : PAL.desk;
    rr(ctx, c.x, c.y, c.w, c.h, 4);
    ctx.fill();
    ctx.fillStyle = isCounter ? PAL.counterTop : 'rgba(255,255,255,0.18)';
    ctx.fillRect(c.x + 3, c.y + 3, c.w - 6, 8);
    if (c.w === 44 && c.h === 44) {
      // planter: green bush in a terracotta pot
      ctx.fillStyle = PAL.planterPot;
      rr(ctx, c.x + 4, c.y + 26, c.w - 8, c.h - 30, 3);
      ctx.fill();
      ctx.fillStyle = PAL.planter;
      ctx.beginPath();
      ctx.arc(c.x + c.w / 2, c.y + 16, 15, 0, Math.PI * 2);
      ctx.arc(c.x + 10, c.y + 20, 10, 0, Math.PI * 2);
      ctx.arc(c.x + c.w - 10, c.y + 20, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The vault safe: steel door with a gold combination wheel.
  const s = VAULT_SAFE;
  ctx.fillStyle = PAL.safeSteel;
  rr(ctx, s.x, s.y, s.w, s.h, 6);
  ctx.fill();
  ctx.strokeStyle = PAL.safeDark;
  ctx.lineWidth = 3;
  rr(ctx, s.x, s.y, s.w, s.h, 6);
  ctx.stroke();
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  if (state.vaultOpen) {
    // Door swung open: dark opening + gold glow spilling out.
    ctx.fillStyle = '#2c2113';
    rr(ctx, s.x + 8, s.y + 8, s.w - 16, s.h - 16, 4);
    ctx.fill();
    ctx.fillStyle = PAL.lootGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 26 + 6 * Math.sin(state.time * 3), 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'OPEN', cx, cy, 13, '#ffd94a', 'center');
  } else {
    // Closed vault: the gold wheel glows — the prize the whole heist is for.
    ctx.save();
    ctx.shadowColor = PAL.lootGlow;
    ctx.shadowBlur = 22 + 10 * Math.sin(state.time * 3);
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PAL.goldDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();
    // Spokes.
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + state.time * 0.15;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
    }
    ctx.stroke();
    ctx.fillStyle = PAL.safeDark;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'VAULT', cx, s.y - 12, 13, '#5d6b7c', 'center');
  }

  // Vent grates.
  for (const g of VENT.grates) {
    ctx.fillStyle = '#5d6b7c';
    rr(ctx, g.x - 22, g.y - 12, 44, 24, 4);
    ctx.fill();
    ctx.strokeStyle = '#e8eef2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(g.x - 18, g.y + i * 7);
      ctx.lineTo(g.x + 18, g.y + i * 7);
    }
    ctx.stroke();
    label(ctx, g.label, g.x, g.y + 26, 10, '#5d6b7c', 'center');
  }

  // Vault door (the gap in the vault room's left wall).
  ctx.fillStyle = state.vaultOpen ? '#2fbf71' : PAL.gold;
  ctx.fillRect(880, 500, 20, 60);
  label(ctx, 'VAULT DOOR', 910, 486, 11, '#5d6b7c');
}

function drawLoot(state, ctx) {
  const t = state.time;
  for (const item of state.lootItems) {
    if (item.taken) continue;
    if (item.inVault && !state.vaultOpen) continue; // gold hides until cracked
    const bob = Math.sin(t * 3 + item.x) * 2;
    const glow = 0.35 + 0.2 * Math.sin(t * 4 + item.y);
    ctx.save();
    ctx.shadowColor = PAL.lootGlow;
    ctx.shadowBlur = 18 * glow + 6;
    if (item.kind === 'cash') {
      ctx.fillStyle = '#2fbf71';
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      ctx.rotate(-0.25);
      rr(ctx, -14, -9, 28, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#f7f4ea';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#137a44';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3);
      ctx.restore();
    } else if (item.kind === 'diamond') {
      ctx.fillStyle = '#7fe0ff';
      ctx.beginPath();
      ctx.moveTo(item.x, item.y - 13 + bob);
      ctx.lineTo(item.x + 12, item.y + bob);
      ctx.lineTo(item.x, item.y + 12 + bob);
      ctx.lineTo(item.x - 12, item.y + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // gold bar
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(item.x - 13, item.y + 7 + bob);
      ctx.lineTo(item.x - 9, item.y - 7 + bob);
      ctx.lineTo(item.x + 9, item.y - 7 + bob);
      ctx.lineTo(item.x + 13, item.y + 7 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PAL.goldDark;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, `$${item.value}`, item.x, item.y + 24 + bob, 11, '#7a5b00', 'center');
  }
}

function drawSmokeAndDecoys(state, ctx) {
  for (const s of state.smokes) {
    ctx.fillStyle = PAL.smoke;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.arc(s.x - s.r * 0.5, s.y + 10, s.r * 0.6, 0, Math.PI * 2);
    ctx.arc(s.x + s.r * 0.5, s.y - 8, s.r * 0.65, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'SMOKE', s.x, s.y, 11, '#6a737c', 'center');
  }
  for (const d of state.decoys) {
    const pulse = 1 + 0.25 * Math.sin(state.time * 8);
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'DECOY', d.x, d.y - 20, 10, '#7a5b00', 'center');
  }
}

function drawGuards(state, ctx) {
  for (const g of state.guards) {
    // "!" when the guard has eyes on the thief.
    if (g.seeStrength > 0.15) {
      const alert = g.seeStrength > 0.4 || g.state === 'chase';
      label(ctx, alert ? '!' : '?', g.x, g.y - 30, 22, alert ? '#ff4030' : '#ffb020', 'center');
    }
    // Body: navy circle, cap, facing tick.
    ctx.fillStyle = g.state === 'chase' ? PAL.guardAlert : g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = g.state === 'chase' ? '#7a1010' : PAL.guardCap;
    ctx.beginPath();
    ctx.arc(g.x, g.y - 4, 8, Math.PI, 0);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.dir) * 20, g.y + Math.sin(g.dir) * 20);
    ctx.stroke();
    // Name tag.
    label(ctx, g.name, g.x, g.y + 26, 10, '#1b3268', 'center');
    // State tag while suspicious / chasing / investigating.
    if (g.state !== 'patrol') {
      label(ctx, g.state.toUpperCase(), g.x, g.y + 38, 9, '#c22e2e', 'center');
    }
  }
}

function drawCams(state, ctx) {
  for (const cam of state.cams) {
    const off = cam.disabledT > 0;
    ctx.fillStyle = off ? '#8a97a8' : '#333d4a';
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.rotate(cam.angle);
    rr(ctx, -4, -7, 22, 14, 4);
    ctx.fill();
    ctx.fillStyle = off ? '#5d6b7c' : cam.seeStrength > 0.15 ? '#ff4030' : '#ff4030';
    ctx.beginPath();
    ctx.arc(18, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#333d4a';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, off ? `${cam.label} OFF` : cam.label, cam.x, cam.y - 14, 10, off ? '#5d6b7c' : '#333d4a', 'center');
  }
}

function drawPlayer(state, ctx) {
  const p = state.player;
  if (p.inVent) {
    // In the vent: a small moving dot inside the duct, with a label.
    ctx.fillStyle = PAL.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.playerOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, 'IN VENT', p.x, p.y + 24, 10, '#0a5453', 'center');
    return;
  }
  // Shadow ring under the thief.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 10, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body: teal hood, dark mask, gold outline so the thief pops.
  ctx.fillStyle = PAL.player;
  ctx.beginPath();
  ctx.arc(p.x, p.y, CFG.PLAYER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.playerOutline;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Hood + mask.
  ctx.fillStyle = PAL.playerDark;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 3, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath();
  ctx.arc(p.x - 3, p.y - 1, 1.8, 0, Math.PI * 2);
  ctx.arc(p.x + 3, p.y - 1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick toward movement / mouse.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.dir) * 20, p.y + Math.sin(p.dir) * 20);
  ctx.stroke();
  label(ctx, 'YOU', p.x, p.y + 26, 10, '#0a5453', 'center');
}

function drawHud(state, ctx) {
  const W = CFG.W;
  // Top-left: objective.
  panel(ctx, 12, 10, 300, 58);
  label(ctx, 'HEIST: THE MIDNIGHT TELLER', 24, 26, 13, PAL.text);
  const obj = state.vaultOpen
    ? 'Vault open — grab gold, reach the van'
    : state.loot >= CFG.WIN_LOOT_MIN
      ? 'Loot secured — reach the getaway van'
      : 'Steal $600+, crack the vault, escape';
  label(ctx, obj, 24, 48, 12, PAL.textDim);

  // Top-center: alarm meter.
  const ax = W / 2 - 170;
  const ay = 10;
  panel(ctx, ax, ay, 340, 58);
  label(ctx, 'ALARM', ax + 14, ay + 20, 12, PAL.textDim);
  const frac = state.alarm / 100;
  const col = frac < 0.45 ? PAL.alarmGreen : frac < 0.75 ? PAL.alarmAmber : PAL.alarmRed;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  rr(ctx, ax + 14, ay + 30, 312, 16, 8);
  ctx.fill();
  ctx.fillStyle = col;
  if (frac > 0.01) {
    rr(ctx, ax + 14, ay + 30, Math.max(16, 312 * frac), 16, 8);
    ctx.fill();
  }
  label(ctx, `${Math.round(state.alarm)}%`, ax + 326, ay + 20, 12, col, 'right');
  if (state.alarm >= 75) {
    label(ctx, 'SPOTTED — BREAK LINE OF SIGHT!', ax + 170, ay + 56, 11, PAL.alarmRed, 'center');
  }

  // Top-right: loot + timer.
  panel(ctx, W - 232, 10, 220, 58);
  label(ctx, `LOOT  $${state.loot}`, W - 220, 26, 15, PAL.gold);
  const mm = String(Math.floor(state.time / 60)).padStart(2, '0');
  const ss = String(Math.floor(state.time % 60)).padStart(2, '0');
  label(ctx, `TIME ${mm}:${ss}`, W - 220, 48, 12, PAL.textDim);
  label(ctx, `BEST $${state.bestLoot}`, W - 24, 48, 12, PAL.textDim, 'right');

  // Bottom-left: tools.
  panel(ctx, 12, CFG.H - 62, 330, 50);
  TOOL_DEFS.forEach((t, i) => {
    const x = 24 + i * 108;
    const cd = state.toolCd[i] || 0;
    const afford = state.loot >= t.cost && cd <= 0;
    const col = afford ? PAL.text : '#8a9a8a';
    label(ctx, `[${t.key}] ${t.name}`, x, CFG.H - 46, 12, col);
    label(
      ctx,
      cd > 0 ? `${cd.toFixed(0)}s` : `$${t.cost}`,
      x,
      CFG.H - 28,
      11,
      cd > 0 ? PAL.alarmAmber : PAL.gold,
    );
  });

  // Bottom-right: minimap.
  drawMinimap(state, ctx);

  // Toast (centre-top, below the alarm bar's warning line).
  if (state.toastT > 0) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const tw = ctx.measureText(state.toast).width;
    panel(ctx, W / 2 - tw / 2 - 14, 116, tw + 28, 30);
    label(ctx, state.toast, W / 2, 131, 15, PAL.gold, 'center');
  }

  // Interact prompt (above the player).
  const target = state.interactPrompt;
  if (target && state.mode === 'play') {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(target).width;
    panel(ctx, state.player.x - tw / 2 - 10, state.player.y - 58, tw + 20, 26);
    label(ctx, target, state.player.x, state.player.y - 45, 13, PAL.text, 'center');
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PAL.panel;
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = PAL.panelEdge;
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 8);
  ctx.stroke();
}

function drawMinimap(state, ctx) {
  const mw = 190;
  const mh = 107;
  const mx = CFG.W - mw - 12;
  const my = CFG.H - mh - 12;
  const sx = mw / CFG.W;
  const sy = mh / CFG.H;
  panel(ctx, mx, my, mw, mh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Zones.
  for (const z of ZONES) {
    ctx.fillStyle = z.fill;
    ctx.fillRect(mx + z.x * sx, my + z.y * sy, z.w * sx, z.h * sy);
  }
  // Walls.
  ctx.fillStyle = PAL.wall;
  for (const w of LOS_WALLS) {
    ctx.fillRect(mx + w.x * sx, my + w.y * sy, Math.max(1, w.w * sx), Math.max(1, w.h * sy));
  }
  // Loot dots.
  for (const item of state.lootItems) {
    if (item.taken) continue;
    if (item.inVault && !state.vaultOpen) continue;
    ctx.fillStyle = PAL.gold;
    ctx.beginPath();
    ctx.arc(mx + item.x * sx, my + item.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Guards (red = alerted).
  for (const g of state.guards) {
    ctx.fillStyle = g.state === 'chase' ? '#ff4030' : '#274690';
    ctx.beginPath();
    ctx.arc(mx + g.x * sx, my + g.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Extraction.
  ctx.fillStyle = PAL.van;
  ctx.fillRect(mx + EXTRACTION.x * sx, my + EXTRACTION.y * sy, EXTRACTION.w * sx, EXTRACTION.h * sy);
  // Player.
  ctx.fillStyle = PAL.player;
  ctx.strokeStyle = PAL.playerOutline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mx + state.player.x * sx, my + state.player.y * sy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(ctx, 'MAP', mx + 8, my + 10, 9, PAL.textDim);
}

function drawOverlays(state, ctx) {
  if (state.mode === 'title') {
    ctx.fillStyle = PAL.titleBg;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    label(ctx, 'THE MIDNIGHT TELLER', CFG.W / 2, 190, 52, '#ffd94a', 'center');
    label(ctx, 'A BANK HEIST IN ONE NIGHT', CFG.W / 2, 240, 18, PAL.text, 'center');
    label(ctx, 'WASD / arrows — move      SHIFT — sprint      E — crack / vent', CFG.W / 2, 320, 16, PAL.text, 'center');
    label(ctx, '1 smoke ($150)    2 EMP ($250)    3 decoy ($100)    SPACE — safe dial', CFG.W / 2, 350, 16, PAL.text, 'center');
    label(ctx, 'Stay out of the amber cones. Hide in shadow. Crack the vault.', CFG.W / 2, 380, 16, PAL.text, 'center');
    label(ctx, 'Steal $600+, then reach the GETAWAY VAN.', CFG.W / 2, 410, 16, PAL.gold, 'center');
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    label(ctx, 'CLICK TO START THE HEIST', CFG.W / 2, 480, 20, `rgba(255, 217, 74, ${pulse})`, 'center');
    return;
  }

  if (state.mode === 'crack' && state.crack) {
    const c = state.crack;
    ctx.fillStyle = 'rgba(10, 26, 26, 0.72)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    const cx = CFG.W / 2;
    const cy = CFG.H / 2 - 20;
    label(ctx, 'SAFE-CRACKING', cx, 130, 30, PAL.gold, 'center');
    label(ctx, c.msg, cx, 165, 15, PAL.text, 'center');
    // Dial.
    ctx.fillStyle = '#1d2f2e';
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.panelEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Green zone.
    ctx.strokeStyle = PAL.alarmGreen;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, 118, c.greenCenter - c.greenHalf, c.greenCenter + c.greenHalf);
    ctx.stroke();
    // Needle.
    ctx.strokeStyle = '#ff4030';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(c.needle) * 122, cy + Math.sin(c.needle) * 122);
    ctx.stroke();
    ctx.fillStyle = '#f7f4ea';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    // Tumbler pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < c.locked ? PAL.alarmGreen : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(cx - 44 + i * 44, cy + 168, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    label(ctx, 'SPACE — stop the dial in the green   •   ESC — walk away', cx, cy + 205, 14, PAL.textDim, 'center');
    if (c.flash > 0) {
      ctx.fillStyle = 'rgba(47, 191, 113, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.flash < 0) {
      ctx.fillStyle = 'rgba(255, 64, 48, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (state.mode === 'caught') {
    ctx.fillStyle = 'rgba(120, 10, 10, 0.45)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    label(ctx, 'CAUGHT!', CFG.W / 2, 300, 56, '#ff6b5e', 'center');
    label(ctx, `Busted by ${state.caughtBy || 'a guard'} — the crew drags you back to the door.`, CFG.W / 2, 350, 17, PAL.text, 'center');
    label(ctx, 'You keep 75% of your loot. Lay low and try again.', CFG.W / 2, 380, 15, PAL.textDim, 'center');
    return;
  }

  if (state.mode === 'win') {
    ctx.fillStyle = 'rgba(10, 40, 20, 0.62)';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    label(ctx, 'CLEAN GETAWAY!', CFG.W / 2, 220, 48, '#2fbf71', 'center');
    label(ctx, `Loot escaped with: $${state.loot}`, CFG.W / 2, 290, 22, PAL.gold, 'center');
    const mm = String(Math.floor(state.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(state.time % 60)).padStart(2, '0');
    label(ctx, `Time: ${mm}:${ss}   •   Tools used: ${state.toolsUsed}`, CFG.W / 2, 330, 16, PAL.text, 'center');
    if (state.ghostBonus) {
      label(ctx, `GHOST BONUS +$${CFG.GHOST_BONUS} — never raised the alarm past 50%`, CFG.W / 2, 365, 16, '#7fe0ff', 'center');
    }
    label(ctx, `FINAL SCORE: $${state.finalScore}`, CFG.W / 2, 415, 26, '#ffd94a', 'center');
    label(ctx, 'CLICK TO RUN IT AGAIN', CFG.W / 2, 480, 16, PAL.text, 'center');
  }
}
