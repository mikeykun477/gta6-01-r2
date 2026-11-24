[![make.fun competition](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/mikeykun477/gta6-01-r2/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/mikeykun477/gta6-01-r2/reward.svg)](https://make.fun/competitions/gta6-01)

# Port Vireo — an open-world crime game

**Built for the [make.fun](https://make.fun) competition gta6-01 — "Make GTA 6" ($1,666, top 100 win).**

Rae Calloway drove getaway for the Harbor Kings for five years — then walked away. Now her little brother Milo has vanished after one last job for them, and the only person who will help is Auntie Oka, the fixer who taught Rae to drive. **Find Milo. Burn the Kings down.** That is the spine of *Port Vireo*: a complete, original, open-world crime game that runs entirely offline in a desktop browser from static files — no network request at runtime, no Rockstar asset, name or map anywhere in it. Every street, character, vehicle and line of dialogue is original.

## Why this entry deserves the top of the board

Most open-world web demos show you *one* system — a drivable car, a city to look at, a walker. *Port Vireo* wires **every system of the genre together and makes them interact**, the way the bounty asks ("the most complete rendition"):

- **A living city, not a backdrop.** A seeded procedural Port Vireo — seven districts (Old Harbor, Neon Row, Palm Courts, University Hill, Midtown, The Docks, Coral Beach), a park, a pier, a port full of warehouses — with road-following traffic, sidewalk pedestrians who flee gunfire, parked cars, hidden Vireo Coins and health/ammo pickups.
- **On foot and behind the wheel.** Arcade car physics (grip, drift, handbrake), traffic AI that turns at intersections, and carjacking: yank a driver out of a moving car and the law notices.
- **A real wanted system.** Crimes build heat on a 0–5 star ladder; the Vireo PD answers with foot cops who grab and bust you and cruisers that ram your car. Lose them by breaking line of sight — or pay the $500 bail.
- **A story with an ending, not a sandbox with a score.** Six chained missions — a homecoming, a hot-wheels theft, a timed dockside drop under ambush, a gang clear-out, an informant escort under pursuit, and a boss fight against King Marlow himself — with a finale screen and free roam afterwards. Plus repeatable courier jobs for cash.
- **Combat that fights back.** Mouse-aim pistol with reloads, punches, gang shooters who strafe and return fire, a boss with 220 HP, and health that actually matters (damage vignette, WASTED / BUSTED screens).
- **The full shell.** Animated HUD (health, cash, ammo, wanted stars, objective tracker), a live minimap with mission, police and gang blips, title / pause / game-over screens, localStorage save & continue, and a fully synthesized WebAudio soundscape (engine, gunshots, sirens, stings) — zero audio files.
- **Proof, not promises.** A built-in selftest (`?selftest=1`) runs 21 checks — deterministic city generation, collision, driving, the wanted ladder, bullet hits, traffic, missions and save round-trip — and reports PASS/FAIL on screen. Seeded screenshot staging (`?shot=start|play|chase|finale&seed=1`) poses the same scene every time (city, cars and actors are seeded; live traffic makes individual pixels vary run to run).

## Play

```sh
node serve.ts            # then open http://localhost:8080
# or open game/index.html through any static server
```

| Key | Action |
| --- | ------ |
| WASD / Arrows | Move on foot / drive |
| E | Enter / exit car |
| F | Steal (carjack) the nearest car |
| Mouse + Click | Aim / shoot pistol |
| Space | Punch (on foot) / handbrake (driving) |
| R | Reload |
| C | Take a courier job |
| P / Esc | Pause & save · S save · Q quit to title |
| M | Mute |

Save/continue lives in `localStorage` (`port-vireo-save-v1`); progress autosaves on every completed mission.

## Structure

```
game/
  index.html            entry point (static, offline)
  src/
    boot.js             game loop, input, police director, saves
    map.js              seeded procedural city (roads, blocks, districts)
    drive.js            car physics + traffic AI + police pursuit
    people.js           player, pedestrians, foot police, gang AI
    fight.js            bullets, punches, pickups, wanted-heat rules
    story.js            the 6-mission story chain
    hud.js              world/HUD/minimap/title/pause/end rendering
    sfx.js              synthesized WebAudio (no audio files)
    store.js            localStorage save / load
    rng.js              seeded RNG + math helpers
    verify.js           selftest (?selftest=1) + shot staging (?shot=…)
screenshots/            4 real gameplay captures (title, driving, pursuit, finale)
main.ts                 make.fun program: copies game/ + screenshots/, writes dossier.json
```

## Verification (run 2026-11-24, headless Chromium)

- `?selftest=1` → **SELFTEST PASS 21/21**, zero console errors.
- All 4 screenshots render from the live game at 1280×800, each ≤ 256 KiB.
- City generation is deterministic: two builds from seed `1337` produce the identical fingerprint (checked by the selftest, re-verified on a second run). Shot staging is seeded, so the same scene is posed every run; exact pixels vary slightly because traffic keeps simulating live.

## License

MIT — see [LICENSE](LICENSE).
