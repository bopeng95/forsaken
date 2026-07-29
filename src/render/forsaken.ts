import { R_ARENA } from '../sim/core/constants';
import { compass } from '../sim/core/motion';
import type { Spot } from '../sim/core/types';
import { SPOTS } from '../sim/core/types';
import {
  CONE_HALF_DEG,
  CONE_LEN,
  ICON_SHOW_T,
  R_TOWER,
  SPREAD_R,
  STACK_R,
  WAYMARK_LETTER_R,
  WAYMARK_NUM_HALF,
  WAYMARK_NUM_R,
  WAYMARK_R,
} from '../sim/forsaken/constants';
import type { SimEngine } from '../sim/forsaken/engine';
import {
  beginArena,
  drawBossGlyph,
  drawBossRings,
  drawFailOverlay,
  drawToken,
  finishArena,
  makeProj,
  releaseArenaClip,
  type Proj,
} from './common';
import type { DrawOpts } from './draw';

/** seconds for bots to fade out/in around the blind-bait window */
const BAIT_FADE_T = 0.25;

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

export function drawForsaken(
  ctx: CanvasRenderingContext2D,
  eng: SimEngine,
  cssSize: number,
  { viewRotRad, showHints, focus, blindBait, persistIcons }: DrawOpts,
): void {
  const proj = makeProj(cssSize, viewRotRad);
  const { P, k, cx, cy } = proj;
  const t = eng.t;

  beginArena(ctx, proj, cssSize);

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

  drawBossRings(ctx, proj);
  drawBossGlyph(ctx, proj, t);

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
    }
  }

  // ---- bait marker (strat guidance — hidden unless hints are on)
  if (eng.baitMarker && showHints && !blindBait) {
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

  // ground fills that trim at the rim are done — everything from here on
  // (clone/player tokens, labels, debuff icons) may poke past it
  releaseArenaClip(ctx);

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
  // blind bait: bots fade out for the whole bait window (they still walk to the
  // bait spot unseen, so they fade back in already stacked there at the lock)
  let botAlpha = 1;
  if (blindBait) {
    if (eng.baitMarker && eng.baitStartT !== null) {
      botAlpha = Math.max(0, 1 - (eng.t - eng.baitStartT) / BAIT_FADE_T);
    } else if (eng.baitEndT !== null) {
      botAlpha = Math.min(1, (eng.t - eng.baitEndT) / BAIT_FADE_T);
    }
  }
  for (const s of SPOTS) {
    const isUser = s === eng.userSpot;
    if (!isUser && botAlpha <= 0) continue;
    if (!isUser && botAlpha < 1) ctx.globalAlpha = botAlpha;
    drawPlayer(ctx, eng, s, proj, isUser, focus, persistIcons);
    ctx.globalAlpha = 1;
  }

  if (eng.result?.kind === 'fail') drawFailOverlay(ctx, proj, eng.result, eng.positions);

  finishArena(ctx, proj);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  eng: SimEngine,
  s: Spot,
  proj: Proj,
  isUser: boolean,
  focus: Spot | null,
  persistIcons: boolean,
): void {
  const { P, k } = proj;
  const [x, y] = P(eng.positions[s]);

  drawToken(ctx, proj, eng.positions[s], s, isUser);

  // debuff icon above head (focus mode hides every icon except the user's and the focused bot's)
  let icon = focus === null || s === focus || isUser ? eng.icons[s] : null;
  // like the real fight, each icon only shows for ICON_SHOW_T after (re)assignment
  // (unless the "display debuff indefinitely" option is on)
  let iconAlpha = 1;
  if (!persistIcons && icon) {
    iconAlpha = Math.min(1, Math.max(0, 1 - (eng.t - eng.iconSetAt[s] - ICON_SHOW_T) / BAIT_FADE_T));
    if (iconAlpha <= 0) icon = null;
  }
  const prevAlpha = ctx.globalAlpha;
  if (iconAlpha < 1) ctx.globalAlpha = prevAlpha * iconAlpha;
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
  ctx.globalAlpha = prevAlpha;

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
