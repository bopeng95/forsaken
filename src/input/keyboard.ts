import type { Vec2 } from '../sim/types';

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

export function inputVec(): Vec2 {
  let x = 0;
  let y = 0;
  if (pressed.has('ArrowUp') || pressed.has('KeyW')) y -= 1;
  if (pressed.has('ArrowDown') || pressed.has('KeyS')) y += 1;
  if (pressed.has('ArrowLeft') || pressed.has('KeyA')) x -= 1;
  if (pressed.has('ArrowRight') || pressed.has('KeyD')) x += 1;
  return { x, y };
}
