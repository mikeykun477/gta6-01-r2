// Port Vireo — vehicles. Arcade car physics (grip, drift, handbrake) plus a
// traffic system that drives the road graph: cars pick a road, cruise, and
// turn at intersections instead of wandering off-road.
import { makeRng, clamp, angleDiff, dist } from './rng.js';
import { isOnRoad, snapToRoad, pointInBuilding } from './map.js';

export const CAR_COLORS = ['#d93939', '#2f7fd0', '#e8b93a', '#37b06f', '#e8e8e8', '#8a5fd0', '#222831', '#e07b39'];
export const CAR_MODELS = ['Vireo GT', 'Marlin Sedan', 'Palm Pickup', 'Coral Taxi', 'Harbor Van', 'Neon Coupe'];

export function makeCar(x, y, angle, opts = {}) {
  return {
    x, y, angle, speed: 0,
    color: opts.color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    model: opts.model || CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)],
    kind: opts.kind || 'civilian', // civilian | police | taxi | mission
    parked: !!opts.parked,
    driver: opts.driver ?? null,   // 'traffic' | 'player' | null
    hp: 100,
    // traffic AI
    axis: opts.axis || 'v', dir: opts.dir || 1,
    cruise: opts.cruise || 150,
    stuck: 0,
    wobble: 0,
  };
}

// Arcade handling: forward accel, steering scales with speed, handbrake cuts grip.
export function driveCar(car, input, dt) {
  const maxSpeed = car.kind === 'police' ? 560 : 500;
  const maxRev = 180;
  if (input.up) car.speed += (car.kind === 'police' ? 560 : 480) * dt;
  if (input.down) car.speed -= car.speed > 5 ? 620 * dt : 260 * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * 120 * dt;
  if (input.handbrake) car.speed -= Math.sign(car.speed) * 420 * dt;
  car.speed = clamp(car.speed, -maxRev, maxSpeed);
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const grip = input.handbrake ? 1.6 : 1;
  car.angle += steer * 2.5 * grip * dt * clamp(Math.abs(car.speed) / 140, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  return car;
}

export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = snapToRoad(city, rng.range(300, 3300), rng.range(300, 2600));
    const onV = rng.chance(0.5);
    const angle = onV ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    cars.push(makeCar(p.x + rng.range(-16, 16), p.y + rng.range(-16, 16), angle, {
      driver: 'traffic',
      axis: onV ? 'v' : 'h',
      dir: onV ? (angle > 0 ? 1 : -1) : (angle === 0 ? 1 : -1),
      cruise: rng.range(110, 190),
      color: CAR_COLORS[i % CAR_COLORS.length],
      model: CAR_MODELS[i % CAR_MODELS.length],
    }));
  }
  return cars;
}

export function spawnParked(city, rng, count) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries++ < count * 40) {
    const onV = rng.chance(0.5);
    const x = onV ? rng.pick(city.roadsV) + (rng.chance(0.5) ? 40 : -40) : rng.range(300, 3300);
    const y = onV ? rng.range(300, 2600) : rng.pick(city.roadsH) + (rng.chance(0.5) ? 40 : -40);
    if (pointInBuilding(city, x, y)) continue;
    const angle = onV ? (Math.PI / 2) : 0;
    cars.push(makeCar(x, y, angle, { parked: true, driver: null, color: CAR_COLORS[(cars.length * 3 + 1) % CAR_COLORS.length] }));
  }
  return cars;
}

// One traffic tick: follow the current road, turn at intersections, avoid
// buildings by snapping back to the road centre.
export function updateTraffic(city, cars, others, dt, rng) {
  for (const c of cars) {
    if (c.driver !== 'traffic') continue;
    const target = c.cruise;
    c.speed += (target - c.speed) * Math.min(1, dt * 1.5);
    // Intersection check: near a crossing, sometimes turn.
    const nearV = city.roadsV.find((rx) => Math.abs(c.x - rx) < 26);
    const nearH = city.roadsH.find((ry) => Math.abs(c.y - ry) < 26);
    if (nearV !== undefined && nearH !== undefined && rng.chance(dt * 0.55)) {
      if (c.axis === 'v' && rng.chance(0.5)) {
        c.axis = 'h';
        c.dir = rng.chance(0.5) ? 1 : -1;
        c.angle = c.dir > 0 ? 0 : Math.PI;
        c.y = nearH;
      } else if (c.axis === 'h') {
        c.axis = 'v';
        c.dir = rng.chance(0.5) ? 1 : -1;
        c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        c.x = nearV;
      }
    }
    // Gentle steering back onto the road centre line.
    if (c.axis === 'v') {
      const rx = city.roadsV.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a);
      c.x += (rx - c.x) * Math.min(1, dt * 2);
      c.angle += angleDiff(c.angle, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) * Math.min(1, dt * 3);
    } else {
      const ry = city.roadsH.reduce((a, b) => Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a);
      c.y += (ry - c.y) * Math.min(1, dt * 2);
      c.angle += angleDiff(c.angle, c.dir > 0 ? 0 : Math.PI) * Math.min(1, dt * 3);
    }
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Soft separation from other cars.
    for (const o of others) {
      if (o === c || o.driver === 'player') continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 46 && d > 0.01) {
        c.x += ((c.x - o.x) / d) * (46 - d) * 0.5;
        c.y += ((c.y - o.y) / d) * (46 - d) * 0.5;
        c.speed *= 0.92;
      }
    }
    if (pointInBuilding(city, c.x, c.y)) {
      const s = snapToRoad(city, c.x, c.y);
      c.x = s.x; c.y = s.y; c.speed *= 0.4;
    }
    c.x = clamp(c.x, 60, 3540);
    c.y = clamp(c.y, 60, 2940);
  }
}

// Police pursuit car: steers toward the target, rams, backs off when stuck.
export function updatePoliceCar(city, car, target, dt) {
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.angle, want);
  car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
  const d = dist(car.x, car.y, target.x, target.y);
  const input = { up: d > 60, down: false, left: false, right: false, handbrake: Math.abs(diff) > 1.2 && d < 120 };
  driveCar(car, input, dt);
  if (pointInBuilding(city, car.x, car.y)) {
    const s = snapToRoad(city, car.x, car.y);
    car.x = s.x; car.y = s.y; car.speed *= 0.3;
  }
  car.x = clamp(car.x, 60, 3540);
  car.y = clamp(car.y, 60, 2940);
}
