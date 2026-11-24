// Port Vireo — story. Six chained missions following Rae Calloway, an
// ex-getaway driver hunting her missing brother Milo through the Harbor
// Kings. Each mission is a small state machine: objective text, a map
// marker, a trigger radius and a completion check.
import { dist } from './rng.js';

export const STORY_INTRO =
  'Rae Calloway drove getaway for the Harbor Kings for five years — then walked away. ' +
  'Now her little brother Milo has vanished after one last job for them, and the only person ' +
  'who will help is Auntie Oka, the fixer who taught Rae to drive. Find Milo. Burn the Kings down.';

export const MISSIONS = [
  {
    id: 1, title: 'Homecoming', pay: 200,
    brief: 'Get to Oka\'s Garage in Old Harbor. She knows where Milo was last seen.',
    objective: 'Reach Oka\'s Garage',
    place: 'garage', radius: 90, kind: 'goto',
  },
  {
    id: 2, title: 'Hot Wheels', pay: 450,
    brief: 'Oka needs a fast car, no questions. Steal the Neon Coupe parked on Neon Row and bring it to the garage. Stealing in front of witnesses brings heat.',
    objective: 'Steal the Neon Coupe, deliver it to the garage',
    place: 'nightclub', radius: 70, kind: 'steal-deliver',
  },
  {
    id: 3, title: 'Dockside Drop', pay: 600,
    brief: 'Run a package to the King Warehouse at the docks in 100 seconds. The Kings will not let it arrive.',
    objective: 'Deliver the package to the docks (100s)',
    place: 'warehouse', radius: 110, kind: 'timed-goto', time: 100,
  },
  {
    id: 4, title: 'Neon Row Rumble', pay: 800,
    brief: 'Five Harbor Kings are shaking down Club Mirage. Clear them out — then lose the cops.',
    objective: 'Take out 5 Harbor Kings, then drop to 0 stars',
    place: 'nightclub', radius: 260, kind: 'eliminate', count: 5,
  },
  {
    id: 5, title: 'The Informant', pay: 900,
    brief: 'An informant at Vireo U knows where Milo is held. Pick him up and get him to the safehouse — the police are already rolling.',
    objective: 'Pick up the informant, reach the safehouse',
    place: 'university', radius: 90, kind: 'escort',
  },
  {
    id: 6, title: "King's Fall", pay: 2500,
    brief: 'Milo is in the King Warehouse. Take down King Marlow and his crew, then reach your brother.',
    objective: 'Defeat King Marlow and reach Milo',
    place: 'warehouse', radius: 200, kind: 'boss',
  },
];

export function missionMarker(city, mission) {
  return city.places[mission.place];
}

export function missionState(mission) {
  return {
    idx: mission.id - 1,
    stage: 'go', // go | done
    timer: mission.time || 0,
    killed: 0,
    spawned: false,
    pickedUp: false,
    bossDown: false,
    failed: false,
  };
}

// Returns 'complete' | 'failed' | null. Mutates S through the hooks passed in.
export function updateMission(S, dt) {
  const m = MISSIONS[S.missionIdx];
  if (!m || S.missionIdx >= MISSIONS.length) return null;
  const st = S.mission;
  const p = S.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const mark = missionMarker(S.city, m);
  const d = dist(px, py, mark.x, mark.y);

  if (m.kind === 'goto' && d < m.radius) return 'complete';
  if (m.kind === 'timed-goto') {
    st.timer -= dt;
    if (d < m.radius) return 'complete';
    if (st.timer <= 0) return 'failed';
  }
  if (m.kind === 'steal-deliver') {
    if (!st.pickedUp && S.stolenTarget && S.stolenTarget.stolen) {
      st.pickedUp = true;
      S.toast('Coupe secured — get it to the garage, fast.');
    }
    if (st.pickedUp) {
      const g = S.city.places.garage;
      if (dist(px, py, g.x, g.y) < 110) return 'complete';
    }
  }
  if (m.kind === 'eliminate') {
    if (st.killed >= m.count) {
      if (p.wanted === 0) return 'complete';
    }
  }
  if (m.kind === 'escort') {
    if (!st.pickedUp && d < m.radius) {
      st.pickedUp = true;
      S.toast('Informant aboard — reach the safehouse!');
      S.wantedBump(3);
    }
    if (st.pickedUp) {
      const s = S.city.places.safehouse;
      if (dist(px, py, s.x, s.y) < 110) return 'complete';
    }
  }
  if (m.kind === 'boss') {
    if (st.bossDown) {
      const w = S.city.places.warehouse;
      if (dist(px, py, w.x, w.y) < 90) return 'complete';
    }
  }
  return null;
}

export function missionObjectiveText(S) {
  const m = MISSIONS[S.missionIdx];
  if (!m) return 'Free roam — Port Vireo is yours. Find coins, take courier jobs, stay alive.';
  const st = S.mission;
  let t = `${m.id}/6 ${m.title}: ${m.objective}`;
  if (m.kind === 'timed-goto') t += ` — ${Math.max(0, Math.ceil(st.timer))}s left`;
  if (m.kind === 'eliminate') t += ` (${Math.min(st.killed, m.count)}/${m.count})`;
  if (m.kind === 'boss') t += st.bossDown ? ' — Milo is inside!' : ' — Marlow first!';
  return t;
}
