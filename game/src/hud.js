// Port Vireo — all drawing: the city, the actors, the HUD, the minimap and
// the title / pause / game-over screens. Canvas 2D only, no assets.
import { clamp, dist, fmtMoney, fmtTime } from './rng.js';
import { WORLD_W, WORLD_H, ROAD_HALF, districtAt } from './map.js';
import { MISSIONS, missionMarker, missionObjectiveText } from './story.js';

// --- World -----------------------------------------------------------------
export function drawWorld(ctx, S) {
  const cam = S.cam;
  const x0 = cam.x - cam.w / 2, y0 = cam.y - cam.h / 2;
  const x1 = cam.x + cam.w / 2, y1 = cam.y + cam.h / 2;

  // Ground.
  ctx.fillStyle = '#232a1e';
  ctx.fillRect(x0, y0, cam.w, cam.h);
  // Beach + sea along the south edge.
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(x0, 2700, cam.w, 130);
  ctx.fillStyle = '#1b6f8f';
  ctx.fillRect(x0, 2830, cam.w, WORLD_H - 2830);
  ctx.fillStyle = '#2b8fb5';
  ctx.fillRect(x0, 2830, cam.w, 10);

  // Parks.
  for (const pk of S.city.parks) {
    if (pk.x > x1 || pk.x + pk.w < x0 || pk.y > y1 || pk.y + pk.h < y0) continue;
    ctx.fillStyle = '#2f6b3a';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = '#3f8a4c';
    for (let i = 0; i < 8; i++) {
      const tx = pk.x + 40 + ((i * 97) % Math.max(1, pk.w - 80));
      const ty = pk.y + 40 + ((i * 61) % Math.max(1, pk.h - 80));
      ctx.beginPath(); ctx.arc(tx, ty, 16, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Roads.
  ctx.fillStyle = '#33363e';
  for (const rx of S.city.roadsV) ctx.fillRect(rx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const ry of S.city.roadsH) ctx.fillRect(0, ry - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  // Sidewalk edges.
  ctx.strokeStyle = '#4a4e58'; ctx.lineWidth = 5;
  for (const rx of S.city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_HALF, 0); ctx.lineTo(rx - ROAD_HALF, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_HALF, 0); ctx.lineTo(rx + ROAD_HALF, WORLD_H); ctx.stroke();
  }
  for (const ry of S.city.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry - ROAD_HALF); ctx.lineTo(WORLD_W, ry - ROAD_HALF); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ry + ROAD_HALF); ctx.lineTo(WORLD_W, ry + ROAD_HALF); ctx.stroke();
  }
  // Centre dashes.
  ctx.strokeStyle = '#d8c95a'; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
  for (const rx of S.city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD_H); ctx.stroke();
  }
  for (const ry of S.city.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD_W, ry); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings (culled).
  for (const b of S.city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    if (b.warehouse) {
      ctx.fillStyle = '#e8b93a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('KING', b.x + 18, b.y + 44);
    }
    if (b.neon) {
      ctx.strokeStyle = b.neon; ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    }
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, 8);
    }
  }

  // District label (faint, at camera centre).
  const d = districtAt(cam.x, cam.y);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(d.name.toUpperCase(), x0 + 16, y0 + 24);

  // Coins.
  for (const c of S.city.coins) {
    if (c.taken) continue;
    const bob = Math.sin(S.time * 3 + c.bob) * 3;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(c.x, c.y + bob, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a87e00';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('V', c.x - 4, c.y + bob + 4);
  }

  // Pickups.
  for (const p of S.pickups) {
    if (p.taken) continue;
    ctx.fillStyle = p.kind === 'health' ? '#ff5a5a' : p.kind === 'ammo' ? '#5ab8ff' : '#ffd94a';
    ctx.fillRect(p.x - 11, p.y - 11, 22, 22);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(p.kind === 'health' ? '+' : p.kind === 'ammo' ? 'A' : '$', p.x - 4, p.y + 5);
  }

  // Mission marker: pulsing beacon.
  const m = MISSIONS[S.missionIdx];
  if (m) {
    const mk = missionMarker(S.city, m);
    const pulse = 1 + Math.sin(S.time * 4) * 0.18;
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(mk.x, mk.y - 46 * pulse); ctx.lineTo(mk.x + 14, mk.y - 18); ctx.lineTo(mk.x - 14, mk.y - 18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(String(m.id), mk.x - 3, mk.y - 24);
  }

  drawCars(ctx, S);
  drawPeople(ctx, S);
  drawBullets(ctx, S);

  // Damage vignette.
  if (S.player.hp < 35) {
    const g = ctx.createRadialGradient(cam.x, cam.y, cam.h * 0.3, cam.x, cam.y, cam.h * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,0,0,${0.45 - S.player.hp * 0.008})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, cam.w, cam.h);
  }
}

function drawCarShape(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-24, -12, 48, 28);
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.roundRect(-24, -13, 48, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-6, -11, 14, 22);
  ctx.fillStyle = c.kind === 'police' ? '#e8e8e8' : c.color;
  ctx.fillRect(-24, -13, 8, 26);
  if (c.kind === 'police') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('PD', -20, 3);
    ctx.fillStyle = (Math.floor(performance.now() / 280) % 2 === 0) ? '#ff2d2d' : '#2d7dff';
    ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (c.kind === 'mission') {
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 2;
    ctx.strokeRect(-26, -15, 52, 30);
  }
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(22, -10, 3, 5);
  ctx.fillRect(22, 5, 3, 5);
  ctx.restore();
}

function drawCars(ctx, S) {
  for (const c of S.cars) {
    if (c.hp <= 0) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
      ctx.fillStyle = '#181818';
      ctx.beginPath(); ctx.roundRect(-24, -13, 48, 26, 7); ctx.fill();
      ctx.restore();
      continue;
    }
    drawCarShape(ctx, c);
  }
}

function drawPeople(ctx, S) {
  const p = S.player;
  // Pedestrians.
  for (const ped of S.peds) {
    if (ped.state === 'down') {
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath(); ctx.arc(ped.x, ped.y, 10, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 5, ped.y + Math.sin(ped.angle) * 5, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Gang.
  for (const g of S.gang) {
    if (g.hp <= 0) continue;
    ctx.fillStyle = g.boss ? '#3d0a3d' : '#4a2d6e';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.boss ? 17 : 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff2d78'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.boss ? 20 : 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.fillRect(g.x - 14, g.y - 26, 28, 4);
    ctx.fillStyle = g.boss ? '#ff2d78' : '#c05aff';
    ctx.fillRect(g.x - 14, g.y - 26, 28 * clamp(g.hp / (g.boss ? 220 : 55), 0, 1), 4);
    if (g.boss) {
      ctx.fillStyle = '#ffe600'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText('MARLOW', g.x - 24, g.y - 32);
    }
  }
  // Foot cops.
  for (const c of S.cops) {
    if (c.car || c.hp <= 0) continue;
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(c.x - 8, c.y - 3, 16, 6);
  }
  // Player (on foot).
  if (!p.inCar) {
    ctx.fillStyle = '#d93939';
    ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    ctx.stroke();
    // Aim line when armed.
    if (p.hasGun) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 90, p.y + Math.sin(p.angle) * 90);
      ctx.stroke();
    }
  }
}

function drawBullets(ctx, S) {
  ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3;
  for (const b of S.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    ctx.stroke();
  }
}

// --- HUD -------------------------------------------------------------------
export function drawHUD(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const p = S.player;
  ctx.save();
  ctx.textBaseline = 'top';

  // Top-left: health, cash, ammo.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 12, 250, 86);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText('RAE CALLOWAY', 22, 20);
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 44, 180, 12);
  ctx.fillStyle = p.hp > 50 ? '#37b06f' : p.hp > 25 ? '#e8b93a' : '#d93939';
  ctx.fillRect(22, 44, 180 * clamp(p.hp / 100, 0, 1), 12);
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.hp)}`, 208, 43);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(fmtMoney(p.cash), 22, 62);
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  const gun = p.inCar ? `${p.inCar.model}  ${Math.abs(Math.round(p.inCar.speed * 0.36))} km/h` :
    p.hasGun ? `Pistol  ${p.ammo} / 12` : 'Fists';
  ctx.fillText(gun, 120, 64);
  ctx.fillStyle = '#9fb3d8'; ctx.font = '12px sans-serif';
  ctx.fillText(`Missions ${S.missionIdx}/6   Coins ${S.coinsTaken}/12   ${fmtTime(S.playSeconds)}`, 22, 82);

  // Top-right: wanted stars.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 190, 12, 178, 44);
  ctx.font = '22px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < p.wanted ? '★' : '☆';
  ctx.fillStyle = p.wanted > 0 ? '#ffd94a' : '#666';
  ctx.fillText(stars, W - 180, 20);
  if (p.wanted > 0) {
    ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(p.wanted >= 3 ? 'POLICE PURSUIT' : 'WANTED', W - 180, 44);
  }

  // Objective bar (bottom centre).
  const obj = missionObjectiveText(S);
  ctx.font = 'bold 14px sans-serif';
  const ow = ctx.measureText(obj).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect((W - ow) / 2, H - 56, ow, 30);
  ctx.fillStyle = '#ffe600';
  ctx.fillText(obj, (W - ow) / 2 + 14, H - 48);

  // Toasts.
  ctx.font = 'bold 15px sans-serif';
  S.toasts.forEach((t, i) => {
    ctx.globalAlpha = clamp(t.life, 0, 1);
    const tw = ctx.measureText(t.text).width + 24;
    ctx.fillStyle = 'rgba(20,20,40,0.85)';
    ctx.fillRect((W - tw) / 2, 120 + i * 34, tw, 28);
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, (W - tw) / 2 + 12, 126 + i * 34);
    ctx.globalAlpha = 1;
  });

  // Mission banner.
  if (S.banner) {
    ctx.globalAlpha = clamp(S.banner.life, 0, 1);
    ctx.fillStyle = 'rgba(10,10,30,0.85)';
    ctx.fillRect(0, H * 0.3, W, 74);
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(S.banner.title, W / 2, H * 0.3 + 12);
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
    ctx.fillText(S.banner.sub, W / 2, H * 0.3 + 48);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Controls hint.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px sans-serif';
  ctx.fillText('WASD move/drive · E enter car · F steal · Click shoot · Space punch · R reload · P pause · M mute', 12, H - 18);

  drawMinimap(ctx, S);
  ctx.restore();
}

function drawMinimap(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const mw = 200, mh = 168, mx = W - mw - 12, my = H - mh - 70;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = '#1d2b1d';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  for (const rx of S.city.roadsV) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
  }
  for (const ry of S.city.roadsH) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  ctx.fillStyle = '#2b8fb5';
  ctx.fillRect(mx, my + 2700 * sy, mw, mh - 2700 * sy);
  const m = MISSIONS[S.missionIdx];
  if (m) {
    const mk = missionMarker(S.city, m);
    ctx.fillStyle = '#ffe600';
    ctx.beginPath(); ctx.arc(mx + mk.x * sx, my + mk.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff2d2d';
  for (const c of S.cops) { ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4); }
  for (const c of S.cars) if (c.kind === 'police') ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4);
  ctx.fillStyle = '#c05aff';
  for (const g of S.gang) if (g.hp > 0) ctx.fillRect(mx + g.x * sx - 2, my + g.y * sy - 2, 4, 4);
  const p = S.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mx + px * sx, my + py * sy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(mx + (S.cam.x - S.cam.w / 2) * sx, my + (S.cam.y - S.cam.h / 2) * sy, S.cam.w * sx, S.cam.h * sy);
  ctx.restore();
}

// --- Screens ----------------------------------------------------------------
export function drawTitle(ctx, S, hasSave) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#12082b'); g.addColorStop(0.55, '#3d1048'); g.addColorStop(1, '#0a2a3d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff2d78';
  ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PORT VIREO', W / 2, H * 0.24);
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('AN OPEN-WORLD CRIME STORY', W / 2, H * 0.24 + 36);
  ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
  const lines = [
    'Rae Calloway came home to find her brother Milo.',
    'The Harbor Kings took him. The city owes her answers.',
    'Steal cars. Outrun the law. Take the Kings down, mission by mission.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.42 + i * 24));
  ctx.fillStyle = '#ffe600'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(hasSave ? 'Press ENTER — Continue your story' : 'Press ENTER — Start a new story', W / 2, H * 0.62);
  ctx.fillStyle = '#cfe3ff'; ctx.font = '14px sans-serif';
  const controls = [
    'WASD / Arrows — move & drive      E — enter / exit car      F — steal car',
    'Mouse — aim      Click — shoot      Space — punch      R — reload',
    'P / Esc — pause & save      M — mute      ?selftest=1 runs the built-in checks',
  ];
  controls.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.72 + i * 22));
  ctx.fillStyle = '#8fa3c8'; ctx.font = '12px sans-serif';
  ctx.fillText('A complete open-world game: traffic, pedestrians, police, missions, combat, minimap, saves. Runs fully offline.', W / 2, H - 24);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, S) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(5,5,20,0.72)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe600'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PAUSED', W / 2, H * 0.3);
  ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
  const lines = [
    'P / Esc — resume',
    'S — save game now',
    'M — mute / unmute sound',
    'Q — quit to title (progress saved)',
    '',
    `Cash ${fmtMoney(S.player.cash)}   Missions ${S.missionIdx}/6   Kills ${S.kills}   Time ${fmtTime(S.playSeconds)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.42 + i * 28));
  ctx.textAlign = 'left';
}

export function drawEnd(ctx, S, kind) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = kind === 'finale' ? 'rgba(10,40,20,0.85)' : 'rgba(30,5,10,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (kind === 'wasted') {
    ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText('WASTED', W / 2, H * 0.3);
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
    ctx.fillText('Port Vireo chewed you up. The Kings are still out there.', W / 2, H * 0.3 + 36);
  } else if (kind === 'busted') {
    ctx.fillStyle = '#7db4ff'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText('BUSTED', W / 2, H * 0.3);
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
    ctx.fillText('The Vireo PD hauled you in. Bail cost you $500 — and your heat.', W / 2, H * 0.3 + 36);
  } else {
    ctx.fillStyle = '#7ee787'; ctx.font = 'bold 48px sans-serif';
    ctx.fillText('KING\'S FALL', W / 2, H * 0.26);
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Milo is free. The Harbor Kings are finished. Port Vireo is yours.', W / 2, H * 0.26 + 36);
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
    ctx.fillText('Free roam continues — courier jobs, coins and the open city remain.', W / 2, H * 0.26 + 66);
  }
  ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
  ctx.fillText(`Cash ${fmtMoney(S.player.cash)}   Missions ${S.missionIdx}/6   Kills ${S.kills}   Time ${fmtTime(S.playSeconds)}`, W / 2, H * 0.55);
  ctx.fillStyle = '#ffe600'; ctx.font = 'bold 17px sans-serif';
  ctx.fillText(kind === 'finale' ? 'ENTER — keep playing free roam' : 'ENTER — retry from your last save', W / 2, H * 0.65);
  ctx.textAlign = 'left';
}
