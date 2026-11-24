// Port Vireo — save / load. One localStorage slot, versioned, plain JSON.
const KEY = 'port-vireo-save-v1';

export function saveGame(S) {
  const p = S.player;
  const data = {
    v: 1,
    cash: p.cash, hp: p.hp, ammo: p.ammo,
    x: p.inCar ? p.inCar.x : p.x, y: p.inCar ? p.inCar.y : p.y,
    missionIdx: S.missionIdx, coins: S.coinsTaken,
    kills: S.kills, playSeconds: S.playSeconds,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch (e) { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
