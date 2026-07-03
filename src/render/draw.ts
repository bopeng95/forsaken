import type { SimEngine } from '../sim/engine';
import {
  CONE_HALF_DEG,
  CONE_LEN,
  R_ARENA,
  R_INNER_RING,
  R_OUTER_RING,
  R_TOWER,
  SPREAD_R,
  STACK_R,
  WAYMARK_LETTER_R,
  WAYMARK_NUM_HALF,
  WAYMARK_NUM_R,
  WAYMARK_R,
} from '../sim/constants';
import type { Spot, Vec2 } from '../sim/types';
import { SPOTS, roleOf } from '../sim/types';

export const ROLE_COLOR: Record<string, string> = {
  T: '#5b8dd6',
  H: '#4fbf7f',
  M: '#d66a6a',
  R: '#d6906a',
};

const WAYMARKS: Array<{
  label: string;
  deg: number;
  r: number;
  color: string;
  shape: 'circle' | 'square';
}> = [
  { label: 'A', deg: 0, r: WAYMARK_R, color: '#e05252', shape: 'circle' },
  { label: '2', deg: 45, r: WAYMARK_NUM_R, color: '#d8c24a', shape: 'square' },
  { label: 'B', deg: 90, r: WAYMARK_R, color: '#d8c24a', shape: 'circle' },
  { label: '3', deg: 135, r: WAYMARK_NUM_R, color: '#57b7e0', shape: 'square' },
  { label: 'C', deg: 180, r: WAYMARK_R, color: '#57b7e0', shape: 'circle' },
  { label: '4', deg: 225, r: WAYMARK_NUM_R, color: '#b06ad6', shape: 'square' },
  { label: 'D', deg: 270, r: WAYMARK_R, color: '#b06ad6', shape: 'circle' },
  { label: '1', deg: 315, r: WAYMARK_NUM_R, color: '#e05252', shape: 'square' },
];

function compass(deg: number, r: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

export function draw(
  ctx: CanvasRenderingContext2D,
  eng: SimEngine,
  cssSize: number,
  viewRotRad = 0,
  showHints = false,
  focus: Spot | null = null,
): void {
  const k = cssSize / (2 * (R_ARENA + 2.5));
  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const rc = Math.cos(viewRotRad);
  const rs = Math.sin(viewRotRad);
  const P = (p: Vec2): [number, number] => [
    cx + (p.x * rc - p.y * rs) * k,
    cy + (p.x * rs + p.y * rc) * k,
  ];

  ctx.clearRect(0, 0, cssSize, cssSize);

  // ---- arena
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
  ctx.rotate(viewRotRad);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let g = -20; g <= 20; g += 4) {
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

  // ---- cleave halves (after lock)
  if (eng.cleaveDir) {
    const phi = Math.atan2(eng.cleaveDir.y, eng.cleaveDir.x) + viewRotRad;
    ctx.beginPath();
    ctx.arc(cx, cy, R_ARENA * k, phi - Math.PI / 2, phi + Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(224,64,64,0.28)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R_ARENA * k, phi + Math.PI / 2, phi - Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(64,224,120,0.07)';
    ctx.fill();
  }

  // ---- boss rings (walkable — the inner hitbox is a positioning reference, not a deadzone)
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

  // boss glyph
  const t = eng.t;
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

  // ---- waymarks
  ctx.font = `600 ${11 * (k / 18)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const w of WAYMARKS) {
    const [x, y] = P(compass(w.deg, w.r));
    ctx.strokeStyle = w.color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (w.shape === 'circle') ctx.arc(x, y, WAYMARK_LETTER_R * k, 0, Math.PI * 2);
    else {
      // number marks are squares glued to the ground: the outline rotates
      // with the camera, only the digit stays screen-upright
      const s = WAYMARK_NUM_HALF * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(viewRotRad);
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
    ctx.stroke();
    ctx.fillStyle = w.color;
    ctx.font = `700 ${1.4 * k}px system-ui, sans-serif`;
    ctx.fillText(w.label, x, y + 0.5);
    ctx.globalAlpha = 1;
  }

  // ---- towers
  if (eng.activeTowers) {
    const { plan, spawnT, resolveT } = eng.activeTowers;
    const frac = Math.min(1, (t - spawnT) / (resolveT - spawnT));
    for (const side of ['left', 'right'] as const) {
      const [x, y] = P(plan.towerCenters[side]);
      ctx.beginPath();
      ctx.arc(x, y, R_TOWER * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(250,240,180,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,250,220,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // shrinking timer ring — hits the center exactly at the soak check
      ctx.beginPath();
      ctx.arc(x, y, R_TOWER * k * (1 - frac), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      void resolveT;
    }
  }

  // ---- bait marker (strat guidance — hidden unless hints are on)
  if (eng.baitMarker && showHints) {
    const [x, y] = P(eng.baitMarker);
    const pulse = 1 + 0.12 * Math.sin(t * 6);
    ctx.beginPath();
    ctx.arc(x, y, 2.0 * k * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,90,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,90,0.9)';
    ctx.font = `700 ${0.8 * k}px system-ui, sans-serif`;
    ctx.fillText('STACK HERE', x, y - 2.7 * k * pulse);
  }

  // ---- AoE effects
  for (const e of eng.effects) {
    const alpha = Math.max(0, Math.min(1, (e.until - t) / 1.2));
    const [x, y] = P(e.pos);
    if (e.kind === 'cone') {
      const half = (CONE_HALF_DEG * Math.PI) / 180;
      const dir = e.dirRad! + viewRotRad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, CONE_LEN * k, dir - half, dir + half);
      ctx.closePath();
      ctx.fillStyle = `rgba(230,170,60,${0.35 * alpha})`;
      ctx.fill();
    } else if (e.kind === 'spread') {
      ctx.beginPath();
      ctx.arc(x, y, SPREAD_R * k, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230,90,60,${0.3 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(230,120,60,${0.8 * alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, STACK_R * k, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110,220,140,${0.8 * alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // ---- clones (aim lines under the tokens)
  for (const c of eng.clones) {
    const [x, y] = P(c.pos);
    const [ax, ay] = P(c.aim);
    const ang = Math.atan2(ay - y, ax - x);
    ctx.strokeStyle = c.locked ? 'rgba(255,90,90,0.8)' : 'rgba(220,140,255,0.35)';
    ctx.lineWidth = c.locked ? 2 : 1.5;
    if (!c.locked) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * 1.1 * k, y + Math.sin(ang) * 1.1 * k);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const c of eng.clones) {
    const [x, y] = P(c.pos);
    const [ax, ay] = P(c.aim);
    const ang = Math.atan2(ay - y, ax - x);
    ctx.beginPath();
    ctx.arc(x, y, 1.1 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,40,120,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,140,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // facing chevron on the token edge
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(1.9 * k, 0);
    ctx.lineTo(1.15 * k, 0.5 * k);
    ctx.lineTo(1.15 * k, -0.5 * k);
    ctx.closePath();
    ctx.fillStyle = c.locked ? 'rgba(255,90,90,0.9)' : 'rgba(220,140,255,0.7)';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(240,200,255,0.95)';
    ctx.font = `700 ${0.9 * k}px system-ui, sans-serif`;
    ctx.fillText('K', x, y + 0.5);
  }

  // ---- players
  for (const s of SPOTS) {
    drawPlayer(ctx, eng, s, P, k, s === eng.userSpot, focus);
  }

  // ---- fail marks
  if (eng.result?.kind === 'fail') {
    const res = eng.result;

    // the AoE area that caused the fail, highlighted under the player marks
    if (res.zone) {
      ctx.beginPath();
      if (res.zone.kind === 'half') {
        const phi = Math.atan2(res.zone.dir.y, res.zone.dir.x) + viewRotRad;
        ctx.arc(cx, cy, R_ARENA * k, phi - Math.PI / 2, phi + Math.PI / 2);
        ctx.closePath();
      } else if (res.zone.kind === 'cone') {
        const [x, y] = P(res.zone.pos);
        const half = (CONE_HALF_DEG * Math.PI) / 180;
        const dir = res.zone.dirRad + viewRotRad;
        ctx.moveTo(x, y);
        ctx.arc(x, y, CONE_LEN * k, dir - half, dir + half);
        ctx.closePath();
      } else {
        const [x, y] = P(res.zone.pos);
        ctx.arc(x, y, res.zone.r * k, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(255,80,80,0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // players wrongly caught by the failing AoE
    ctx.strokeStyle = 'rgba(255,80,80,0.95)';
    ctx.lineWidth = 4;
    for (const s of res.hit ?? []) {
      const [x, y] = P(eng.positions[s]);
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
      const [x, y] = P(eng.positions[s]);
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

  ctx.restore();

  // rim
  ctx.beginPath();
  ctx.arc(cx, cy, R_ARENA * k, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,180,255,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // true-north marker outside the rim (only when the camera is rotated)
  if (Math.abs(viewRotRad) > 0.01) {
    const [nx, ny] = P({ x: 0, y: -(R_ARENA + 1.3) });
    ctx.fillStyle = 'rgba(200,180,255,0.8)';
    ctx.font = `700 ${1.0 * k}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  eng: SimEngine,
  s: Spot,
  P: (p: Vec2) => [number, number],
  k: number,
  isUser: boolean,
  focus: Spot | null,
): void {
  const [x, y] = P(eng.positions[s]);
  const color = ROLE_COLOR[roleOf(s)];

  ctx.beginPath();
  ctx.arc(x, y, 0.9 * k, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = isUser ? '#ffd75e' : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = isUser ? 3 : 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(10,8,16,0.95)';
  ctx.font = `700 ${0.62 * k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(s, x, y);

  // debuff icon above head (focus mode hides every icon except the user's and the focused bot's)
  const icon = focus === null || s === focus || isUser ? eng.icons[s] : null;
  const iy = y - 1.9 * k;
  if (icon === 'cone') {
    ctx.beginPath();
    ctx.moveTo(x, iy + 0.55 * k);
    ctx.arc(x, iy + 0.55 * k, 1.1 * k, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    ctx.closePath();
    ctx.fillStyle = '#e05252';
    ctx.fill();
  } else if (icon === 'spread') {
    ctx.beginPath();
    ctx.arc(x, iy, 0.55 * k, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0a052';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, iy, 0.18 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#e0a052';
    ctx.fill();
  } else if (icon === 'stack') {
    ctx.save();
    ctx.strokeStyle = '#6ee08c';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // chevron pointing at the icon center: apex leaves the middle empty,
      // wings reach back outward
      const ax = x + dx * 0.18 * k;
      const ay = iy + dy * 0.18 * k;
      const bx = ax + dx * 0.34 * k;
      const by = ay + dy * 0.34 * k;
      ctx.beginPath();
      ctx.moveTo(bx - dy * 0.26 * k, by + dx * 0.26 * k);
      ctx.lineTo(ax, ay);
      ctx.lineTo(bx + dy * 0.26 * k, by - dx * 0.26 * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Spell's Trouble pips — user only, below the token
  const pips = eng.stacksLeft[s];
  if (isUser && pips > 0) {
    ctx.fillStyle = '#c390f0';
    for (let i = 0; i < pips; i++) {
      const px = x - ((pips - 1) * 0.42 * k) / 2 + i * 0.42 * k;
      const py = y + 1.5 * k;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-0.14 * k, -0.14 * k, 0.28 * k, 0.28 * k);
      ctx.restore();
    }
  }
}
