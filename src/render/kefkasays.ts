import woundBlackUrl from '../assets/debuffs/wound-black.png';
import woundWhiteUrl from '../assets/debuffs/wound-white.png';
import { R_ARENA } from '../sim/core/constants';
import type { RF } from '../sim/core/engine';
import { compass } from '../sim/core/motion';
import type { Vec2 } from '../sim/core/types';
import { SPOTS } from '../sim/core/types';
import {
  DONUT_R_IN,
  DONUT_R_OUT,
  EDGE_HALFW,
  ICE_HALF_DEG,
  STRAY_FLAME_R,
  THUNDER_LANE_W,
} from '../sim/kefkasays/constants';
import type { KefkaEngine, Zone } from '../sim/kefkasays/engine';
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

// slide-6 tell colors, same language as the HUD cast-bar dots: solid blue = real, red "?" = fake
const REAL_ORB = '#4A90E2';
const FAKE_ORB = '#cf2621';
const FAKE_MARK = '#ffd75e';
const RING_STROKE = 'rgba(80, 200, 150, 0.85)';

/** the wound status icons shown beside the antilight orbs (this module is browser-only) */
const loadIcon = (src: string): HTMLImageElement => {
  const img = new Image();
  img.src = src;
  return img;
};
const WOUND_ICON = { white: loadIcon(woundWhiteUrl), black: loadIcon(woundBlackUrl) };

/**
 * one in-game-style tell ring around a caster: a green orbit ellipse carrying two orbs.
 * rx/ry are the ellipse radii and dy the vertical offset from the caster, all in world (k) units —
 * Kefka's dual-element casts stack two of these (top = lightning, bottom = ice).
 */
function drawTellRing(
  ctx: CanvasRenderingContext2D,
  proj: Proj,
  pos: Vec2,
  rf: RF,
  t: number,
  rx: number,
  ry: number,
  dy: number,
): void {
  const { P, k } = proj;
  const [x, y0] = P(pos);
  const y = y0 + dy * k;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2);
  ctx.strokeStyle = RING_STROKE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // spin direction doubles as a secondary cue, as before: real clockwise, fake counter-clockwise
  const spin = t * (rf === 'real' ? 1.6 : -1.6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${0.7 * k}px system-ui, sans-serif`;
  for (const phase of [0, Math.PI]) {
    const ox = x + Math.cos(spin + phase) * rx * k;
    const oy = y + Math.sin(spin + phase) * ry * k;
    ctx.beginPath();
    ctx.arc(ox, oy, 0.45 * k, 0, Math.PI * 2);
    ctx.fillStyle = rf === 'real' ? REAL_ORB : FAKE_ORB;
    ctx.fill();
    if (rf === 'fake') {
      ctx.fillStyle = FAKE_MARK;
      ctx.fillText('?', ox, oy + 0.03 * k);
    }
  }
  ctx.restore();
}

function zoneAlpha(z: { spawnT: number; hitT: number }, t: number): number {
  // telegraphs brighten as the hit approaches
  const frac = Math.min(1, Math.max(0, (t - z.spawnT) / (z.hitT - z.spawnT)));
  return 0.55 + 0.45 * frac;
}

function drawZone(ctx: CanvasRenderingContext2D, proj: Proj, z: Zone, t: number): void {
  const { P, k, rot } = proj;
  const real = z.rf === 'real';
  const a = zoneAlpha(z, t);
  const fill = real ? `rgba(235,200,70,${0.26 * a})` : `rgba(150,140,170,${0.14 * a})`;
  const edge = real ? `rgba(245,215,90,${0.8 * a})` : `rgba(160,150,185,${0.4 * a})`;

  ctx.beginPath();
  if (z.kind === 'thunder') {
    // the two hit lanes: perpendicular offsets [0,10] and [-20,-10] (constants.ts)
    const n = compass(z.axisDeg, 1);
    const u = compass(z.axisDeg + 90, 1);
    for (const [lo, hi] of [
      [0, THUNDER_LANE_W],
      [-2 * THUNDER_LANE_W, -THUNDER_LANE_W],
    ]) {
      const c = (p: number, q: number): [number, number] =>
        P({ x: n.x * p + u.x * q, y: n.y * p + u.y * q });
      const L = R_ARENA + 2;
      ctx.moveTo(...c(lo, -L));
      ctx.lineTo(...c(lo, L));
      ctx.lineTo(...c(hi, L));
      ctx.lineTo(...c(hi, -L));
      ctx.closePath();
    }
  } else {
    const [cx0, cy0] = P({ x: 0, y: 0 });
    const dir = ((z.aimDeg - 90) * Math.PI) / 180 + rot;
    const half = (ICE_HALF_DEG * Math.PI) / 180;
    ctx.moveTo(cx0, cy0);
    ctx.arc(cx0, cy0, (R_ARENA + 2) * k, dir - half, dir + half);
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = real ? 2 : 1.2;
  ctx.stroke();

  // a FAKE watermark so desaturation is never ambiguous
  if (!real) {
    const label =
      z.kind === 'thunder'
        ? { x: compass(z.axisDeg, 1).x * 5, y: compass(z.axisDeg, 1).y * 5 }
        : compass(z.aimDeg, 12);
    const [lx, ly] = proj.P(label);
    ctx.fillStyle = `rgba(200,190,230,${0.5 * a})`;
    ctx.font = `700 ${1.1 * k}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('FAKE', lx, ly);
  }
}

export function drawKefkaSays(
  ctx: CanvasRenderingContext2D,
  eng: KefkaEngine,
  cssSize: number,
  { viewRotRad, showHints, focus }: DrawOpts,
): void {
  const proj = makeProj(cssSize, viewRotRad);
  const { P, k, cx, cy } = proj;
  const t = eng.t;
  void focus;

  beginArena(ctx, proj, cssSize);

  // ---- antilight halves + kill laser (orb DISPLAY sides; a fake Flood swaps the hits)
  if (eng.antilightActive) {
    const { jumpDeg } = eng.antilight;
    const whiteOrbSign = eng.script.whiteSideSign;
    const m = compass(jumpDeg + 90, 1);
    for (const sign of [1, -1] as const) {
      const white = sign === whiteOrbSign;
      const phi = Math.atan2(m.y * sign, m.x * sign) + viewRotRad;
      ctx.beginPath();
      ctx.arc(cx, cy, R_ARENA * k, phi - Math.PI / 2, phi + Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = white ? 'rgba(240,240,255,0.16)' : 'rgba(30,10,60,0.42)';
      ctx.fill();
      // the orb beside Neo Exdeath announcing each side's color
      const orbPos = {
        x: compass(jumpDeg, R_ARENA - 3).x + m.x * sign * 4,
        y: compass(jumpDeg, R_ARENA - 3).y + m.y * sign * 4,
      };
      const [ox, oy] = P(orbPos);
      ctx.beginPath();
      ctx.arc(ox, oy, 1.1 * k, 0, Math.PI * 2);
      ctx.fillStyle = white ? 'rgba(245,245,255,0.95)' : 'rgba(25,8,50,0.95)';
      ctx.fill();
      ctx.strokeStyle = white ? 'rgba(180,180,220,0.9)' : 'rgba(150,110,220,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // the Wound this side's antilight applies — the bare orb colors alone are
      // hard to read on the tinted halves
      const icon = WOUND_ICON[white ? 'white' : 'black'];
      if (icon.complete && icon.naturalWidth > 0) {
        const iw = 1.8 * k;
        const ih = iw * (icon.naturalHeight / icon.naturalWidth);
        // upright in screen space, floating off the orb toward the arena center
        // so it stays inside the circle whatever the camera rotation
        const iy = oy > cy ? oy - 1.5 * k - ih : oy + 1.5 * k;
        ctx.drawImage(icon, ox - iw / 2, iy, iw, ih);
      }
    }
    // Edge of Death: the kill laser on the boundary diameter
    const a = compass(jumpDeg, 1);
    const laser = (p: number, q: number): [number, number] =>
      P({ x: a.x * q + m.x * p, y: a.y * q + m.y * p });
    ctx.beginPath();
    ctx.moveTo(...laser(-EDGE_HALFW, -R_ARENA - 1));
    ctx.lineTo(...laser(-EDGE_HALFW, R_ARENA + 1));
    ctx.lineTo(...laser(EDGE_HALFW, R_ARENA + 1));
    ctx.lineTo(...laser(EDGE_HALFW, -R_ARENA - 1));
    ctx.closePath();
    ctx.fillStyle = `rgba(255,70,110,${0.45 + 0.15 * Math.sin(t * 8)})`;
    ctx.fill();
  }

  // ---- telegraph zones
  for (const z of eng.zones) drawZone(ctx, proj, z, t);

  drawBossRings(ctx, proj);
  drawBossGlyph(ctx, proj, t);

  // ---- dropped twisters / donuts
  for (const d of eng.drops) {
    const [x, y] = P(d.pos);
    const urgency = 0.5 + 0.5 * Math.min(1, Math.max(0, 1 - (d.hitT - t) / 4));
    if (d.kind === 'twister') {
      ctx.beginPath();
      ctx.arc(x, y, STRAY_FLAME_R * k, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230,120,50,${0.16 * urgency})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(240,150,60,${0.8 * urgency})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, DONUT_R_OUT * k, 0, Math.PI * 2);
      ctx.arc(x, y, DONUT_R_IN * k, 0, Math.PI * 2, true);
      ctx.fillStyle = `rgba(70,140,230,${0.18 * urgency})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(90,160,240,${0.7 * urgency})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, DONUT_R_OUT * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, DONUT_R_IN * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- resolution flashes
  for (const e of eng.effects) {
    const alpha = Math.max(0, Math.min(1, (e.until - t) / 1.2));
    const [x, y] = P(e.pos);
    ctx.beginPath();
    ctx.arc(x, y, e.r * k, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(240,220,120,${0.8 * alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // ground fills that trim at the rim are done — everything from here on
  // (tokens, name labels, REAL/FAKE tells, gaze eyes) may poke past it
  releaseArenaClip(ctx);

  // ---- edge bosses (Chaos NW, Neo Exdeath at its jump spot)
  for (const boss of [
    { pos: eng.chaosPos, name: 'Chaos', color: 'rgba(220,110,70,0.9)' },
    { pos: eng.nePos, name: 'NeoEx', color: 'rgba(140,110,230,0.9)' },
  ]) {
    const [x, y] = P(boss.pos);
    ctx.beginPath();
    ctx.arc(x, y, 1.3 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14,10,20,0.9)';
    ctx.fill();
    ctx.strokeStyle = boss.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = boss.color;
    ctx.font = `700 ${0.62 * k}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(boss.name, x, y - 2.0 * k);
  }

  // tell rings around whoever is casting with a tell. Kefka's per-element casts (tells) stack
  // rings in fixed slots — top = lightning, bottom = ice — so a lone banked cast still reads;
  // single-rf casts (Grand Cross, Tsunami/Inferno, Flood) get one centered ring on their caster.
  for (const c of eng.castBars) {
    const kefka = c.caster !== 'Chaos' && c.caster !== 'Neo Exdeath';
    const pos = c.caster === 'Chaos' ? eng.chaosPos : kefka ? { x: 0, y: 0 } : eng.nePos;
    // Kefka's rings clear the 3.4k boss glyph; edge-boss rings hug the 1.3k token
    const [rx, ry] = kefka ? [3.0, 1.0] : [2.0, 0.7];
    if (c.tells) {
      if (c.tells.thunder) drawTellRing(ctx, proj, pos, c.tells.thunder, t, rx, ry, -1.3);
      if (c.tells.ice) drawTellRing(ctx, proj, pos, c.tells.ice, t, rx, ry, 1.3);
    } else if (c.rf) {
      drawTellRing(ctx, proj, pos, c.rf, t, rx, ry, 0);
    }
  }

  // ---- gaze eyes over the live shriek holders
  const gaze = eng.activeGaze;
  if (gaze) {
    for (const h of gaze.holders) {
      const [x, y] = P(eng.positions[h]);
      const ey = y - 2.1 * k;
      const w = 0.85 * k;
      ctx.beginPath();
      ctx.ellipse(x, ey, w, 0.5 * k, 0, 0, Math.PI * 2);
      ctx.fillStyle = gaze.rf === 'real' ? 'rgba(230,80,120,0.95)' : 'rgba(159,110,224,0.95)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, ey, 0.22 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#0e0a14';
      ctx.fill();
    }
  }

  // ---- players (facing chevrons on — gazes care)
  for (const s of SPOTS) {
    drawToken(ctx, proj, eng.positions[s], s, s === eng.userSpot, eng.facing[s]);
  }

  // ---- strat ghost: where the sim wants the user next (hints mode)
  if (showHints && !eng.result) {
    const target = eng.targets[eng.userSpot];
    const [x, y] = P(target);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, 1.3 * k, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,90,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (eng.result?.kind === 'fail') drawFailOverlay(ctx, proj, eng.result, eng.positions);

  finishArena(ctx, proj);
}
