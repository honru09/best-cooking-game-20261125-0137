// Bootstrapping, state machine (title / playing / rush / end), and main animation loop.

import { createSoundEngine } from './audio.js';
import {
  addCookingParticles,
  createStationStates,
  discardCarriedOrPlate,
  interactWithStation,
  pushToast,
  updateCookingStations,
} from './cooking.js';
import { UI_RECTS, attachInputHandlers, pointInRect } from './input.js';
import {
  RUSH_THRESHOLD,
  SHIFT_DURATION,
  createOrderManager,
  spawnOrderTicket,
  updateOrderTickets,
} from './orders.js';
import { renderGameFrame } from './render.js';
import { applyDeterministicShotScene, createSeededRng, parseShotQuery } from './shots.js';
import {
  INTERACT_REACH,
  STATION_BY_ID,
  commandChefToPoint,
  commandChefToStation,
  createKitchenWorld,
  distanceToStation,
  findStationAtPoint,
  updateChefMovement,
} from './world.js';

export function createGameState(seed = 20261125) {
  const rng = createSeededRng(seed);
  const game = {
    mode: 'title', // 'title' | 'playing' | 'rush' | 'end'
    paused: false,
    seed,
    rng,
    timeLeft: SHIFT_DURATION,
    elapsedAnim: 0,
    world: createKitchenWorld(),
    orders: createOrderManager(),
    stations: createStationStates(),
    sound: createSoundEngine(),
    shotMode: null,
  };

  // Populate welcoming kitchen preview on title screen
  applyDeterministicShotScene(game, 'start');
  return game;
}

export function startShift(game) {
  game.rng = createSeededRng(game.seed + Date.now() % 10000);
  game.mode = 'playing';
  game.paused = false;
  game.timeLeft = SHIFT_DURATION;
  game.world = createKitchenWorld();
  game.orders = createOrderManager();
  game.stations = createStationStates();

  // Open the shift with two varied tickets so route planning starts immediately
  spawnOrderTicket(game.orders, game.timeLeft, game.rng, 'veggie_roll');
  spawnOrderTicket(game.orders, game.timeLeft, game.rng, 'tamago_bento');
  game.orders.spawnTimer = 11.5;
  game.sound.playServeBell(1);
  pushToast(game.stations, 'SHIFT STARTED! PREP & PLATE ORDERS BEFORE TIME RUNS OUT', '#98f5ae');
}

export function handleCanvasClick(game, click) {
  if (pointInRect(click.x, click.y, UI_RECTS.muteBtn)) {
    game.sound.toggleMute();
    return;
  }

  if (game.mode === 'title') {
    if (pointInRect(click.x, click.y, UI_RECTS.startBtn)) {
      startShift(game);
    }
    return;
  }

  if (game.mode === 'end') {
    if (pointInRect(click.x, click.y, UI_RECTS.restartBtn)) {
      startShift(game);
    }
    return;
  }

  if (pointInRect(click.x, click.y, UI_RECTS.pauseBtn)) {
    game.paused = !game.paused;
    return;
  }

  if (game.paused) {
    if (pointInRect(click.x, click.y, UI_RECTS.resumeBtn)) {
      game.paused = false;
    }
    return;
  }

  const clickedStation = findStationAtPoint(click.x, click.y);
  if (clickedStation) {
    const dist = distanceToStation(game.world.chef.x, game.world.chef.y, clickedStation);
    if (dist <= INTERACT_REACH) {
      interactWithStation(game, clickedStation);
    } else {
      commandChefToStation(game.world.chef, clickedStation);
    }
    return;
  }

  if (click.y >= 270 && click.y <= 580 && click.x >= 40 && click.x <= 1090) {
    commandChefToPoint(game.world.chef, click.x, click.y);
  }
}

export function stepSimulation(game, input, dt) {
  const clampedDt = Math.min(0.05, Math.max(0, dt));
  game.elapsedAnim += clampedDt;

  const actions = input.consumeActions();
  const pointer = input.getPointer();
  const hovered = findStationAtPoint(pointer.x, pointer.y);
  game.world.hoveredStationId = hovered ? hovered.id : null;

  if (actions.mute) {
    game.sound.toggleMute();
  }

  for (const click of actions.clicks) {
    handleCanvasClick(game, click);
  }

  if (game.mode === 'title') {
    if (actions.start || actions.interact) {
      startShift(game);
    }
    return;
  }

  if (game.mode === 'end') {
    if (actions.restart || actions.start) {
      startShift(game);
    }
    return;
  }

  if (actions.pause) {
    game.paused = !game.paused;
  }
  if (actions.restart) {
    startShift(game);
    return;
  }
  if (game.paused) return;

  game.timeLeft = Math.max(0, game.timeLeft - clampedDt);
  if (game.timeLeft <= RUSH_THRESHOLD && game.mode === 'playing') {
    game.mode = 'rush';
  }

  const wasSprinting = game.world.chef.sprinting;
  const arrivedStation = updateChefMovement(game.world, input.getMoveVector(), clampedDt);
  if (game.world.chef.sprinting && !wasSprinting) {
    game.sound.playDashWhoosh();
    addCookingParticles(game.stations, game.world.chef.x, game.world.chef.y + 18, 'rgba(255,228,165,0.65)', 5, 'steam');
  }
  if (arrivedStation) {
    interactWithStation(game, arrivedStation);
  }

  if (actions.interact) {
    const active = game.world.activeStationId ? STATION_BY_ID[game.world.activeStationId] : null;
    if (active) {
      interactWithStation(game, active);
    }
  }

  if (actions.bin) {
    discardCarriedOrPlate(game);
  }

  updateCookingStations(game, clampedDt);

  const orderEvents = updateOrderTickets(game.orders, game.timeLeft, clampedDt, game.rng);
  if (orderEvents.enteredRush) {
    game.sound.playRushChime();
    pushToast(game.stations, 'RUSH HOUR! TICKETS SPEED UP — +25% SPEED TIPS!', '#ffe073');
  }
  if (orderEvents.expired.length > 0) {
    game.sound.playErrorBuzz();
    pushToast(game.stations, 'ORDER EXPIRED! STREAK LOST & -1 HEART', '#ff7466');
  }

  if (game.timeLeft <= 0 || game.orders.hearts <= 0) {
    game.mode = 'end';
    game.sound.playRushChime();
  }
}

export function bootGame() {
  const canvas = document.getElementById('kitchen-canvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const query = parseShotQuery(window.location.search);
  const game = createGameState(query.seed);
  const input = attachInputHandlers(canvas);

  if (query.shot) {
    game.shotMode = query.shot;
    applyDeterministicShotScene(game, query.shot);
    renderGameFrame(ctx, game);
    window.__MIDNIGHT_BENTO__ = game;
    return game;
  }

  window.__MIDNIGHT_BENTO__ = game;
  let lastTime = performance.now();

  function animationLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    stepSimulation(game, input, dt);
    renderGameFrame(ctx, game);
    requestAnimationFrame(animationLoop);
  }

  renderGameFrame(ctx, game);
  requestAnimationFrame(animationLoop);
  return game;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGame, { once: true });
  } else {
    bootGame();
  }
}
