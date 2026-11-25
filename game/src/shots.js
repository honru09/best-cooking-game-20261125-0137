// Deterministic seeded RNG and ?shot= scene staging for crisp headless renders.

import { addCookingParticles, addPopup } from './cooking.js';
import { STATION_BY_ID } from './world.js';

export function createSeededRng(seedValue) {
  let state = (Number(seedValue) >>> 0) || 20261125;
  return function nextFloat() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseShotQuery(searchString = '') {
  const params = new URLSearchParams(searchString);
  const shot = params.get('shot');
  const seedRaw = params.get('seed');
  const seed = seedRaw !== null && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : 101;
  return {
    shot: shot ? shot.trim().toLowerCase() : null,
    seed,
  };
}

function setTicket(orders, id, recipeId, patience, maxPatience) {
  orders.tickets.push({
    id,
    recipeId,
    patience,
    maxPatience,
    flash: 0,
  });
}

export function applyDeterministicShotScene(game, shotName) {
  const { world, orders, stations } = game;
  const chef = world.chef;

  orders.tickets = [];
  stations.particles = [];
  stations.popups = [];
  stations.toast.timer = 0;
  game.paused = false;

  if (shotName === 'start') {
    game.mode = 'title';
    game.timeLeft = 180;
    game.elapsedAnim = 1.4;
    orders.score = 0;
    orders.streak = 0;
    orders.servedCount = 0;
    orders.hearts = 3;

    setTicket(orders, 1, 'salmon_onigiri', 48, 56);
    setTicket(orders, 2, 'tamago_bento', 41, 56);
    setTicket(orders, 3, 'chicken_teriyaki', 53, 56);

    chef.x = 966;
    chef.y = 428;
    chef.facingX = -1;
    chef.facingY = 0.2;
    chef.carry = [
      { kind: 'rice', state: 'ready' },
      { kind: 'seaweed', state: 'ready' },
    ];
    chef.carriedPlate = null;
    world.activeStationId = 'plating';

    stations.chop.item = { kind: 'greens', state: 'raw' };
    stations.chop.progress = 0.65;
    stations.chop.duration = 1.2;

    stations.stoves[0] = {
      item: { kind: 'salmon', state: 'chopped' },
      elapsed: 2.0,
      duration: 3.0,
      burnElapsed: 0,
      status: 'cooking',
      sizzleCooldown: 0.2,
    };
    stations.stoves[1] = {
      item: { kind: 'egg', state: 'cooked' },
      elapsed: 2.6,
      duration: 2.6,
      burnElapsed: 0.9,
      status: 'ready',
      sizzleCooldown: 0.2,
    };

    stations.plate.items = [
      { kind: 'rice', state: 'ready' },
      { kind: 'greens', state: 'chopped' },
    ];
    stations.plate.completedRecipeId = null;
    stations.plate.mismatch = false;

    stations.serveShowcase = {
      recipeId: 'salmon_onigiri',
      timer: 99,
      label: 'Salmon Onigiri',
    };

    const st0 = STATION_BY_ID.stove_0;
    addCookingParticles(stations, st0.x + st0.w * 0.5, st0.y + 32, 'rgba(255,244,218,0.85)', 5, 'steam');
    return true;
  }

  if (shotName === 'play') {
    game.mode = 'playing';
    game.timeLeft = 108;
    game.elapsedAnim = 3.2;
    orders.score = 340;
    orders.streak = 2;
    orders.bestStreak = 2;
    orders.servedCount = 4;
    orders.hearts = 3;

    setTicket(orders, 5, 'tamago_bento', 38, 52);
    setTicket(orders, 6, 'salmon_onigiri', 12, 52);
    setTicket(orders, 7, 'chicken_teriyaki', 25, 52);

    chef.x = 592;
    chef.y = 426;
    chef.facingX = 0.7;
    chef.facingY = 0.7;
    chef.stamina = 0.74;
    chef.sprinting = true;
    chef.carry = [
      { kind: 'salmon', state: 'cooked' },
      { kind: 'rice', state: 'ready' },
    ];
    chef.carriedPlate = null;
    world.activeStationId = 'plating';

    stations.chop.item = { kind: 'greens', state: 'raw' };
    stations.chop.progress = 0.84;
    stations.chop.duration = 1.2;
    stations.chop.slashAnim = 0.72;

    stations.stoves[0] = {
      item: { kind: 'egg', state: 'raw' },
      elapsed: 2.05,
      duration: 2.6,
      burnElapsed: 0,
      status: 'cooking',
      sizzleCooldown: 0.2,
    };
    stations.stoves[1] = {
      item: { kind: 'chicken', state: 'cooked' },
      elapsed: 3.2,
      duration: 3.2,
      burnElapsed: 1.1,
      status: 'ready',
      sizzleCooldown: 0.2,
    };

    stations.plate.items = [
      { kind: 'rice', state: 'ready' },
      { kind: 'greens', state: 'chopped' },
    ];
    stations.plate.completedRecipeId = null;
    stations.plate.mismatch = false;

    stations.serveShowcase = {
      recipeId: 'veggie_roll',
      timer: 2.4,
      label: 'Veggie Roll',
    };

    const chopSt = STATION_BY_ID.chop;
    const stove0 = STATION_BY_ID.stove_0;
    addCookingParticles(stations, chopSt.x + chopSt.w * 0.5, chopSt.y + 42, '#59cc69', 6, 'spark');
    addCookingParticles(stations, stove0.x + stove0.w * 0.5, stove0.y + 32, 'rgba(255,244,218,0.85)', 5, 'steam');
    return true;
  }

  if (shotName === 'serve') {
    game.mode = 'rush';
    game.timeLeft = 44;
    game.elapsedAnim = 5.6;
    orders.score = 785;
    orders.streak = 3;
    orders.bestStreak = 3;
    orders.servedCount = 8;
    orders.hearts = 3;
    orders.rushAnnounced = true;

    setTicket(orders, 10, 'salmon_teriyaki_set', 28, 45);
    setTicket(orders, 11, 'chicken_teriyaki', 17, 45);
    setTicket(orders, 12, 'veggie_roll', 36, 45);
    setTicket(orders, 13, 'tamago_bento', 41, 45);

    chef.x = 1024;
    chef.y = 426;
    chef.facingX = 1;
    chef.facingY = 0;
    chef.carry = [{ kind: 'rice', state: 'ready' }];
    chef.carriedPlate = null;
    world.activeStationId = 'serve';

    stations.chop.item = { kind: 'greens', state: 'chopped' };
    stations.chop.progress = 1.2;
    stations.chop.duration = 1.2;

    stations.stoves[0] = {
      item: { kind: 'salmon', state: 'chopped' },
      elapsed: 2.2,
      duration: 3.0,
      burnElapsed: 0,
      status: 'cooking',
      sizzleCooldown: 0.2,
    };
    stations.stoves[1] = {
      item: { kind: 'chicken', state: 'cooked' },
      elapsed: 3.2,
      duration: 3.2,
      burnElapsed: 0.6,
      status: 'ready',
      sizzleCooldown: 0.2,
    };

    stations.plate.items = [
      { kind: 'rice', state: 'ready' },
      { kind: 'chicken', state: 'cooked' },
    ];
    stations.plate.completedRecipeId = null;
    stations.plate.mismatch = false;

    stations.serveShowcase = {
      recipeId: 'salmon_onigiri',
      timer: 3.1,
      label: 'Salmon Onigiri',
    };

    const serveSt = STATION_BY_ID.serve;
    addCookingParticles(stations, serveSt.x + 81, serveSt.y + 190, '#ffe066', 14, 'spark');
    addCookingParticles(stations, serveSt.x + 81, serveSt.y + 190, '#ff7d54', 8, 'spark');
    addPopup(stations, serveSt.x - 18, serveSt.y + 84, '+120 COMBO x3', '#ffe875', 'FAST TIP +30');
    return true;
  }

  return false;
}
