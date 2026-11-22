// The Midnight Teller — world.js
// The bank floor plan: one teller hall, one vault room, one manager office,
// a security desk, a lobby, and a vent duct that links the lobby to the
// vault side. Every rectangle here blocks movement; the ones listed in
// losWalls also block sightlines (that is what makes a counter "cover").
// Layout sketch (1280x720):
//   top wall with vent duct running under it (lobby grate -> vault grate)
//   [teller hall: counters + cash]   [security desk]  [manager office: diamond]
//   [lobby: sofa + shadow]  [pillars/corridor]  [vault room: safe + gold]
//   entrance + getaway van at the bottom-left door.

import { CFG } from './config.js';

const R = (x, y, w, h) => ({ x, y, w, h });

// Walls that block movement AND sight (full-height).
export const WALLS = [
  // outer shell (24 thick)
  R(40, 40, 1200, 24), // top
  R(40, 656, 1200, 24), // bottom
  R(40, 40, 24, 640), // left
  R(1216, 40, 24, 640), // right
  // vault room (bottom-right): top wall + left wall with a door gap y 500..560
  R(880, 400, 336, 20),
  R(880, 400, 20, 100),
  R(880, 560, 20, 96),
  // manager office (top-right): left wall + bottom wall with door gap x 1010..1070
  R(880, 64, 20, 236),
  R(880, 300, 130, 20),
  R(1070, 300, 146, 20),
  // pillars in the corridor
  R(660, 300, 28, 28),
  R(660, 520, 28, 28),
];

// Low cover: blocks movement and sightlines, drawn as furniture.
export const COVER = [
  // teller counters (three segments, gaps to slip between them)
  R(180, 210, 120, 24),
  R(340, 210, 120, 24),
  R(500, 210, 120, 24),
  // security desk (centre-right)
  R(700, 150, 120, 50),
  // manager desk
  R(980, 160, 120, 46),
  // planters in the hall
  R(300, 420, 44, 44),
  R(520, 420, 44, 44),
  // lobby sofa
  R(180, 520, 130, 44),
  // the vault safe itself
  R(1050, 500, 110, 80),
];

export const LOS_WALLS = [...WALLS, ...COVER];

// Floor zones, drawn in order (later = on top). Light tints, one per zone.
export const ZONES = [
  { x: 64, y: 64, w: 576, h: 296, fill: '#ddf0dd', label: 'TELLER HALL', ly: 176 }, // teller hall
  { x: 64, y: 360, w: 576, h: 296, fill: '#efe4c8', label: 'LOBBY', ly: 472 }, // lobby
  { x: 640, y: 64, w: 240, h: 592, fill: '#e9e1cf', label: 'CORRIDOR', ly: 400 }, // corridor
  { x: 900, y: 64, w: 316, h: 236, fill: '#e2e6f8', label: 'MANAGER OFFICE', ly: 280 }, // office
  { x: 900, y: 420, w: 316, h: 236, fill: '#f7e7bd', label: 'VAULT', ly: 532 }, // vault room
];

// Shadow patches: detection is slower here, alarm decays faster.
export const SHADOWS = [
  R(96, 452, 240, 58),
  R(920, 84, 180, 110),
  R(700, 560, 140, 80),
];

// Vent duct: a crawl from the lobby grate to the vault-side grate.
// Press E at a grate to crawl through (guards can never see you inside).
export const VENT = {
  path: [
    { x: 135, y: 82 },
    { x: 640, y: 82 },
    { x: 860, y: 82 },
  ],
  grates: [
    { x: 135, y: 82, label: 'VENT' },
    { x: 860, y: 82, label: 'VENT' },
  ],
};

export const SPAWN = { x: 115, y: 610 };
export const EXTRACTION = R(78, 596, 150, 52); // getaway van zone by the door
export const VAULT_SAFE = { x: 1050, y: 500, w: 110, h: 80 };
export const VAULT_DOOR = { x: 880, y: 500, w: 20, h: 60 };

// Loot spots. Gold bars only appear once the safe is cracked open.
export const LOOT_DEFS = [
  { id: 'cash1', kind: 'cash', x: 240, y: 198, value: 200, inVault: false },
  { id: 'cash2', kind: 'cash', x: 400, y: 198, value: 200, inVault: false },
  { id: 'cash3', kind: 'cash', x: 560, y: 198, value: 200, inVault: false },
  { id: 'cash4', kind: 'cash', x: 760, y: 138, value: 150, inVault: false },
  { id: 'diamond', kind: 'diamond', x: 1040, y: 148, value: 800, inVault: false },
  { id: 'gold1', kind: 'gold', x: 1085, y: 470, value: 500, inVault: true },
  { id: 'gold2', kind: 'gold', x: 1135, y: 470, value: 500, inVault: true },
  { id: 'gold3', kind: 'gold', x: 1110, y: 560, value: 500, inVault: true },
];

// Guard patrol definitions: waypoints, speed, and a readable name.
export const GUARD_DEFS = [
  {
    name: 'RONI',
    color: '#274690',
    waypoints: [
      { x: 240, y: 300 },
      { x: 560, y: 300 },
      { x: 560, y: 150 },
      { x: 240, y: 150 },
    ],
  },
  {
    name: 'BIMO',
    color: '#274690',
    waypoints: [
      { x: 820, y: 470 },
      { x: 820, y: 610 },
      { x: 700, y: 610 },
      { x: 700, y: 470 },
    ],
  },
  {
    name: 'SARI',
    color: '#274690',
    waypoints: [
      { x: 300, y: 600 },
      { x: 300, y: 480 },
      { x: 560, y: 480 },
      { x: 560, y: 600 },
    ],
  },
];

// CCTV cameras: wall-mounted, sweeping an arc.
export const CAM_DEFS = [
  { x: 620, y: 76, base: Math.PI / 2, sweep: 0.85, speed: 0.55, label: 'CAM 1' },
  { x: 916, y: 424, base: Math.PI, sweep: 0.7, speed: 0.7, label: 'CAM 2' },
];

// ---- geometry helpers -------------------------------------------------

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function circleHitsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Move a circle by (dx, dy) with axis-separated collision against walls.
// Returns the new position; the caller keeps the old axis when blocked.
export function moveCircle(x, y, r, dx, dy) {
  let nx = x + dx;
  for (const w of LOS_WALLS) {
    if (circleHitsRect(nx, y, r, w)) {
      nx = x;
      break;
    }
  }
  let ny = y + dy;
  for (const w of LOS_WALLS) {
    if (circleHitsRect(nx, ny, r, w)) {
      ny = y;
      break;
    }
  }
  return { x: nx, y: ny };
}

// Line of sight: sample along the segment; blocked if a sample lands in
// any sight-blocking rectangle. Cheap and good enough at this scale.
export function losBlocked(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 7));
  for (let i = 1; i < steps; i++) {
    const px = x1 + (dx * i) / steps;
    const py = y1 + (dy * i) / steps;
    for (const w of LOS_WALLS) {
      if (pointInRect(px, py, w)) return true;
    }
  }
  return false;
}

export function inShadow(x, y) {
  return SHADOWS.some((s) => pointInRect(x, y, s));
}

// Is the segment blocked by any smoke cloud?
export function smokeBlocks(x1, y1, x2, y2, smokes) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 0; i <= steps; i++) {
    const px = x1 + (dx * i) / steps;
    const py = y1 + (dy * i) / steps;
    for (const s of smokes) {
      const ddx = px - s.x;
      const ddy = py - s.y;
      if (ddx * ddx + ddy * ddy < s.r * s.r) return true;
    }
  }
  return false;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Keep a point inside the playable floor (inside the outer shell).
export function clampToFloor(x, y, r) {
  return {
    x: Math.max(64 + r, Math.min(CFG.W - 64 - r, x)),
    y: Math.max(64 + r, Math.min(CFG.H - 64 - r, y)),
  };
}
