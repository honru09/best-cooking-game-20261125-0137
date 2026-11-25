// Kitchen geometry, stations, walkable bounds, and chef navigation.

export const KITCHEN_WIDTH = 1280;
export const KITCHEN_HEIGHT = 720;

export const FLOOR_BOUNDS = {
  minX: 74,
  maxX: 1054,
  minY: 304,
  maxY: 550,
};

export const CHEF_RADIUS = 24;
export const CHEF_SPEED = 325;
export const CHEF_SPRINT_MULT = 1.48;
export const INTERACT_REACH = 74;

export const STATION_DEFS = [
  // Upper pantry counters
  { id: 'rice', type: 'pantry', ingredient: 'rice', label: 'RICE BIN', x: 48, y: 174, w: 156, h: 96, standX: 126, standY: 308 },
  { id: 'seaweed', type: 'pantry', ingredient: 'seaweed', label: 'SEAWEED', x: 218, y: 174, w: 156, h: 96, standX: 296, standY: 308 },
  { id: 'greens', type: 'pantry', ingredient: 'greens', label: 'GREENS', x: 388, y: 174, w: 156, h: 96, standX: 466, standY: 308 },
  { id: 'egg', type: 'pantry', ingredient: 'egg', label: 'EGGS', x: 558, y: 174, w: 156, h: 96, standX: 636, standY: 308 },
  { id: 'salmon', type: 'pantry', ingredient: 'salmon', label: 'SALMON', x: 728, y: 174, w: 156, h: 96, standX: 806, standY: 308 },
  { id: 'chicken', type: 'pantry', ingredient: 'chicken', label: 'CHICKEN', x: 898, y: 174, w: 156, h: 96, standX: 976, standY: 308 },

  // Lower prep, stove, plating, and bin counters
  { id: 'chop', type: 'chop', label: 'CHOP BOARD', x: 48, y: 584, w: 248, h: 112, standX: 172, standY: 546 },
  { id: 'stove_0', type: 'stove', burnerIndex: 0, label: 'PAN 1', x: 324, y: 588, w: 148, h: 104, standX: 398, standY: 546 },
  { id: 'stove_1', type: 'stove', burnerIndex: 1, label: 'PAN 2', x: 486, y: 588, w: 148, h: 104, standX: 560, standY: 546 },
  { id: 'plating', type: 'plating', label: 'PLATING COUNTER', x: 662, y: 584, w: 288, h: 112, standX: 806, standY: 546 },
  { id: 'trash', type: 'trash', label: 'TRASH [X]', x: 968, y: 584, w: 100, h: 112, standX: 1018, standY: 546 },

  // Right wall serve window
  { id: 'serve', type: 'serve', label: 'SERVE WINDOW', x: 1094, y: 248, w: 162, h: 368, standX: 1052, standY: 430 },
];

export const STATION_BY_ID = Object.fromEntries(STATION_DEFS.map((s) => [s.id, s]));

export function createChef() {
  return {
    x: 520,
    y: 428,
    facingX: 0,
    facingY: 1,
    walkPhase: 0,
    moving: false,
    carry: [],
    carriedPlate: null,
    walkTarget: null,
    targetStationId: null,
    actionBounce: 0,
    stamina: 1.0,
    sprinting: false,
  };
}

export function createKitchenWorld() {
  return {
    width: KITCHEN_WIDTH,
    height: KITCHEN_HEIGHT,
    stations: STATION_DEFS,
    chef: createChef(),
    activeStationId: null,
    hoveredStationId: null,
  };
}

export function distanceToStation(px, py, station) {
  const cx = Math.max(station.x, Math.min(px, station.x + station.w));
  const cy = Math.max(station.y, Math.min(py, station.y + station.h));
  const dx = px - cx;
  const dy = py - cy;
  return Math.hypot(dx, dy);
}

export function findStationAtPoint(px, py) {
  for (const station of STATION_DEFS) {
    if (px >= station.x && px <= station.x + station.w && py >= station.y && py <= station.y + station.h) {
      return station;
    }
  }
  return null;
}

export function findAdjacentStation(chef) {
  let best = null;
  let bestScore = Infinity;

  for (const station of STATION_DEFS) {
    const dist = distanceToStation(chef.x, chef.y, station);
    if (dist > INTERACT_REACH) continue;

    const sx = station.x + station.w * 0.5;
    const sy = station.y + station.h * 0.5;
    const vx = sx - chef.x;
    const vy = sy - chef.y;
    const len = Math.hypot(vx, vy) || 1;
    const alignment = (vx / len) * chef.facingX + (vy / len) * chef.facingY;
    const weighted = dist - alignment * 14;

    if (weighted < bestScore) {
      bestScore = weighted;
      best = station;
    }
  }
  return best;
}

export function commandChefToStation(chef, station) {
  chef.walkTarget = { x: station.standX, y: station.standY };
  chef.targetStationId = station.id;
}

export function commandChefToPoint(chef, x, y) {
  chef.walkTarget = {
    x: Math.max(FLOOR_BOUNDS.minX, Math.min(FLOOR_BOUNDS.maxX, x)),
    y: Math.max(FLOOR_BOUNDS.minY, Math.min(FLOOR_BOUNDS.maxY, y)),
  };
  chef.targetStationId = null;
}

export function updateChefMovement(world, moveVector, dt) {
  const chef = world.chef;
  let arrivedStation = null;

  if (chef.actionBounce > 0) {
    chef.actionBounce = Math.max(0, chef.actionBounce - dt * 5.2);
  }

  let vx = moveVector.x;
  let vy = moveVector.y;

  if (vx !== 0 || vy !== 0) {
    chef.walkTarget = null;
    chef.targetStationId = null;
    const mag = Math.hypot(vx, vy);
    vx /= mag;
    vy /= mag;
  } else if (chef.walkTarget) {
    const dx = chef.walkTarget.x - chef.x;
    const dy = chef.walkTarget.y - chef.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 8) {
      chef.x = chef.walkTarget.x;
      chef.y = chef.walkTarget.y;
      chef.walkTarget = null;
      if (chef.targetStationId) {
        arrivedStation = STATION_BY_ID[chef.targetStationId] || null;
        chef.targetStationId = null;
        if (arrivedStation) {
          const sx = arrivedStation.x + arrivedStation.w * 0.5 - chef.x;
          const sy = arrivedStation.y + arrivedStation.h * 0.5 - chef.y;
          const slen = Math.hypot(sx, sy) || 1;
          chef.facingX = sx / slen;
          chef.facingY = sy / slen;
        }
      }
    } else {
      vx = dx / dist;
      vy = dy / dist;
    }
  }

  if (vx !== 0 || vy !== 0) {
    const wantsSprint = Boolean(moveVector.sprint) && chef.stamina > 0.08;
    chef.sprinting = wantsSprint;
    const speed = wantsSprint ? CHEF_SPEED * CHEF_SPRINT_MULT : CHEF_SPEED;
    if (wantsSprint) {
      chef.stamina = Math.max(0, chef.stamina - dt * 0.65);
    } else {
      chef.stamina = Math.min(1, chef.stamina + dt * 0.38);
    }
    chef.x = Math.max(FLOOR_BOUNDS.minX, Math.min(FLOOR_BOUNDS.maxX, chef.x + vx * speed * dt));
    chef.y = Math.max(FLOOR_BOUNDS.minY, Math.min(FLOOR_BOUNDS.maxY, chef.y + vy * speed * dt));
    chef.facingX = vx;
    chef.facingY = vy;
    chef.moving = true;
    chef.walkPhase += dt * (wantsSprint ? 16 : 11);
  } else {
    chef.moving = false;
    chef.sprinting = false;
    chef.stamina = Math.min(1, chef.stamina + dt * 0.45);
  }

  const near = findAdjacentStation(chef);
  world.activeStationId = near ? near.id : null;
  return arrivedStation;
}
