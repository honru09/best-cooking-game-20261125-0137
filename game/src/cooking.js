// Station cooking logic: carry stack, chopping, stove searing/burning, plating, serving, and binning.

import {
  INGREDIENT_META,
  RECIPE_MAP,
  findMatchingTicket,
  getCandidateRecipes,
  getMissingIngredients,
  getPrioritizedCandidateRecipe,
  itemSignature,
  matchRecipeFromItems,
  scoreServedOrder,
} from './orders.js';
import { STATION_BY_ID, distanceToStation } from './world.js';

export const MAX_CARRY = 3;
export const CHOP_DURATION = 1.2;
export const COOK_DURATIONS = {
  egg: 2.6,
  salmon: 3.0,
  chicken: 3.2,
};
export const BURN_GRACE = 5.5;
export const BIN_PENALTY_SECONDS = 2.0;

export function createStationStates() {
  return {
    chop: {
      item: null,
      progress: 0,
      duration: CHOP_DURATION,
      slashAnim: 0,
      thockCooldown: 0,
    },
    stoves: [
      { item: null, elapsed: 0, duration: 3.0, burnElapsed: 0, status: 'idle', sizzleCooldown: 0 },
      { item: null, elapsed: 0, duration: 3.0, burnElapsed: 0, status: 'idle', sizzleCooldown: 0 },
    ],
    plate: {
      items: [],
      completedRecipeId: null,
      mismatch: false,
      flash: 0,
    },
    serveShowcase: {
      recipeId: null,
      timer: 0,
      label: '',
    },
    particles: [],
    popups: [],
    toast: { text: '', color: '#ffd87a', timer: 0 },
  };
}

export function pushToast(stations, text, color = '#ffd87a') {
  stations.toast.text = text;
  stations.toast.color = color;
  stations.toast.timer = 2.0;
}

export function addPopup(stations, x, y, text, color = '#ffe074', subtext = '') {
  stations.popups.push({
    x,
    y,
    text,
    subtext,
    color,
    age: 0,
    life: 1.8,
  });
}

export function addCookingParticles(stations, x, y, color, count = 8, kind = 'spark') {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (i % 3) * 0.28;
    const speed = kind === 'steam' ? 18 + (i % 4) * 9 : 48 + (i % 5) * 26;
    stations.particles.push({
      x: x + ((i % 3) - 1) * 8,
      y: y + (((i + 1) % 3) - 1) * 6,
      vx: kind === 'steam' ? ((i % 2 === 0 ? -1 : 1) * 10) : Math.cos(angle) * speed,
      vy: kind === 'steam' ? -speed : Math.sin(angle) * speed - 22,
      radius: kind === 'steam' ? 5 + (i % 3) * 2 : 3 + (i % 3),
      color,
      kind,
      age: 0,
      life: kind === 'steam' ? 0.95 : 0.58,
    });
  }
}

export function isItemPlateable(item) {
  if (!item || item.state === 'burnt') return false;
  const meta = INGREDIENT_META[item.kind];
  return Boolean(meta && item.state === meta.plateState);
}

export function isItemChoppable(item) {
  if (!item) return false;
  const meta = INGREDIENT_META[item.kind];
  return Boolean(meta && meta.needsChop && item.state === 'raw');
}

export function isItemCookable(item) {
  if (!item) return false;
  const meta = INGREDIENT_META[item.kind];
  if (!meta || !meta.needsCook) return false;
  return meta.needsChop ? item.state === 'chopped' : item.state === 'raw';
}

function chooseBestCarryIndexForPlate(carry, plateItems, activeTickets) {
  const candidates = getCandidateRecipes(plateItems);
  const placedSigs = plateItems.map(itemSignature);
  const activeRecipeIds = new Set(activeTickets.map((t) => t.recipeId));

  // Prefer an item that completes or advances a currently ordered recipe.
  for (let priority = 0; priority < 2; priority++) {
    for (let i = 0; i < carry.length; i++) {
      const item = carry[i];
      if (!isItemPlateable(item)) continue;
      const sig = itemSignature(item);
      for (const recipe of candidates) {
        if (priority === 0 && !activeRecipeIds.has(recipe.id)) continue;
        const needed = recipe.ingredients.map(itemSignature);
        for (const pSig of placedSigs) {
          const pIdx = needed.indexOf(pSig);
          if (pIdx !== -1) needed.splice(pIdx, 1);
        }
        if (needed.includes(sig)) return i;
      }
    }
  }

  // Otherwise allow any plateable item (may cause a mismatch plate that must be binned).
  return carry.findIndex(isItemPlateable);
}

function refreshPlateStatus(plate) {
  if (plate.items.length === 0) {
    plate.completedRecipeId = null;
    plate.mismatch = false;
    return;
  }
  const matched = matchRecipeFromItems(plate.items);
  if (matched) {
    plate.completedRecipeId = matched.id;
    plate.mismatch = false;
    return;
  }
  const candidates = getCandidateRecipes(plate.items);
  plate.completedRecipeId = null;
  plate.mismatch = candidates.length === 0 || plate.items.length >= 3;
}

export function interactWithStation(game, station) {
  const { world, stations, orders, sound } = game;
  const chef = world.chef;
  if (!station) return false;

  chef.actionBounce = 1.0;

  if (station.type === 'pantry') {
    if (chef.carry.length >= MAX_CARRY) {
      sound.playErrorBuzz();
      pushToast(stations, 'HANDS FULL (MAX 3) — PREP OR PLATE FIRST', '#ff8c78');
      return false;
    }
    const meta = INGREDIENT_META[station.ingredient];
    chef.carry.push({ kind: meta.id, state: meta.initialState });
    sound.playPickup();
    addCookingParticles(stations, station.x + station.w * 0.5, station.y + 42, meta.accent, 6, 'spark');
    return true;
  }

  if (station.type === 'chop') {
    const board = stations.chop;
    if (board.item && board.progress >= board.duration) {
      if (chef.carry.length >= MAX_CARRY) {
        sound.playErrorBuzz();
        pushToast(stations, 'HANDS FULL — FREE A SLOT TO PICK UP', '#ff8c78');
        return false;
      }
      chef.carry.push(board.item);
      board.item = null;
      board.progress = 0;
      sound.playPickup();
      return true;
    }
    if (board.item && board.progress < board.duration) {
      // Responsive tap boost while chopping
      board.progress = Math.min(board.duration, board.progress + 0.22);
      board.slashAnim = 1.0;
      sound.playChopThock();
      addCookingParticles(
        stations,
        station.x + station.w * 0.5,
        station.y + 46,
        INGREDIENT_META[board.item.kind].accent,
        5,
        'spark',
      );
      if (board.progress >= board.duration) {
        board.item.state = 'chopped';
        sound.playPlateSnap();
        if (chef.carry.length < MAX_CARRY) {
          chef.carry.push(board.item);
          board.item = null;
          board.progress = 0;
        }
      }
      return true;
    }
    const chopIdx = chef.carry.findIndex(isItemChoppable);
    if (chopIdx === -1) {
      sound.playErrorBuzz();
      pushToast(stations, 'BRING RAW GREENS, SALMON, OR CHICKEN TO CHOP', '#ffd87a');
      return false;
    }
    const [picked] = chef.carry.splice(chopIdx, 1);
    board.item = picked;
    board.progress = 0.08;
    board.duration = CHOP_DURATION;
    board.slashAnim = 1.0;
    sound.playChopThock();
    return true;
  }

  if (station.type === 'stove') {
    const burner = stations.stoves[station.burnerIndex];
    if (burner.item && (burner.status === 'ready' || burner.status === 'burnt')) {
      if (chef.carry.length >= MAX_CARRY) {
        sound.playErrorBuzz();
        pushToast(stations, 'HANDS FULL — CLEAR A SLOT FIRST', '#ff8c78');
        return false;
      }
      chef.carry.push(burner.item);
      burner.item = null;
      burner.elapsed = 0;
      burner.burnElapsed = 0;
      burner.status = 'idle';
      sound.playPickup();
      return true;
    }
    if (burner.item && burner.status === 'cooking') {
      pushToast(stations, 'SEARING IN PAN — WAIT FOR GREEN RING', '#ffd87a');
      return false;
    }
    const cookIdx = chef.carry.findIndex(isItemCookable);
    if (cookIdx === -1) {
      const hasRawProtein = chef.carry.some(
        (it) => (it.kind === 'salmon' || it.kind === 'chicken') && it.state === 'raw',
      );
      sound.playErrorBuzz();
      pushToast(
        stations,
        hasRawProtein ? 'CHOP SALMON / CHICKEN ON THE BOARD FIRST!' : 'BRING EGG OR CHOPPED PROTEIN TO SEAR',
        '#ff9e70',
      );
      return false;
    }
    const [picked] = chef.carry.splice(cookIdx, 1);
    burner.item = picked;
    burner.elapsed = 0;
    burner.burnElapsed = 0;
    burner.duration = COOK_DURATIONS[picked.kind] || 3.0;
    burner.status = 'cooking';
    sound.playSizzleTick();
    addCookingParticles(stations, station.x + station.w * 0.5, station.y + 42, '#fff0c4', 6, 'steam');
    return true;
  }

  if (station.type === 'plating') {
    const plate = stations.plate;
    if (plate.completedRecipeId) {
      if (chef.carriedPlate) {
        sound.playErrorBuzz();
        pushToast(stations, 'SERVE THE BENTO IN YOUR HANDS FIRST!', '#ff8c78');
        return false;
      }
      chef.carriedPlate = {
        recipeId: plate.completedRecipeId,
        items: plate.items.slice(),
      };
      plate.items = [];
      plate.completedRecipeId = null;
      plate.mismatch = false;
      sound.playPickup();
      pushToast(stations, `CARRYING ${RECIPE_MAP[chef.carriedPlate.recipeId].name.toUpperCase()} → SERVE!`, '#8df0a4');
      return true;
    }
    if (plate.mismatch) {
      sound.playErrorBuzz();
      pushToast(stations, 'WRONG MIX — PRESS [X] OR CLICK TRASH BIN (-2s)', '#ff7d6b');
      return false;
    }
    const bestIdx = chooseBestCarryIndexForPlate(chef.carry, plate.items, orders.tickets);
    if (bestIdx === -1) {
      const hasBurnt = chef.carry.some((it) => it.state === 'burnt');
      const hasUnprepped = chef.carry.some((it) => !isItemPlateable(it) && it.state !== 'burnt');
      sound.playErrorBuzz();
      if (hasBurnt) {
        pushToast(stations, 'BIN BURNT FOOD [X] — CANNOT PLATE', '#ff7d6b');
      } else if (hasUnprepped) {
        pushToast(stations, 'CHOP OR COOK INGREDIENTS BEFORE PLATING', '#ffd87a');
      } else {
        pushToast(stations, 'BRING PREPARED INGREDIENTS TO ASSEMBLE', '#ffd87a');
      }
      return false;
    }
    const [placed] = chef.carry.splice(bestIdx, 1);
    plate.items.push(placed);
    plate.flash = 0.5;
    refreshPlateStatus(plate);
    sound.playPlateSnap();
    addCookingParticles(stations, station.x + station.w * 0.5, station.y + 48, '#ffdf88', 7, 'spark');

    if (plate.completedRecipeId) {
      const rec = RECIPE_MAP[plate.completedRecipeId];
      sound.playCookReadyDing();
      addPopup(stations, station.x + station.w * 0.5, station.y - 10, `${rec.shortName.toUpperCase()} READY!`, '#90f2a6');
    } else if (plate.mismatch) {
      sound.playErrorBuzz();
      pushToast(stations, 'NO MATCHING RECIPE — BIN WITH [X] (-2s)', '#ff7d6b');
    } else {
      const targetRec = getPrioritizedCandidateRecipe(plate.items, orders.tickets);
      const missing = getMissingIngredients(targetRec, plate.items);
      if (targetRec && missing.length > 0) {
        const nextNeed = INGREDIENT_META[missing[0].kind];
        pushToast(stations, `${targetRec.shortName.toUpperCase()} (${plate.items.length}/3) — NEXT: ${nextNeed.shortLabel}`, '#ffe394');
      }
    }
    return true;
  }

  if (station.type === 'serve') {
    if (!chef.carriedPlate) {
      // Convenience: if plate is completed on plating counter, prompt clearly
      if (stations.plate.completedRecipeId) {
        pushToast(stations, 'PICK UP THE FINISHED BENTO FROM PLATING FIRST!', '#ffd87a');
      } else {
        pushToast(stations, 'ASSEMBLE A COMPLETE 3-ITEM BENTO TO SERVE', '#ffd87a');
      }
      sound.playErrorBuzz();
      return false;
    }
    const ticket = findMatchingTicket(orders, chef.carriedPlate.recipeId);
    if (!ticket) {
      sound.playErrorBuzz();
      pushToast(stations, 'NO ACTIVE TICKET FOR THAT DISH — WAIT OR BIN [X]', '#ff9575');
      return false;
    }
    const result = scoreServedOrder(orders, ticket, game.timeLeft);
    stations.serveShowcase = {
      recipeId: chef.carriedPlate.recipeId,
      timer: 3.4,
      label: result.recipe.shortName,
    };
    chef.carriedPlate = null;
    sound.playServeBell(result.multiplier);
    const px = station.x + 81;
    const py = station.y + 132;
    addCookingParticles(stations, px, py + 48, '#ffd966', 16, 'spark');
    addCookingParticles(stations, px, py + 48, '#ff7f50', 10, 'spark');
    const sub = result.fastTip > 0 ? `FAST TIP +${result.fastTip}` : `${result.recipe.shortName.toUpperCase()}`;
    addPopup(
      stations,
      px - 36,
      py,
      `+${result.totalPoints} COMBO x${result.multiplier}`,
      '#ffe570',
      sub,
    );
    return true;
  }

  if (station.type === 'trash') {
    return discardCarriedOrPlate(game);
  }

  return false;
}

export function discardCarriedOrPlate(game) {
  const { world, stations, sound } = game;
  const chef = world.chef;

  // 1. Toss burnt carried item first with no penalty.
  const burntIdx = chef.carry.findIndex((it) => it.state === 'burnt');
  if (burntIdx !== -1) {
    chef.carry.splice(burntIdx, 1);
    sound.playBinDiscard();
    pushToast(stations, 'BURNT FOOD DISCARDED', '#d6d0c4');
    return true;
  }

  // 2. Toss carried wrong plate with small time penalty.
  if (chef.carriedPlate) {
    chef.carriedPlate = null;
    game.timeLeft = Math.max(1, game.timeLeft - BIN_PENALTY_SECONDS);
    sound.playBinDiscard();
    addPopup(stations, chef.x, chef.y - 36, 'PLATE BINNED (-2s)', '#ff8d78');
    return true;
  }

  // 3. Toss plate on plating counter if mismatched or chef is adjacent to plating/trash.
  if (stations.plate.items.length > 0 && (stations.plate.mismatch || world.activeStationId === 'plating' || world.activeStationId === 'trash')) {
    stations.plate.items = [];
    stations.plate.completedRecipeId = null;
    stations.plate.mismatch = false;
    game.timeLeft = Math.max(1, game.timeLeft - BIN_PENALTY_SECONDS);
    sound.playBinDiscard();
    const ps = STATION_BY_ID.plating;
    addPopup(stations, ps.x + ps.w * 0.5, ps.y - 12, 'PLATE BINNED (-2s)', '#ff8d78');
    return true;
  }

  // 4. Scrape burnt pan if adjacent to it.
  for (let i = 0; i < stations.stoves.length; i++) {
    const burner = stations.stoves[i];
    if (burner.status === 'burnt' && world.activeStationId === `stove_${i}`) {
      burner.item = null;
      burner.elapsed = 0;
      burner.burnElapsed = 0;
      burner.status = 'idle';
      sound.playBinDiscard();
      pushToast(stations, 'BURNT PAN SCRAPED CLEAN', '#d6d0c4');
      return true;
    }
  }

  // 5. Discard top carried loose ingredient.
  if (chef.carry.length > 0) {
    chef.carry.pop();
    sound.playBinDiscard();
    pushToast(stations, 'ITEM BINNED', '#d6d0c4');
    return true;
  }

  return false;
}

export function updateCookingStations(game, dt) {
  const { world, stations, sound } = game;
  const chef = world.chef;

  // Chopping board progresses automatically while chef stands beside it.
  const chopStation = STATION_BY_ID.chop;
  const board = stations.chop;
  if (board.slashAnim > 0) board.slashAnim = Math.max(0, board.slashAnim - dt * 4.5);

  if (board.item && board.progress < board.duration) {
    const nearChop = distanceToStation(chef.x, chef.y, chopStation) <= 84;
    if (nearChop) {
      board.progress = Math.min(board.duration, board.progress + dt);
      board.thockCooldown -= dt;
      if (board.thockCooldown <= 0) {
        board.thockCooldown = 0.24;
        board.slashAnim = 0.85;
        sound.playChopThock();
        addCookingParticles(
          stations,
          chopStation.x + chopStation.w * 0.5,
          chopStation.y + 44,
          INGREDIENT_META[board.item.kind].accent,
          3,
          'spark',
        );
      }
      if (board.progress >= board.duration) {
        board.item.state = 'chopped';
        sound.playPlateSnap();
        if (chef.carry.length < MAX_CARRY) {
          chef.carry.push(board.item);
          board.item = null;
          board.progress = 0;
        }
      }
    }
  }

  // Stove burners cook over time, then enter burn grace before charring.
  for (let i = 0; i < stations.stoves.length; i++) {
    const burner = stations.stoves[i];
    const stDef = STATION_BY_ID[`stove_${i}`];
    if (!burner.item) continue;

    if (burner.status === 'cooking') {
      burner.elapsed += dt;
      burner.sizzleCooldown -= dt;
      if (burner.sizzleCooldown <= 0) {
        burner.sizzleCooldown = 0.42;
        sound.playSizzleTick();
        addCookingParticles(stations, stDef.x + stDef.w * 0.5, stDef.y + 40, 'rgba(255,244,218,0.85)', 2, 'steam');
      }
      if (burner.elapsed >= burner.duration) {
        burner.status = 'ready';
        burner.item.state = 'cooked';
        burner.burnElapsed = 0;
        sound.playCookReadyDing();
        addCookingParticles(stations, stDef.x + stDef.w * 0.5, stDef.y + 44, '#88f09c', 8, 'spark');
      }
    } else if (burner.status === 'ready') {
      burner.burnElapsed += dt;
      burner.sizzleCooldown -= dt;
      if (burner.sizzleCooldown <= 0) {
        burner.sizzleCooldown = burner.burnElapsed > BURN_GRACE * 0.55 ? 0.25 : 0.55;
        const smokeColor = burner.burnElapsed > BURN_GRACE * 0.6 ? 'rgba(255,150,90,0.8)' : 'rgba(255,240,210,0.65)';
        addCookingParticles(stations, stDef.x + stDef.w * 0.5, stDef.y + 38, smokeColor, 2, 'steam');
      }
      if (burner.burnElapsed >= BURN_GRACE) {
        burner.status = 'burnt';
        burner.item.state = 'burnt';
        sound.playErrorBuzz();
        pushToast(stations, `PAN ${i + 1} BURNT! PICK UP & BIN [X]`, '#ff6e5a');
        addCookingParticles(stations, stDef.x + stDef.w * 0.5, stDef.y + 40, 'rgba(65,60,65,0.85)', 10, 'steam');
      }
    } else if (burner.status === 'burnt') {
      burner.sizzleCooldown -= dt;
      if (burner.sizzleCooldown <= 0) {
        burner.sizzleCooldown = 0.45;
        addCookingParticles(stations, stDef.x + stDef.w * 0.5, stDef.y + 38, 'rgba(60,55,62,0.75)', 2, 'steam');
      }
    }
  }

  if (stations.plate.flash > 0) {
    stations.plate.flash = Math.max(0, stations.plate.flash - dt);
  }
  if (stations.serveShowcase.timer > 0) {
    stations.serveShowcase.timer = Math.max(0, stations.serveShowcase.timer - dt);
    if (stations.serveShowcase.timer === 0) {
      stations.serveShowcase.recipeId = null;
    }
  }
  if (stations.toast.timer > 0) {
    stations.toast.timer = Math.max(0, stations.toast.timer - dt);
  }

  updateParticlesAndPopups(stations, dt);
}

export function updateParticlesAndPopups(stations, dt) {
  for (let i = stations.particles.length - 1; i >= 0; i--) {
    const p = stations.particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind !== 'steam') {
      p.vy += 120 * dt;
    }
    if (p.age >= p.life) stations.particles.splice(i, 1);
  }
  for (let i = stations.popups.length - 1; i >= 0; i--) {
    const pop = stations.popups[i];
    pop.age += dt;
    pop.y -= 26 * dt;
    if (pop.age >= pop.life) stations.popups.splice(i, 1);
  }
}
