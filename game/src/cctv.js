// The Midnight Teller — cctv.js
// Wall-mounted CCTV cameras sweeping an arc. A camera raises the alarm
// more slowly than a guard, but it never blinks and never walks away —
// the EMP tool is the answer to it. An EMP-disabled camera shows a dead
// grey arc so the player can read exactly when the coast is clear.

import { CFG } from './config.js';
import {
  CAM_DEFS,
  angleDiff,
  inShadow,
  losBlocked,
  smokeBlocks,
} from './world.js';

export function makeCams() {
  return CAM_DEFS.map((d) => ({
    x: d.x,
    y: d.y,
    base: d.base,
    sweep: d.sweep,
    speed: d.speed,
    label: d.label,
    angle: d.base,
    phase: Math.random() * Math.PI * 2,
    disabledT: 0,
    seeStrength: 0,
  }));
}

export function camSees(cam, player, state) {
  if (cam.disabledT > 0 || player.inVent) return 0;
  const dx = player.x - cam.x;
  const dy = player.y - cam.y;
  const dist = Math.hypot(dx, dy);
  if (dist > CFG.CAM_RANGE) return 0;
  const ang = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(ang, cam.angle)) > CFG.CAM_HALF_ANGLE) return 0;
  if (losBlocked(cam.x, cam.y, player.x, player.y)) return 0;
  if (smokeBlocks(cam.x, cam.y, player.x, player.y, state.smokes)) return 0;
  let strength = 1 - dist / CFG.CAM_RANGE;
  if (inShadow(player.x, player.y)) strength *= 0.5;
  return Math.max(0.05, strength);
}

export function updateCams(state, dt) {
  for (const cam of state.cams) {
    // Ping-pong sweep: angle oscillates around base by ±sweep.
    cam.phase += dt * cam.speed;
    cam.angle = cam.base + Math.sin(cam.phase) * cam.sweep;
    if (cam.disabledT > 0) cam.disabledT -= dt;
    cam.seeStrength = camSees(cam, state.player, state);
  }
}
