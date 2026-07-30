import type { Vec2 } from '../sim/core/types';

const pressed = new Set<string>();
let attached = false;

const KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

let sprintQueued = false;
let dashQueued = false;
let pauseQueued = false;
let restartQueued = false;
let replayQueued = false;
let changeSpotQueued = false;
let rewindQueued = false;

export function attachKeyboard(): void {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', (e) => {
    if (KEYS.has(e.code)) {
      pressed.add(e.code);
      e.preventDefault();
    } else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      sprintQueued = true;
    } else if ((e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) {
      dashQueued = true;
    } else if (e.code === 'Space') {
      if (!e.repeat) pauseQueued = true;
      e.preventDefault();
    } else if (e.code === 'KeyR' && !e.repeat) {
      restartQueued = true;
    } else if (e.code === 'KeyT' && !e.repeat) {
      replayQueued = true;
    } else if (e.code === 'KeyC' && !e.repeat) {
      changeSpotQueued = true;
    } else if (e.code === 'KeyE' && !e.repeat) {
      rewindQueued = true;
    }
  });
  window.addEventListener('keyup', (e) => pressed.delete(e.code));
  window.addEventListener('blur', () => pressed.clear());
}

/** returns true once per Shift press (queued so a press between frames isn't lost) */
export function consumeSprint(): boolean {
  const q = sprintQueued;
  sprintQueued = false;
  return q;
}

/** returns true once per press of 1 (queued so a press between frames isn't lost) */
export function consumeDash(): boolean {
  const q = dashQueued;
  dashQueued = false;
  return q;
}

/** returns true once per Space press (queued so a press between frames isn't lost) */
export function consumePause(): boolean {
  const q = pauseQueued;
  pauseQueued = false;
  return q;
}

/** returns true once per press of R (queued so a press between frames isn't lost) */
export function consumeRestart(): boolean {
  const q = restartQueued;
  restartQueued = false;
  return q;
}

/** returns true once per press of T (queued so a press between frames isn't lost) */
export function consumeReplay(): boolean {
  const q = replayQueued;
  replayQueued = false;
  return q;
}

/** returns true once per press of C (queued so a press between frames isn't lost) */
export function consumeChangeSpot(): boolean {
  const q = changeSpotQueued;
  changeSpotQueued = false;
  return q;
}

/** returns true once per press of E (queued so a press between frames isn't lost) */
export function consumeRewind(): boolean {
  const q = rewindQueued;
  rewindQueued = false;
  return q;
}

/**
 * Drop every queued one-shot press. Listeners attach to window forever, so without this a
 * C/R/T pressed around a route change would sit queued and fire into the next GameView mount.
 */
export function clearPresses(): void {
  sprintQueued = false;
  dashQueued = false;
  pauseQueued = false;
  restartQueued = false;
  replayQueued = false;
  changeSpotQueued = false;
  rewindQueued = false;
}

export function inputVec(): Vec2 {
  let x = 0;
  let y = 0;
  if (pressed.has('ArrowUp') || pressed.has('KeyW')) y -= 1;
  if (pressed.has('ArrowDown') || pressed.has('KeyS')) y += 1;
  if (pressed.has('ArrowLeft') || pressed.has('KeyA')) x -= 1;
  if (pressed.has('ArrowRight') || pressed.has('KeyD')) x += 1;
  return { x, y };
}
