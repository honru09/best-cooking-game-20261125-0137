// Canvas 2D renderer for Midnight Bento Rush — izakaya kitchen, handcrafted food, tickets, and HUD.

import { BURN_GRACE } from './cooking.js';
import { UI_RECTS } from './input.js';
import {
  INGREDIENT_META,
  MAX_HEARTS,
  RECIPE_MAP,
  RUSH_THRESHOLD,
  computeShiftGrade,
  getMissingIngredients,
  getPrioritizedCandidateRecipe,
  getShiftPhase,
  getUrgentNeededKinds,
} from './orders.js';
import { KITCHEN_HEIGHT, KITCHEN_WIDTH, STATION_BY_ID } from './world.js';

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function formatClock(seconds) {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function drawFoodIcon(ctx, kind, state, cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (state === 'burnt') {
    ctx.fillStyle = '#252126';
    ctx.beginPath();
    ctx.ellipse(0, 2, 16, 12, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b353c';
    ctx.beginPath();
    ctx.arc(-5, -2, 6, 0, Math.PI * 2);
    ctx.arc(5, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6d3b';
    ctx.beginPath();
    ctx.arc(-2, 3, 2, 0, Math.PI * 2);
    ctx.arc(6, -2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'rice') {
    ctx.fillStyle = '#2f2938';
    ctx.beginPath();
    ctx.ellipse(0, 7, 17, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8f4eb';
    ctx.beginPath();
    ctx.arc(0, 3, 14, Math.PI, 0);
    ctx.quadraticCurveTo(14, 10, 0, 10);
    ctx.quadraticCurveTo(-14, 10, -14, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const [gx, gy] of [[-6, -2], [0, -5], [6, -1], [-3, 3], [4, 4]]) {
      ctx.beginPath();
      ctx.ellipse(gx, gy, 2.5, 1.4, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2d2930';
    ctx.beginPath();
    ctx.arc(-2, -3, 1, 0, Math.PI * 2);
    ctx.arc(3, -1, 1, 0, Math.PI * 2);
    ctx.restore();
    return;
  }

  if (kind === 'seaweed') {
    ctx.rotate(-0.12);
    fillRoundRect(ctx, -14, -10, 28, 20, 3, '#1a3629', '#39634c', 1.4);
    ctx.strokeStyle = 'rgba(130, 198, 155, 0.25)';
    ctx.lineWidth = 1.2;
    for (let y = -5; y <= 6; y += 5) {
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(10, y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (kind === 'greens') {
    if (state === 'chopped') {
      const pieces = [
        [-8, -4, '#4fd167'], [2, -6, '#39ad50'], [8, -1, '#6de07f'],
        [-5, 5, '#349c49'], [4, 5, '#59d670'], [0, 0, '#78eb8c'],
      ];
      for (const [px, py, col] of pieces) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(px, py, 5.2, 3.2, px * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#389948';
      ctx.beginPath();
      ctx.ellipse(-5, -2, 11, 6, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#52c464';
      ctx.beginPath();
      ctx.ellipse(4, -3, 11, 6, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d7f0c7';
      ctx.beginPath();
      ctx.ellipse(0, 7, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (kind === 'egg') {
    if (state === 'cooked') {
      // Golden layered tamagoyaki roll slices
      fillRoundRect(ctx, -14, -8, 13, 16, 4, '#f7c548', '#b8761c', 1.2);
      fillRoundRect(ctx, 1, -8, 13, 16, 4, '#ffd764', '#b8761c', 1.2);
      ctx.strokeStyle = '#d98f24';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-10, -2);
      ctx.lineTo(-4, -2);
      ctx.moveTo(5, 2);
      ctx.lineTo(11, 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f8ead5';
      ctx.strokeStyle = '#cbb392';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 1, 10, 13, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-3, -4, 3, 5, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (kind === 'salmon') {
    if (state === 'cooked') {
      fillRoundRect(ctx, -15, -9, 30, 18, 6, '#e3633f', '#8c3119', 1.4);
      ctx.strokeStyle = '#6b2210';
      ctx.lineWidth = 2;
      for (const gx of [-7, 0, 7]) {
        ctx.beginPath();
        ctx.moveTo(gx - 3, -7);
        ctx.lineTo(gx + 3, 7);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff1cc';
      for (const [sx, sy] of [[-6, -3], [1, 2], [7, -2], [-2, 4]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state === 'chopped') {
      const cubes = [[-9, -5], [2, -6], [-5, 3], [6, 3]];
      for (const [cx0, cy0] of cubes) {
        fillRoundRect(ctx, cx0 - 4, cy0 - 4, 9, 8, 2, '#f78569', '#ffd4c7', 1);
      }
    } else {
      ctx.fillStyle = '#f57c62';
      ctx.strokeStyle = '#c4513d';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-15, 2);
      ctx.quadraticCurveTo(-8, -12, 15, -6);
      ctx.quadraticCurveTo(13, 10, -15, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,226,0.78)';
      ctx.lineWidth = 1.8;
      for (const sx of [-7, 0, 7]) {
        ctx.beginPath();
        ctx.moveTo(sx - 2, -6);
        ctx.lineTo(sx + 2, 7);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (kind === 'chicken') {
    if (state === 'cooked') {
      fillRoundRect(ctx, -15, -9, 30, 18, 6, '#b85c24', '#632a0d', 1.4);
      ctx.fillStyle = 'rgba(255,218,145,0.42)';
      ctx.beginPath();
      ctx.ellipse(-4, -3, 9, 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#66d67a';
      for (const [sx, sy] of [[-5, 2], [2, -2], [7, 3]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state === 'chopped') {
      for (const [cx0, cy0] of [[-8, -4], [4, -5], [-4, 4], [7, 4]]) {
        fillRoundRect(ctx, cx0 - 4.5, cy0 - 3.5, 9, 7.5, 2.5, '#f0baa1', '#c78a70', 1);
      }
    } else {
      ctx.fillStyle = '#ebb69e';
      ctx.strokeStyle = '#bf856c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 14, 9, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f9dcd0';
      ctx.beginPath();
      ctx.ellipse(-5, -3, 6, 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawFinishedDish(ctx, recipeId, cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Lacquer bento plate base
  fillRoundRect(ctx, -26, -18, 52, 36, 7, '#1d1823', '#cf3e2b', 2.4);
  fillRoundRect(ctx, -22, -14, 44, 28, 4, '#2a2333', 'rgba(255,210,140,0.22)', 1);

  if (recipeId === 'salmon_onigiri') {
    for (const ox of [-10, 10]) {
      ctx.fillStyle = '#faf6ee';
      ctx.beginPath();
      ctx.moveTo(ox, -11);
      ctx.lineTo(ox + 10, 9);
      ctx.lineTo(ox - 10, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#183327';
      ctx.fillRect(ox - 6, 2, 12, 7);
      ctx.fillStyle = '#eb6742';
      ctx.beginPath();
      ctx.arc(ox, -4, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (recipeId === 'tamago_bento') {
    // Left rice + umeboshi, right tamago + greens
    fillRoundRect(ctx, -19, -11, 17, 22, 3, '#f7f3ea');
    ctx.fillStyle = '#d93d3d';
    ctx.beginPath();
    ctx.arc(-10.5, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, 1, -11, 18, 11, 3, '#ffd257', '#b5721a', 1);
    fillRoundRect(ctx, 1, 2, 18, 9, 3, '#4bc462');
  } else if (recipeId === 'chicken_teriyaki') {
    // Donburi bowl accent inside tray
    ctx.fillStyle = '#3d2128';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8f3ea';
    ctx.beginPath();
    ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, -10, -7, 14, 12, 3, '#b85a22');
    ctx.fillStyle = '#53cf6a';
    ctx.beginPath();
    ctx.arc(7, 4, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (recipeId === 'veggie_roll') {
    for (const [rx, ry] of [[-11, -4], [0, 4], [11, -4]]) {
      ctx.fillStyle = '#183326';
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#faf6ee';
      ctx.beginPath();
      ctx.arc(rx, ry, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4ad167';
      ctx.beginPath();
      ctx.arc(rx, ry, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (recipeId === 'salmon_teriyaki_set') {
    fillRoundRect(ctx, -19, -11, 13, 22, 3, '#f7f3ea');
    fillRoundRect(ctx, -4, -11, 23, 10, 3, '#e3633f', '#8c3119', 1);
    fillRoundRect(ctx, -4, 1, 23, 10, 3, '#b85c24', '#632a0d', 1);
    ctx.fillStyle = '#fff1cc';
    ctx.beginPath();
    ctx.arc(6, -6, 1.3, 0, Math.PI * 2);
    ctx.arc(11, 6, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawKitchenFloorAndCounters(ctx, game) {
  const rushActive = game.timeLeft <= RUSH_THRESHOLD && game.mode !== 'title';

  // Main warm midnight timber backdrop
  const bgGrad = ctx.createLinearGradient(0, 164, 0, KITCHEN_HEIGHT);
  bgGrad.addColorStop(0, '#2a2232');
  bgGrad.addColorStop(1, '#1d1724');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 164, KITCHEN_WIDTH, KITCHEN_HEIGHT - 164);

  // Tiled stone kitchen aisle floor
  const floorX = 44;
  const floorY = 276;
  const floorW = 1044;
  const floorH = 304;
  fillRoundRect(ctx, floorX, floorY, floorW, floorH, 10, '#2e2938', '#463b52', 2);

  ctx.save();
  roundRectPath(ctx, floorX, floorY, floorW, floorH, 10);
  ctx.clip();
  const tile = 44;
  for (let gx = floorX; gx < floorX + floorW; gx += tile) {
    for (let gy = floorY; gy < floorY + floorH; gy += tile) {
      const alt = ((Math.floor(gx / tile) + Math.floor(gy / tile)) % 2) === 0;
      ctx.fillStyle = alt ? '#342e3f' : '#2d2738';
      ctx.fillRect(gx, gy, tile - 1, tile - 1);
    }
  }
  // Warm paper-lantern pools on floor
  const pool1 = ctx.createRadialGradient(260, 340, 20, 260, 340, 260);
  pool1.addColorStop(0, rushActive ? 'rgba(255, 136, 72, 0.16)' : 'rgba(255, 198, 112, 0.13)');
  pool1.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = pool1;
  ctx.fillRect(floorX, floorY, floorW, floorH);

  const pool2 = ctx.createRadialGradient(920, 440, 20, 920, 440, 280);
  pool2.addColorStop(0, rushActive ? 'rgba(255, 118, 66, 0.19)' : 'rgba(255, 192, 104, 0.14)');
  pool2.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = pool2;
  ctx.fillRect(floorX, floorY, floorW, floorH);

  // Subtle floor path arrow guides toward Serve Window
  ctx.strokeStyle = 'rgba(255, 206, 126, 0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(810, 540);
  ctx.lineTo(1038, 430);
  ctx.stroke();
  ctx.setLineDash([]);

  // Woven izakaya bamboo-slate kitchen runner mats beside prep and pantry lines
  fillRoundRect(ctx, 64, 286, 986, 36, 6, 'rgba(66, 51, 40, 0.52)', 'rgba(196, 146, 86, 0.28)', 1.2);
  fillRoundRect(ctx, 64, 532, 986, 36, 6, 'rgba(66, 51, 40, 0.52)', 'rgba(196, 146, 86, 0.28)', 1.2);
  ctx.strokeStyle = 'rgba(218, 174, 108, 0.12)';
  ctx.lineWidth = 1;
  for (let mx = 80; mx < 1040; mx += 18) {
    ctx.beginPath();
    ctx.moveTo(mx, 290);
    ctx.lineTo(mx, 318);
    ctx.moveTo(mx, 536);
    ctx.lineTo(mx, 564);
    ctx.stroke();
  }

  // Subtle decorative izakaya crest medallion in center floor
  ctx.save();
  ctx.translate(566, 428);
  ctx.strokeStyle = 'rgba(224, 178, 102, 0.13)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(224, 178, 102, 0.09)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(26, 0);
  ctx.moveTo(0, -26);
  ctx.lineTo(0, 26);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // Left cedar trim beam with glowing wall sconces
  fillRoundRect(ctx, 8, 170, 22, 534, 6, '#38251f', '#734d36', 1.6);
  for (const ly of [332, 518]) {
    const scGlow = ctx.createRadialGradient(19, ly, 2, 19, ly, 26);
    scGlow.addColorStop(0, 'rgba(255, 196, 102, 0.45)');
    scGlow.addColorStop(1, 'rgba(255, 170, 80, 0)');
    ctx.fillStyle = scGlow;
    ctx.beginPath();
    ctx.arc(19, ly, 26, 0, Math.PI * 2);
    ctx.fill();
    fillRoundRect(ctx, 13, ly - 10, 12, 20, 4, '#f59c42', '#ffdf94', 1.2);
  }

  // Upper pantry cedar counter bench
  fillRoundRect(ctx, 36, 168, 1030, 108, 10, '#5a3b28', '#8a5d3b', 2.5);
  // Lower work counter cedar bench
  fillRoundRect(ctx, 36, 576, 1044, 128, 10, '#523624', '#855838', 2.5);
  // Stove metallic hearth insert
  fillRoundRect(ctx, 314, 580, 330, 120, 8, '#363944', '#72798c', 2);

  // Right izakaya pass wall + glowing red paper lanterns
  fillRoundRect(ctx, 1086, 170, 180, 534, 10, '#33242b', '#7a5239', 2.5);
  drawPaperLantern(ctx, 1134, 204, rushActive);
  drawPaperLantern(ctx, 1218, 204, rushActive);
}

function drawPaperLantern(ctx, cx, cy, intense) {
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, intense ? 52 : 42);
  glow.addColorStop(0, intense ? 'rgba(255, 115, 62, 0.5)' : 'rgba(255, 178, 84, 0.42)');
  glow.addColorStop(1, 'rgba(255, 140, 60, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, intense ? 52 : 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#201822';
  ctx.fillRect(cx - 8, cy - 22, 16, 4);
  ctx.fillRect(cx - 8, cy + 18, 16, 4);

  const lGrad = ctx.createRadialGradient(cx - 3, cy - 4, 2, cx, cy, 20);
  lGrad.addColorStop(0, '#ffe89c');
  lGrad.addColorStop(0.55, '#f0743a');
  lGrad.addColorStop(1, '#ad2e1d');
  ctx.fillStyle = lGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 16, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70, 18, 12, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - 6);
  ctx.lineTo(cx + 15, cy - 6);
  ctx.moveTo(cx - 15, cy + 6);
  ctx.lineTo(cx + 15, cy + 6);
  ctx.stroke();
  ctx.restore();
}

export function drawStationFixtures(ctx, game) {
  const { world, stations, orders } = game;
  const activeId = world.activeStationId;
  const hoveredId = world.hoveredStationId;
  const urgentKinds = getUrgentNeededKinds(orders);

  for (const st of world.stations) {
    const isActive = st.id === activeId;
    const isHovered = st.id === hoveredId;

    if (st.type === 'pantry') {
      const meta = INGREDIENT_META[st.ingredient];
      const isUrgentNeed = urgentKinds.has(st.ingredient);
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 8, '#3f2a1d', isActive ? '#ffd972' : isHovered ? '#d4a66a' : '#704d34', isActive ? 3 : 1.5);
      // Container-specific tray styling
      const trayBg = st.ingredient === 'salmon' || st.ingredient === 'chicken'
        ? '#202b36'
        : st.ingredient === 'rice'
          ? '#33251d'
          : '#261e29';
      const trayBorder = st.ingredient === 'salmon' || st.ingredient === 'chicken'
        ? 'rgba(165, 215, 255, 0.28)'
        : 'rgba(255, 220, 170, 0.2)';
      fillRoundRect(ctx, st.x + 8, st.y + 8, st.w - 16, 52, 6, trayBg, trayBorder, 1.2);

      // Ohitsu wooden tub rim for rice bin
      if (st.ingredient === 'rice') {
        ctx.strokeStyle = '#c9934b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(st.x + st.w * 0.5, st.y + 34, 48, 20, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw plentiful ingredients inside bin
      drawFoodIcon(ctx, st.ingredient, meta.initialState, st.x + st.w * 0.5 - 24, st.y + 34, 0.92);
      drawFoodIcon(ctx, st.ingredient, meta.initialState, st.x + st.w * 0.5 + 22, st.y + 36, 0.92);
      drawFoodIcon(ctx, st.ingredient, meta.initialState, st.x + st.w * 0.5, st.y + 30, 1.05);

      // Subtle glowing amber cue dot when urgent tickets need this pantry item
      if (isUrgentNeed) {
        ctx.fillStyle = '#ffd666';
        ctx.beginPath();
        ctx.arc(st.x + st.w - 16, st.y + 16, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Station title + prep tag
      ctx.fillStyle = '#fff5e0';
      ctx.font = 'bold 12.5px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(meta.shortLabel, st.x + 9, st.y + 82);

      const badgeColor = meta.prepHint === 'READY' ? '#2c7d4d' : meta.prepHint === 'CHOP' ? '#36759c' : meta.prepHint === 'COOK' ? '#b8681f' : '#a83d38';
      const badgeW = meta.prepHint.length > 5 ? 72 : 56;
      fillRoundRect(ctx, st.x + st.w - badgeW - 7, st.y + 66, badgeW, 22, 5, badgeColor);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(meta.prepHint, st.x + st.w - badgeW * 0.5 - 7, st.y + 81);
      continue;
    }

    if (st.type === 'chop') {
      const board = stations.chop;
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 9, '#493122', isActive ? '#ffd972' : isHovered ? '#d4a66a' : '#785239', isActive ? 3 : 1.5);
      // Thick Hinoki cutting block
      fillRoundRect(ctx, st.x + 18, st.y + 12, st.w - 36, 68, 7, '#deb882', '#a87c45', 2);
      // Wood grain lines
      ctx.strokeStyle = 'rgba(130, 86, 36, 0.25)';
      ctx.lineWidth = 1.2;
      for (let gy = st.y + 24; gy < st.y + 72; gy += 13) {
        ctx.beginPath();
        ctx.moveTo(st.x + 26, gy);
        ctx.lineTo(st.x + st.w - 26, gy);
        ctx.stroke();
      }
      // Santoku knife resting or chopping
      ctx.save();
      const slash = board.slashAnim;
      const kx = st.x + st.w - 58 - slash * 18;
      const ky = st.y + 44 - slash * 9;
      ctx.translate(kx, ky);
      ctx.rotate(-0.35 - slash * 0.45);
      fillRoundRect(ctx, -22, -6, 30, 12, 3, '#d7e0eb', '#788496', 1.2);
      fillRoundRect(ctx, 8, -4, 16, 8, 2, '#3a241a');
      ctx.restore();

      if (board.item) {
        const displayState = board.progress >= board.duration ? 'chopped' : board.item.state;
        drawFoodIcon(ctx, board.item.kind, displayState, st.x + st.w * 0.42, st.y + 46, 1.32);
        // Radial progress ring
        const pct = Math.min(1, board.progress / board.duration);
        const rx = st.x + st.w * 0.42;
        const ry = st.y + 46;
        ctx.strokeStyle = 'rgba(20, 16, 26, 0.55)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(rx, ry, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = pct >= 1 ? '#57e389' : '#35b4f0';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(rx, ry, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.stroke();
      }

      ctx.fillStyle = '#fff5e0';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(board.item && board.progress >= board.duration ? 'CHOPPED — PICK UP [E]' : 'CHOPPING BOARD [E]', st.x + st.w * 0.5, st.y + 100);
      continue;
    }

    if (st.type === 'stove') {
      const burner = stations.stoves[st.burnerIndex];
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 8, '#282b34', isActive ? '#ffd972' : isHovered ? '#c4cadb' : '#565c6e', isActive ? 3 : 1.5);

      const cx = st.x + st.w * 0.5;
      const cy = st.y + 44;
      // Gas burner ring glow + animated flame petals when active
      if (burner.item) {
        const flameCol = burner.status === 'burnt' ? 'rgba(255, 64, 48, 0.55)' : 'rgba(255, 148, 52, 0.7)';
        ctx.strokeStyle = flameCol;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.stroke();

        const petalCol = burner.status === 'burnt' ? '#ff4e3b' : '#58bfff';
        ctx.fillStyle = petalCol;
        for (let p = 0; p < 8; p++) {
          const ang = (Math.PI * 2 * p) / 8 + game.elapsedAnim * 1.4;
          const fx = cx + Math.cos(ang) * 33;
          const fy = cy + Math.sin(ang) * 33;
          ctx.beginPath();
          ctx.arc(fx, fy, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Cast-iron skillet & handle
      ctx.fillStyle = '#1b1d24';
      ctx.strokeStyle = burner.status === 'ready' ? '#66ed8d' : burner.status === 'burnt' ? '#ff5947' : '#656c80';
      ctx.lineWidth = burner.status === 'ready' || burner.status === 'burnt' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 29, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      fillRoundRect(ctx, cx + 26, cy - 5, 22, 10, 4, '#242730', '#5a6073', 1);

      if (burner.item) {
        const visualState = burner.status === 'cooking' ? burner.item.state : burner.status === 'ready' ? 'cooked' : 'burnt';
        drawFoodIcon(ctx, burner.item.kind, visualState, cx, cy, 1.15);

        // Progress or Burn warning bar
        const bx = st.x + 14;
        const by = st.y + 76;
        const bw = st.w - 28;
        fillRoundRect(ctx, bx, by, bw, 10, 4, '#14161c');
        if (burner.status === 'cooking') {
          const pct = Math.min(1, burner.elapsed / burner.duration);
          fillRoundRect(ctx, bx + 1, by + 1, (bw - 2) * pct, 8, 3, '#f7a531');
        } else if (burner.status === 'ready') {
          const warnPct = Math.min(1, burner.burnElapsed / BURN_GRACE);
          const col = warnPct > 0.6 ? '#ff6448' : '#4ee37b';
          fillRoundRect(ctx, bx + 1, by + 1, (bw - 2) * (1 - warnPct), 8, 3, col);
        } else {
          fillRoundRect(ctx, bx + 1, by + 1, bw - 2, 8, 3, '#c7342c');
        }
      }

      ctx.fillStyle = burner.status === 'ready' ? '#8ef5a8' : burner.status === 'burnt' ? '#ff8475' : '#e6e8f2';
      ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      const stoveText = burner.status === 'ready'
        ? `PAN ${st.burnerIndex + 1} READY!`
        : burner.status === 'burnt'
          ? 'BURNT — BIN!'
          : `STOVE PAN ${st.burnerIndex + 1}`;
      ctx.fillText(stoveText, cx, st.y + 98);
      continue;
    }

    if (st.type === 'plating') {
      const plate = stations.plate;
      const borderCol = plate.completedRecipeId
        ? '#6cf092'
        : plate.mismatch
          ? '#ff5f4d'
          : isActive
            ? '#ffd972'
            : isHovered
              ? '#d4a66a'
              : '#785239';
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 9, '#3e291d', borderCol, isActive || plate.completedRecipeId ? 3 : 1.5);

      // Lacquer bento tray in center
      fillRoundRect(ctx, st.x + 16, st.y + 10, st.w - 32, 68, 8, '#1a1521', '#cf3e2b', 2.4);

      if (plate.completedRecipeId) {
        drawFinishedDish(ctx, plate.completedRecipeId, st.x + st.w * 0.5, st.y + 44, 1.48);
      } else {
        // 3 clear ingredient slots for mid-assembly visibility, prioritized by active orders
        const suggested = plate.items.length > 0 ? getPrioritizedCandidateRecipe(plate.items, orders.tickets) : null;
        const missing = suggested ? getMissingIngredients(suggested, plate.items) : [];
        let missingCursor = 0;
        for (let slot = 0; slot < 3; slot++) {
          const sx = st.x + 64 + slot * 80;
          const sy = st.y + 44;
          const placed = plate.items[slot];
          if (placed) {
            fillRoundRect(ctx, sx - 28, sy - 24, 56, 48, 7, '#2d2638', '#83c98d', 1.6);
            drawFoodIcon(ctx, placed.kind, placed.state, sx, sy, 1.05);
          } else {
            ctx.save();
            ctx.setLineDash([4, 4]);
            fillRoundRect(ctx, sx - 28, sy - 24, 56, 48, 7, 'rgba(255,255,255,0.04)', 'rgba(255,214,132,0.5)', 1.5);
            ctx.restore();
            const ghost = missing[missingCursor++];
            if (ghost && !plate.mismatch) {
              ctx.save();
              ctx.globalAlpha = 0.38;
              drawFoodIcon(ctx, ghost.kind, ghost.state, sx, sy - 3, 0.85);
              ctx.restore();
              ctx.fillStyle = 'rgba(255,224,155,0.8)';
              ctx.font = 'bold 8.5px "Trebuchet MS", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`+${INGREDIENT_META[ghost.kind].shortLabel}`, sx, sy + 20);
            } else {
              ctx.fillStyle = 'rgba(255,224,165,0.42)';
              ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`+${slot + 1}`, sx, sy + 4);
            }
          }
        }
        if (plate.items.length > 0 && suggested && !plate.mismatch) {
          const nextHint = missing.length > 0 ? ` — ADD ${INGREDIENT_META[missing[0].kind].shortLabel}` : '';
          ctx.fillStyle = '#ffd97d';
          ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${suggested.shortName.toUpperCase()} (${plate.items.length}/3)${nextHint}`, st.x + st.w * 0.5, st.y + 100);
        } else if (plate.mismatch) {
          ctx.fillStyle = '#ff7d6b';
          ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('MISMATCH — PRESS [X] TO BIN (-2s)', st.x + st.w * 0.5, st.y + 100);
        } else {
          ctx.fillStyle = '#fff5e0';
          ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('PLATING COUNTER — ASSEMBLE 3 ITEMS', st.x + st.w * 0.5, st.y + 100);
        }
      }

      if (plate.completedRecipeId) {
        const rec = RECIPE_MAP[plate.completedRecipeId];
        ctx.fillStyle = '#8ef5a8';
        ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`READY: ${rec.shortName.toUpperCase()} — PICK UP [E]`, st.x + st.w * 0.5, st.y + 100);
      }
      continue;
    }

    if (st.type === 'trash') {
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 9, '#313440', isActive ? '#ffd972' : isHovered ? '#b0b8cc' : '#5e657a', isActive ? 3 : 1.5);
      // Steel trash can icon
      fillRoundRect(ctx, st.x + 24, st.y + 22, 52, 54, 6, '#1f222b', '#7b849c', 2);
      fillRoundRect(ctx, st.x + 20, st.y + 16, 60, 10, 4, '#545c70');
      ctx.strokeStyle = '#6f778f';
      ctx.lineWidth = 2;
      for (const lx of [38, 50, 62]) {
        ctx.beginPath();
        ctx.moveTo(st.x + lx, st.y + 32);
        ctx.lineTo(st.x + lx, st.y + 68);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd6c7';
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BIN [X]', st.x + st.w * 0.5, st.y + 100);
      continue;
    }

    if (st.type === 'serve') {
      const carryingDish = Boolean(world.chef.carriedPlate);
      const outline = carryingDish ? '#73f599' : isActive ? '#ffd972' : isHovered ? '#e0b370' : '#9c6e46';
      fillRoundRect(ctx, st.x, st.y, st.w, st.h, 10, '#4f3322', outline, carryingDish || isActive ? 3.5 : 2);

      // Indigo izakaya noren curtain at top of serve window
      for (let i = 0; i < 3; i++) {
        const nx = st.x + 10 + i * 48;
        fillRoundRect(ctx, nx, st.y + 10, 44, 52, 4, '#1b2c4a', '#c99b52', 1.2);
        ctx.strokeStyle = 'rgba(235, 194, 114, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nx + 22, st.y + 42, 10, Math.PI, 0);
        ctx.stroke();
      }

      // Warm illuminated service pass tray
      const passGrad = ctx.createLinearGradient(st.x + 14, st.y + 84, st.x + st.w - 14, st.y + 270);
      passGrad.addColorStop(0, '#785032');
      passGrad.addColorStop(1, '#593923');
      fillRoundRect(ctx, st.x + 14, st.y + 84, st.w - 28, 198, 8, passGrad, '#d6a463', 1.8);

      // Brass service bell
      ctx.fillStyle = '#eab84b';
      ctx.strokeStyle = '#8c5e14';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(st.x + st.w * 0.5, st.y + 114, 15, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff0b3';
      ctx.beginPath();
      ctx.arc(st.x + st.w * 0.5 - 4, st.y + 106, 3.5, 0, Math.PI * 2);
      ctx.fill();
      fillRoundRect(ctx, st.x + st.w * 0.5 - 18, st.y + 114, 36, 5, 2, '#9e6c1c');

      // Show plated showcase dish on the pass with celebratory radial rays
      if (stations.serveShowcase.recipeId) {
        const pulse = 0.85 + Math.sin(game.elapsedAnim * 6) * 0.15;
        const dishCx = st.x + st.w * 0.5;
        const dishCy = st.y + 196;
        const glow = ctx.createRadialGradient(dishCx, dishCy, 6, dishCx, dishCy, 60);
        glow.addColorStop(0, `rgba(255, 226, 118, ${0.46 * pulse})`);
        glow.addColorStop(1, 'rgba(255, 200, 90, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(dishCx, dishCy, 60, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 232, 136, 0.34)';
        ctx.lineWidth = 2;
        for (let r = 0; r < 8; r++) {
          const ang = (Math.PI * 2 * r) / 8 + game.elapsedAnim * 0.5;
          ctx.beginPath();
          ctx.moveTo(dishCx + Math.cos(ang) * 34, dishCy + Math.sin(ang) * 28);
          ctx.lineTo(dishCx + Math.cos(ang) * 52, dishCy + Math.sin(ang) * 44);
          ctx.stroke();
        }
        ctx.restore();

        drawFinishedDish(ctx, stations.serveShowcase.recipeId, dishCx, dishCy, 1.72);
        ctx.fillStyle = '#fff5d1';
        ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(stations.serveShowcase.label.toUpperCase(), dishCx, st.y + 252);
        ctx.fillStyle = '#8ef5a8';
        ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
        ctx.fillText('SERVED HOT!', dishCx, st.y + 270);
      } else {
        ctx.save();
        ctx.setLineDash([6, 5]);
        fillRoundRect(ctx, st.x + 28, st.y + 148, st.w - 56, 94, 8, 'rgba(255,244,210,0.06)', 'rgba(255,222,140,0.55)', 2);
        ctx.restore();
        ctx.fillStyle = carryingDish ? '#90f7a8' : '#f7e5c3';
        ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(carryingDish ? 'DROP PLATE [E]' : 'PLACE BENTO', st.x + st.w * 0.5, st.y + 198);
      }

      // Vertical serve label plaque at bottom
      fillRoundRect(ctx, st.x + 14, st.y + 298, st.w - 28, 52, 7, '#221721', '#d99e46', 1.6);
      ctx.fillStyle = '#ffe59c';
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SERVE PASS', st.x + st.w * 0.5, st.y + 322);
      ctx.fillStyle = '#d4c3ab';
      ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
      ctx.fillText('PRESS [E] OR CLICK', st.x + st.w * 0.5, st.y + 340);
    }
  }
}

export function drawChefCharacter(ctx, game) {
  const chef = game.world.chef;
  const bob = chef.moving ? Math.sin(chef.walkPhase) * 3.5 : Math.sin(game.elapsedAnim * 2.5) * 1.2;
  const scaleBounce = 1 + chef.actionBounce * 0.08;

  ctx.save();
  ctx.translate(chef.x, chef.y);
  ctx.scale(scaleBounce, scaleBounce);

  // Soft floor shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 22, 23, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle walk target ring if moving via click
  if (chef.walkTarget) {
    ctx.save();
    ctx.translate(chef.walkTarget.x - chef.x, chef.walkTarget.y - chef.y);
    ctx.strokeStyle = 'rgba(255, 220, 120, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Navy izakaya happi coat + white apron
  fillRoundRect(ctx, -20, -10 + bob, 40, 30, 12, '#1f365c', '#0e1b33', 2);
  fillRoundRect(ctx, -12, -2 + bob, 24, 21, 5, '#f5efe6');
  // Vermilion collar trim
  ctx.strokeStyle = '#d94836';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -8 + bob);
  ctx.lineTo(0, 2 + bob);
  ctx.lineTo(10, -8 + bob);
  ctx.stroke();

  // Chef head
  ctx.fillStyle = '#f8cfa8';
  ctx.strokeStyle = '#9c6c46';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -16 + bob, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hair cap + crisp white hachimaki headband with crimson knot
  ctx.fillStyle = '#1e1926';
  ctx.beginPath();
  ctx.arc(0, -19 + bob, 15.5, Math.PI, 0);
  ctx.fill();
  fillRoundRect(ctx, -16, -24 + bob, 32, 6, 3, '#faf6ee', '#c7bca8', 1);
  ctx.fillStyle = '#d94032';
  ctx.beginPath();
  ctx.arc(14, -21 + bob, 4, 0, Math.PI * 2);
  ctx.fill();

  // Expressive eyes facing movement direction
  const ex = Math.max(-3.5, Math.min(3.5, chef.facingX * 3.5));
  const ey = Math.max(-2, Math.min(2, chef.facingY * 2));
  ctx.fillStyle = '#1d1824';
  ctx.beginPath();
  ctx.arc(-5 + ex, -14 + ey + bob, 2.2, 0, Math.PI * 2);
  ctx.arc(5 + ex, -14 + ey + bob, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Carried finished plate held proudly in front/above chef
  if (chef.carriedPlate) {
    drawFinishedDish(ctx, chef.carriedPlate.recipeId, 0, -48 + bob, 1.15);
  }

  // Carried loose ingredients stack shown clearly above the chef's head
  if (chef.carry.length > 0) {
    const baseY = chef.carriedPlate ? -84 + bob : -54 + bob;
    const trayW = Math.max(46, chef.carry.length * 36 + 12);
    fillRoundRect(ctx, -trayW * 0.5, baseY - 17, trayW, 34, 9, 'rgba(20, 17, 29, 0.9)', '#e3b25d', 1.8);
    const startX = -((chef.carry.length - 1) * 34) * 0.5;
    for (let i = 0; i < chef.carry.length; i++) {
      const item = chef.carry[i];
      const ix = startX + i * 34;
      drawFoodIcon(ctx, item.kind, item.state, ix, baseY, 0.82);
      if (item.state === 'chopped' || item.state === 'cooked' || item.state === 'burnt') {
        const dotCol = item.state === 'cooked' ? '#63eb8b' : item.state === 'chopped' ? '#4ec2ff' : '#ff5247';
        ctx.fillStyle = dotCol;
        ctx.beginPath();
        ctx.arc(ix + 11, baseY - 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Sprint stamina bar under chef feet while recharging
  if (chef.stamina < 0.98) {
    fillRoundRect(ctx, -18, 28, 36, 5, 2.5, 'rgba(15, 12, 22, 0.75)');
    fillRoundRect(ctx, -17, 29, 34 * chef.stamina, 3, 1.5, chef.sprinting ? '#ffe066' : '#6cc8ff');
  }

  ctx.restore();
}

export function drawOrderBoardRail(ctx, game) {
  const { orders } = game;
  const shakeX = orders.railShake > 0 ? Math.sin(game.elapsedAnim * 48) * 6 * orders.railShake : 0;

  // Top dark indigo timber rail backdrop
  const topGrad = ctx.createLinearGradient(0, 0, 0, 132);
  topGrad.addColorStop(0, '#14111d');
  topGrad.addColorStop(1, '#211b2e');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, KITCHEN_WIDTH, 132);

  // Brass hanging bar behind tickets
  fillRoundRect(ctx, 12, 16, 938, 7, 3, '#b8893d', '#f2cf7e', 1);

  ctx.save();
  ctx.translate(shakeX, 0);
  for (let slot = 0; slot < 4; slot++) {
    const tx = 16 + slot * 234;
    const ty = 12;
    const tw = 222;
    const th = 112;
    const ticket = orders.tickets[slot];

    if (!ticket) {
      fillRoundRect(ctx, tx, ty + 6, tw, th - 6, 8, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 224, 160, 0.14)', 1.2);
      ctx.fillStyle = 'rgba(255, 232, 190, 0.28)';
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OPEN TICKET SLOT', tx + tw * 0.5, ty + 66);
      continue;
    }

    const recipe = RECIPE_MAP[ticket.recipeId];
    const ratio = Math.max(0, Math.min(1, ticket.patience / ticket.maxPatience));
    const urgent = ratio < 0.28;
    const paperCol = urgent && Math.sin(game.elapsedAnim * 12) > 0 ? '#ffe8e0' : '#fcf5e6';
    const borderCol = urgent ? '#e04236' : '#c9a66b';

    fillRoundRect(ctx, tx, ty + 4, tw, th - 4, 8, paperCol, borderCol, urgent ? 2.4 : 1.6);
    // Brass ticket clip
    fillRoundRect(ctx, tx + tw * 0.5 - 18, ty, 36, 10, 3, '#d9aa4e', '#755017', 1);

    // Header row: ticket number, dish title, base value
    ctx.fillStyle = '#241b2b';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`#${ticket.id} ${recipe.shortName}`, tx + 10, ty + 25);

    fillRoundRect(ctx, tx + tw - 44, ty + 12, 34, 18, 4, '#241c2e');
    ctx.fillStyle = '#ffd96b';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${recipe.value}`, tx + tw - 27, ty + 25);

    // Dish preview on left
    drawFinishedDish(ctx, recipe.id, tx + 36, ty + 61, 0.92);

    // 3 ingredient recipe chips
    for (let j = 0; j < recipe.ingredients.length; j++) {
      const ing = recipe.ingredients[j];
      const cx = tx + 86 + j * 44;
      const cy = ty + 55;
      fillRoundRect(ctx, cx - 18, cy - 19, 38, 44, 6, '#f0e4cc', '#d4be98', 1);
      drawFoodIcon(ctx, ing.kind, ing.state, cx + 1, cy - 3, 0.72);
      const tag = ing.state === 'cooked' ? 'COOK' : ing.state === 'chopped' ? 'CHOP' : 'READY';
      const tagCol = ing.state === 'cooked' ? '#c2571d' : ing.state === 'chopped' ? '#2c789c' : '#2d7a4a';
      ctx.fillStyle = tagCol;
      ctx.font = 'bold 8.5px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tag, cx + 1, cy + 20);
    }

    // Patience timer bar
    const barX = tx + 10;
    const barY = ty + 94;
    const barW = tw - 54;
    fillRoundRect(ctx, barX, barY, barW, 11, 5, '#d6cbb5');
    const barCol = ratio > 0.55 ? '#35b864' : ratio > 0.28 ? '#eb9e2d' : '#de3f33';
    fillRoundRect(ctx, barX + 1, barY + 1, Math.max(4, (barW - 2) * ratio), 9, 4, barCol);

    ctx.fillStyle = urgent ? '#c7281e' : '#3c3145';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(ticket.patience)}s`, tx + tw - 10, ty + 104);
  }
  ctx.restore();
}

export function drawHudAndBanners(ctx, game) {
  const { orders, stations } = game;
  const rushActive = game.timeLeft <= RUSH_THRESHOLD && game.mode !== 'title';

  // Right HUD lacquer cabinet
  fillRoundRect(ctx, 962, 10, 304, 114, 10, '#161221', rushActive ? '#ff6442' : '#d6a049', 2);

  // Shift clock
  ctx.fillStyle = rushActive ? '#ff8b6b' : '#b8a894';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(rushActive ? 'RUSH CLOCK' : 'SHIFT CLOCK', 978, 28);

  ctx.fillStyle = rushActive && Math.sin(game.elapsedAnim * 8) > 0 ? '#ff6947' : '#fff5df';
  ctx.font = 'bold 31px "Trebuchet MS", sans-serif';
  ctx.fillText(formatClock(game.timeLeft), 976, 61);

  // Score & streak
  ctx.fillStyle = '#b8a894';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('SCORE', 1252, 28);

  ctx.fillStyle = '#ffe073';
  ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
  ctx.fillText(String(orders.score), 1252, 56);

  if (orders.streak > 0) {
    fillRoundRect(ctx, 1152, 62, 100, 21, 6, '#b83f28', '#ffcf6b', 1.2);
    ctx.fillStyle = '#fff9e6';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`COMBO x${Math.min(5, orders.streak)}`, 1202, 76);
  } else {
    ctx.fillStyle = '#8d8299';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SERVED ${orders.servedCount}`, 1252, 76);
  }

  // Hearts row (generous spacing before pause/sfx buttons)
  for (let h = 0; h < MAX_HEARTS; h++) {
    const hx = 978 + h * 24;
    const hy = 100;
    const full = h < orders.hearts;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.fillStyle = full ? '#e84343' : '#3a2d3d';
    ctx.strokeStyle = full ? '#ff9e9e' : '#5e4c63';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 7.5);
    ctx.bezierCurveTo(-11, -2, -9.5, -10.5, 0, -4);
    ctx.bezierCurveTo(9.5, -10.5, 11, -2, 0, 7.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#d4c3ab';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${orders.servedCount} PLATES`, 1052, 105);

  // Pause & Mute buttons
  const pb = UI_RECTS.pauseBtn;
  const mb = UI_RECTS.muteBtn;
  fillRoundRect(ctx, pb.x, pb.y, pb.w, pb.h, 6, game.paused ? '#d48b2c' : '#2a2338', '#8a749e', 1.2);
  ctx.fillStyle = '#fff5e0';
  ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(game.paused ? 'PLAY [P]' : 'PAUSE [P]', pb.x + pb.w * 0.5, pb.y + 17);

  const muted = game.sound.isMuted();
  fillRoundRect(ctx, mb.x, mb.y, mb.w, mb.h, 6, muted ? '#57282b' : '#2a2338', '#8a749e', 1.2);
  ctx.fillStyle = muted ? '#ffa096' : '#fff5e0';
  ctx.fillText(muted ? 'MUTE' : 'SFX [M]', mb.x + mb.w * 0.5, mb.y + 17);

  // Band 2: Status / Rush Hour Banner Strip (y: 132..164)
  if (rushActive) {
    const pulse = 0.5 + 0.5 * Math.sin(game.elapsedAnim * 7);
    const rushGrad = ctx.createLinearGradient(0, 132, KITCHEN_WIDTH, 132);
    rushGrad.addColorStop(0, '#6e1918');
    rushGrad.addColorStop(0.5, `rgba(${Math.round(196 + pulse * 30)}, 49, 33, 1)`);
    rushGrad.addColorStop(1, '#6e1918');
    ctx.fillStyle = rushGrad;
    ctx.fillRect(0, 132, KITCHEN_WIDTH, 32);
    ctx.fillStyle = '#ffec99';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    const statusRight = stations.toast.timer > 0 ? `  •  ${stations.toast.text}` : '  •  FASTER TICKETS & +25% SPEED TIPS!';
    ctx.fillText(`RUSH HOUR ACTIVE (${Math.ceil(game.timeLeft)}s LEFT)${statusRight}`, KITCHEN_WIDTH * 0.5, 153);
  } else {
    ctx.fillStyle = '#2c2336';
    ctx.fillRect(0, 132, KITCHEN_WIDTH, 32);
    ctx.strokeStyle = '#4e3e5e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 163.5);
    ctx.lineTo(KITCHEN_WIDTH, 163.5);
    ctx.stroke();

    const phase = getShiftPhase(game.timeLeft);
    const hintText = stations.toast.timer > 0
      ? stations.toast.text
      : `${phase.label}  •  WASD/ARROWS TO MOVE  •  [E] OR CLICK STATION TO COOK & PLATE  •  [X] BIN`;
    ctx.fillStyle = stations.toast.timer > 0 ? stations.toast.color : '#e2d4be';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(hintText, KITCHEN_WIDTH * 0.5, 153);
  }
}

export function drawParticlesAndPopups(ctx, game) {
  const { stations } = game;

  for (const p of stations.particles) {
    const alpha = Math.max(0, 1 - p.age / p.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === 'steam' ? p.radius * (1 + p.age * 0.9) : p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const pop of stations.popups) {
    const alpha = Math.min(1, (1 - pop.age / pop.life) * 1.6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const pillW = Math.max(150, pop.text.length * 11 + 26);
    const pillH = pop.subtext ? 46 : 30;
    fillRoundRect(ctx, pop.x - pillW * 0.5, pop.y - 20, pillW, pillH, 9, 'rgba(20, 14, 28, 0.9)', pop.color, 2);
    ctx.fillStyle = pop.color;
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pop.text, pop.x, pop.y);
    if (pop.subtext) {
      ctx.fillStyle = '#9cf5ad';
      ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
      ctx.fillText(pop.subtext, pop.x, pop.y + 18);
    }
    ctx.restore();
  }
}

export function drawTitleOverlay(ctx) {
  // Compact izakaya lantern-wood card over the center-left floor so counters, tickets, stove, plating & serve stay visible!
  const cardX = 248;
  const cardY = 286;
  const cardW = 624;
  const cardH = 230;

  fillRoundRect(ctx, cardX, cardY, cardW, cardH, 16, 'rgba(20, 15, 29, 0.91)', '#e0aa4e', 3);
  fillRoundRect(ctx, cardX + 10, cardY + 10, cardW - 20, cardH - 20, 11, 'rgba(38, 27, 46, 0.55)', 'rgba(224, 170, 78, 0.35)', 1.2);

  ctx.fillStyle = '#f5b853';
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LATE-NIGHT IZAKAYA KITCHEN  •  180-SECOND SHIFT', cardX + cardW * 0.5, cardY + 34);

  ctx.fillStyle = '#fff6e3';
  ctx.font = 'bold 42px "Trebuchet MS", sans-serif';
  ctx.fillText('MIDNIGHT BENTO RUSH', cardX + cardW * 0.5, cardY + 80);

  ctx.fillStyle = '#e3d5be';
  ctx.font = '15px "Trebuchet MS", sans-serif';
  ctx.fillText('Grab pantry items  •  Chop & sear on dual pans  •  Plate 3-item bentos  •  Beat Rush Hour!', cardX + cardW * 0.5, cardY + 112);

  // Mini control pills
  const controls = [
    'MOVE: WASD / Arrows / Click',
    'COOK & SERVE: [E] / Click',
    'BIN: [X]   PAUSE: [P]   SFX: [M]',
  ];
  ctx.fillStyle = '#c8bed4';
  ctx.font = 'bold 12.5px "Trebuchet MS", sans-serif';
  ctx.fillText(controls.join('   |   '), cardX + cardW * 0.5, cardY + 140);

  // Start button
  const btn = UI_RECTS.startBtn;
  const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
  btnGrad.addColorStop(0, '#e85d38');
  btnGrad.addColorStop(1, '#bd3422');
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, btnGrad, '#ffe08a', 2.4);
  ctx.fillStyle = '#fffaf0';
  ctx.font = 'bold 19px "Trebuchet MS", sans-serif';
  ctx.fillText('START SHIFT  [ENTER]', btn.x + btn.w * 0.5, btn.y + 31);
}

export function drawPauseOverlay(ctx) {
  ctx.fillStyle = 'rgba(12, 9, 18, 0.65)';
  ctx.fillRect(0, 132, KITCHEN_WIDTH, KITCHEN_HEIGHT - 132);

  fillRoundRect(ctx, 430, 268, 420, 200, 14, 'rgba(24, 19, 34, 0.96)', '#e0aa4e', 2.5);
  ctx.fillStyle = '#fff5df';
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KITCHEN PAUSED', 640, 326);
  ctx.fillStyle = '#d4c3ab';
  ctx.font = '15px "Trebuchet MS", sans-serif';
  ctx.fillText('Press [P] to resume  •  [R] to restart  •  [M] mute SFX', 640, 358);

  const btn = UI_RECTS.resumeBtn;
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, '#368c53', '#a6f0be', 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
  ctx.fillText('RESUME SHIFT [P]', btn.x + btn.w * 0.5, btn.y + 31);
}

export function drawShiftEndOverlay(ctx, game) {
  const { orders } = game;
  ctx.fillStyle = 'rgba(12, 9, 18, 0.76)';
  ctx.fillRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);

  fillRoundRect(ctx, 370, 148, 540, 416, 16, '#1a1424', '#e3ad4f', 3);
  const outOfHearts = orders.hearts <= 0;
  ctx.fillStyle = outOfHearts ? '#ff7d6b' : '#8ef5a8';
  ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(outOfHearts ? 'KITCHEN OVERWHELMED — 0 HEARTS LEFT' : 'LAST CALL — 180s SHIFT COMPLETE!', 640, 188);

  ctx.fillStyle = '#fff5df';
  ctx.font = 'bold 38px "Trebuchet MS", sans-serif';
  ctx.fillText('SHIFT SUMMARY', 640, 232);

  const grade = computeShiftGrade(orders.score, orders.servedCount, orders.hearts);
  fillRoundRect(ctx, 594, 248, 92, 54, 12, '#c94028', '#ffe082', 2.4);
  ctx.fillStyle = '#fff8e3';
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.fillText(grade, 640, 287);

  const rows = [
    ['FINAL SCORE', String(orders.score)],
    ['DISHES SERVED', String(orders.servedCount)],
    ['BEST STREAK', `x${Math.max(1, orders.bestStreak)}`],
    ['FAST TIPS EARNED', `+${orders.tipsEarned}`],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = 336 + i * 34;
    ctx.fillStyle = '#cfc1ab';
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rows[i][0], 446, ry);
    ctx.fillStyle = '#ffe380';
    ctx.textAlign = 'right';
    ctx.fillText(rows[i][1], 834, ry);
  }

  const btn = UI_RECTS.restartBtn;
  fillRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, '#d94d2b', '#ffe08a', 2.4);
  ctx.fillStyle = '#fffaf0';
  ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PLAY AGAIN  [R]', btn.x + btn.w * 0.5, btn.y + 31);
}

export function renderGameFrame(ctx, game) {
  ctx.clearRect(0, 0, KITCHEN_WIDTH, KITCHEN_HEIGHT);
  drawOrderBoardRail(ctx, game);
  drawHudAndBanners(ctx, game);
  drawKitchenFloorAndCounters(ctx, game);
  drawStationFixtures(ctx, game);
  drawChefCharacter(ctx, game);
  drawParticlesAndPopups(ctx, game);

  if (game.mode === 'title') {
    drawTitleOverlay(ctx);
  } else if (game.paused) {
    drawPauseOverlay(ctx);
  } else if (game.mode === 'end') {
    drawShiftEndOverlay(ctx, game);
  }
}
