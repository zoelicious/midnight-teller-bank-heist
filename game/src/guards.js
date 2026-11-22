// The Midnight Teller — guards.js
// Patrol guards with readable vision cones. States:
//   patrol     — walk the waypoint loop, cone sweeping ahead
//   suspect    — saw something briefly, walk to the last seen spot and look
//   chase      — alarm is high and the thief is in sight, run at the thief
//   investigate — a decoy coin clinked nearby, walk over and check it out
// A guard only raises the alarm while the thief is inside the cone AND in
// line of sight AND not hidden by smoke or the vent. That is the whole
// stealth contract: if you can read the cone, you can beat the guard.

import { CFG } from './config.js';
import {
  GUARD_DEFS,
  angleDiff,
  clampToFloor,
  inShadow,
  losBlocked,
  moveCircle,
  smokeBlocks,
} from './world.js';

export function makeGuards() {
  return GUARD_DEFS.map((d, i) => ({
    name: d.name,
    color: d.color,
    waypoints: d.waypoints,
    wpi: i % d.waypoints.length,
    x: d.waypoints[i % d.waypoints.length].x,
    y: d.waypoints[i % d.waypoints.length].y,
    dir: Math.PI / 2,
    speed: CFG.GUARD_PATROL_SPEED,
    state: 'patrol',
    stateT: 0,
    lastSeen: null,
    seeStrength: 0, // 0..1, how clearly this guard sees the thief right now
    pauseT: 0,
    investigate: null,
  }));
}

// Can this guard see the thief right now? Returns 0..1 (0 = not seen).
export function guardSees(g, player, state) {
  if (player.inVent) return 0;
  const dx = player.x - g.x;
  const dy = player.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist > CFG.GUARD_RANGE) return 0;
  const ang = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(ang, g.dir)) > CFG.GUARD_HALF_ANGLE) return 0;
  if (losBlocked(g.x, g.y, player.x, player.y)) return 0;
  if (smokeBlocks(g.x, g.y, player.x, player.y, state.smokes)) return 0;
  // Closer = clearer. Shadow halves the clarity.
  let strength = 1 - dist / CFG.GUARD_RANGE;
  if (inShadow(player.x, player.y)) strength *= 0.5;
  return Math.max(0.05, strength);
}

function stepToward(g, tx, ty, speed, dt) {
  const dx = tx - g.x;
  const dy = ty - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = g.x + (dx / dist) * step;
  const ny = g.y + (dy / dist) * step;
  const pos = moveCircle(g.x, g.y, 13, nx - g.x, ny - g.y);
  g.x = pos.x;
  g.y = pos.y;
  g.dir = Math.atan2(dy, dx);
  return dist - step < 4;
}

export function updateGuards(state, dt) {
  const { player } = state;
  for (const g of state.guards) {
    g.stateT += dt;
    g.seeStrength = guardSees(g, player, state);

    // A fresh sighting is remembered even if the thief ducks behind cover.
    if (g.seeStrength > 0.15) {
      g.lastSeen = { x: player.x, y: player.y, t: state.time };
      if (g.state === 'patrol' || g.state === 'investigate') {
        g.state = 'suspect';
        g.stateT = 0;
      }
    }

    // Decoy lure overrides patrol/suspect (not an active chase).
    if (g.state !== 'chase') {
      for (const d of state.decoys) {
        const dist = Math.hypot(d.x - g.x, d.y - g.y);
        if (dist < CFG.DECOY_LURE_R && !d.claimedBy) {
          d.claimedBy = g;
          g.investigate = { x: d.x, y: d.y };
          g.state = 'investigate';
          g.stateT = 0;
        }
      }
    }

    if (g.seeStrength > 0.55 && state.alarm > 55) {
      g.state = 'chase';
      g.stateT = 0;
    } else if (g.state === 'chase' && (g.seeStrength <= 0 || state.alarm < 40)) {
      g.state = 'suspect';
      g.stateT = 0;
    }

    switch (g.state) {
      case 'patrol': {
        if (g.pauseT > 0) {
          g.pauseT -= dt;
          break;
        }
        const wp = g.waypoints[g.wpi];
        if (stepToward(g, wp.x, wp.y, CFG.GUARD_PATROL_SPEED, dt)) {
          g.wpi = (g.wpi + 1) % g.waypoints.length;
          g.pauseT = 0.9; // glance around at each waypoint — the cone sweeps
        }
        break;
      }
      case 'suspect': {
        if (g.lastSeen) {
          const arrived = stepToward(g, g.lastSeen.x, g.lastSeen.y, CFG.GUARD_SUSPECT_SPEED, dt);
          if (arrived || g.stateT > 4) {
            // Look around for a moment, then give up and go back on patrol.
            g.dir += Math.sin(state.time * 2.2 + g.wpi) * 0.9 * dt;
            if (g.stateT > 6) {
              g.state = 'patrol';
              g.stateT = 0;
              g.lastSeen = null;
            }
          }
        } else {
          g.state = 'patrol';
        }
        break;
      }
      case 'chase': {
        stepToward(g, player.x, player.y, CFG.GUARD_CHASE_SPEED, dt);
        // Touching the thief while chasing ends the run (fair: the guard
        // had to see you, close in, and the alarm had to be high).
        if (Math.hypot(player.x - g.x, player.y - g.y) < CFG.GUARD_TOUCH_R) {
          state.caughtBy = g.name;
          state.alarm = CFG.ALARM_CAUGHT;
        }
        break;
      }
      case 'investigate': {
        if (g.investigate) {
          const arrived = stepToward(g, g.investigate.x, g.investigate.y, CFG.GUARD_INVESTIGATE_SPEED, dt);
          if (arrived || g.stateT > 5) {
            g.state = 'patrol';
            g.stateT = 0;
            g.investigate = null;
          }
        } else {
          g.state = 'patrol';
        }
        break;
      }
      default:
        break;
    }

    const clamped = clampToFloor(g.x, g.y, 13);
    g.x = clamped.x;
    g.y = clamped.y;
  }
}
