// Port Vireo — combat. Hitscan-feel bullets as fast projectiles, punches,
// pickups (health, ammo, cash) and the wanted-heat rules that tie crime to
// the police response.
import { dist, clamp } from './rng.js';
import { pointInBuilding } from './map.js';

export function playerShoot(player, aimX, aimY, bullets) {
  if (!player.hasGun || player.reloadT > 0 || player.shootCd > 0) return false;
  if (player.ammo <= 0) { player.reloadT = 1.1; return false; }
  player.ammo -= 1;
  player.shootCd = 0.22;
  const a = Math.atan2(aimY - player.y, aimX - player.x) + (Math.random() - 0.5) * 0.06;
  bullets.push({
    x: player.x + Math.cos(a) * 22, y: player.y + Math.sin(a) * 22,
    vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
    from: 'player', dmg: 26, life: 0.9,
  });
  player.angle = a;
  return true;
}

export function playerPunch(player, peds, gang, cops) {
  if (player.punchCd > 0) return null;
  player.punchCd = 0.45;
  const range = 46;
  const hit = (t) => dist(player.x, player.y, t.x, t.y) < range;
  for (const g of gang) if (g.hp > 0 && hit(g)) { g.hp -= 18; return { kind: 'gang', target: g }; }
  for (const c of cops) if (c.hp > 0 && hit(c)) { c.hp -= 14; return { kind: 'cop', target: c }; }
  for (const p of peds) if (p.state !== 'down' && hit(p)) { p.state = 'down'; p.hp = 0; return { kind: 'ped', target: p }; }
  return null;
}

export function updateBullets(city, bullets, player, peds, gang, cops, cars, dt, onHit) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || pointInBuilding(city, b.x, b.y);
    if (!dead) {
      const check = (t, r, dmg, kind) => {
        if (t.hp > 0 && dist(b.x, b.y, t.x, t.y) < r) {
          t.hp -= dmg;
          if (kind === 'ped' && t.hp <= 0) t.state = 'down';
          onHit(kind, t);
          return true;
        }
        return false;
      };
      if (b.from === 'player') {
        for (const g of gang) if (check(g, 18, b.dmg, 'gang')) { dead = true; break; }
        if (!dead) for (const c of cops) if (!c.car && check(c, 16, b.dmg, 'cop')) { dead = true; break; }
        if (!dead) for (const p of peds) if (p.state !== 'down' && check(p, 15, b.dmg, 'ped')) { dead = true; break; }
        if (!dead) for (const c of cars) {
          if (dist(b.x, b.y, c.x, c.y) < 26) { c.hp -= b.dmg; if (c.hp <= 0 && c.driver === 'traffic') c.driver = null; dead = true; break; }
        }
      } else if (b.from === 'gang') {
        if (player.inCar) {
          const car = player.inCar;
          if (dist(b.x, b.y, car.x, car.y) < 28) { car.hp -= b.dmg; dead = true; }
        } else if (check(player, 16, b.dmg, 'player')) dead = true;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

// Wanted heat: 0..100 maps to stars 0..5. Crimes add heat, hiding sheds it.
export function addHeat(player, amount) {
  player.heat = clamp(player.heat + amount, 0, 100);
  player.wanted = player.heat <= 2 ? 0 : player.heat <= 20 ? 1 : player.heat <= 40 ? 2 : player.heat <= 60 ? 3 : player.heat <= 82 ? 4 : 5;
}
export function decayHeat(player, dt, hidden) {
  if (player.wanted === 0) return;
  const rate = hidden ? 2.2 : 0.55;
  player.heat = clamp(player.heat - rate * dt, 0, 100);
  if (player.heat <= 2) player.wanted = 0;
  else if (player.heat <= 20) player.wanted = 1;
  else if (player.heat <= 40) player.wanted = 2;
  else if (player.heat <= 60) player.wanted = 3;
  else if (player.heat <= 82) player.wanted = 4;
  else player.wanted = 5;
}

export function makePickups() {
  return [
    { kind: 'health', x: 1450, y: 1440, taken: false },
    { kind: 'health', x: 620, y: 1560, taken: false },
    { kind: 'ammo', x: 1720, y: 560, taken: false },
    { kind: 'ammo', x: 2620, y: 1640, taken: false },
    { kind: 'health', x: 3260, y: 2100, taken: false },
    { kind: 'cash', x: 900, y: 2100, taken: false, value: 150 },
    { kind: 'cash', x: 2100, y: 900, taken: false, value: 150 },
  ];
}

export function checkPickups(player, pickups) {
  for (const p of pickups) {
    if (p.taken) continue;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;
    if (dist(px, py, p.x, p.y) < 30) {
      p.taken = true;
      if (p.kind === 'health') player.hp = Math.min(player.maxHp, player.hp + 40);
      if (p.kind === 'ammo') player.ammo += 24;
      if (p.kind === 'cash') player.cash += p.value;
      return p;
    }
  }
  return null;
}
