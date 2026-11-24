// Port Vireo — people. The player, wandering pedestrians, foot police and
// gang shooters. Peds stroll the sidewalks and flee gunfire; cops chase and
// try to bust the player; gang members hold ground and shoot.
import { makeRng, clamp, dist, angleTo, angleDiff } from './rng.js';
import { collideCircle, isOnRoad, randomRoadPoint } from './map.js';

export const PED_SHIRTS = ['#e8e8e8', '#d93939', '#2f7fd0', '#e8b93a', '#37b06f', '#8a5fd0', '#e07b39', '#39c0d8'];

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    hp: 100, maxHp: 100, armor: 0,
    cash: 250, ammo: 24, hasGun: true,
    inCar: null, wanted: 0, heat: 0,
    punchCd: 0, shootCd: 0, reloadT: 0,
    bustedT: 0, // seconds a cop has held onto the player
    run: false,
  };
}

export function makePed(city, rng) {
  const p = randomRoadPoint(city, rng);
  return {
    x: p.x, y: p.y, angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 55), shirt: PED_SHIRTS[rng.int(0, PED_SHIRTS.length - 1)],
    state: 'walk', // walk | flee | down
    tx: p.x, ty: p.y, retarget: rng.range(2, 6),
    hp: 30, fleeT: 0, panic: 0,
  };
}

export function makeCop(x, y, inCar) {
  return {
    x, y, angle: 0, speed: 0,
    state: 'chase', // chase | bust | patrol
    hp: 60, grabT: 0, car: inCar || null,
    batonCd: 0, shootCd: 0,
  };
}

export function makeGangster(x, y, boss = false) {
  return {
    x, y, angle: 0, hp: boss ? 220 : 55, boss,
    state: 'guard', shootCd: 1 + Math.random() * 2,
    strafe: Math.random() * Math.PI * 2,
  };
}

// --- Player movement (on foot) ---------------------------------------------
export function movePlayer(city, p, input, dt) {
  const run = input.run;
  const spd = run ? 265 : 165;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
    p.angle = Math.atan2(my, mx);
    p.speed = spd;
  } else {
    p.speed = 0;
  }
  p.run = run;
  collideCircle(city, p, 16);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.ammo = 12; }
  }
}

// --- Pedestrians ------------------------------------------------------------
export function updatePeds(city, peds, player, gunfire, dt, rng) {
  for (const p of peds) {
    if (p.state === 'down') continue;
    if (gunfire && dist(p.x, p.y, gunfire.x, gunfire.y) < 420) {
      p.state = 'flee'; p.fleeT = 3;
      p.panic = 1;
    }
    if (p.state === 'flee') {
      p.fleeT -= dt;
      const a = angleTo(player.x, player.y, p.x, p.y);
      p.x += Math.cos(a) * 150 * dt;
      p.y += Math.sin(a) * 150 * dt;
      p.angle = a;
      if (p.fleeT <= 0) p.state = 'walk';
    } else {
      p.retarget -= dt;
      if (p.retarget <= 0 || dist(p.x, p.y, p.tx, p.ty) < 24) {
        const t = randomRoadPoint(city, rng);
        p.tx = t.x; p.ty = t.y;
        p.retarget = rng.range(3, 8);
      }
      const a = angleTo(p.x, p.y, p.tx, p.ty);
      p.angle += angleDiff(p.angle, a) * Math.min(1, dt * 4);
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      // Keep peds off the middle of buildings: slide along them.
      if (collideCircle(city, p, 12)) { p.retarget = 0; }
    }
    p.x = clamp(p.x, 30, 3570);
    p.y = clamp(p.y, 30, 2970);
  }
}

// --- Foot police ------------------------------------------------------------
export function updateCops(city, cops, player, dt) {
  for (const c of cops) {
    if (c.car) continue; // car cops are driven by drive.js
    const d = dist(c.x, c.y, player.x, player.y);
    if (c.state === 'chase') {
      const a = angleTo(c.x, c.y, player.x, player.y);
      c.angle = a;
      const spd = 195;
      c.x += Math.cos(a) * spd * dt;
      c.y += Math.sin(a) * spd * dt;
      collideCircle(city, c, 14);
      if (d < 26) {
        c.grabT += dt;
        player.bustedT += dt;
      } else {
        c.grabT = Math.max(0, c.grabT - dt * 2);
      }
      c.batonCd = Math.max(0, c.batonCd - dt);
      if (d < 34 && c.batonCd <= 0) {
        c.batonCd = 0.9;
        player.hp -= 6;
      }
    }
  }
}

// --- Gang shooters ----------------------------------------------------------
export function updateGang(gang, player, bullets, dt) {
  for (const g of gang) {
    if (g.hp <= 0) continue;
    const d = dist(g.x, g.y, player.x, player.y);
    g.strafe += dt;
    if (d < 520) {
      g.state = 'fight';
      g.angle = angleTo(g.x, g.y, player.x, player.y);
      // Strafe sideways so they are not static targets.
      const sa = g.angle + Math.PI / 2 * Math.sin(g.strafe);
      g.x += Math.cos(sa) * 42 * dt;
      g.y += Math.sin(sa) * 42 * dt;
      g.shootCd -= dt;
      if (g.shootCd <= 0 && d < 460) {
        g.shootCd = g.boss ? 0.9 : 1.5;
        const spread = g.boss ? 0.12 : 0.22;
        bullets.push({
          x: g.x, y: g.y,
          vx: Math.cos(g.angle + (Math.random() - 0.5) * spread) * 620,
          vy: Math.sin(g.angle + (Math.random() - 0.5) * spread) * 620,
          from: 'gang', dmg: g.boss ? 14 : 8, life: 1.1,
        });
      }
    } else {
      g.state = 'guard';
    }
  }
}
