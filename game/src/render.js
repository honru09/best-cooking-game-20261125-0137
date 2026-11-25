// Canvas renderer for Midnight Bento Rush — draws the whole izakaya kitchen:
// order rail and HUD, pantry counters, floor and chef, chopping board, dual
// stove pans, plating counter, serve window, particles, popups and the
// title / pause / end screens. Everything is drawn from the live game state
// with plain 2D canvas calls, so every frame is a true render of the game.

import { UI_RECTS } from './input.js';
import {
  INGREDIENT_META,
  RECIPE_MAP,
  computeShiftGrade,
  getMissingIngredients,
  getPrioritizedCandidateRecipe,
  getShiftPhase,
  getUrgentNeededKinds,
} from './orders.js';
import { INTERACT_REACH, KITCHEN_HEIGHT, KITCHEN_WIDTH, STATION_BY_ID } from './world.js';

// Palette — warm wood and gold over a deep plum night kitchen.
const CREAM = '#f7ead0';
const GOLD = '#d9a441';
const GOLD_BRIGHT = '#f2c14e';
const INK = '#241a20';
const PANEL_DARK = '#221a30';
const WOOD = '#5a3d24';
const WOOD_EDGE = '#3a2812';
const MUTED = '#9a8fa8';
const GREEN = '#37c978';
const GREEN_DARK = '#2e9e4f';
const RED = '#e0402e';
const RED_DEEP = '#c0392b';

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, stroke, lineWidth = 2) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawText(ctx, str, x, y, font, color, align = 'center', baseline = 'alphabetic') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

function drawHeart(ctx, cx, cy, size, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 12, size / 12);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-7, -3, -5, -9, 0, -5);
  ctx.bezierCurveTo(5, -9, 7, -3, 0, 4);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function stateLabel(state) {
  if (state === 'chopped') return 'CHOP';
  if (state === 'cooked') return 'COOK';
  return 'READY';
}

function stateLabelColor(state) {
  if (state === 'chopped') return '#2a7f8f';
  if (state === 'cooked') return '#c96a1e';
  return GREEN_DARK;
}

// ---------------------------------------------------------------------------
// Food icons — small vector drawings, one per ingredient and state.
// ---------------------------------------------------------------------------

function drawIngredientIcon(ctx, kind, state, cx, cy, size) {
  const s = size / 48;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineWidth = 2;

  if (kind === 'rice') {
    ctx.fillStyle = '#fbf7ee';
    ctx.strokeStyle = '#d8cbb0';
    for (const [dx, dy, r] of [[-11, 4, 9], [0, -3, 11], [11, 4, 9]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(-3, -8, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'seaweed') {
    ctx.fillStyle = '#1d3a2a';
    ctx.strokeStyle = '#0f2418';
    for (const [dx, dy, rot] of [[-6, -4, -0.12], [6, 2, 0.1], [0, 8, -0.05]]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.rect(-14, -7, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,180,120,0.5)';
      ctx.beginPath();
      ctx.moveTo(-10, -2);
      ctx.lineTo(10, -2);
      ctx.moveTo(-10, 3);
      ctx.lineTo(10, 3);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#0f2418';
    }
  } else if (kind === 'greens') {
    if (state === 'chopped') {
      ctx.fillStyle = '#4ea854';
      for (const [dx, dy, r] of [[-10, 2, 7], [0, -4, 8], [10, 3, 7], [4, 8, 6], [-4, 9, 5]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8fd694';
      ctx.beginPath();
      ctx.arc(-2, -2, 3, 0, Math.PI * 2);
      ctx.arc(8, 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3f9e4d';
      for (const [dx, dy, rx, ry, rot] of [[-12, 2, 12, 7, -0.3], [2, -5, 13, 8, 0.15], [12, 4, 11, 7, 0.4]]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#cfe8b8';
      ctx.beginPath();
      ctx.arc(-8, 8, 3, 0, Math.PI * 2);
      ctx.arc(6, 6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'egg') {
    if (state === 'cooked') {
      ctx.fillStyle = '#f4c24f';
      ctx.strokeStyle = '#c98f1e';
      for (const dx of [-9, 9]) {
        ctx.beginPath();
        ctx.rect(dx - 8, -9, 16, 18);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(160,110,20,0.6)';
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.lineTo(9, -2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fdf6e3';
      ctx.strokeStyle = '#d8c49a';
      for (const [dx, dy, rot] of [[-11, 2, -0.25], [0, -3, 0.1], [11, 3, 0.3]]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  } else if (kind === 'salmon') {
    if (state === 'cooked') {
      ctx.fillStyle = '#e0683a';
      ctx.strokeStyle = '#a34a24';
      for (const [dx, dy] of [[-10, -3], [9, 3]]) {
        ctx.beginPath();
        ctx.rect(dx - 9, dy - 8, 18, 16);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#f2a56a';
      ctx.fillRect(-14, -8, 6, 5);
      ctx.fillRect(4, -2, 6, 5);
    } else {
      ctx.fillStyle = '#f0785a';
      ctx.strokeStyle = '#c65a3a';
      for (const [dx, dy, rot] of [[-10, -3, -0.18], [10, 3, 0.12]]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-14, -6);
        ctx.lineTo(14, -6);
        ctx.lineTo(10, 6);
        ctx.lineTo(-14, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,235,220,0.85)';
        ctx.beginPath();
        ctx.moveTo(-6, -5);
        ctx.lineTo(-8, 5);
        ctx.moveTo(2, -5);
        ctx.lineTo(0, 5);
        ctx.stroke();
        ctx.strokeStyle = '#c65a3a';
        ctx.restore();
      }
    }
  } else if (kind === 'chicken') {
    if (state === 'cooked') {
      ctx.fillStyle = '#c97b3e';
      ctx.strokeStyle = '#8a5426';
      for (const [dx, dy] of [[-9, -2], [9, 4]]) {
        ctx.beginPath();
        ctx.rect(dx - 9, dy - 8, 18, 16);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#e8a866';
      ctx.fillRect(-13, -7, 6, 5);
      ctx.fillRect(5, -1, 6, 5);
    } else {
      ctx.fillStyle = '#f2c1a8';
      ctx.strokeStyle = '#c98f78';
      for (const [dx, dy, r] of [[-11, 0, 9], [1, -4, 10], [11, 3, 8]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#e8a58c';
      ctx.beginPath();
      ctx.arc(1, -4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'burnt') {
    ctx.fillStyle = '#2a2226';
    ctx.strokeStyle = '#120e10';
    ctx.beginPath();
    ctx.rect(-11, -9, 22, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a4a44';
    ctx.fillRect(-7, -5, 5, 4);
    ctx.fillRect(2, 1, 5, 4);
  }
  ctx.restore();
}

function drawDishIcon(ctx, recipeId, cx, cy, size) {
  const s = size / 56;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  if (recipeId === 'veggie_roll') {
    for (const [dx, dy] of [[-14, 6], [0, -6], [14, 6]]) {
      ctx.fillStyle = '#2e7d46';
      ctx.beginPath();
      ctx.arc(dx, dy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbf7ee';
      ctx.beginPath();
      ctx.arc(dx, dy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4ea854';
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (recipeId === 'tamago_bento') {
    ctx.fillStyle = '#241a2e';
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-22, -12, 44, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8542f';
    ctx.beginPath();
    ctx.arc(-12, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4c24f';
    ctx.fillRect(-4, -7, 12, 10);
    ctx.fillStyle = '#4ea854';
    ctx.fillRect(10, -2, 10, 10);
    ctx.fillStyle = '#fbf7ee';
    ctx.fillRect(-4, 4, 12, 6);
  } else if (recipeId === 'salmon_onigiri') {
    for (const dx of [-13, 13]) {
      ctx.fillStyle = '#fbf7ee';
      ctx.strokeStyle = '#d8cbb0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dx, -14);
      ctx.lineTo(dx + 12, 10);
      ctx.lineTo(dx - 12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d3a2a';
      ctx.fillRect(dx - 8, 2, 16, 8);
      ctx.fillStyle = '#f0785a';
      ctx.beginPath();
      ctx.arc(dx, -6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (recipeId === 'chicken_teriyaki') {
    ctx.fillStyle = '#fbf7ee';
    ctx.strokeStyle = '#d8cbb0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.lineTo(22, -2);
    ctx.quadraticCurveTo(20, 14, 0, 14);
    ctx.quadraticCurveTo(-20, 14, -22, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c97b3e';
    ctx.beginPath();
    ctx.arc(-8, -4, 7, 0, Math.PI * 2);
    ctx.arc(8, -5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ea854';
    ctx.beginPath();
    ctx.arc(-1, -9, 3, 0, Math.PI * 2);
    ctx.arc(14, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (recipeId === 'salmon_teriyaki_set') {
    ctx.fillStyle = '#241a2e';
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-24, -10, 48, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f0785a';
    ctx.fillRect(-20, -5, 14, 10);
    ctx.fillStyle = '#c97b3e';
    ctx.fillRect(-4, -5, 12, 10);
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath();
    ctx.arc(15, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Order rail + HUD
// ---------------------------------------------------------------------------

const TICKET_SLOTS = [17, 251, 485, 719];
const TICKET_W = 220;
const TICKET_Y = 10;
const TICKET_H = 118;

function drawTicket(ctx, game, ticket, slotIndex) {
  const x = TICKET_SLOTS[slotIndex];
  const y = TICKET_Y;
  const recipe = RECIPE_MAP[ticket.recipeId];
  const ratio = Math.max(0, Math.min(1, ticket.patience / ticket.maxPatience));
  const urgent = ratio < 0.25;

  ctx.save();
  if (game.orders.railShake > 0) {
    ctx.translate(Math.sin(game.elapsedAnim * 42) * game.orders.railShake * 5, 0);
  }

  fillRoundRect(ctx, x, y, TICKET_W, TICKET_H, 10, '#f6ead2');
  strokeRoundRect(
    ctx,
    x + 1,
    y + 1,
    TICKET_W - 2,
    TICKET_H - 2,
    10,
    urgent ? RED : '#cbb98d',
    urgent ? 2.5 : 1,
  );

  // Gold clip tab on top.
  fillRoundRect(ctx, x + TICKET_W / 2 - 17, y - 6, 34, 10, 4, GOLD);

  drawText(ctx, `#${ticket.id} ${recipe.shortName}`, x + 10, y + 22, 'bold 15px "Trebuchet MS", sans-serif', INK, 'left');
  fillRoundRect(ctx, x + TICKET_W - 52, y + 8, 42, 20, 6, '#241a33');
  drawText(ctx, `+${recipe.value}`, x + TICKET_W - 31, y + 23, 'bold 13px "Trebuchet MS", sans-serif', GOLD_BRIGHT);

  // Dish icon box + three ingredient chips.
  fillRoundRect(ctx, x + 8, y + 32, 48, 48, 8, PANEL_DARK);
  strokeRoundRect(ctx, x + 8, y + 32, 48, 48, 8, RED_DEEP, 2);
  drawDishIcon(ctx, recipe.id, x + 32, y + 56, 40);

  recipe.ingredients.forEach((ing, i) => {
    const chipX = x + 60 + i * 52;
    fillRoundRect(ctx, chipX, y + 32, 48, 48, 8, '#efe3c8');
    strokeRoundRect(ctx, chipX, y + 32, 48, 48, 8, '#d8c49a', 1);
    drawIngredientIcon(ctx, ing.kind, ing.state, chipX + 24, y + 54, 34);
    drawText(
      ctx,
      stateLabel(ing.state),
      chipX + 24,
      y + 76,
      'bold 10px "Trebuchet MS", sans-serif',
      stateLabelColor(ing.state),
    );
  });

  // Patience bar.
  fillRoundRect(ctx, x + 10, y + 92, 158, 10, 5, '#d8cbb0');
  const barColor = ratio > 0.5 ? GREEN : ratio > 0.25 ? '#f08a24' : RED;
  if (ratio > 0) {
    fillRoundRect(ctx, x + 10, y + 92, Math.max(8, 158 * ratio), 10, 5, barColor);
  }
  drawText(ctx, `${Math.ceil(ticket.patience)}s`, x + TICKET_W - 10, y + 102, 'bold 13px "Trebuchet MS", sans-serif', INK, 'right');

  if (ticket.flash > 0) {
    ctx.globalAlpha = ticket.flash * 0.55;
    fillRoundRect(ctx, x, y, TICKET_W, TICKET_H, 10, '#ffffff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEmptySlot(ctx, slotIndex) {
  const x = TICKET_SLOTS[slotIndex];
  fillRoundRect(ctx, x, 24, TICKET_W, 104, 10, '#221a30');
  strokeRoundRect(ctx, x, 24, TICKET_W, 104, 10, '#3a2f4d', 1);
  drawText(ctx, 'OPEN TICKET SLOT', x + TICKET_W / 2, 80, 'bold 13px "Trebuchet MS", sans-serif', '#6b5f7d');
}

function drawHud(ctx, game) {
  const { orders } = game;
  const rush = game.mode === 'rush' || game.timeLeft <= 60;
  const hx = 958;
  const hy = 8;
  const hw = 310;
  const hh = 120;

  fillRoundRect(ctx, hx, hy, hw, hh, 10, '#1a1426');
  strokeRoundRect(ctx, hx + 1, hy + 1, hw - 2, hh - 2, 10, GOLD, 2);

  drawText(ctx, rush ? 'RUSH CLOCK' : 'SHIFT CLOCK', hx + 14, hy + 22, 'bold 11px "Trebuchet MS", sans-serif', MUTED, 'left');
  drawText(ctx, 'SCORE', hx + hw - 14, hy + 22, 'bold 11px "Trebuchet MS", sans-serif', MUTED, 'right');

  drawText(
    ctx,
    formatClock(game.timeLeft),
    hx + 14,
    hy + 58,
    'bold 40px "Trebuchet MS", sans-serif',
    rush ? '#ff7a5c' : CREAM,
    'left',
  );
  drawText(ctx, `${orders.score}`, hx + hw - 14, hy + 54, 'bold 34px "Trebuchet MS", sans-serif', '#ffd76a', 'right');

  if (orders.streak >= 2) {
    fillRoundRect(ctx, hx + hw - 128, hy + 60, 114, 22, 11, RED_DEEP);
    drawText(ctx, `COMBO x${orders.streak}`, hx + hw - 71, hy + 76, 'bold 13px "Trebuchet MS", sans-serif', '#ffffff');
  } else {
    drawText(ctx, `SERVED ${orders.servedCount}`, hx + hw - 14, hy + 78, 'bold 13px "Trebuchet MS", sans-serif', MUTED, 'right');
  }

  for (let i = 0; i < 3; i++) {
    drawHeart(ctx, hx + 14 + i * 26 + 10, hy + 96, 16, i < orders.hearts ? '#f04a4a' : '#3a2f4d');
  }
  drawText(ctx, `${orders.servedCount} PLATES`, hx + 96, hy + 103, 'bold 14px "Trebuchet MS", sans-serif', '#b9aeb9', 'left');

  const muted = game.sound.isMuted();
  fillRoundRect(ctx, UI_RECTS.pauseBtn.x, UI_RECTS.pauseBtn.y, UI_RECTS.pauseBtn.w, UI_RECTS.pauseBtn.h, 6, '#2a2138');
  strokeRoundRect(ctx, UI_RECTS.pauseBtn.x, UI_RECTS.pauseBtn.y, UI_RECTS.pauseBtn.w, UI_RECTS.pauseBtn.h, 6, '#6b5f7d', 1.5);
  drawText(ctx, 'PAUSE [P]', UI_RECTS.pauseBtn.x + 31, UI_RECTS.pauseBtn.y + 18, 'bold 12px "Trebuchet MS", sans-serif', '#e8ddc8');

  fillRoundRect(ctx, UI_RECTS.muteBtn.x, UI_RECTS.muteBtn.y, UI_RECTS.muteBtn.w, UI_RECTS.muteBtn.h, 6, muted ? '#4a2020' : '#2a2138');
  strokeRoundRect(
    ctx,
    UI_RECTS.muteBtn.x,
    UI_RECTS.muteBtn.y,
    UI_RECTS.muteBtn.w,
    UI_RECTS.muteBtn.h,
    6,
    muted ? RED : '#6b5f7d',
    1.5,
  );
  drawText(ctx, muted ? 'MUTED' : 'SFX [M]', UI_RECTS.muteBtn.x + 31, UI_RECTS.muteBtn.y + 18, 'bold 12px "Trebuchet MS", sans-serif', '#e8ddc8');
}

function drawOrderRail(ctx, game) {
  // Gold rail the tickets hang from.
  ctx.save();
  const rail = ctx.createLinearGradient(14, 0, 948, 0);
  rail.addColorStop(0, '#e8b64c');
  rail.addColorStop(1, '#b57f2a');
  fillRoundRect(ctx, 14, 13, 934, 8, 4, rail);
  ctx.restore();

  const tickets = game.orders.tickets;
  for (let i = 0; i < 4; i++) {
    if (i < tickets.length) {
      drawTicket(ctx, game, tickets[i], i);
    } else {
      drawEmptySlot(ctx, i);
    }
  }
  drawHud(ctx, game);
}

function drawHintStrip(ctx, game) {
  const rush = game.mode === 'rush';
  ctx.fillStyle = rush ? '#a02c20' : '#241a2e';
  ctx.fillRect(0, 132, KITCHEN_WIDTH, 28);
  if (rush) {
    drawText(
      ctx,
      `RUSH HOUR ACTIVE (${Math.ceil(game.timeLeft)}s LEFT)  •  FASTER TICKETS & +25% SPEED TIPS!`,
      KITCHEN_WIDTH / 2,
      151,
      'bold 13px "Trebuchet MS", sans-serif',
      '#ffe9d8',
    );
    return;
  }
  const phase = getShiftPhase(game.timeLeft);
  drawText(
    ctx,
    `${phase.label}  •  WASD/ARROWS TO MOVE  •  [E] OR CLICK STATION TO COOK & PLATE  •  [X] BIN`,
    KITCHEN_WIDTH / 2,
    151,
    'bold 13px "Trebuchet MS", sans-serif',
    '#cbbfa8',
  );
}

// ---------------------------------------------------------------------------
// Floor and walls
// ---------------------------------------------------------------------------

function drawFloor(ctx, game) {
  ctx.fillStyle = '#1d1829';
  ctx.fillRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  const tile = 64;
  for (let ty = 0; ty < Math.ceil(KITCHEN_HEIGHT / tile); ty++) {
    for (let tx = 0; tx < Math.ceil(KITCHEN_WIDTH / tile); tx++) {
      if ((tx + ty) % 2 === 0) continue;
      ctx.fillStyle = '#2f2839';
      ctx.fillRect(tx * tile, 160 + ty * tile, tile, tile);
    }
  }
  ctx.fillStyle = '#2a2333';
  for (let ty = 0; ty < Math.ceil(KITCHEN_HEIGHT / tile); ty++) {
    for (let tx = 0; tx < Math.ceil(KITCHEN_WIDTH / tile); tx++) {
      if ((tx + ty) % 2 !== 0) continue;
      ctx.fillRect(tx * tile, 160 + ty * tile, tile, tile);
    }
  }

  // Runner mats across the walkway.
  for (const my of [300, 538]) {
    fillRoundRect(ctx, 60, my, 980, 32, 8, '#241d31');
    strokeRoundRect(ctx, 60, my, 980, 32, 8, '#3a2f4d', 1);
  }

  // Faint center marking on the floor.
  ctx.beginPath();
  ctx.arc(640, 420, 56, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Wall sconces on the left edge.
  for (const sy of [345, 520]) {
    const glow = ctx.createRadialGradient(11, sy + 17, 2, 11, sy + 17, 28);
    glow.addColorStop(0, 'rgba(240,138,36,0.4)');
    glow.addColorStop(1, 'rgba(240,138,36,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-17, sy - 11, 56, 56);
    fillRoundRect(ctx, 6, sy, 10, 34, 5, '#f08a24');
    fillRoundRect(ctx, 8, sy + 4, 6, 26, 3, '#ffc46a');
  }
}

// ---------------------------------------------------------------------------
// Pantry counters
// ---------------------------------------------------------------------------

const PREP_PILL_COLORS = {
  READY: GREEN_DARK,
  CHOP: '#3a7ca8',
  COOK: '#d07a1e',
  'CHOP+COOK': RED_DEEP,
};

function drawPantryRow(ctx, game) {
  fillRoundRect(ctx, 36, 166, 1030, 116, 12, WOOD);
  strokeRoundRect(ctx, 36, 166, 1030, 116, 12, WOOD_EDGE, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(48, 168, 1006, 2);

  const urgentKinds = getUrgentNeededKinds(game.orders);
  for (const station of game.world.stations) {
    if (station.type !== 'pantry') continue;
    const meta = INGREDIENT_META[station.ingredient];
    const x = station.x;
    const active = game.world.activeStationId === station.id;
    const hovered = game.world.hoveredStationId === station.id;

    fillRoundRect(ctx, x + 2, 176, 152, 60, 8, PANEL_DARK);
    strokeRoundRect(ctx, x + 2, 176, 152, 60, 8, '#3a2f4d', 1);
    drawIngredientIcon(ctx, station.ingredient, meta.initialState, x + 78, 206, 46);

    if (urgentKinds.has(station.ingredient)) {
      const glow = ctx.createRadialGradient(x + 138, 186, 1, x + 138, 186, 12);
      glow.addColorStop(0, 'rgba(255,215,106,0.7)');
      glow.addColorStop(1, 'rgba(255,215,106,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x + 126, 174, 24, 24);
      ctx.beginPath();
      ctx.arc(x + 138, 186, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd76a';
      ctx.fill();
    }

    drawText(ctx, meta.shortLabel, x + 4, 266, 'bold 14px "Trebuchet MS", sans-serif', CREAM, 'left');
    const pillColor = PREP_PILL_COLORS[meta.prepHint] || GREEN_DARK;
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    const pillW = ctx.measureText(meta.prepHint).width + 12;
    fillRoundRect(ctx, x + 150 - pillW, 250, pillW, 22, 6, pillColor);
    drawText(ctx, meta.prepHint, x + 150 - pillW / 2, 265, 'bold 10px "Trebuchet MS", sans-serif', '#ffffff');

    if (active) {
      strokeRoundRect(ctx, x - 6, 166, 168, 116, 10, GOLD_BRIGHT, 3);
    } else if (hovered) {
      strokeRoundRect(ctx, x - 6, 166, 168, 116, 10, 'rgba(242,193,78,0.5)', 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Bottom stations: chopping board, stove pans, plating, trash
// ---------------------------------------------------------------------------

function drawChopBoard(ctx, game) {
  const chop = game.stations.chop;
  const station = STATION_BY_ID.chop;
  const active = game.world.activeStationId === 'chop';
  const hovered = game.world.hoveredStationId === 'chop';

  fillRoundRect(ctx, 56, 592, 232, 80, 8, '#d9b47c');
  strokeRoundRect(ctx, 56, 592, 232, 80, 8, '#a87f4e', 1.5);
  ctx.strokeStyle = 'rgba(120,80,30,0.25)';
  ctx.lineWidth = 1.5;
  for (const gy of [612, 632, 652]) {
    ctx.beginPath();
    ctx.moveTo(66, gy);
    ctx.lineTo(278, gy);
    ctx.stroke();
  }

  // Progress ring around whatever sits on the board.
  if (chop.item) {
    const done = chop.item.state !== 'raw';
    ctx.beginPath();
    ctx.arc(140, 632, 26, 0, Math.PI * 2);
    ctx.strokeStyle = done ? GREEN : '#6b5a7d';
    ctx.lineWidth = 6;
    ctx.stroke();
    if (!done) {
      const frac = Math.max(0, Math.min(1, chop.progress / chop.duration));
      ctx.beginPath();
      ctx.arc(140, 632, 26, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = '#3a9be8';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    drawIngredientIcon(ctx, chop.item.kind, chop.item.state, 140, 632, 34);
    if (chop.slashAnim > 0) {
      ctx.save();
      ctx.globalAlpha = chop.slashAnim;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(122, 614);
      ctx.lineTo(158, 650);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Knife resting on the board's right side.
  ctx.save();
  ctx.translate(228, 634);
  ctx.rotate(-0.45);
  fillRoundRect(ctx, -18, -5, 34, 10, 3, '#e8e4da');
  fillRoundRect(ctx, 16, -4, 18, 8, 3, '#3a2f2a');
  ctx.restore();

  let label = 'CHOPPING BOARD [E]';
  let labelColor = CREAM;
  if (chop.item && chop.item.state !== 'raw') {
    label = 'CHOPPED — PICK UP [E]';
    labelColor = '#98f5ae';
  }
  drawText(ctx, label, station.x + station.w / 2, 694, 'bold 13px "Trebuchet MS", sans-serif', labelColor);

  if (active) {
    strokeRoundRect(ctx, 40, 578, 264, 124, 12, GOLD_BRIGHT, 3);
  } else if (hovered) {
    strokeRoundRect(ctx, 40, 578, 264, 124, 12, 'rgba(242,193,78,0.5)', 2);
  }
}

function drawStovePan(ctx, game, index) {
  const station = STATION_BY_ID[`stove_${index}`];
  const stove = game.stations.stoves[index];
  const x = station.x;
  const y = station.y;
  const cx = x + 74;
  const cy = y + 40;
  const active = game.world.activeStationId === station.id;
  const hovered = game.world.hoveredStationId === station.id;

  fillRoundRect(ctx, x, y, station.w, station.h, 8, PANEL_DARK);
  strokeRoundRect(ctx, x, y, station.w, station.h, 8, '#3a2f4d', 1);

  // Handle.
  fillRoundRect(ctx, x + 106, y + 36, 26, 9, 4, '#3a2f4d');

  // Copper-rimmed pan with rivets.
  ctx.beginPath();
  ctx.arc(cx, cy, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#171224';
  ctx.fill();
  ctx.strokeStyle = '#b5703a';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#7fc4d8';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (stove.item) {
    drawIngredientIcon(ctx, stove.item.kind, stove.item.state, cx, cy, 36);
  }

  // Gas flame petals while the pan is on the heat, tucked under the pan rim.
  if (stove.status === 'cooking') {
    for (let i = -1; i <= 1; i++) {
      const flicker = Math.sin(game.elapsedAnim * 9 + i * 2.1) * 2;
      const fx = cx + i * 14;
      const fy = cy + 33 + flicker * 0.3;
      ctx.beginPath();
      ctx.moveTo(fx, fy - 8 - flicker);
      ctx.quadraticCurveTo(fx + 5, fy + 2, fx, fy + 6);
      ctx.quadraticCurveTo(fx - 5, fy + 2, fx, fy - 8 - flicker);
      ctx.fillStyle = i === 0 ? '#ffc46a' : '#f08a24';
      ctx.fill();
    }
  }

  // Readiness bar.
  fillRoundRect(ctx, x + 12, y + 82, 124, 8, 4, '#14101e');
  let barColor = '#f08a24';
  let frac = 0;
  if (stove.item) {
    if (stove.status === 'cooking') {
      frac = Math.max(0, Math.min(1, stove.elapsed / stove.duration));
    } else if (stove.status === 'ready') {
      frac = 1;
      barColor = GREEN;
    } else if (stove.status === 'burnt') {
      frac = 1;
      barColor = RED;
    }
  }
  if (frac > 0) {
    fillRoundRect(ctx, x + 12, y + 82, Math.max(8, 124 * frac), 8, 4, barColor);
  }

  let label = `STOVE PAN ${index + 1}`;
  let labelColor = '#cbbfa8';
  if (stove.status === 'ready') {
    label = `PAN ${index + 1} READY!`;
    labelColor = '#98f5ae';
  } else if (stove.status === 'burnt') {
    label = `PAN ${index + 1} BURNT!`;
    labelColor = '#ff7466';
  } else if (stove.status === 'cooking') {
    labelColor = CREAM;
  }
  drawText(ctx, label, cx, y + 100, 'bold 12px "Trebuchet MS", sans-serif', labelColor);

  if (active) {
    strokeRoundRect(ctx, x, y, station.w, station.h, 8, GOLD_BRIGHT, 3);
  } else if (hovered) {
    strokeRoundRect(ctx, x, y, station.w, station.h, 8, 'rgba(242,193,78,0.5)', 2);
  }
}

function drawPlating(ctx, game) {
  const plate = game.stations.plate;
  const station = STATION_BY_ID.plating;
  const active = game.world.activeStationId === 'plating';
  const hovered = game.world.hoveredStationId === 'plating';

  fillRoundRect(ctx, 656, 578, 300, 124, 10, '#241a2e');
  strokeRoundRect(ctx, 656, 578, 300, 124, 10, '#8a2f28', 2);

  const target = getPrioritizedCandidateRecipe(plate.items, game.orders.tickets);
  const missing = target ? getMissingIngredients(target, plate.items) : [];

  for (let i = 0; i < 3; i++) {
    const sx = 672 + i * 76;
    const sy = 590;
    const item = plate.items[i];
    if (item) {
      fillRoundRect(ctx, sx, sy, 64, 64, 8, PANEL_DARK);
      strokeRoundRect(ctx, sx, sy, 64, 64, 8, plate.mismatch ? RED : GREEN, 2);
      drawIngredientIcon(ctx, item.kind, item.state, sx + 32, sy + 32, 40);
    } else {
      ctx.save();
      ctx.setLineDash([5, 4]);
      strokeRoundRect(ctx, sx, sy, 64, 64, 8, '#8a7a5a', 1.5);
      ctx.restore();
      const ghost = missing[i - plate.items.length];
      if (ghost) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawIngredientIcon(ctx, ghost.kind, ghost.state, sx + 32, sy + 26, 30);
        ctx.restore();
        drawText(
          ctx,
          `+${INGREDIENT_META[ghost.kind].shortLabel}`,
          sx + 32,
          sy + 56,
          'bold 10px "Trebuchet MS", sans-serif',
          '#cbbfa8',
        );
      }
    }
  }

  let label = 'PLATING COUNTER — ADD ITEMS';
  let labelColor = '#cbbfa8';
  if (plate.mismatch) {
    label = 'MISMATCH! BIN THE PLATE [X]';
    labelColor = '#ff7466';
  } else if (plate.completedRecipeId) {
    label = `${RECIPE_MAP[plate.completedRecipeId].shortName.toUpperCase()} READY — PICK UP [E]`;
    labelColor = '#98f5ae';
  } else if (target && plate.items.length > 0) {
    const next = missing[0];
    label = `${target.shortName.toUpperCase()} (${plate.items.length}/3) — ADD ${next ? INGREDIENT_META[next.kind].shortLabel : ''}`;
    labelColor = GOLD_BRIGHT;
  }
  drawText(ctx, label, 806, 694, 'bold 13px "Trebuchet MS", sans-serif', labelColor);

  if (active) {
    strokeRoundRect(ctx, 656, 578, 300, 124, 10, GOLD_BRIGHT, 3);
  } else if (hovered) {
    strokeRoundRect(ctx, 656, 578, 300, 124, 10, 'rgba(242,193,78,0.5)', 2);
  }
}

function drawTrash(ctx, game) {
  const station = STATION_BY_ID.trash;
  const active = game.world.activeStationId === 'trash';
  const hovered = game.world.hoveredStationId === 'trash';

  fillRoundRect(ctx, 962, 578, 112, 124, 10, '#2a2138');
  strokeRoundRect(ctx, 962, 578, 112, 124, 10, '#453a58', 1.5);

  fillRoundRect(ctx, 992, 600, 52, 8, 3, '#6b5f7d');
  ctx.beginPath();
  ctx.moveTo(996, 610);
  ctx.lineTo(1040, 610);
  ctx.lineTo(1036, 656);
  ctx.lineTo(1000, 656);
  ctx.closePath();
  ctx.fillStyle = '#4a4258';
  ctx.fill();
  ctx.strokeStyle = '#2a2138';
  ctx.lineWidth = 2;
  for (const lx of [1008, 1018, 1028]) {
    ctx.beginPath();
    ctx.moveTo(lx, 618);
    ctx.lineTo(lx, 648);
    ctx.stroke();
  }

  drawText(ctx, 'BIN [X]', station.x + station.w / 2, 694, 'bold 13px "Trebuchet MS", sans-serif', '#cbbfa8');

  if (active) {
    strokeRoundRect(ctx, 962, 578, 112, 124, 10, GOLD_BRIGHT, 3);
  } else if (hovered) {
    strokeRoundRect(ctx, 962, 578, 112, 124, 10, 'rgba(242,193,78,0.5)', 2);
  }
}

function drawBottomRow(ctx, game) {
  fillRoundRect(ctx, 36, 578, 1030, 124, 12, WOOD);
  strokeRoundRect(ctx, 36, 578, 1030, 124, 12, WOOD_EDGE, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(48, 580, 1006, 2);

  fillRoundRect(ctx, 316, 580, 330, 120, 10, '#2b2438');
  strokeRoundRect(ctx, 316, 580, 330, 120, 10, '#453a58', 1.5);

  drawChopBoard(ctx, game);
  drawStovePan(ctx, game, 0);
  drawStovePan(ctx, game, 1);
  drawPlating(ctx, game);
  drawTrash(ctx, game);
}

// ---------------------------------------------------------------------------
// Serve window (right column)
// ---------------------------------------------------------------------------

function drawLantern(ctx, cx, cy) {
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 36);
  glow.addColorStop(0, 'rgba(242,104,42,0.3)');
  glow.addColorStop(1, 'rgba(242,104,42,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 36, cy - 36, 72, 72);

  const body = ctx.createLinearGradient(cx - 18, cy - 22, cx + 18, cy + 22);
  body.addColorStop(0, '#f2682a');
  body.addColorStop(1, '#c23c1e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - 7, cy - 26, 14, 5);
  ctx.fillRect(cx - 7, cy + 21, 14, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.5;
  for (const ly of [-8, 8]) {
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy + ly);
    ctx.lineTo(cx + 16, cy + ly);
    ctx.stroke();
  }
}

function drawServeColumn(ctx, game) {
  const active = game.world.activeStationId === 'serve';
  const hovered = game.world.hoveredStationId === 'serve';
  const showcase = game.stations.serveShowcase;

  fillRoundRect(ctx, 1074, 168, 192, 532, 12, WOOD);
  strokeRoundRect(ctx, 1074, 168, 192, 532, 12, active ? GOLD_BRIGHT : WOOD_EDGE, active ? 3 : 2);

  drawLantern(ctx, 1124, 204);
  drawLantern(ctx, 1222, 204);

  for (let i = 0; i < 3; i++) {
    const ax = 1092 + i * 58;
    ctx.beginPath();
    ctx.moveTo(ax, 308);
    ctx.lineTo(ax, 282);
    ctx.arc(ax + 25, 282, 25, Math.PI, 0);
    ctx.lineTo(ax + 50, 308);
    ctx.closePath();
    ctx.fillStyle = '#1d2f4d';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax + 25, 292, 10, Math.PI, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
  }

  // Cloche above the showcase.
  const cloche = ctx.createLinearGradient(1146, 374, 1194, 402);
  cloche.addColorStop(0, '#e8b64c');
  cloche.addColorStop(1, '#b57f2a');
  ctx.fillStyle = cloche;
  ctx.beginPath();
  ctx.arc(1170, 400, 24, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  fillRoundRect(ctx, 1144, 398, 52, 6, 3, '#8a6a2a');
  ctx.beginPath();
  ctx.arc(1170, 374, 4, 0, Math.PI * 2);
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.fill();

  fillRoundRect(ctx, 1090, 424, 160, 128, 10, '#6b4a26');
  strokeRoundRect(ctx, 1090, 424, 160, 128, 10, GOLD, 2);
  if (showcase) {
    const recipe = RECIPE_MAP[showcase.recipeId];
    fillRoundRect(ctx, 1124, 436, 92, 64, 8, PANEL_DARK);
    strokeRoundRect(ctx, 1124, 436, 92, 64, 8, RED_DEEP, 2);
    drawDishIcon(ctx, showcase.recipeId, 1170, 468, 54);
    drawText(ctx, recipe.shortName.toUpperCase(), 1170, 524, 'bold 14px "Trebuchet MS", sans-serif', CREAM);
    drawText(ctx, 'SERVED HOT!', 1170, 544, 'bold 13px "Trebuchet MS", sans-serif', '#98f5ae');
  } else {
    drawText(ctx, 'READY TO SERVE', 1170, 492, 'bold 12px "Trebuchet MS", sans-serif', MUTED);
  }

  fillRoundRect(ctx, 1090, 572, 160, 52, 8, '#241a2e');
  strokeRoundRect(ctx, 1090, 572, 160, 52, 8, GOLD, 2);
  drawText(ctx, 'SERVE PASS', 1170, 594, 'bold 16px "Trebuchet MS", sans-serif', GOLD_BRIGHT);
  drawText(ctx, 'PRESS [E] OR CLICK', 1170, 612, 'bold 10px "Trebuchet MS", sans-serif', MUTED);

  if (hovered && !active) {
    strokeRoundRect(ctx, 1074, 168, 192, 532, 12, 'rgba(242,193,78,0.5)', 2);
  }
}

// ---------------------------------------------------------------------------
// Chef
// ---------------------------------------------------------------------------

function drawChef(ctx, game) {
  const chef = game.world.chef;
  const x = chef.x;
  const y = chef.y;
  const yOff = -chef.actionBounce * 6;

  // Route hint: dashed line toward the next thing the chef must do.
  const plate = game.stations.plate;
  let routeTarget = chef.walkTarget;
  if (!routeTarget && chef.carriedPlate) {
    routeTarget = { x: 1052, y: 430 };
  } else if (!routeTarget && plate.items.length > 0 && !plate.completedRecipeId) {
    routeTarget = { x: 806, y: 546 };
  }
  if (routeTarget) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(242,193,78,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(routeTarget.x, routeTarget.y);
    ctx.stroke();
    ctx.restore();
  }

  // Sprint aura rings.
  if (chef.sprinting) {
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -game.elapsedAnim * 30;
    ctx.strokeStyle = 'rgba(255,220,120,0.45)';
    ctx.lineWidth = 2;
    for (const r of [56, 74]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Shadow.
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 20, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // Legs, stepping with the walk cycle.
  const step = chef.moving ? Math.sin(chef.walkPhase) * 3 : 0;
  ctx.fillStyle = '#1a1426';
  ctx.fillRect(x - 10, y + 12 + step, 7, 10);
  ctx.fillRect(x + 3, y + 12 - step, 7, 10);

  // Body and apron.
  fillRoundRect(ctx, x - 16, y - 8 + yOff, 32, 28, 10, '#1f3a5f');
  fillRoundRect(ctx, x - 11, y - 2 + yOff, 22, 20, 6, CREAM);

  // Head, hair, headband and face.
  ctx.beginPath();
  ctx.arc(x, y - 18 + yOff, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#f2c9a0';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 18 + yOff, 13, Math.PI, 0);
  ctx.fillStyle = '#221a2e';
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.fillRect(x - 13, y - 26 + yOff, 26, 5);
  ctx.beginPath();
  ctx.arc(x + 13, y - 23 + yOff, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#d23c2e';
  ctx.fill();
  ctx.fillStyle = '#221a2e';
  const look = chef.facingX * 2;
  ctx.beginPath();
  ctx.arc(x - 5 + look, y - 17 + yOff, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 5 + look, y - 17 + yOff, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Carry bubble above the head.
  const bubbleItems = [...chef.carry];
  if (chef.carriedPlate) bubbleItems.push({ dish: chef.carriedPlate.recipeId });
  if (bubbleItems.length > 0) {
    const bw = bubbleItems.length * 30 + 14;
    const bx = x - bw / 2;
    const by = y - 64 + yOff;
    fillRoundRect(ctx, bx, by, bw, 32, 8, '#1a1426');
    strokeRoundRect(ctx, bx, by, bw, 32, 8, GOLD, 2);
    bubbleItems.forEach((item, i) => {
      const ix = bx + 22 + i * 30;
      if (item.dish) {
        ctx.beginPath();
        ctx.arc(ix, by + 16, 13, 0, Math.PI * 2);
        ctx.strokeStyle = GOLD_BRIGHT;
        ctx.lineWidth = 2;
        ctx.stroke();
        drawDishIcon(ctx, item.dish, ix, by + 16, 22);
      } else {
        drawIngredientIcon(ctx, item.kind, item.state, ix, by + 16, 24);
      }
    });
  }

  // Sprint stamina bar under the feet.
  if (chef.stamina < 0.999) {
    fillRoundRect(ctx, x - 18, y + 30, 36, 4, 2, '#14101e');
    fillRoundRect(ctx, x - 18, y + 30, Math.max(4, 36 * chef.stamina), 4, 2, GOLD_BRIGHT);
  }
}

// ---------------------------------------------------------------------------
// Particles, popups, toasts
// ---------------------------------------------------------------------------

function drawParticles(ctx, game) {
  for (const p of game.stations.particles) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.save();
    ctx.globalAlpha = p.kind === 'steam' ? alpha * 0.55 : alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === 'steam' ? p.size * (1.6 - alpha * 0.6) : p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPopups(ctx, game) {
  for (const popup of game.stations.popups) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, popup.timer / 0.4);
    ctx.font = 'bold 19px "Trebuchet MS", sans-serif';
    const mainW = ctx.measureText(popup.text).width;
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    const subW = popup.subtext ? ctx.measureText(popup.subtext).width : 0;
    const w = Math.max(mainW, subW) + 28;
    const h = popup.subtext ? 56 : 34;
    const px = popup.x - w / 2;
    const py = popup.y - h / 2;
    fillRoundRect(ctx, px, py, w, h, 8, 'rgba(20,14,28,0.92)');
    strokeRoundRect(ctx, px, py, w, h, 8, GOLD, 2);
    drawText(ctx, popup.text, popup.x, py + 24, 'bold 19px "Trebuchet MS", sans-serif', popup.color);
    if (popup.subtext) {
      drawText(ctx, popup.subtext, popup.x, py + 44, 'bold 12px "Trebuchet MS", sans-serif', '#ffe875');
    }
    ctx.restore();
  }
}

function drawToast(ctx, game) {
  const toast = game.stations.toast;
  if (!toast || toast.timer <= 0 || !toast.text) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, toast.timer / 0.5);
  ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
  const w = ctx.measureText(toast.text).width + 32;
  const tx = (KITCHEN_WIDTH - w) / 2;
  const ty = 306;
  fillRoundRect(ctx, tx, ty, w, 30, 15, 'rgba(20,14,28,0.9)');
  strokeRoundRect(ctx, tx, ty, w, 30, 15, toast.color, 2);
  drawText(ctx, toast.text, KITCHEN_WIDTH / 2, ty + 20, 'bold 15px "Trebuchet MS", sans-serif', toast.color);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Title / pause / end overlays
// ---------------------------------------------------------------------------

function drawTitleOverlay(ctx, game) {
  ctx.fillStyle = 'rgba(10,8,16,0.55)';
  ctx.fillRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  fillRoundRect(ctx, 247, 285, 625, 231, 16, '#221a2e');
  strokeRoundRect(ctx, 247, 285, 625, 231, 16, GOLD, 3);
  strokeRoundRect(ctx, 255, 293, 609, 215, 12, 'rgba(214,178,92,0.35)', 1);

  drawText(ctx, 'LATE-NIGHT IZAKAYA KITCHEN  •  180-SECOND SHIFT', 560, 318, 'bold 15px "Trebuchet MS", sans-serif', '#e8b64c');
  drawText(ctx, 'MIDNIGHT BENTO RUSH', 560, 380, 'bold 56px "Trebuchet MS", sans-serif', CREAM);
  drawText(
    ctx,
    'Grab pantry items  •  Chop & sear on dual pans  •  Plate 3-item bentos  •  Beat Rush Hour!',
    560,
    412,
    '15px "Trebuchet MS", sans-serif',
    '#d8cdb4',
  );
  drawText(
    ctx,
    'MOVE: WASD / Arrows / Click   |   COOK & SERVE: [E] / Click   |   BIN: [X]   PAUSE: [P]   SFX: [M]',
    560,
    438,
    'bold 13px "Trebuchet MS", sans-serif',
    MUTED,
  );

  const btn = UI_RECTS.startBtn;
  const grad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
  grad.addColorStop(0, '#e8542f');
  grad.addColorStop(1, '#c73a1e');
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, grad);
  strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, GOLD_BRIGHT, 2);
  drawText(ctx, 'START SHIFT  [ENTER]', btn.x + btn.w / 2, btn.y + 31, 'bold 20px "Trebuchet MS", sans-serif', '#ffffff');
}

function drawPauseOverlay(ctx, game) {
  ctx.fillStyle = 'rgba(10,8,16,0.6)';
  ctx.fillRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  fillRoundRect(ctx, 390, 300, 500, 180, 16, '#221a2e');
  strokeRoundRect(ctx, 390, 300, 500, 180, 16, GOLD, 3);
  drawText(ctx, 'PAUSED', 640, 352, 'bold 44px "Trebuchet MS", sans-serif', CREAM);
  drawText(ctx, 'TAKE A BREATH — THE KITCHEN WAITS', 640, 376, 'bold 12px "Trebuchet MS", sans-serif', MUTED);

  const btn = UI_RECTS.resumeBtn;
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, '#2a2138');
  strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, GOLD_BRIGHT, 2);
  drawText(ctx, 'RESUME  [P]', btn.x + btn.w / 2, btn.y + 31, 'bold 18px "Trebuchet MS", sans-serif', CREAM);
}

function drawEndOverlay(ctx, game) {
  const { orders } = game;
  const grade = computeShiftGrade(orders.score, orders.servedCount, orders.hearts);

  ctx.fillStyle = 'rgba(10,8,16,0.65)';
  ctx.fillRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  fillRoundRect(ctx, 390, 180, 500, 370, 16, '#221a2e');
  strokeRoundRect(ctx, 390, 180, 500, 370, 16, GOLD, 3);
  drawText(ctx, 'SHIFT COMPLETE!', 640, 232, 'bold 34px "Trebuchet MS", sans-serif', CREAM);
  drawText(ctx, grade, 640, 312, 'bold 64px "Trebuchet MS", sans-serif', GOLD_BRIGHT);

  const stats = [
    `SCORE  ${orders.score}`,
    `DISHES SERVED  ${orders.servedCount}`,
    `BEST COMBO  x${orders.bestStreak}`,
    `TIPS EARNED  +${orders.tipsEarned}`,
  ];
  stats.forEach((line, i) => {
    drawText(ctx, line, 640, 352 + i * 26, '16px "Trebuchet MS", sans-serif', '#d8cdb4');
  });

  const btn = UI_RECTS.restartBtn;
  const grad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
  grad.addColorStop(0, '#e8542f');
  grad.addColorStop(1, '#c73a1e');
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, grad);
  strokeRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, GOLD_BRIGHT, 2);
  drawText(ctx, 'RESTART  [R]', btn.x + btn.w / 2, btn.y + 31, 'bold 18px "Trebuchet MS", sans-serif', '#ffffff');
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function renderGameFrame(ctx, game) {
  ctx.save();
  ctx.clearRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  drawFloor(ctx, game);
  drawOrderRail(ctx, game);
  drawHintStrip(ctx, game);
  drawPantryRow(ctx, game);
  drawBottomRow(ctx, game);
  drawServeColumn(ctx, game);
  drawChef(ctx, game);
  drawParticles(ctx, game);
  drawPopups(ctx, game);
  drawToast(ctx, game);

  if (game.mode === 'title') {
    drawTitleOverlay(ctx, game);
  } else if (game.paused) {
    drawPauseOverlay(ctx, game);
  } else if (game.mode === 'end') {
    drawEndOverlay(ctx, game);
  }

  ctx.restore();
}
