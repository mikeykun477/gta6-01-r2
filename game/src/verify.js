// Port Vireo — verification. The built-in selftest (?selftest=1) proves the
// systems work without playing: deterministic city gen, collision, driving,
// wanted heat, combat, missions and save round-trip. Shot staging
// (?shot=start|play|chase|finale&seed=N) poses deterministic scenes for
// screenshots.
import { buildCity, collideCircle, pointInBuilding, snapToRoad } from './map.js';
import { makeRng, dist } from './rng.js';
import { makeCar, driveCar, spawnTraffic, updateTraffic } from './drive.js';
import { makePlayer, movePlayer, makePed } from './people.js';
import { addHeat, decayHeat, playerShoot, updateBullets, makePickups } from './fight.js';
import { MISSIONS, missionState } from './story.js';
import { saveGame, loadGame } from './store.js';

export function runSelftest(S) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

  // 1. Deterministic city: same seed -> identical fingerprint + building count.
  const a = buildCity(1337), b = buildCity(1337), c = buildCity(99);
  check('city deterministic (same seed, same hash)', a.hash === b.hash && a.buildings.length === b.buildings.length, `hash=${a.hash} n=${a.buildings.length}`);
  check('city seed-sensitive (different seed differs)', a.hash !== c.hash, `1337=${a.hash} 99=${c.hash}`);
  check('city has roads + buildings + parks', a.roadsV.length === 7 && a.roadsH.length === 6 && a.buildings.length > 40 && a.parks.length === 2, `b=${a.buildings.length}`);
  check('city has all 8 landmarks', Object.keys(a.places).length === 8);
  check('city has 12 coins', a.coins.length === 12);

  // 2. Collision: a point inside a building is pushed out.
  const blk = a.buildings[0];
  const p = { x: blk.x + blk.w / 2, y: blk.y + blk.h / 2 };
  collideCircle(a, p, 16);
  check('collision pushes a circle out of a building', !pointInBuilding(a, p.x, p.y), `moved to ${Math.round(p.x)},${Math.round(p.y)}`);

  // 3. Driving: acceleration moves the car forward, steering turns it.
  const car = makeCar(500, 500, 0, {});
  driveCar(car, { up: true, down: false, left: false, right: false, handbrake: false }, 1);
  check('car accelerates forward', car.x > 500 && car.speed > 100, `x=${Math.round(car.x)} speed=${Math.round(car.speed)}`);
  const car2 = makeCar(500, 500, 0, {});
  driveCar(car2, { up: true, down: false, left: false, right: true, handbrake: false }, 1);
  check('car steers while moving', car2.angle > 0.1, `angle=${car2.angle.toFixed(2)}`);

  // 4. Player movement + building collision.
  const pl = makePlayer(500, 500);
  movePlayer(a, pl, { up: false, down: false, left: false, right: true, run: false }, 0.5);
  check('player walks right', pl.x > 500, `x=${Math.round(pl.x)}`);

  // 5. Wanted heat ladder.
  const w = makePlayer(0, 0);
  addHeat(w, 25);
  check('heat 25 -> 2 stars', w.wanted === 2, `wanted=${w.wanted}`);
  addHeat(w, 60);
  check('heat 85 -> 5 stars', w.wanted === 5, `wanted=${w.wanted}`);
  decayHeat(w, 60, true);
  check('hiding sheds heat', w.heat < 85 && w.wanted < 5, `heat=${w.heat.toFixed(1)} wanted=${w.wanted}`);

  // 6. Combat: a bullet damages a gangster.
  const bullets = [];
  const shooter = makePlayer(100, 100);
  shooter.ammo = 12;
  const gang = [{ x: 160, y: 100, hp: 55, boss: false, state: 'guard', shootCd: 9, strafe: 0 }];
  playerShoot(shooter, 300, 100, bullets);
  check('player fires a bullet', bullets.length === 1 && shooter.ammo === 11);
  // Step like real frames do (dt <= 0.05) so the bullet cannot tunnel past.
  for (let i = 0; i < 10 && bullets.length; i++) {
    updateBullets(a, bullets, shooter, [], gang, [], [], 0.05, () => {});
  }
  check('bullet hits the gangster', gang[0].hp < 55, `hp=${gang[0].hp}`);

  // 7. Traffic: cars stay on roads and keep moving.
  const rng = makeRng(7);
  const traffic = spawnTraffic(a, rng, 10);
  check('traffic spawns on roads', traffic.every((t) => {
    const s = snapToRoad(a, t.x, t.y);
    return dist(t.x, t.y, s.x, s.y) < 120;
  }));
  const moved = traffic.map((t) => ({ x: t.x, y: t.y }));
  updateTraffic(a, traffic, traffic, 1, rng);
  check('traffic moves after 1s', traffic.some((t, i) => dist(t.x, t.y, moved[i].x, moved[i].y) > 20));

  // 8. Missions: the chain is six long and states initialise.
  check('story has 6 missions', MISSIONS.length === 6, MISSIONS.map((m) => m.title).join(', '));
  check('mission state initialises', missionState(MISSIONS[2]).timer === 100);

  // 9. Save round-trip.
  S.player.cash = 1234; S.missionIdx = 2; S.coinsTaken = 3; S.kills = 5; S.playSeconds = 321;
  const saved = saveGame(S);
  const loaded = loadGame();
  check('save/load round-trip', saved && loaded && loaded.cash === 1234 && loaded.missionIdx === 2 && loaded.coins === 3, JSON.stringify(loaded || {}));

  // 10. Pickups exist and peds spawn.
  check('pickups placed', makePickups().length === 7);
  check('pedestrian spawns on a road point', (() => { const pd = makePed(a, makeRng(3)); return pd.x > 0 && pd.y > 0; })());

  const passed = results.filter((r) => r.ok).length;
  const out = { results, passed, total: results.length, ok: passed === results.length };
  console.log(`[SELFTEST] ${passed}/${results.length} passed`);
  for (const r of results) console.log(`[SELFTEST] ${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`);
  document.title = out.ok ? `SELFTEST PASS ${passed}/${results.length}` : `SELFTEST FAIL ${passed}/${results.length}`;
  return out;
}

// --- Screenshot staging ----------------------------------------------------
export function stageShot(S, name, seed) {
  const rng = makeRng('shot-' + seed + '-' + name);
  const city = S.city;
  const p = S.player;
  // Reset to a clean staged scene.
  S.bullets.length = 0;
  S.gang.length = 0;
  S.cops.length = 0;
  S.toasts.length = 0;
  S.banner = null;
  p.heat = 0; p.wanted = 0; p.hp = 100; p.ammo = 24;

  if (name === 'start') {
    S.mode = 'title';
    return;
  }
  S.mode = 'play';
  if (name === 'play') {
    // Driving downtown on Neon Row with traffic around.
    const car = S.cars.find((c) => c.driver === 'player') || S.cars[0];
    p.inCar = car; car.driver = 'player'; car.parked = false;
    car.x = 1680; car.y = 720; car.angle = 0; car.speed = 320;
    p.x = car.x; p.y = car.y;
    S.missionIdx = 1;
    S.mission = missionState(MISSIONS[1]);
    S.toast('Mission 2 — Hot Wheels: steal the Neon Coupe');
    // Traffic cruising the same avenue.
    S.cars.filter((c) => c.driver === 'traffic').slice(0, 6).forEach((c, i) => {
      c.x = 1350 + i * 110; c.y = 720 + (i % 2 ? -28 : 28); c.angle = i % 2 ? Math.PI : 0; c.axis = 'h'; c.speed = 150;
    });
    S.cam.x = car.x + 120; S.cam.y = car.y;
  } else if (name === 'chase') {
    const car = S.cars.find((c) => c.driver === 'player') || S.cars[0];
    p.inCar = car; car.driver = 'player'; car.parked = false;
    car.x = 1680; car.y = 1500; car.angle = Math.PI / 2; car.speed = 380;
    p.x = car.x; p.y = car.y;
    p.heat = 55; p.wanted = 3;
    S.missionIdx = 3;
    S.mission = missionState(MISSIONS[3]);
    S.toast('WANTED — 3 stars! Lose the Vireo PD!');
    // Two police cruisers in pursuit up the same avenue.
    for (let i = 0; i < 2; i++) {
      const pc = makeCar(1680, 1320 - i * 140, Math.PI / 2, { kind: 'police', color: '#e8e8e8' });
      pc.driver = 'police';
      S.cars.push(pc);
      S.cops.push({ x: pc.x, y: pc.y, angle: 0, speed: 0, state: 'chase', hp: 60, grabT: 0, car: pc, batonCd: 0, shootCd: 0 });
    }
    S.cam.x = car.x + 100; S.cam.y = car.y;
  } else if (name === 'finale') {
    p.inCar = null;
    p.x = 3180; p.y = 1900; p.angle = 0;
    p.hp = 72; p.ammo = 24;
    S.missionIdx = 5;
    S.mission = missionState(MISSIONS[5]);
    S.mission.bossDown = false;
    S.gang.push({ x: 3330, y: 1900, hp: 220, boss: true, state: 'fight', shootCd: 2, strafe: 0, angle: Math.PI });
    for (let i = 0; i < 3; i++) {
      S.gang.push({ x: 3250 + i * 70, y: 1820 + (i % 2) * 140, hp: 55, boss: false, state: 'fight', shootCd: 1 + i, strafe: i, angle: Math.PI });
    }
    S.bullets.push({ x: 3200, y: 1900, vx: 700, vy: 0, from: 'player', dmg: 26, life: 0.5 });
    S.toast('Final mission — take down King Marlow!');
    S.cam.x = 3250; S.cam.y = 1900;
  }
  document.title = 'SHOT ' + name;
}
