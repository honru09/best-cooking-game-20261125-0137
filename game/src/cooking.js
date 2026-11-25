// Cooking stations for Midnight Bento Rush — chopping board, dual stove pans,
// plating counter, serve window, trash bin, plus particles, popups and toasts.
//
// The kitchen loop: grab a raw ingredient from a pantry bin, chop it on the
// board and/or sear it in a pan, then stack three finished items on the
// plating counter and carry the completed plate to the serve window before
// the ticket's patience runs out. A wrong item on the plate mismatches the
// dish and must be binned at a two-second cost.

import {
  INGREDIENT_META,
  RECIPE_MAP,
  findMatchingTicket,
  getCandidateRecipes,
  getPrioritizedCandidateRecipe,
  matchRecipeFromItems,
  scoreServedOrder,
} from './orders.js';

// Tuning — kept in one place so the kitchen's pace is easy to reason about.
export const CHOP_DURATION = 1.2;
export const CHOP_AUTO_RATE = 0.55;
export const CHOP_TAP_BOOST = 0.28;
export const COOK_DURATIONS = { egg: 2.6, salmon: 3.0, chicken: 3.2 };
export const BURN_LIMIT = 4.0;
export const MAX_CARRY = 2;
export const WRONG_PLATE_PENALTY = 2;

function emptyStove() {
  return {
    item: null,
    elapsed: 0,
    duration: 0,
    burnElapsed: 0,
    status: 'empty',
    sizzleCooldown: 0,
  };
}

export function createStationStates() {
  return {
    chop: { item: null, progress: 0, duration: CHOP_DURATION, slashAnim: 0 },
    stoves: [emptyStove(), emptyStove()],
    plate: { items: [], completedRecipeId: null, mismatch: false },
    serveShowcase: null,
    particles: [],
    popups: [],
    toast: { text: '', color: '#f7ead0', timer: 0 },
  };
}

export function pushToast(stations, text, color = '#f7ead0') {
  stations.toast = { text, color, timer: 2.8 };
}

export function addPopup(stations, x, y, text, color, subtext = '') {
  stations.popups.push({ x, y, text, color, subtext, timer: 1.7, life: 1.7 });
}

export function addCookingParticles(stations, x, y, color, count, kind) {
  for (let i = 0; i < count; i++) {
    const life = 0.55 + Math.random() * 0.5;
    stations.particles.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * (kind === 'spark' ? 95 : 16),
      vy: kind === 'spark' ? -(45 + Math.random() * 75) : -(18 + Math.random() * 28),
      life,
      maxLife: life,
      size: 2 + Math.random() * 3,
      color,
      kind,
    });
  }
}

function carryHasRoom(chef) {
  return chef.carry.length < MAX_CARRY;
}

function takeCarriedItem(chef, predicate) {
  const idx = chef.carry.findIndex(predicate);
  if (idx === -1) return null;
  return chef.carry.splice(idx, 1)[0];
}

function handlePantry(game, station) {
  const chef = game.world.chef;
  const meta = INGREDIENT_META[station.ingredient];
  if (!meta) return;
  if (!carryHasRoom(chef)) {
    pushToast(game.stations, 'HANDS FULL — PLATE OR BIN SOMETHING FIRST', '#ff9d8a');
    game.sound.playErrorBuzz();
    return;
  }
  chef.carry.push({ kind: meta.id, state: meta.initialState });
  chef.actionBounce = 1;
  game.sound.playPickup();
  addCookingParticles(
    game.stations,
    station.x + station.w * 0.5,
    station.y + 30,
    'rgba(255,228,165,0.7)',
    4,
    'spark',
  );
}

function handleChopBoard(game) {
  const chef = game.world.chef;
  const chop = game.stations.chop;

  // Nothing on the board: lay down something that needs chopping.
  if (!chop.item) {
    const raw = takeCarriedItem(
      chef,
      (item) => INGREDIENT_META[item.kind].needsChop && item.state === 'raw',
    );
    if (!raw) {
      pushToast(game.stations, 'BRING GREENS, SALMON OR CHICKEN TO CHOP', '#ff9d8a');
      game.sound.playErrorBuzz();
      return;
    }
    chop.item = raw;
    chop.progress = 0;
    chop.duration = CHOP_DURATION;
    chef.actionBounce = 1;
    game.sound.playPickup();
    return;
  }

  // Still chopping: each tap drives the knife and speeds the work up.
  if (chop.item.state === 'raw') {
    chop.progress = Math.min(chop.duration, chop.progress + CHOP_TAP_BOOST);
    chop.slashAnim = 1;
    chef.actionBounce = 1;
    game.sound.playChopThock();
    addCookingParticles(game.stations, 172, 634, '#59cc69', 3, 'spark');
    if (chop.progress >= chop.duration) {
      chop.item.state = 'chopped';
      game.sound.playPlateSnap();
      pushToast(game.stations, 'CHOPPED — PICK IT UP [E]', '#98f5ae');
    }
    return;
  }

  // Finished chopping: pick the pieces back up.
  if (!carryHasRoom(chef)) {
    pushToast(game.stations, 'HANDS FULL — PLATE OR BIN SOMETHING FIRST', '#ff9d8a');
    game.sound.playErrorBuzz();
    return;
  }
  chef.carry.push(chop.item);
  chop.item = null;
  chop.progress = 0;
  chef.actionBounce = 1;
  game.sound.playPickup();
}

function cookableCarriedItem(chef) {
  return chef.carry.find((item) => {
    const meta = INGREDIENT_META[item.kind];
    if (!meta.needsCook) return false;
    if (item.kind === 'egg') return item.state === 'raw';
    return item.state === 'chopped';
  });
}

function handleStove(game, station) {
  const chef = game.world.chef;
  const stove = game.stations.stoves[station.burnerIndex];
  if (!stove) return;

  // Empty pan: start searing something that is ready for the heat.
  if (!stove.item) {
    const rawNeedsChop = chef.carry.find(
      (item) => INGREDIENT_META[item.kind].needsChop && item.state === 'raw',
    );
    if (rawNeedsChop) {
      pushToast(
        game.stations,
        `${INGREDIENT_META[rawNeedsChop.kind].label.toUpperCase()} NEEDS CHOPPING FIRST`,
        '#ff9d8a',
      );
      game.sound.playErrorBuzz();
      return;
    }
    const item = cookableCarriedItem(chef);
    if (!item) {
      pushToast(game.stations, 'BRING EGG, OR CHOPPED SALMON / CHICKEN TO COOK', '#ff9d8a');
      game.sound.playErrorBuzz();
      return;
    }
    takeCarriedItem(chef, (carried) => carried === item);
    stove.item = item;
    stove.elapsed = 0;
    stove.duration = COOK_DURATIONS[item.kind];
    stove.burnElapsed = 0;
    stove.status = 'cooking';
    stove.sizzleCooldown = 0.4;
    chef.actionBounce = 1;
    game.sound.playSizzleTick();
    return;
  }

  // Still cooking: the pan needs more time, nothing to take yet.
  if (stove.status === 'cooking') {
    game.sound.playSizzleTick();
    return;
  }

  // Ready (or burnt): lift the pan's contents off, hands permitting.
  if (!carryHasRoom(chef)) {
    pushToast(game.stations, 'HANDS FULL — PLATE OR BIN SOMETHING FIRST', '#ff9d8a');
    game.sound.playErrorBuzz();
    return;
  }
  const wasBurnt = stove.status === 'burnt';
  chef.carry.push(stove.item);
  game.stations.stoves[station.burnerIndex] = emptyStove();
  chef.actionBounce = 1;
  game.sound.playPickup();
  if (wasBurnt) {
    pushToast(game.stations, 'BURNT! BIN IT WITH [X]', '#ff9d8a');
  }
}

function handlePlating(game) {
  const chef = game.world.chef;
  const plate = game.stations.plate;

  if (chef.carriedPlate) {
    pushToast(game.stations, 'THAT PLATE IS DONE — TAKE IT TO THE SERVE WINDOW', '#ffe073');
    return;
  }

  // A finished plate is waiting: pick it up with the free hand.
  if (plate.completedRecipeId) {
    chef.carriedPlate = { recipeId: plate.completedRecipeId };
    plate.items = [];
    plate.completedRecipeId = null;
    plate.mismatch = false;
    chef.actionBounce = 1;
    game.sound.playPlateSnap();
    pushToast(
      game.stations,
      `${RECIPE_MAP[chef.carriedPlate.recipeId].name.toUpperCase()} PLATED — SERVE IT!`,
      '#98f5ae',
    );
    return;
  }

  if (chef.carry.length === 0) return;

  // Place the first carried item that still leaves a dish completable.
  const fitting = chef.carry.find(
    (item) => getCandidateRecipes([...plate.items, item]).length > 0,
  );
  if (fitting) {
    takeCarriedItem(chef, (carried) => carried === fitting);
    plate.items.push(fitting);
    chef.actionBounce = 1;
    game.sound.playPlateSnap();
    const match = matchRecipeFromItems(plate.items);
    if (match) {
      plate.completedRecipeId = match.id;
      pushToast(game.stations, `${match.name.toUpperCase()} READY — PICK UP THE PLATE!`, '#98f5ae');
    }
    return;
  }

  // Nothing carried fits any dish: it lands anyway and mismatches the plate.
  const wrong = chef.carry.shift();
  plate.items.push(wrong);
  plate.mismatch = true;
  chef.actionBounce = 1;
  game.sound.playErrorBuzz();
  pushToast(game.stations, 'WRONG INGREDIENT — PLATE MISMATCHED! BIN IT [X]', '#ff7466');
}

function handleServeWindow(game, station) {
  const chef = game.world.chef;
  const { orders, stations } = game;

  if (chef.carriedPlate) {
    const recipe = RECIPE_MAP[chef.carriedPlate.recipeId];
    const ticket = findMatchingTicket(orders, chef.carriedPlate.recipeId);
    if (!ticket) {
      pushToast(
        game.stations,
        `NO TICKET FOR ${recipe.shortName.toUpperCase()} — HOLD THE PLATE`,
        '#ff9d8a',
      );
      game.sound.playErrorBuzz();
      return;
    }
    const result = scoreServedOrder(orders, ticket, game.timeLeft);
    chef.carriedPlate = null;
    chef.actionBounce = 1;
    stations.serveShowcase = { recipeId: recipe.id, timer: 3.5, label: recipe.name };
    addPopup(
      stations,
      station.x - 18,
      station.y + 84,
      `+${result.totalPoints} COMBO x${result.multiplier}`,
      '#ffe875',
      result.fastTip > 0 ? `FAST TIP +${result.fastTip}` : '',
    );
    addCookingParticles(stations, station.x + 81, station.y + 190, '#ffe066', 14, 'spark');
    addCookingParticles(stations, station.x + 81, station.y + 190, '#ff7d54', 8, 'spark');
    game.sound.playServeBell(orders.streak);
    return;
  }

  if (chef.carry.length > 0) {
    pushToast(game.stations, 'FINISH THE DISH ON THE PLATING COUNTER FIRST', '#ffe073');
    return;
  }
  pushToast(game.stations, 'NOTHING TO SERVE — PLATE A DISH FIRST', '#ffe073');
}

export function discardCarriedOrPlate(game) {
  const chef = game.world.chef;
  const plate = game.stations.plate;

  if (chef.carriedPlate) {
    chef.carriedPlate = null;
    game.sound.playBinDiscard();
    pushToast(game.stations, 'PLATE BINNED', '#ff9d8a');
    return;
  }

  if (chef.carry.length > 0) {
    chef.carry = [];
    game.sound.playBinDiscard();
    pushToast(game.stations, 'CARRIED ITEMS BINNED', '#ff9d8a');
    return;
  }

  if (plate.items.length > 0) {
    const wasMismatch = plate.mismatch;
    plate.items = [];
    plate.completedRecipeId = null;
    plate.mismatch = false;
    game.sound.playBinDiscard();
    if (wasMismatch) {
      game.timeLeft = Math.max(0, game.timeLeft - WRONG_PLATE_PENALTY);
      pushToast(game.stations, `WRONG PLATE BINNED −${WRONG_PLATE_PENALTY}s`, '#ff7466');
    } else {
      pushToast(game.stations, 'PLATE CLEARED', '#ff9d8a');
    }
    return;
  }

  pushToast(game.stations, 'NOTHING TO BIN', '#cbbfa8');
}

export function interactWithStation(game, station) {
  if (!station || game.mode === 'title' || game.mode === 'end') return;
  switch (station.type) {
    case 'pantry':
      handlePantry(game, station);
      break;
    case 'chop':
      handleChopBoard(game);
      break;
    case 'stove':
      handleStove(game, station);
      break;
    case 'plating':
      handlePlating(game);
      break;
    case 'trash':
      discardCarriedOrPlate(game);
      break;
    case 'serve':
      handleServeWindow(game, station);
      break;
    default:
      break;
  }
}

export function updateCookingStations(game, dt) {
  const { stations } = game;
  const chop = stations.chop;

  if (chop.slashAnim > 0) {
    chop.slashAnim = Math.max(0, chop.slashAnim - dt * 3);
  }

  // The board works on its own, slowly; tapping the knife hurries it along.
  if (chop.item && chop.item.state === 'raw') {
    chop.progress = Math.min(chop.duration, chop.progress + dt * CHOP_AUTO_RATE);
    if (chop.progress >= chop.duration) {
      chop.item.state = 'chopped';
      game.sound.playPlateSnap();
      addCookingParticles(stations, 172, 634, '#59cc69', 4, 'spark');
    }
  }

  const panCenters = [398, 560];
  for (let s = 0; s < stations.stoves.length; s++) {
    const stove = stations.stoves[s];
    if (!stove.item) continue;
    if (stove.status === 'cooking') {
      stove.elapsed += dt;
      stove.sizzleCooldown -= dt;
      if (stove.sizzleCooldown <= 0) {
        stove.sizzleCooldown = 0.5;
        game.sound.playSizzleTick();
        addCookingParticles(
          stations,
          panCenters[s],
          620,
          'rgba(255,244,218,0.85)',
          1,
          'steam',
        );
      }
      if (stove.elapsed >= stove.duration) {
        stove.item.state = INGREDIENT_META[stove.item.kind].plateState;
        stove.status = 'ready';
        stove.burnElapsed = 0;
        game.sound.playCookReadyDing();
      }
    } else if (stove.status === 'ready') {
      stove.burnElapsed += dt;
      if (stove.burnElapsed >= BURN_LIMIT) {
        stove.status = 'burnt';
        stove.item.state = 'burnt';
        game.sound.playErrorBuzz();
        pushToast(stations, 'PAN BURNT! PICK IT UP & BIN IT [X]', '#ff7466');
      }
    }
  }

  for (let i = stations.particles.length - 1; i >= 0; i--) {
    const p = stations.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'steam') p.vx *= 1 - dt * 0.4;
    if (p.life <= 0) stations.particles.splice(i, 1);
  }

  for (let i = stations.popups.length - 1; i >= 0; i--) {
    const popup = stations.popups[i];
    popup.timer -= dt;
    popup.y -= dt * 26;
    if (popup.timer <= 0) stations.popups.splice(i, 1);
  }

  if (stations.toast.timer > 0) {
    stations.toast.timer = Math.max(0, stations.toast.timer - dt);
  }

  if (stations.serveShowcase) {
    stations.serveShowcase.timer -= dt;
    if (stations.serveShowcase.timer <= 0) stations.serveShowcase = null;
  }
}

// Helper for renderers that want the dish the plate is heading toward.
export function getPlateTargetRecipe(game) {
  return getPrioritizedCandidateRecipe(game.stations.plate.items, game.orders.tickets);
}
