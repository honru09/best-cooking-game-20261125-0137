// Keyboard and mouse input controller for Midnight Bento Rush.

import { KITCHEN_HEIGHT, KITCHEN_WIDTH } from './world.js';

export const UI_RECTS = {
  pauseBtn: { x: 1126, y: 90, w: 62, h: 26 },
  muteBtn: { x: 1194, y: 90, w: 62, h: 26 },
  startBtn: { x: 432, y: 444, w: 256, h: 48 },
  resumeBtn: { x: 512, y: 382, w: 256, h: 48 },
  restartBtn: { x: 512, y: 482, w: 256, h: 48 },
};

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function canvasCoordsFromEvent(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: ((event.clientX - rect.left) / rect.width) * KITCHEN_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * KITCHEN_HEIGHT,
  };
}

export function attachInputHandlers(canvas) {
  const keysDown = new Set();
  const pending = {
    interact: false,
    bin: false,
    start: false,
    pause: false,
    mute: false,
    restart: false,
    clicks: [],
  };
  const pointer = { x: -1, y: -1 };

  const moveKeys = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ]);

  function onKeyDown(event) {
    const code = event.code;
    if (moveKeys.has(code) || code === 'Space') {
      event.preventDefault();
    }
    keysDown.add(code);
    if (event.repeat) return;

    if (code === 'KeyE' || code === 'Space') pending.interact = true;
    else if (code === 'KeyX' || code === 'Backspace') pending.bin = true;
    else if (code === 'Enter') pending.start = true;
    else if (code === 'KeyP' || code === 'Escape') pending.pause = true;
    else if (code === 'KeyM') pending.mute = true;
    else if (code === 'KeyR') pending.restart = true;
  }

  function onKeyUp(event) {
    keysDown.delete(event.code);
  }

  function onMouseMove(event) {
    const pos = canvasCoordsFromEvent(canvas, event);
    pointer.x = pos.x;
    pointer.y = pos.y;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    const pos = canvasCoordsFromEvent(canvas, event);
    pointer.x = pos.x;
    pointer.y = pos.y;
    pending.clicks.push(pos);
  }

  function onBlur() {
    keysDown.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    getMoveVector() {
      let x = 0;
      let y = 0;
      if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) x -= 1;
      if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) x += 1;
      if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) y -= 1;
      if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) y += 1;
      const sprint = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
      return { x, y, sprint };
    },
    getPointer() {
      return { x: pointer.x, y: pointer.y };
    },
    consumeActions() {
      const snapshot = {
        interact: pending.interact,
        bin: pending.bin,
        start: pending.start,
        pause: pending.pause,
        mute: pending.mute,
        restart: pending.restart,
        clicks: pending.clicks.slice(),
      };
      pending.interact = false;
      pending.bin = false;
      pending.start = false;
      pending.pause = false;
      pending.mute = false;
      pending.restart = false;
      pending.clicks.length = 0;
      return snapshot;
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
    },
  };
}
