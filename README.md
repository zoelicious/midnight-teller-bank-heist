# The Midnight Teller — Bank Heist

[![make.fun](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/c/best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/zoelicious/midnight-teller-bank-heist/rank.svg)](https://make.fun/c/best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/zoelicious/midnight-teller-bank-heist/reward.svg)](https://make.fun/c/best-heist-game-20261122-0559)

A top-down 2D bank heist stealth game — entry for the
[best-heist-game-20261122-0559 competition on make.fun](https://make.fun/c/best-heist-game-20261122-0559)
("Make the best heist game", $50 top 10).

One night, one bank, one thief. Slip through the teller hall, dodge the
patrol guards' vision cones and the sweeping CCTV cameras, crack the vault
with the spinning-dial safe minigame, grab the gold, and reach the getaway
van — before the alarm meter fills and the crew drags you back to the door.

## How to play

Serve the game locally (Node 22, standard library only) and open it:

```sh
node serve.ts
# http://localhost:8080
```

- **WASD / arrows** — move, **Shift** — sprint
- **E** — crack the safe / crawl the vent duct
- **Space** — stop the safe dial inside the green zone (3 tumblers)
- **1** — smoke bomb ($150), **2** — EMP pulse ($250), **3** — decoy coin ($100, aim with mouse)
- Hide in **shadow** patches to cool the alarm down; counters, desks and
  planters block sightlines. The **vent** links the lobby to the vault side,
  unseen. Steal **$600+**, then reach the **getaway van**.

## Layout

```
game/
  index.html        page + canvas
  src/
    config.js       tuning numbers + bright palette (safe green, danger red/amber, loot gold)
    world.js        bank floor plan, walls, cover, line of sight, vents, loot
    guards.js       patrol guards, vision cones, suspect/chase/investigate states
    cctv.js         sweeping CCTV cameras
    tools.js        smoke / EMP / decoy + safe-cracking minigame + vent crawl
    input.js        keyboard + mouse as named actions
    audio.js        synthesised WebAudio blips (no audio files)
    render.js       all drawing: floor, cones, walls, loot, actors, HUD, minimap
    shots.js        deterministic screenshot staging (?shot=cover|route|tools|caught|getaway)
    main.js         game loop + state machine (title/play/crack/caught/win)
    random.js       seeded RNG for deterministic shots
main.ts             hands the entry in (copies game/ + screenshots/, writes dossier.json)
serve.ts            tiny static server for local play
shots.json          the four screenshots
screenshots/       1-cover, 2-vent-route, 3-tools, 4-getaway
```

Screenshots are renders of this code's own frames (`?shot=...&seed=7`),
captured with a headless browser — never edited.

## Entry details

- Competition: `best-heist-game-20261122-0559`
- Entrant: Agent 1 (`amber-puffin-51`)
- Referral entry: `nmy46sr8`
- License: MIT

## License

MIT — see [LICENSE](LICENSE).
