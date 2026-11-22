// The Midnight Teller — shots.js
// Deterministic screenshot staging. `?shot=<name>&seed=<n>` in the URL
// poses the game for one frame: the cover shows the whole heist in a single
// frame (rooms + thief + guards with bright cones + cameras + glowing vault
// + alarm meter + cover), the other shots show depth — the vent route, a
// tool in use, a near-catch, and the getaway. Nothing here edits the game;
// it only moves actors into place and sets the HUD numbers.

import { CFG } from './config.js';

function placeGuard(state, i, x, y, dir) {
  const g = state.guards[i];
  g.x = x;
  g.y = y;
  g.dir = dir;
  g.state = 'patrol';
  g.stateT = 0;
  g.seeStrength = 0;
  g.lastSeen = null;
}

function placeCam(state, i, angle) {
  const cam = state.cams[i];
  cam.angle = angle;
  cam.disabledT = 0;
  cam.seeStrength = 0;
}

export function stageShot(state, name) {
  const p = state.player;
  state.mode = 'play';
  state.shot = name;

  if (name === 'cover') {
    // The whole heist in one frame, mid-teller-hall.
    p.x = 430;
    p.y = 330;
    p.dir = Math.PI / 2;
    p.inVent = false;
    placeGuard(state, 0, 300, 260, Math.PI / 2); // Roni, cone sweeping down the hall
    placeGuard(state, 1, 760, 500, -Math.PI / 2); // Bimo, cone up the vault corridor
    placeGuard(state, 2, 560, 540, Math.PI); // Sari, cone across the lobby
    state.guards[0].seeStrength = 0.3; // suspicious "?" over Roni
    placeCam(state, 0, Math.PI / 2 + 0.35);
    placeCam(state, 1, Math.PI - 0.3);
    state.alarm = 35;
    state.loot = 400;
    state.time = 62;
    state.vaultOpen = false;
    state.toast = '';
    state.toastT = 0;
    return;
  }

  if (name === 'route') {
    // The alternate route: crawling the vent duct over the hall while a
    // guard patrols underneath, none the wiser.
    p.x = 500;
    p.y = 82;
    p.dir = 0;
    p.inVent = true;
    placeGuard(state, 0, 480, 170, Math.PI / 2);
    placeGuard(state, 1, 780, 480, 0);
    placeGuard(state, 2, 300, 560, -Math.PI / 2);
    placeCam(state, 0, Math.PI / 2);
    placeCam(state, 1, Math.PI);
    state.alarm = 12;
    state.loot = 200;
    state.time = 38;
    state.vaultOpen = false;
    state.toast = 'IN THE VENT — unseen…';
    state.toastT = 99;
    return;
  }

  if (name === 'tools') {
    // EMP + smoke in play: cameras dead (grey arcs), a smoke cloud hides
    // the thief, a decoy coin pulls a guard away.
    p.x = 700;
    p.y = 300;
    p.dir = Math.PI;
    p.inVent = false;
    placeGuard(state, 0, 420, 300, 0);
    placeGuard(state, 1, 820, 560, -Math.PI / 2);
    placeGuard(state, 2, 340, 560, Math.PI / 2);
    state.guards[0].state = 'investigate';
    state.guards[0].investigate = { x: 560, y: 330 };
    placeCam(state, 0, Math.PI / 2);
    placeCam(state, 1, Math.PI);
    state.cams[0].disabledT = 6;
    state.cams[1].disabledT = 6;
    state.empT = 6;
    state.smokes = [{ x: 700, y: 300, r: 92, t: 5 }];
    state.decoys = [{ x: 560, y: 330, t: 3, claimedBy: state.guards[0] }];
    state.alarm = 48;
    state.loot = 950;
    state.time = 121;
    state.vaultOpen = false;
    state.toast = 'EMP — cameras down 8s';
    state.toastT = 99;
    return;
  }

  if (name === 'caught') {
    // A near-catch: alarm at 96, a guard sprinting in, cone red, thief
    // one step from the shadow.
    p.x = 860;
    p.y = 470;
    p.dir = Math.PI;
    p.inVent = false;
    placeGuard(state, 0, 560, 300, 0);
    placeGuard(state, 1, 800, 470, Math.PI);
    state.guards[1].state = 'chase';
    state.guards[1].seeStrength = 0.9;
    placeGuard(state, 2, 420, 560, -Math.PI / 2);
    placeCam(state, 0, Math.PI / 2 + 0.5);
    placeCam(state, 1, Math.PI + 0.2);
    state.cams[1].seeStrength = 0.7;
    state.alarm = 96;
    state.loot = 1150;
    state.time = 154;
    state.vaultOpen = true;
    state.flashRed = 1.2;
    state.toast = '';
    state.toastT = 0;
    return;
  }

  if (name === 'getaway') {
    // The payoff, one step from disaster: vault cracked, gold grabbed,
    // thief at the van — alarm at 88 and a guard sprinting in behind.
    // Near-catch tension AND the getaway in a single frame.
    p.x = 150;
    p.y = 622;
    p.dir = -Math.PI / 2;
    p.inVent = false;
    placeGuard(state, 0, 300, 260, Math.PI);
    placeGuard(state, 1, 330, 600, Math.PI);
    state.guards[1].state = 'chase';
    state.guards[1].seeStrength = 0.85;
    placeGuard(state, 2, 480, 480, 0);
    placeCam(state, 0, Math.PI / 2 - 0.4);
    placeCam(state, 1, Math.PI);
    state.alarm = 88;
    state.loot = 2150;
    state.time = 203;
    state.vaultOpen = true;
    for (const item of state.lootItems) {
      if (item.inVault) item.taken = true;
    }
    state.toast = 'GETAWAY — GO GO GO!';
    state.toastT = 99;
    return;
  }

  // Unknown shot name: leave the live game alone.
  state.mode = 'title';
}

export function shotNames() {
  return ['cover', 'route', 'tools', 'caught', 'getaway'];
}
