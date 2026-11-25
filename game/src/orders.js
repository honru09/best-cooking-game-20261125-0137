// Recipes, order spawning, patience decay, streak multipliers, and shift pacing.

export const SHIFT_DURATION = 180;
export const RUSH_THRESHOLD = 60;
export const MAX_ACTIVE_ORDERS = 4;
export const MAX_HEARTS = 3;

export const INGREDIENT_META = {
  rice: {
    id: 'rice',
    label: 'Rice',
    shortLabel: 'RICE',
    prepHint: 'READY',
    needsChop: false,
    needsCook: false,
    initialState: 'ready',
    plateState: 'ready',
    accent: '#f4efe6',
  },
  seaweed: {
    id: 'seaweed',
    label: 'Seaweed',
    shortLabel: 'NORI',
    prepHint: 'READY',
    needsChop: false,
    needsCook: false,
    initialState: 'ready',
    plateState: 'ready',
    accent: '#284d3a',
  },
  greens: {
    id: 'greens',
    label: 'Greens',
    shortLabel: 'GREENS',
    prepHint: 'CHOP',
    needsChop: true,
    needsCook: false,
    initialState: 'raw',
    plateState: 'chopped',
    accent: '#4ea854',
  },
  egg: {
    id: 'egg',
    label: 'Egg',
    shortLabel: 'EGG',
    prepHint: 'COOK',
    needsChop: false,
    needsCook: true,
    initialState: 'raw',
    plateState: 'cooked',
    accent: '#f4c24f',
  },
  salmon: {
    id: 'salmon',
    label: 'Salmon',
    shortLabel: 'SALMON',
    prepHint: 'CHOP+COOK',
    needsChop: true,
    needsCook: true,
    initialState: 'raw',
    plateState: 'cooked',
    accent: '#f0785a',
  },
  chicken: {
    id: 'chicken',
    label: 'Chicken',
    shortLabel: 'CHICKEN',
    prepHint: 'CHOP+COOK',
    needsChop: true,
    needsCook: true,
    initialState: 'raw',
    plateState: 'cooked',
    accent: '#c97b3e',
  },
};

export const RECIPES = [
  {
    id: 'veggie_roll',
    name: 'Seaweed Veggie Roll',
    shortName: 'Veggie Roll',
    value: 45,
    accent: '#48b86a',
    ingredients: [
      { kind: 'rice', state: 'ready' },
      { kind: 'seaweed', state: 'ready' },
      { kind: 'greens', state: 'chopped' },
    ],
  },
  {
    id: 'tamago_bento',
    name: 'Tamago Bento',
    shortName: 'Tamago Bento',
    value: 55,
    accent: '#f2be42',
    ingredients: [
      { kind: 'rice', state: 'ready' },
      { kind: 'egg', state: 'cooked' },
      { kind: 'greens', state: 'chopped' },
    ],
  },
  {
    id: 'salmon_onigiri',
    name: 'Salmon Onigiri',
    shortName: 'Salmon Onigiri',
    value: 65,
    accent: '#f2785c',
    ingredients: [
      { kind: 'rice', state: 'ready' },
      { kind: 'salmon', state: 'cooked' },
      { kind: 'seaweed', state: 'ready' },
    ],
  },
  {
    id: 'chicken_teriyaki',
    name: 'Chicken Teriyaki Bowl',
    shortName: 'Chicken Bowl',
    value: 70,
    accent: '#d98236',
    ingredients: [
      { kind: 'rice', state: 'ready' },
      { kind: 'chicken', state: 'cooked' },
      { kind: 'greens', state: 'chopped' },
    ],
  },
  {
    id: 'salmon_teriyaki_set',
    name: 'Salmon Teriyaki Set',
    shortName: 'Teriyaki Set',
    value: 90,
    accent: '#e35d49',
    ingredients: [
      { kind: 'salmon', state: 'cooked' },
      { kind: 'chicken', state: 'cooked' },
      { kind: 'rice', state: 'ready' },
    ],
  },
];

export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function getShiftPhase(timeLeft) {
  if (timeLeft <= RUSH_THRESHOLD) {
    return {
      id: 'rush',
      label: 'RUSH HOUR',
      spawnInterval: 9.0,
      patience: 45,
      maxOrders: 4,
      tipMultiplier: 1.25,
    };
  }
  if (timeLeft <= 120) {
    return {
      id: 'peak',
      label: 'DINNER PEAK',
      spawnInterval: 12.5,
      patience: 52,
      maxOrders: 4,
      tipMultiplier: 1.0,
    };
  }
  return {
    id: 'opening',
    label: 'LATE OPENING',
    spawnInterval: 15.5,
    patience: 58,
    maxOrders: 3,
    tipMultiplier: 1.0,
  };
}

export function createOrderManager() {
  return {
    tickets: [],
    nextTicketId: 1,
    spawnTimer: 1.2,
    score: 0,
    tipsEarned: 0,
    servedCount: 0,
    missedCount: 0,
    streak: 0,
    bestStreak: 0,
    hearts: MAX_HEARTS,
    rushAnnounced: false,
    railShake: 0,
  };
}

export function spawnOrderTicket(orderState, timeLeft, rng, forcedRecipeId = null) {
  if (orderState.tickets.length >= MAX_ACTIVE_ORDERS) return null;
  const phase = getShiftPhase(timeLeft);

  let chosen = forcedRecipeId ? RECIPE_MAP[forcedRecipeId] : null;
  if (!chosen) {
    const activeIds = new Set(orderState.tickets.map((t) => t.recipeId));
    const pool = RECIPES.filter((r) => {
      if (timeLeft > 145 && r.id === 'salmon_teriyaki_set') return false;
      return !activeIds.has(r.id);
    });
    const candidates = pool.length > 0 ? pool : RECIPES;
    const index = Math.floor(rng() * candidates.length);
    chosen = candidates[index];
  }

  const jitter = (rng() - 0.5) * 6;
  const maxPatience = Math.max(42, Math.round(phase.patience + jitter));
  const ticket = {
    id: orderState.nextTicketId++,
    recipeId: chosen.id,
    patience: maxPatience,
    maxPatience,
    flash: 0.45,
  };
  orderState.tickets.push(ticket);
  return ticket;
}

export function itemSignature(item) {
  return `${item.kind}:${item.state}`;
}

export function getCandidateRecipes(plateItems) {
  if (plateItems.length === 0) return RECIPES;
  const placedSigs = plateItems.map(itemSignature);
  return RECIPES.filter((recipe) => {
    const remaining = recipe.ingredients.map(itemSignature);
    for (const sig of placedSigs) {
      const idx = remaining.indexOf(sig);
      if (idx === -1) return false;
      remaining.splice(idx, 1);
    }
    return true;
  });
}

export function matchRecipeFromItems(plateItems) {
  if (plateItems.length !== 3) return null;
  const candidates = getCandidateRecipes(plateItems);
  return candidates.length > 0 ? candidates[0] : null;
}

export function getPrioritizedCandidateRecipe(plateItems, tickets) {
  const candidates = getCandidateRecipes(plateItems);
  if (candidates.length === 0) return null;
  if (tickets && tickets.length > 0) {
    const sorted = tickets.slice().sort((a, b) => a.patience - b.patience);
    for (const ticket of sorted) {
      const match = candidates.find((c) => c.id === ticket.recipeId);
      if (match) return match;
    }
  }
  return candidates[0];
}

export function getMissingIngredients(recipe, plateItems) {
  if (!recipe) return [];
  const remaining = recipe.ingredients.map((ing) => ({ ...ing }));
  for (const item of plateItems) {
    const sig = itemSignature(item);
    const idx = remaining.findIndex((ing) => itemSignature(ing) === sig);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

export function getUrgentNeededKinds(orderState) {
  const needed = new Set();
  const sorted = orderState.tickets.slice().sort((a, b) => a.patience - b.patience);
  const top = sorted.slice(0, 2);
  for (const ticket of top) {
    const recipe = RECIPE_MAP[ticket.recipeId];
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      needed.add(ing.kind);
    }
  }
  return needed;
}

export function computeShiftGrade(score, servedCount, hearts) {
  if (score >= 950 && hearts > 0) return 'S';
  if (score >= 620 || servedCount >= 8) return 'A';
  if (score >= 340 || servedCount >= 4) return 'B';
  return 'C';
}

export function findMatchingTicket(orderState, recipeId) {
  let urgent = null;
  for (const ticket of orderState.tickets) {
    if (ticket.recipeId !== recipeId) continue;
    if (!urgent || ticket.patience < urgent.patience) {
      urgent = ticket;
    }
  }
  return urgent;
}

export function scoreServedOrder(orderState, ticket, timeLeft) {
  const recipe = RECIPE_MAP[ticket.recipeId];
  const phase = getShiftPhase(timeLeft);
  const idx = orderState.tickets.indexOf(ticket);
  if (idx >= 0) orderState.tickets.splice(idx, 1);

  orderState.streak += 1;
  orderState.bestStreak = Math.max(orderState.bestStreak, orderState.streak);
  orderState.servedCount += 1;

  const multiplier = Math.min(5, orderState.streak);
  const ratio = ticket.patience / ticket.maxPatience;
  const basePoints = recipe.value * multiplier;
  const fastTip = ratio >= 0.45 ? Math.round(20 * (0.6 + ratio) * phase.tipMultiplier) : 0;
  const totalPoints = basePoints + fastTip;

  orderState.score += totalPoints;
  orderState.tipsEarned += fastTip;

  return {
    recipe,
    basePoints,
    fastTip,
    totalPoints,
    multiplier,
  };
}

export function updateOrderTickets(orderState, timeLeft, dt, rng) {
  const events = { expired: [], spawned: null, enteredRush: false };
  const phase = getShiftPhase(timeLeft);

  if (orderState.railShake > 0) {
    orderState.railShake = Math.max(0, orderState.railShake - dt * 2.8);
  }

  if (timeLeft <= RUSH_THRESHOLD && !orderState.rushAnnounced) {
    orderState.rushAnnounced = true;
    events.enteredRush = true;
  }

  for (let i = orderState.tickets.length - 1; i >= 0; i--) {
    const ticket = orderState.tickets[i];
    ticket.patience -= dt;
    if (ticket.flash > 0) ticket.flash = Math.max(0, ticket.flash - dt);
    if (ticket.patience <= 0) {
      orderState.tickets.splice(i, 1);
      orderState.missedCount += 1;
      orderState.streak = 0;
      orderState.hearts = Math.max(0, orderState.hearts - 1);
      orderState.railShake = 0.55;
      events.expired.push(ticket);
    }
  }

  orderState.spawnTimer -= dt;
  const minTickets = timeLeft <= RUSH_THRESHOLD ? 2 : 1;
  if (orderState.tickets.length < minTickets && orderState.spawnTimer > 1.0) {
    orderState.spawnTimer = 0.9;
  }

  if (orderState.spawnTimer <= 0 && orderState.tickets.length < phase.maxOrders) {
    events.spawned = spawnOrderTicket(orderState, timeLeft, rng);
    orderState.spawnTimer = phase.spawnInterval;
  } else if (orderState.spawnTimer <= 0) {
    orderState.spawnTimer = 2.0;
  }

  return events;
}
