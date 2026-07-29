import { R_ARENA, R_INNER_RING, R_OUTER_RING } from '../sim/core/constants';
import type { FailInfo, Spot, Vec2 } from '../sim/core/types';
import { roleOf } from '../sim/core/types';

export const ROLE_COLOR: Record<string, string> = {
  T: '#5b8dd6',
  H: '#4fbf7f',
  M: '#d66a6a',
  R: '#d6906a',
};

/** world→screen: scale + view rotation, arena always centered */
export interface Proj {
  P: (p: Vec2) => [number, number];
  k: number;
  cx: number;
  cy: number;
  rot: number;
}

export function makeProj(cssSize: number, viewRotRad: number): Proj {
  // 3 world units of margin past the rim so edge-boss names and REAL/FAKE
  // tells (up to ~2.8 units above a rim token) never hit the canvas edge
  const k = cssSize / (2 * (R_ARENA + 3));
  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const rc = Math.cos(viewRotRad);
  const rs = Math.sin(viewRotRad);
  return {
    P: (p: Vec2) => [cx + (p.x * rc - p.y * rs) * k, cy + (p.x * rs + p.y * rc) * k],
    k,
    cx,
    cy,
    rot: viewRotRad,
  };
}

/**
 * clear + arena disc + grid; leaves the context saved and clipped to the disc.
 * Ground fills that must be trimmed at the rim (telegraphs, halves, cones)
 * draw next; call releaseArenaClip before tokens/labels so nothing that pokes
 * past the rim gets cut off.
 */
export function beginArena(ctx: CanvasRenderingContext2D, proj: Proj, cssSize: number): void {
  const { cx, cy, k, rot } = proj;
  ctx.clearRect(0, 0, cssSize, cssSize);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R_ARENA * k, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R_ARENA * k);
  bg.addColorStop(0, '#26222e');
  bg.addColorStop(1, '#191622');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();

  // grid (rotates with the camera; no text inside)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let g = -R_ARENA; g <= R_ARENA; g += 4) {
    ctx.beginPath();
    ctx.moveTo(cx + g * k, cy - R_ARENA * k);
    ctx.lineTo(cx + g * k, cy + R_ARENA * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - R_ARENA * k, cy + g * k);
    ctx.lineTo(cx + R_ARENA * k, cy + g * k);
    ctx.stroke();
  }
  ctx.restore();
}

/** drop the disc clip from beginArena — call before drawing tokens/labels */
export function releaseArenaClip(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/** boss hitbox rings (walkable — positioning references, not deadzones) */
export function drawBossRings(ctx: CanvasRenderingContext2D, proj: Proj): void {
  const { cx, cy, k } = proj;
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(220,210,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R_INNER_RING * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R_OUTER_RING * k, 0, Math.PI * 2);
  ctx.stroke();
}

/** the animated Kefka glyph at the arena center */
export function drawBossGlyph(ctx: CanvasRenderingContext2D, proj: Proj, t: number): void {
  const { cx, cy, k } = proj;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.7) * 0.08);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1.4 * k, 3.4 * k);
    ctx.lineTo(-1.4 * k, 3.4 * k);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(150,80,190,0.55)' : 'rgba(220,140,60,0.5)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 1.6 * k, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0a14';
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,180,90,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/**
 * A player token: role-colored circle + spot label, plus an optional facing
 * chevron on the rim (Kefka Says gazes — facing = last movement direction).
 */
export function drawToken(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  pos: Vec2,
  spot: Spot,
  isUser: boolean,
  facing: Vec2 | null = null,
): void {
  const { P, k, rot } = proj;
  const [x, y] = P(pos);

  if (facing) {
    const ang = Math.atan2(facing.y, facing.x) + rot;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(1.75 * k, 0);
    ctx.lineTo(1.0 * k, 0.48 * k);
    ctx.lineTo(1.0 * k, -0.48 * k);
    ctx.closePath();
    ctx.fillStyle = isUser ? 'rgba(255,215,94,0.95)' : 'rgba(230,225,255,0.55)';
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(x, y, 0.9 * k, 0, Math.PI * 2);
  ctx.fillStyle = ROLE_COLOR[roleOf(spot)];
  ctx.fill();
  ctx.strokeStyle = isUser ? '#ffd75e' : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = isUser ? 3 : 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(10,8,16,0.95)';
  ctx.font = `700 ${0.62 * k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spot, x, y);
}

/**
 * The frozen-scene fail overlay: the failing AoE zone, X marks on players it
 * wrongly caught, dashed rings on players it missed, and the pulsing ghost at
 * the user's intended position. Clips its own zone fill to the arena disc, so
 * it can be called after releaseArenaClip.
 */
export function drawFailOverlay(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  res: FailInfo,
  positions: Record<Spot, Vec2>,
): void {
  const { P, k, cx, cy, rot } = proj;

  if (res.zone) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R_ARENA * k, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    if (res.zone.kind === 'half') {
      const phi = Math.atan2(res.zone.dir.y, res.zone.dir.x) + rot;
      ctx.arc(cx, cy, R_ARENA * k, phi - Math.PI / 2, phi + Math.PI / 2);
      ctx.closePath();
    } else if (res.zone.kind === 'cone') {
      const [x, y] = P(res.zone.pos);
      // Forsaken always stamps halfRad/len; defaults only guard hand-written zones
      const half = res.zone.halfRad ?? Math.PI / 4;
      const len = res.zone.len ?? R_ARENA * 2;
      const dir = res.zone.dirRad + rot;
      ctx.moveTo(x, y);
      ctx.arc(x, y, len * k, dir - half, dir + half);
      ctx.closePath();
    } else if (res.zone.kind === 'line') {
      const [x, y] = P(res.zone.pos);
      const dir = res.zone.dirRad + rot;
      const ux = Math.cos(dir);
      const uy = Math.sin(dir);
      const w = res.zone.halfWidth * k;
      const l = res.zone.len * k;
      ctx.moveTo(x - uy * w, y + ux * w);
      ctx.lineTo(x - uy * w + ux * l, y + ux * w + uy * l);
      ctx.lineTo(x + uy * w + ux * l, y - ux * w + uy * l);
      ctx.lineTo(x + uy * w, y - ux * w);
      ctx.closePath();
    } else if (res.zone.kind === 'donut') {
      const [x, y] = P(res.zone.pos);
      ctx.arc(x, y, res.zone.rOut * k, 0, Math.PI * 2);
      ctx.arc(x, y, res.zone.rIn * k, 0, Math.PI * 2, true);
    } else {
      const [x, y] = P(res.zone.pos);
      ctx.arc(x, y, res.zone.r * k, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(255,80,80,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,80,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // players wrongly caught by the failing AoE
  ctx.strokeStyle = 'rgba(255,80,80,0.95)';
  ctx.lineWidth = 4;
  for (const s of res.hit ?? []) {
    const [x, y] = P(positions[s]);
    ctx.beginPath();
    ctx.moveTo(x - 0.9 * k, y - 0.9 * k);
    ctx.lineTo(x + 0.9 * k, y + 0.9 * k);
    ctx.moveTo(x + 0.9 * k, y - 0.9 * k);
    ctx.lineTo(x - 0.9 * k, y + 0.9 * k);
    ctx.stroke();
  }

  // players the AoE was supposed to hit but missed
  ctx.strokeStyle = 'rgba(255,80,80,0.9)';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 3]);
  for (const s of res.missed ?? []) {
    const [x, y] = P(positions[s]);
    ctx.beginPath();
    ctx.arc(x, y, 1.4 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // where the user should have been
  if (res.ghost) {
    const [x, y] = P(res.ghost);
    const pulse = 1 + 0.15 * Math.sin(performance.now() / 150);
    ctx.strokeStyle = 'rgba(255,220,90,0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, 1.5 * k * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - 0.8 * k, y - 0.8 * k);
    ctx.lineTo(x + 0.8 * k, y + 0.8 * k);
    ctx.moveTo(x + 0.8 * k, y - 0.8 * k);
    ctx.lineTo(x - 0.8 * k, y + 0.8 * k);
    ctx.stroke();
  }
}

/** rim + true-north marker (call after releaseArenaClip) */
export function finishArena(ctx: CanvasRenderingContext2D, proj: Proj): void {
  const { P, cx, cy, k, rot } = proj;

  ctx.beginPath();
  ctx.arc(cx, cy, R_ARENA * k, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,180,255,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // true-north marker outside the rim (only when the camera is rotated)
  if (Math.abs(rot) > 0.01) {
    const [nx, ny] = P({ x: 0, y: -(R_ARENA + 0.9) });
    ctx.fillStyle = 'rgba(200,180,255,0.8)';
    ctx.font = `700 ${1.0 * k}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}
