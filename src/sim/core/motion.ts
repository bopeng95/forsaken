import { R_ARENA, R_DEADZONE } from './constants';
import type { Vec2 } from './types';

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** World point at a compass azimuth (deg, 0 = N, clockwise) and radius. */
export function compass(deg: number, r: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

/**
 * Local frame: dDeg is a compass direction (0 = "relative north" = away from the
 * reference azimuth, clockwise) in the frame where southDeg is at local south.
 * P2 uses it with the tower-pair midpoint as "relative south".
 */
export function lp(southDeg: number, dDeg: number, r: number): Vec2 {
  const world = (((southDeg + 180 + dDeg) % 360) * Math.PI) / 180;
  return { x: r * Math.sin(world), y: -r * Math.cos(world) };
}

export function clampToArena(p: Vec2): Vec2 {
  const r = Math.hypot(p.x, p.y);
  const max = R_ARENA - 0.4;
  if (r <= max) return p;
  return { x: (p.x / r) * max, y: (p.y / r) * max };
}

/** all duty spots sit at r >= 3.86 (P2 odd-set stack helpers), so bots orbit at 3.7 when cutting across */
const AVOID_R = R_DEADZONE + 0.3;

function segmentMinDistToOrigin(a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(a.x, a.y);
  let t = -(a.x * abx + a.y * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + abx * t, a.y + aby * t);
}

/**
 * Bot steering: straight line toward target; if that line would cut through the
 * boss deadzone, walk tangentially around it at full speed instead.
 * (Purely cosmetic — the boss hitbox is walkable and never lethal.)
 */
export function stepToward(pos: Vec2, target: Vec2, maxDist: number): Vec2 {
  const d = dist(pos, target);
  if (d < 1e-6) return pos;

  let nx: number;
  let ny: number;
  const posR = Math.hypot(pos.x, pos.y);
  const blocked = segmentMinDistToOrigin(pos, target) < AVOID_R - 0.05 && posR > 1e-6;

  if (blocked) {
    // orbit the avoid circle toward the target's angular side
    const a1 = Math.atan2(pos.y, pos.x);
    const a2 = Math.atan2(target.y, target.x);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const sign = da >= 0 ? 1 : -1;
    // tangent direction, plus gentle correction back toward the orbit radius
    const ux = pos.x / posR;
    const uy = pos.y / posR;
    let dirX = -uy * sign;
    let dirY = ux * sign;
    const radialErr = AVOID_R + 0.15 - posR; // >0 wants outward
    dirX += ux * radialErr * 0.5;
    dirY += uy * radialErr * 0.5;
    const dl = Math.hypot(dirX, dirY);
    nx = pos.x + (dirX / dl) * maxDist;
    ny = pos.y + (dirY / dl) * maxDist;
  } else {
    const step = Math.min(d, maxDist);
    nx = pos.x + ((target.x - pos.x) / d) * step;
    ny = pos.y + ((target.y - pos.y) / d) * step;
  }

  // never end up inside the deadzone
  const r = Math.hypot(nx, ny);
  if (r < AVOID_R) {
    nx = (nx / r) * AVOID_R;
    ny = (ny / r) * AVOID_R;
  }
  return clampToArena({ x: nx, y: ny });
}
