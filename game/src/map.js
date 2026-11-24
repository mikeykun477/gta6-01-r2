// Port Vireo — procedural city. One seeded pass lays out roads, blocks,
// buildings, parks, the beach and the docks. Nothing here is copied from any
// other map: the grid pitch, district split and landmark set are original.
import { makeRng, clamp } from './rng.js';

export const WORLD_W = 3600;
export const WORLD_H = 3000;
export const ROAD_HALF = 52;
export const PITCH = 480;

export const DISTRICTS = [
  { name: 'Old Harbor', x0: 0, y0: 0, x1: 1000, y1: 1000, tint: '#3d5a73' },
  { name: 'Neon Row', x0: 1000, y0: 0, x1: 2200, y1: 1000, tint: '#7a2d6e' },
  { name: 'Palm Courts', x0: 2200, y0: 0, x1: 3600, y1: 1000, tint: '#2d6e4f' },
  { name: 'University Hill', x0: 0, y0: 1000, x1: 1300, y1: 2000, tint: '#6e5a2d' },
  { name: 'Midtown', x0: 1300, y0: 1000, x1: 3050, y1: 2000, tint: '#39415e' },
  { name: 'The Docks', x0: 3050, y0: 1000, x1: 3600, y1: 2700, tint: '#4a4a55' },
  { name: 'Coral Beach', x0: 0, y0: 2700, x1: 3600, y1: 3000, tint: '#b08d57' },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[4];
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const roadsV = [];
  const roadsH = [];
  for (let i = 0; i < 7; i++) roadsV.push(240 + i * PITCH);
  for (let j = 0; j < 6; j++) roadsH.push(240 + j * PITCH);

  const buildings = [];
  const parks = [];
  const palette = ['#5b6b8c', '#7a6a8c', '#8c6a5b', '#5b8c7a', '#8c8c5b', '#6b5b7a', '#7a4a5a'];
  const neon = ['#ff2d78', '#00e5ff', '#ffe600', '#ff6a00'];

  // Special blocks: [col,row] in block space (blocks sit between road lines).
  const parkBlocks = [[2, 2], [4, 3]];
  const isPark = (c, r) => parkBlocks.some(([pc, pr]) => pc === c && pr === r);
  const isBeach = (r) => r >= 5;
  const isPort = (c, r) => c >= 6 && r >= 2 && r <= 4;

  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < 5; r++) {
      const bx0 = roadsV[c] + ROAD_HALF + 14;
      const by0 = roadsH[r] + ROAD_HALF + 14;
      const bx1 = roadsV[c + 1] - ROAD_HALF - 14;
      const by1 = roadsH[r + 1] - ROAD_HALF - 14;
      if (isBeach(r) || isPort(c, r)) continue;
      if (isPark(c, r)) {
        parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
        continue;
      }
      const n = rng.int(1, 3);
      if (n === 1) {
        buildings.push(mkBuilding(rng, bx0, by0, bx1 - bx0, by1 - by0, palette, neon));
      } else {
        // Split the block into a row/column of smaller buildings.
        const vertical = rng.chance(0.5);
        for (let k = 0; k < n; k++) {
          if (vertical) {
            const w = (bx1 - bx0) / n;
            buildings.push(mkBuilding(rng, bx0 + k * w + 6, by0 + 6, w - 12, by1 - by0 - 12, palette, neon));
          } else {
            const h = (by1 - by0) / n;
            buildings.push(mkBuilding(rng, bx0 + 6, by0 + k * h + 6, bx1 - bx0 - 12, h - 12, palette, neon));
          }
        }
      }
    }
  }

  // Port warehouses (big sheds on the east strip).
  for (let k = 0; k < 3; k++) {
    buildings.push({
      x: 3180, y: 1180 + k * 430, w: 300, h: 330,
      color: '#565664', roof: '#3c3c48', neon: false, tall: false, warehouse: true,
    });
  }

  // Landmarks — fixed, mission-relevant places.
  const places = {
    garage: { name: "Oka's Garage", x: 480, y: 700, district: 'Old Harbor' },
    hospital: { name: 'Vireo General', x: 1500, y: 1500, district: 'Midtown' },
    nightclub: { name: 'Club Mirage', x: 1680, y: 480, district: 'Neon Row' },
    university: { name: 'Vireo U', x: 700, y: 1500, district: 'University Hill' },
    warehouse: { name: 'King Warehouse', x: 3330, y: 1900, district: 'The Docks' },
    pier: { name: 'Coral Pier', x: 1800, y: 2880, district: 'Coral Beach' },
    safehouse: { name: 'Safehouse', x: 2500, y: 1700, district: 'Midtown' },
    market: { name: 'Palm Market', x: 2700, y: 700, district: 'Palm Courts' },
  };

  // Coins: 12 hidden collectibles scattered on sidewalks.
  const coins = [];
  for (let i = 0; i < 12; i++) {
    const onV = rng.chance(0.5);
    let x, y;
    if (onV) { x = rng.pick(roadsV) + rng.range(-30, 30); y = rng.range(300, 2600); }
    else { y = rng.pick(roadsH) + rng.range(-30, 30); x = rng.range(300, 3300); }
    coins.push({ x, y, taken: false, bob: rng.range(0, 6.28) });
  }

  // A deterministic fingerprint so selftests can prove two gens match.
  let hash = 0;
  for (const b of buildings) hash = (hash * 31 + Math.round(b.x) + Math.round(b.y) * 3 + Math.round(b.w)) >>> 0;

  return { seed, roadsV, roadsH, buildings, parks, places, coins, hash };
}

function mkBuilding(rng, x, y, w, h, palette, neon) {
  const d = districtAt(x + w / 2, y + h / 2);
  const isNeon = d.name === 'Neon Row' && rng.chance(0.55);
  return {
    x, y, w, h,
    color: rng.pick(palette),
    roof: '#2a2f3d',
    neon: isNeon ? rng.pick(neon) : null,
    tall: rng.chance(0.35),
    warehouse: false,
  };
}

export function isOnRoad(city, x, y) {
  for (const rx of city.roadsV) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) <= ROAD_HALF) return true;
  return false;
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps. Returns true if it hit.
export function collideCircle(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        // Center inside the block: shove out along the smallest penetration.
        const l = p.x - b.x, rr = b.x + b.w - p.x, t = p.y - b.y, bb = b.y + b.h - p.y;
        const m = Math.min(l, rr, t, bb);
        if (m === l) p.x = b.x - r; else if (m === rr) p.x = b.x + b.w + r;
        else if (m === t) p.y = b.y - r; else p.y = b.y + b.h + r;
      }
    }
  }
  p.x = clamp(p.x, 20, WORLD_W - 20);
  p.y = clamp(p.y, 20, WORLD_H - 20);
  return hit;
}

export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(city.roadsV) + rng.range(-24, 24), y: rng.range(260, 2620) };
  }
  return { x: rng.range(260, 3260), y: rng.pick(city.roadsH) + rng.range(-24, 24) };
}

// Nearest point on the road network (used to snap spawns onto asphalt).
export function snapToRoad(city, x, y) {
  let best = null, bd = Infinity;
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = { x: rx, y }; }
  }
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = { x, y: ry }; }
  }
  return best;
}
