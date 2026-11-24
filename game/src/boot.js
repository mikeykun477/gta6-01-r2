// Port Vireo — boot. Wires every system together: input, the game loop, the
// police director, mission hooks, courier side jobs, busted / wasted, and
// save / load. The entry point is game/index.html.
import { buildCity, snapToRoad, randomRoadPoint, WORLD_W, WORLD_H } from './map.js';
import { makeRng, clamp, dist, angleTo } from './rng.js';
import { makeCar, driveCar, spawnTraffic, spawnParked, updateTraffic, updatePoliceCar } from './drive.js';
import { makePlayer, makePed, makeCop, makeGangster, movePlayer, updatePeds, updateCops, updateGang } from './people.js';
import { playerShoot, playerPunch, updateBullets, addHeat, decayHeat, makePickups, checkPickups } from './fight.js';
import { MISSIONS, missionState, updateMission } from './story.js';
import { drawWorld, drawHUD, drawTitle, drawPause, drawEnd } from './hud.js';
import { Sfx } from './sfx.js';
import { saveGame, loadGame, hasSave, clearSave } from './store.js';
import { runSelftest, stageShot } from './verify.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- State ------------------------------------------------------------------
function newState() {
  const city = buildCity(1337);
  const rng = makeRng('vireo-' + Date.now());
  const player = makePlayer(city.places.garage.x, city.places.garage.y + 230);
  const cars = [
    ...spawnParked(city, makeRng('parked-1337'), 9),
    ...spawnTraffic(city, makeRng('traffic-1337'), 14),
  ];
  const peds = [];
  for (let i = 0; i < 22; i++) peds.push(makePed(city, rng));
  return {
    city, rng, player, cars, peds,
    gang: [], cops: [], bullets: [],
    pickups: makePickups(),
    mode: 'title', // title | play | pause | over | finale | selftest
    overKind: null,
    missionIdx: 0,
    mission: missionState(MISSIONS[0]),
    coinsTaken: 0, kills: 0, playSeconds: 0, time: 0,
    cam: { x: player.x, y: player.y, w: canvas.width, h: canvas.height },
    toasts: [], banner: null,
    sfx: new Sfx(),
    gunfire: null,
    courier: null,
    stolenTarget: null,
    selftest: null,
    keys: {},
    mouse: { x: canvas.width / 2, y: canvas.height / 2, down: false },
    copSpawnT: 0,
  };
}

let S = newState();

S.toast = (text) => {
  S.toasts.push({ text, life: 4 });
  if (S.toasts.length > 3) S.toasts.shift();
  statusEl.textContent = text;
};
S.showBanner = (title, sub) => { S.banner = { title, sub, life: 3.2 }; };
S.wantedBump = (stars) => addHeat(S.player, stars * 14);

// --- Missions ----------------------------------------------------------------
function startMission(idx) {
  const m = MISSIONS[idx];
  if (!m) return;
  S.mission = missionState(m);
  S.showBanner(`MISSION ${m.id} — ${m.title}`, m.brief);
  S.toast(m.objective);
  const city = S.city;
  if (m.kind === 'steal-deliver') {
    const coupe = makeCar(city.places.nightclub.x + 40, city.places.nightclub.y + 90, Math.PI / 2, {
      kind: 'mission', color: '#ff2d78', model: 'Neon Coupe', parked: true, driver: null,
    });
    S.cars.push(coupe);
    S.stolenTarget = coupe;
    S.toast('The Neon Coupe is parked by Club Mirage.');
  }
  if (m.kind === 'timed-goto') {
    for (let i = 0; i < 3; i++) {
      S.gang.push(makeGangster(city.places.warehouse.x - 120 + i * 90, city.places.warehouse.y - 60 + (i % 2) * 120));
    }
  }
  if (m.kind === 'eliminate') {
    for (let i = 0; i < 5; i++) {
      S.gang.push(makeGangster(city.places.nightclub.x - 140 + i * 70, city.places.nightclub.y + 60 + (i % 2) * 90));
    }
  }
  if (m.kind === 'boss') {
    S.gang.push(makeGangster(city.places.warehouse.x + 60, city.places.warehouse.y, true));
    for (let i = 0; i < 4; i++) {
      S.gang.push(makeGangster(city.places.warehouse.x - 100 + i * 80, city.places.warehouse.y - 120 + (i % 2) * 220));
    }
  }
}

function completeMission() {
  const m = MISSIONS[S.missionIdx];
  S.player.cash += m.pay;
  S.showBanner('MISSION COMPLETE', `${m.title} — +$${m.pay}`);
  S.sfx.sting();
  S.missionIdx += 1;
  saveGame(S);
  if (S.missionIdx >= MISSIONS.length) {
    S.mode = 'finale';
    return;
  }
  startMission(S.missionIdx);
}

function failMission(reason) {
  S.showBanner('MISSION FAILED', reason);
  S.sfx.fail();
  startMission(S.missionIdx);
}

// --- Police director ----------------------------------------------------------
function policeDirector(dt) {
  const p = S.player;
  const wantFoot = p.wanted === 0 ? 0 : p.wanted <= 1 ? 1 : p.wanted <= 2 ? 2 : 3;
  const wantCar = p.wanted === 0 ? 0 : p.wanted <= 1 ? 0 : p.wanted <= 2 ? 1 : p.wanted <= 3 ? 2 : p.wanted <= 4 ? 3 : 4;
  const foot = S.cops.filter((c) => !c.car).length;
  const cars = S.cops.filter((c) => c.car).length;
  S.copSpawnT -= dt;
  if (S.copSpawnT <= 0) {
    S.copSpawnT = 1.2;
    const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
    if (foot < wantFoot) {
      const s = snapToRoad(S.city, px + (Math.random() < 0.5 ? -1 : 1) * 600, py + (Math.random() < 0.5 ? -1 : 1) * 500);
      S.cops.push(makeCop(s.x, s.y, null));
    } else if (cars < wantCar) {
      const s = snapToRoad(S.city, px + (Math.random() < 0.5 ? -1 : 1) * 700, py);
      const pc = makeCar(s.x, s.y, 0, { kind: 'police', color: '#e8e8e8', driver: 'police' });
      S.cars.push(pc);
      S.cops.push(makeCop(s.x, s.y, pc));
    }
  }
  // Cops give up when the heat is gone.
  if (p.wanted === 0 && S.cops.length > 0) {
    S.cops = S.cops.filter((c) => { if (c.car) { const i = S.cars.indexOf(c.car); if (i >= 0) S.cars.splice(i, 1); } return false; });
    if (S.cops.length === 0) S.toast('You lost them. Stay clean.');
  }
  // Despawn cops that fell far behind.
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  S.cops = S.cops.filter((c) => {
    if (dist(c.x, c.y, px, py) > 1600) {
      if (c.car) { const i = S.cars.indexOf(c.car); if (i >= 0) S.cars.splice(i, 1); }
      return false;
    }
    return true;
  });
}

function bustPlayer() {
  const p = S.player;
  p.cash = Math.max(0, p.cash - 500);
  p.heat = 0; p.wanted = 0; p.hp = 100; p.bustedT = 0;
  p.inCar = null;
  S.cops = [];
  S.cars = S.cars.filter((c) => c.kind !== 'police');
  p.x = S.city.places.garage.x; p.y = S.city.places.garage.y + 60;
  S.mode = 'over'; S.overKind = 'busted';
  S.sfx.fail();
  saveGame(S);
}

function wastePlayer() {
  const p = S.player;
  p.cash = Math.max(0, p.cash - 200);
  p.hp = 100; p.heat = 0; p.wanted = 0; p.bustedT = 0;
  p.inCar = null;
  S.cops = [];
  S.cars = S.cars.filter((c) => c.kind !== 'police');
  p.x = S.city.places.hospital.x; p.y = S.city.places.hospital.y + 60;
  S.mode = 'over'; S.overKind = 'wasted';
  S.sfx.fail();
  saveGame(S);
}

// --- Car enter / steal ---------------------------------------------------------
function nearestCar(maxD) {
  const p = S.player;
  let best = null, bd = maxD;
  for (const c of S.cars) {
    if (c.hp <= 0 || c.kind === 'police') continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterCar(car, stolen) {
  const p = S.player;
  if (car.driver === 'traffic') {
    // Yank the driver out — they flee on foot.
    const d = makePed(S.city, S.rng);
    d.x = car.x + 30; d.y = car.y + 30; d.state = 'flee'; d.fleeT = 4;
    S.peds.push(d);
  }
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  if (stolen) {
    addHeat(p, 12);
    S.toast(`Stole a ${car.model} — the law noticed.`);
    if (S.stolenTarget === car) car.stolen = true;
  }
}

function exitCar() {
  const p = S.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.inCar = null;
}

// --- Courier side job -----------------------------------------------------------
function startCourier() {
  if (S.courier) { S.toast('Courier job already running.'); return; }
  const p = S.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  let t, tries = 0;
  do { t = randomRoadPoint(S.city, S.rng); tries++; } while (dist(px, py, t.x, t.y) < 500 && tries < 20);
  const d = dist(px, py, t.x, t.y);
  S.courier = { x: t.x, y: t.y, timer: clamp(d / 9, 45, 110), pay: 150 + Math.round(d / 10) };
  S.toast(`Courier job: deliver to the marker — $${S.courier.pay} if you're fast.`);
}

// --- Input ----------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  S.sfx.ensure();
  if (S.mode === 'title' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
    if (hasSave()) applySave(loadGame());
    else { S.mode = 'play'; startMission(0); }
    return;
  }
  if (S.mode === 'title' && e.code === 'KeyN') { clearSave(); S = freshState(); S.mode = 'play'; startMission(0); return; }
  if ((S.mode === 'over' || S.mode === 'finale') && e.code === 'Enter') { S.mode = 'play'; return; }
  if (S.mode === 'play' && (e.code === 'KeyP' || e.code === 'Escape')) { S.mode = 'pause'; return; }
  if (S.mode === 'pause') {
    if (e.code === 'KeyP' || e.code === 'Escape') S.mode = 'play';
    if (e.code === 'KeyS') { saveGame(S); S.toast('Game saved.'); }
    if (e.code === 'KeyM') { S.sfx.setMuted(!S.sfx.muted); S.toast(S.sfx.muted ? 'Muted.' : 'Sound on.'); }
    if (e.code === 'KeyQ') { saveGame(S); S.mode = 'title'; }
    return;
  }
  if (S.mode !== 'play') return;
  if (e.code === 'KeyM') { S.sfx.setMuted(!S.sfx.muted); S.toast(S.sfx.muted ? 'Muted.' : 'Sound on.'); }
  if (e.code === 'KeyC') startCourier();
  if (e.code === 'KeyR' && S.player.hasGun && S.player.ammo < 12 && S.player.reloadT <= 0) {
    S.player.reloadT = 1.1; S.toast('Reloading…');
  }
  if (e.code === 'KeyE') {
    if (S.player.inCar) exitCar();
    else {
      const car = nearestCar(56);
      if (car) enterCar(car, car.driver === 'traffic' || car.parked);
      else S.toast('No car nearby.');
    }
  }
  if (e.code === 'KeyF') {
    if (!S.player.inCar) {
      const car = nearestCar(80);
      if (car) enterCar(car, true);
      else S.toast('Nothing to steal nearby.');
    }
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!S.player.inCar) {
      const hit = playerPunch(S.player, S.peds, S.gang, S.cops);
      if (hit) {
        S.sfx.punch();
        if (hit.kind === 'ped') addHeat(S.player, 10);
        if (hit.kind === 'cop') addHeat(S.player, 14);
        if (hit.kind === 'gang') onGangHit(hit.target);
      }
    }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => { S.mouse.x = e.clientX; S.mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  S.sfx.ensure();
  if (S.mode !== 'play' || e.button !== 0) return;
  const p = S.player;
  if (p.inCar) return;
  const wx = S.mouse.x + S.cam.x - S.cam.w / 2;
  const wy = S.mouse.y + S.cam.y - S.cam.h / 2;
  if (playerShoot(p, wx, wy, S.bullets)) {
    S.sfx.shot();
    S.gunfire = { x: p.x, y: p.y, life: 0.5 };
    addHeat(p, 1.5);
  } else if (p.ammo <= 0 && p.reloadT <= 0) {
    p.reloadT = 1.1;
    S.toast('Reloading…');
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function freshState() {
  const keepSfx = S ? S.sfx : new Sfx();
  const ns = newState();
  ns.sfx = keepSfx;
  ns.toast = S.toast;
  ns.showBanner = S.showBanner;
  ns.wantedBump = S.wantedBump;
  return ns;
}

function applySave(d) {
  if (!d) { S.mode = 'play'; startMission(0); return; }
  S.player.cash = d.cash; S.player.hp = d.hp; S.player.ammo = d.ammo;
  S.player.x = d.x; S.player.y = d.y;
  S.missionIdx = Math.min(d.missionIdx, MISSIONS.length - 1);
  S.coinsTaken = d.coins || 0; S.kills = d.kills || 0; S.playSeconds = d.playSeconds || 0;
  S.city.coins.forEach((c, i) => { if (i < S.coinsTaken) c.taken = true; });
  S.mode = 'play';
  startMission(S.missionIdx);
  S.toast('Save loaded — welcome back to Port Vireo.');
}

function onGangHit(g) {
  if (g.hp <= 0 && !g.counted) {
    g.counted = true;
    S.kills += 1;
    if (S.missionIdx === 3) S.mission.killed += 1;
    if (g.boss) {
      S.mission.bossDown = true;
      S.toast('Marlow is down! Get to Milo!');
      S.sfx.sting();
    }
  }
}

// --- Update ----------------------------------------------------------------------
function readInput() {
  return {
    up: keys.KeyW || keys.ArrowUp,
    down: keys.KeyS || keys.ArrowDown,
    left: keys.KeyA || keys.ArrowLeft,
    right: keys.KeyD || keys.ArrowRight,
    run: keys.ShiftLeft || keys.ShiftRight,
    handbrake: keys.Space,
  };
}

function update(dt) {
  const p = S.player;
  S.time += dt;
  S.playSeconds += dt;
  S.toasts.forEach((t) => { t.life -= dt; });
  S.toasts = S.toasts.filter((t) => t.life > 0);
  if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }
  if (S.gunfire) { S.gunfire.life -= dt; if (S.gunfire.life <= 0) S.gunfire = null; }

  const input = readInput();
  if (p.inCar) {
    const car = p.inCar;
    driveCar(car, input, dt);
    // Building collision for the car: stop and slide.
    const before = { x: car.x, y: car.y };
    // Car-vs-building: stop and slide (cheap AABB push-out).
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    if (S.city.buildings.some((b) => car.x > b.x - 20 && car.x < b.x + b.w + 20 && car.y > b.y - 20 && car.y < b.y + b.h + 20)) {
      // Cheap AABB push-out for cars.
      car.x = before.x; car.y = before.y;
      car.speed *= 0.35;
    }
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, WORLD_H - 40);
    if (car.hp <= 0) {
      S.toast('Your car is wrecked!');
      p.hp -= 15;
      exitCar();
    }
    S.sfx.setEngine(Math.abs(car.speed) / 520);
  } else {
    movePlayer(S.city, p, input, dt);
    // Aim at the mouse.
    const wx = S.mouse.x + S.cam.x - S.cam.w / 2;
    const wy = S.mouse.y + S.cam.y - S.cam.h / 2;
    if (dist(wx, wy, p.x, p.y) > 30) p.angle = angleTo(p.x, p.y, wx, wy);
    S.sfx.engineOff();
  }

  // Traffic + police cars.
  updateTraffic(S.city, S.cars, S.cars, dt, S.rng);
  for (const c of S.cops) {
    if (c.car) {
      updatePoliceCar(S.city, c.car, p.inCar ? p.inCar : p, dt);
      c.x = c.car.x; c.y = c.car.y;
      // Ram the player.
      const target = p.inCar ? p.inCar : p;
      if (dist(c.car.x, c.car.y, target.x, target.y) < 44) {
        if (p.inCar) { p.inCar.hp -= 26 * dt; p.inCar.speed *= 0.96; }
        else { p.hp -= 9 * dt; }
      }
    }
  }

  updatePeds(S.city, S.peds, p, S.gunfire, dt, S.rng);
  updateCops(S.city, S.cops, p, dt);
  updateGang(S.gang, p, S.bullets, dt);
  updateBullets(S.city, S.bullets, p, S.peds, S.gang, S.cops, S.cars, dt, (kind, t) => {
    if (kind === 'gang') onGangHit(t);
    if (kind === 'ped') { addHeat(p, 14); S.toast('A pedestrian is down — witnesses called it in.'); }
    if (kind === 'cop') addHeat(p, 16);
    if (kind === 'player') S.sfx.blip(140, 0.1, 'square', 0.08);
  });

  // Recycle peds / traffic far from the player.
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  for (const ped of S.peds) {
    if (dist(ped.x, ped.y, px, py) > 1500) {
      ped.x = px + (Math.random() < 0.5 ? -1 : 1) * 700;
      ped.y = py + (Math.random() < 0.5 ? -1 : 1) * 600;
      ped.state = 'walk';
    }
  }
  for (const c of S.cars) {
    if (c.driver === 'traffic' && dist(c.x, c.y, px, py) > 1600) {
      const s = snapToRoad(S.city, px + (Math.random() < 0.5 ? -1 : 1) * 800, py + (Math.random() < 0.5 ? -1 : 1) * 600);
      c.x = s.x; c.y = s.y;
    }
  }

  // Coins + pickups.
  for (const c of S.city.coins) {
    if (!c.taken && dist(px, py, c.x, c.y) < 28) {
      c.taken = true; S.coinsTaken += 1; p.cash += 50;
      S.sfx.coin(); S.toast('Vireo Coin found! +$50');
    }
  }
  const pk = checkPickups(p, S.pickups);
  if (pk) { S.sfx.pickup(); S.toast(pk.kind === 'health' ? '+40 HP' : pk.kind === 'ammo' ? '+24 ammo' : `+$${pk.value}`); }

  // Courier job.
  if (S.courier) {
    S.courier.timer -= dt;
    if (dist(px, py, S.courier.x, S.courier.y) < 70) {
      p.cash += S.courier.pay;
      S.toast(`Courier delivered! +$${S.courier.pay}`);
      S.sfx.sting();
      S.courier = null;
    } else if (S.courier.timer <= 0) {
      S.toast('Courier job failed — too slow.');
      S.courier = null;
    }
  }

  // Wanted decay + police director.
  const nearestCop = S.cops.reduce((m, c) => Math.min(m, dist(c.x, c.y, px, py)), Infinity);
  decayHeat(p, dt, nearestCop > 450);
  policeDirector(dt);
  S.sfx.setSiren(p.wanted > 0);
  S.sfx.updateSiren(dt);

  // Missions.
  const res = updateMission(S, dt);
  if (res === 'complete') completeMission();
  else if (res === 'failed') failMission('Out of time — Oka is not happy. Try again.');

  // Busted / wasted.
  if (!S.cops.some((c) => !c.car && dist(c.x, c.y, p.x, p.y) < 30)) {
    p.bustedT = Math.max(0, p.bustedT - dt);
  }
  if (p.bustedT > 1.5) { bustPlayer(); return; }
  if (p.hp <= 0) { wastePlayer(); return; }

  // Camera follows the player / car.
  const tx = p.inCar ? p.inCar.x : p.x, ty = p.inCar ? p.inCar.y : p.y;
  S.cam.w = canvas.width; S.cam.h = canvas.height;
  S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 5);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 5);
  S.cam.x = clamp(S.cam.x, S.cam.w / 2 - 100, WORLD_W - S.cam.w / 2 + 100);
  S.cam.y = clamp(S.cam.y, S.cam.h / 2 - 100, WORLD_H - S.cam.h / 2 + 100);
}

// --- Render -----------------------------------------------------------------------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (S.mode === 'title') { drawTitle(ctx, S, hasSave()); return; }
  ctx.save();
  ctx.translate(canvas.width / 2 - S.cam.x, canvas.height / 2 - S.cam.y);
  drawWorld(ctx, S);
  ctx.restore();
  if (S.mode === 'selftest' && S.selftest) drawSelftest(ctx, S.selftest);
  else if (S.mode === 'play' || S.mode === 'pause') drawHUD(ctx, S);
  if (S.mode === 'pause') drawPause(ctx, S);
  if (S.mode === 'over') drawEnd(ctx, S, S.overKind);
  if (S.mode === 'finale') drawEnd(ctx, S, 'finale');
}

function drawSelftest(ctx, res) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(40, 40, Math.min(760, W - 80), 40 + res.results.length * 24 + 30);
  ctx.fillStyle = res.ok ? '#7ee787' : '#ff5a5a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`SELFTEST ${res.ok ? 'PASS' : 'FAIL'} — ${res.passed}/${res.total}`, 60, 66);
  ctx.font = '14px monospace';
  res.results.forEach((r, i) => {
    ctx.fillStyle = r.ok ? '#7ee787' : '#ff5a5a';
    ctx.fillText(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`, 60, 96 + i * 24);
  });
}

// --- Loop --------------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.mode === 'play') update(dt);
  else if (S.mode === 'selftest') { S.time += dt; }
  render();
  requestAnimationFrame(loop);
}

// --- Init -----------------------------------------------------------------------------
if (params.has('selftest')) {
  S.mode = 'selftest';
  S.selftest = runSelftest(S);
  console.log('[BOOT] selftest mode, result:', S.selftest.ok ? 'PASS' : 'FAIL');
}
if (params.has('shot')) {
  stageShot(S, params.get('shot') || 'play', params.get('seed') || '1');
}
requestAnimationFrame(loop);
