import type { RF } from '../core/engine';
import { BaseEngine } from '../core/engine';
import { compass, dist } from '../core/motion';
import { R_ARENA } from '../core/constants';
import type { FailZone, Spot, Vec2 } from '../core/types';
import { SPOTS } from '../core/types';
import {
  buildAntilightPlan,
  buildGazeShortPlan,
  buildGazeLongPlan,
  buildWindowPlan,
  escapeRing,
  DROP_CLUSTER,
  OPENING_RING,
  type AntilightPlan,
  type GazePlan,
  type WindowPlan,
} from './assignments';
import {
  ACCEL_ARM,
  ACCEL_EXPIRE,
  ANTILIGHT_HIT_T,
  ANTILIGHT_T,
  CHAOS_CAST,
  CHAOS_T,
  CLEAR_T,
  DEATH_SURGE_T,
  DONUT_R_IN,
  DONUT_R_OUT,
  EDGE_HALFW,
  ENTROPY_APPLY_T,
  ENTROPY_DUR,
  FINAL_MM_T,
  FLOOD_CAST,
  FLUID_APPLY_T,
  FLUID_DUR,
  GAZE_AT_COS,
  GAZE_AWAY_DOT,
  GAZE_EXPIRE,
  GC_APPLY,
  GC_CAST,
  GC_T,
  ICE_HALF_DEG,
  ICE_LEN,
  KEFKA_SAYS_CAST,
  KEFKA_SAYS_T,
  MANA_CHARGE_CAST,
  MANA_CHARGE_T,
  MANA_RELEASE_CAST,
  MANA_RELEASE_T,
  MM_CAST,
  MM_HIT_DELAY,
  MM_T,
  NE_JUMP_CAST,
  NE_JUMP_T,
  P4_TRIM,
  REC_ICE_T,
  REC_THUNDER_T,
  SPREAD8_R,
  STACK8_R,
  STACKSPREAD_T,
  STILL_EPS,
  MOTION_MIN,
  STRAY_FLAME_R,
  STRAY_FLAMES_T,
  STRAY_SPRAY_T,
  THUNDER_LANE_W,
  UPSURGE_CAST,
  UPSURGE_T,
} from './constants';
import { accelOf, markOf, markWindowOf, shriekOf } from './randomizer';
import type { KefkaScript, MmPattern, WindowKey } from './types';
import { combineRF, spreadElem } from './types';

// ---- Telegraph zones -----------------------------------------------------

/** the two-lane Thrumming Thunder pattern (see MmPattern in types.ts) */
export interface ThunderZone {
  kind: 'thunder';
  axisDeg: number;
  rf: RF;
  spawnT: number;
  hitT: number;
}

/** one Blizzard quadrant cleave from the arena center */
export interface IceZone {
  kind: 'ice';
  aimDeg: number;
  rf: RF;
  spawnT: number;
  hitT: number;
}

export type Zone = ThunderZone | IceZone;

export interface Drop {
  kind: 'twister' | 'donut';
  owner: Spot;
  pos: Vec2;
  hitT: number;
}

/** a debuff chip for the HUD tray (derived, not mutated state) */
export interface HeldDebuff {
  kind:
    | 'water'
    | 'lightning'
    | 'shriek'
    | 'accel'
    | 'entropy'
    | 'fluid'
    | 'wound'
    | 'allagan'
    | 'beyond';
  rf: RF;
  /** sim time it resolves */
  expiresAt: number;
  window?: WindowKey;
  /** wound color for 'wound' chips */
  color?: 'white' | 'black';
}

type EventKind =
  | 'setup'
  | 'mmSpawn'
  | 'mmResolve'
  | 'gcApply'
  | 'neJump'
  | 'antilightShow'
  | 'antilightHit'
  | 'deathSurge'
  | 'accelArm'
  | 'accelCheck'
  | 'stackSpread'
  | 'recThunderSpawn'
  | 'recThunderResolve'
  | 'gazePose'
  | 'gazeCheck'
  | 'toDrop'
  | 'entropyDrop'
  | 'entropyResolve'
  | 'recIceSpawn'
  | 'recIceResolve'
  | 'fluidDrop'
  | 'finalMmSpawn'
  | 'fluidResolve'
  | 'finalMmResolve'
  | 'upsurgeHit'
  | 'clear';

interface KefkaEvent {
  t: number;
  kind: EventKind;
  /** MM set index, gc index, or window per kind */
  arg?: number | WindowKey;
}

const GRACE = 0.15;

/** signed offset of p along the thunder pattern normal */
function thunderPerp(p: Vec2, axisDeg: number): number {
  const n = compass(axisDeg, 1);
  return p.x * n.x + p.y * n.y;
}

/**
 * is p under the hit lanes (offsets [0, 10] and [-20, -10], see constants.ts)?
 * pad < 0 shrinks the lanes (the real-hit check grants GRACE margin); pad > 0
 * grows them (the fake-safety check forgives standing on the very lane edge).
 */
function inThunderLanes(p: Vec2, axisDeg: number, pad: number): boolean {
  const d = thunderPerp(p, axisDeg);
  return (
    (d > -pad && d < THUNDER_LANE_W + pad) ||
    (d > -2 * THUNDER_LANE_W - pad && d < -THUNDER_LANE_W + pad)
  );
}

/** unsigned angular distance in degrees */
function angDiff(aDeg: number, bDeg: number): number {
  const d = Math.abs(aDeg - bDeg) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * quadrant cleave from the center: strict comparison so the cardinal seams
 * between quadrants are safe — the strat parks stacks/spreads exactly on them
 */
function iceHit(p: Vec2, aimDeg: number): boolean {
  const r = Math.hypot(p.x, p.y);
  if (r < 0.01 || r > ICE_LEN) return false;
  const bearing = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
  return angDiff(bearing, aimDeg) < ICE_HALF_DEG - 0.5;
}

/**
 * fake-ice coverage: a FAKE Blizzard inverts — it hits everywhere EXCEPT its
 * quadrants, so being covered by one is what saves you. Closed comparison with
 * the same 0.5° slack on the safe side: a cardinal seam counts as covered by
 * an adjacent fake quadrant, so the strat's seam parking survives either roll.
 */
function iceCovers(p: Vec2, aimDeg: number): boolean {
  const r = Math.hypot(p.x, p.y);
  if (r > ICE_LEN) return false;
  if (r < 0.01) return true; // every quadrant's tip
  const bearing = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
  return angDiff(bearing, aimDeg) <= ICE_HALF_DEG + 0.5;
}

/** the real-hit test: the telegraph hits exactly what it shows */
function zoneHit(p: Vec2, z: Zone): boolean {
  return z.kind === 'thunder' ? inThunderLanes(p, z.axisDeg, -GRACE) : iceHit(p, z.aimDeg);
}

/** ice quadrant aims for a pattern: pair 0 = NE+SW, pair 1 = SE+NW */
function iceAims(pat: MmPattern): Array<{ aimDeg: number; rf: (iceRf: RF) => RF }> {
  const chosen = pat.icePair === 0 ? [45, 225] : [135, 315];
  const other = pat.icePair === 0 ? [135, 315] : [45, 225];
  const out = chosen.map((aimDeg) => ({ aimDeg, rf: (iceRf: RF) => iceRf }));
  if (pat.bothIcePairs) {
    out.push(
      ...other.map((aimDeg) => ({
        aimDeg,
        rf: (iceRf: RF): RF => (iceRf === 'real' ? 'fake' : 'real'),
      })),
    );
  }
  return out;
}

export class KefkaEngine extends BaseEngine<KefkaEvent> {
  readonly mechanicId = 'kefkasays' as const;
  readonly script: KefkaScript;

  readonly windowPlans: Record<WindowKey, WindowPlan>;
  readonly gazeShort: GazePlan;
  readonly gazeLong: GazePlan;
  readonly antilight: AntilightPlan;

  /** live telegraph zones (thunder lane pairs / ice quadrants) */
  zones: Zone[] = [];
  /** the antilight halves + kill laser are showing (antilightShow..Hit) */
  antilightActive = false;
  /** dropped twister circles / donut rings */
  drops: Drop[] = [];
  /** Neo Exdeath's edge position (jumps before Flood of Naught); Chaos sits NW */
  nePos: Vec2;
  chaosPos: Vec2;
  /** HUD phase label */
  phaseLabel = 'Kefka Says';
  /** flash effects at resolutions: {pos, r, until} circles */
  effects: Array<{ pos: Vec2; r: number; until: number }> = [];

  /** the two rings Kefka displays from Mana Release until the final dodge resolves */
  get manaRings(): { thunder: RF; ice: RF } | null {
    const t0 = MANA_RELEASE_T - P4_TRIM;
    const t1 = FINAL_MM_T + MM_CAST + MM_HIT_DELAY - P4_TRIM;
    return this.t >= t0 && this.t < t1
      ? { thunder: this.script.ringThunder, ice: this.script.ringIce }
      : null;
  }

  /** active gaze facing rule for bots + the check */
  private gazeRule: { plan: GazePlan; rf: RF } | null = null;

  /** the live gaze (shriek holders + tell), for the renderer's eye icons */
  get activeGaze(): { holders: [Spot, Spot]; rf: RF } | null {
    return this.gazeRule ? { holders: this.gazeRule.plan.holders, rf: this.gazeRule.rf } : null;
  }
  /** stillness/motion accumulation for the armed accel window */
  private armWindow: WindowKey | null = null;
  private armAccum = {} as Record<Spot, number>;
  private wiggleBase = {} as Record<Spot, Vec2>;
  private prevPos = {} as Record<Spot, Vec2>;

  constructor(script: KefkaScript, userSpot: Spot) {
    super(userSpot, OPENING_RING);
    this.script = script;
    this.windowPlans = {
      short: buildWindowPlan(script, 'short'),
      long: buildWindowPlan(script, 'long'),
    };
    this.gazeShort = buildGazeShortPlan(script);
    this.gazeLong = buildGazeLongPlan(script);
    this.antilight = buildAntilightPlan(script);
    this.nePos = compass(45, R_ARENA - 1);
    this.chaosPos = compass(315, R_ARENA - 1);
    for (const s of SPOTS) this.prevPos[s] = { ...this.positions[s] };

    const st = (logT: number) => logT - P4_TRIM;
    const push = (t: number, kind: EventKind, arg?: number | WindowKey) =>
      this.timeline.push({ t: st(t), kind, arg });
    const seg = (
      t0: number,
      t1: number,
      label: string,
      caster?: string,
      rf?: RF,
      tells?: { thunder?: RF; ice?: RF },
    ) => this.castSegs.push({ t0: st(t0), t1: st(t1), label, caster, rf, tells });

    // ---- cast bars (times + casters from the FFLogs cast log)
    seg(KEFKA_SAYS_T, KEFKA_SAYS_T + KEFKA_SAYS_CAST, 'Kefka Says', 'Kefka');
    for (let i = 0; i < 3; i++) {
      seg(MM_T[i], MM_T[i] + MM_CAST, `Mystery Magic ${i + 1}`, 'Kefka', undefined, {
        thunder: script.mm[i].thunder,
        ice: script.mm[i].ice,
      });
      seg(
        GC_T[i],
        GC_T[i] + GC_CAST,
        `Grand Cross ${i + 1}`,
        'Neo Exdeath',
        i < 2 ? this.script.gc[i as 0 | 1].rf : undefined,
      );
    }
    for (let i = 0; i < 2; i++) {
      const kind = script.chaosOrder[i];
      seg(
        CHAOS_T[i],
        CHAOS_T[i] + CHAOS_CAST,
        kind === 'tsunami' ? 'Tsunami' : 'Inferno',
        'Chaos',
        kind === 'tsunami' ? script.tsunamiRF : script.infernoRF,
      );
    }
    seg(ANTILIGHT_T, ANTILIGHT_T + FLOOD_CAST, 'Flood of Naught', 'Neo Exdeath', script.floodRF);
    seg(MANA_CHARGE_T, MANA_CHARGE_T + MANA_CHARGE_CAST, 'Mana Charge', 'Kefka');
    seg(
      REC_THUNDER_T,
      REC_THUNDER_T + MM_CAST,
      'Thrumming Thunder III — REMEMBER!',
      'Kefka',
      undefined,
      { thunder: script.bankedThunder },
    );
    seg(UPSURGE_T[0], UPSURGE_T[0] + UPSURGE_CAST, 'Ultima Upsurge', 'Kefka');
    seg(STRAY_FLAMES_T, STRAY_FLAMES_T + MM_CAST, 'Stray Flames', 'Chaos');
    seg(
      REC_ICE_T,
      REC_ICE_T + MM_CAST,
      'Blizzard III Blowout — REMEMBER!',
      'Kefka',
      undefined,
      { ice: script.bankedIce },
    );
    seg(MANA_RELEASE_T, MANA_RELEASE_T + MANA_RELEASE_CAST, 'Mana Release', 'Kefka');
    seg(STRAY_SPRAY_T, STRAY_SPRAY_T + MM_CAST, 'Stray Spray', 'Chaos');
    seg(UPSURGE_T[1], UPSURGE_T[1] + UPSURGE_CAST, 'Ultima Upsurge', 'Kefka');

    // ---- event timeline (push order breaks equal-time ties)
    push(P4_TRIM, 'setup'); // sim t=0
    for (let i = 0; i < 3; i++) {
      push(MM_T[i], 'mmSpawn', i);
      push(MM_T[i] + MM_CAST + MM_HIT_DELAY, 'mmResolve', i);
      push(GC_APPLY[i], 'gcApply', i);
    }
    push(NE_JUMP_T + NE_JUMP_CAST, 'neJump');
    push(ANTILIGHT_T, 'antilightShow');
    push(ANTILIGHT_HIT_T, 'antilightHit');
    push(DEATH_SURGE_T, 'deathSurge');
    for (const w of ['short', 'long'] as const) {
      push(ACCEL_EXPIRE[w] - ACCEL_ARM, 'accelArm', w);
      push(ACCEL_EXPIRE[w], 'accelCheck', w);
      push(STACKSPREAD_T[w], 'stackSpread', w);
      push(GAZE_EXPIRE[w], 'gazeCheck', w);
    }
    push(REC_THUNDER_T, 'recThunderSpawn');
    push(REC_THUNDER_T + MM_CAST + MM_HIT_DELAY, 'recThunderResolve');
    push(GAZE_EXPIRE.long - 4.5, 'gazePose', 'long');
    push(UPSURGE_T[0] + UPSURGE_CAST, 'upsurgeHit');
    push(STRAY_FLAMES_T, 'entropyDrop');
    push(STRAY_FLAMES_T + MM_CAST + MM_HIT_DELAY, 'entropyResolve');
    push(REC_ICE_T, 'recIceSpawn');
    push(REC_ICE_T + MM_CAST + MM_HIT_DELAY, 'recIceResolve');
    push(STRAY_SPRAY_T, 'fluidDrop');
    push(FINAL_MM_T, 'finalMmSpawn');
    push(STRAY_SPRAY_T + MM_CAST + MM_HIT_DELAY, 'fluidResolve');
    push(FINAL_MM_T + MM_CAST + MM_HIT_DELAY, 'finalMmResolve');
    push(CLEAR_T, 'clear');
    this.timeline.sort((a, b) => a.t - b.t);

    const win = markWindowOf(script, userSpot);
    this.hint = `You are ${userSpot}. Watch each cast's orb ring: FAKE reverses the effect. Your water/lightning mark resolves in the ${win.toUpperCase()} window.`;
  }

  // ---- derived debuff tray (pure function of script + sim time) ----------

  debuffsOf(spot: Spot): HeldDebuff[] {
    const t = this.t;
    const st = (logT: number) => logT - P4_TRIM;
    const out: HeldDebuff[] = [];
    const script = this.script;

    const mark = markOf(script, spot);
    const markWin = markWindowOf(script, spot);
    const markGc = script.gc[mark.gcIdx];
    if (t >= st(GC_APPLY[mark.gcIdx]) && t < st(STACKSPREAD_T[markWin])) {
      out.push({
        kind: mark.elem === 'water' ? 'water' : 'lightning',
        rf: markGc.rf,
        expiresAt: st(STACKSPREAD_T[markWin]),
        window: markWin,
      });
    }
    const shriek = shriekOf(script, spot);
    if (shriek !== null) {
      const w: WindowKey = shriek === 0 ? 'short' : 'long';
      if (t >= st(GC_APPLY[shriek]) && t < st(GAZE_EXPIRE[w])) {
        out.push({
          kind: 'shriek',
          rf: script.gc[shriek].rf,
          expiresAt: st(GAZE_EXPIRE[w]),
          window: w,
        });
      }
    }
    const accel = accelOf(script, spot);
    if (t >= st(GC_APPLY[accel.gcIdx]) && t < st(ACCEL_EXPIRE[accel.window])) {
      out.push({
        kind: 'accel',
        rf: script.gc[accel.gcIdx].rf,
        expiresAt: st(ACCEL_EXPIRE[accel.window]),
        window: accel.window,
      });
    }
    if (t >= st(ENTROPY_APPLY_T) && t < st(ENTROPY_APPLY_T + ENTROPY_DUR)) {
      out.push({ kind: 'entropy', rf: script.infernoRF, expiresAt: st(ENTROPY_APPLY_T + ENTROPY_DUR) });
    }
    if (t >= st(FLUID_APPLY_T) && t < st(FLUID_APPLY_T + FLUID_DUR)) {
      out.push({ kind: 'fluid', rf: script.tsunamiRF, expiresAt: st(FLUID_APPLY_T + FLUID_DUR) });
    }
    if (t >= st(GC_APPLY[2]) && t < st(DEATH_SURGE_T)) {
      out.push({
        kind: 'wound',
        rf: 'real',
        expiresAt: st(ANTILIGHT_HIT_T),
        color: script.wounds[spot],
      });
      out.push({
        kind: script.allagan.includes(spot) ? 'allagan' : 'beyond',
        rf: 'real',
        expiresAt: st(ANTILIGHT_HIT_T),
      });
    }
    return out.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  /** the facing a correctly-playing bot holds right now (used for user autopilot too) */
  idealFacing(spot: Spot): Vec2 | null {
    if (!this.gazeRule) return null;
    const { plan, rf } = this.gazeRule;
    const p = this.positions[spot];
    const isHolder = plan.holders.includes(spot);
    if (rf === 'real') {
      // radially outward clears every center-parked holder
      const r = Math.hypot(p.x, p.y) || 1;
      return { x: p.x / r, y: p.y / r };
    }
    const target = isHolder
      ? this.positions[plan.holders.find((h) => h !== spot)!]
      : this.positions[
          plan.holders.reduce((a, b) =>
            dist(p, this.positions[a]) <= dist(p, this.positions[b]) ? a : b,
          )
        ];
    const d = dist(p, target) || 1;
    return { x: (target.x - p.x) / d, y: (target.y - p.y) / d };
  }

  protected afterMove(): void {
    // bots hold the gaze-correct facing during a live gaze window
    if (this.gazeRule) {
      for (const s of SPOTS) {
        if (s === this.userSpot) continue;
        const f = this.idealFacing(s);
        if (f) this.facing[s] = f;
      }
    }
    // stillness/motion accumulation + fake-bomb wiggle targets
    if (this.armWindow) {
      const w = this.armWindow;
      for (const s of SPOTS) {
        const acc = accelOf(this.script, s);
        if (acc.window !== w) continue;
        this.armAccum[s] += dist(this.positions[s], this.prevPos[s]);
        if (this.script.gc[acc.gcIdx].rf === 'fake') {
          // fake bomb = MOTION: nudge the walk target back and forth
          const phase = Math.floor((this.t * 4) % 2);
          const base = this.wiggleBase[s];
          this.targets[s] = { x: base.x + (phase ? 0.5 : -0.5), y: base.y };
        }
      }
    }
    for (const s of SPOTS) this.prevPos[s] = { ...this.positions[s] };
  }

  protected afterEvents(): void {
    this.effects = this.effects.filter((e) => e.until > this.t);
  }

  // checkpoints stay the BaseEngine default (cast starts): every lethal check
  // sits 0.7–6s after one, and the tight long-gaze case works because gazePose
  // re-fires after a rewind (chained rewinds reach recorded Ice if needed)
  protected snapFields(): Record<string, unknown> {
    return {
      ...super.snapFields(),
      zones: this.zones,
      antilightActive: this.antilightActive,
      drops: this.drops,
      nePos: this.nePos,
      chaosPos: this.chaosPos,
      phaseLabel: this.phaseLabel,
      effects: this.effects,
      gazeRule: this.gazeRule, // .plan is plain immutable data — a clone is equivalent
      armWindow: this.armWindow,
      armAccum: this.armAccum, // mid-window accumulation restores consistently with prevPos
      wiggleBase: this.wiggleBase,
      prevPos: this.prevPos,
    };
  }

  // ---- helpers -----------------------------------------------------------

  private fakeIceZones(): IceZone[] {
    return this.zones.filter((z): z is IceZone => z.kind === 'ice' && z.rf === 'fake');
  }

  /** dead ground right now: inside a REAL zone, or outside a FAKE one (fakes invert) */
  private safeAt(p: Vec2): boolean {
    for (const z of this.zones) {
      if (z.rf === 'real' && zoneHit(p, z)) return false;
      if (z.rf === 'fake' && z.kind === 'thunder' && !inThunderLanes(p, z.axisDeg, GRACE)) {
        return false;
      }
    }
    const fakeIce = this.fakeIceZones();
    return fakeIce.length === 0 || fakeIce.some((z) => iceCovers(p, z.aimDeg));
  }

  /** nearest safe point to an anchor, searched over small radial/angular offsets */
  private nudgeSafe(anchor: Vec2): Vec2 {
    if (this.safeAt(anchor)) return anchor;
    const r0 = Math.hypot(anchor.x, anchor.y);
    const a0 = Math.atan2(anchor.x, -anchor.y);
    for (let dAng = 0; dAng <= 180; dAng += 7.5) {
      for (const sign of dAng === 0 ? [1] : [1, -1]) {
        for (const dr of [0, -2, 2, -4, 4]) {
          const r = Math.min(Math.max(r0 + dr, 4.2), R_ARENA - 1);
          const a = ((a0 * 180) / Math.PI + dAng * sign) as number;
          const p = compass(a, r);
          if (this.safeAt(p)) return p;
        }
      }
    }
    return anchor; // no safe spot found — the pattern rolls guarantee one exists
  }

  /** send every bot to its duty, nudged onto safe ground (out of real telegraphs, into fake ones) */
  private retarget(duties: Record<Spot, { pos: Vec2 }>): void {
    for (const s of SPOTS) this.targets[s] = this.nudgeSafe(duties[s].pos);
  }

  private retargetPositions(pos: Record<Spot, Vec2>): void {
    for (const s of SPOTS) this.targets[s] = this.nudgeSafe(pos[s]);
  }

  private spawnPattern(
    pat: MmPattern,
    thunderRf: RF | null,
    iceRf: RF | null,
    hitT: number,
    nudge = true,
  ): void {
    if (thunderRf !== null) {
      this.zones.push({ kind: 'thunder', axisDeg: pat.thunderAxisDeg, rf: thunderRf, spawnT: this.t, hitT });
    }
    if (iceRf !== null) {
      for (const aim of iceAims(pat)) {
        this.zones.push({ kind: 'ice', aimDeg: aim.aimDeg, rf: aim.rf(iceRf), spawnT: this.t, hitT });
      }
    }
    // everyone sidesteps into safe ground without abandoning their anchors
    // (skipped when the strat is mid-donut: the roll keeps the hole safe)
    if (nudge) for (const s of SPOTS) this.targets[s] = this.nudgeSafe(this.targets[s]);
  }

  /**
   * check every player against the live zones: REAL zones hit anyone inside
   * them; FAKE zones invert and hit anyone OUTSIDE the telegraphed area
   */
  private resolveZones(what: string): void {
    const user = this.userSpot;
    for (const z of this.zones) {
      if (z.rf !== 'real') continue;
      const hits = SPOTS.filter((s) => zoneHit(this.positions[s], z));
      if (hits.length === 0) continue;
      const zone: FailZone =
        z.kind === 'ice'
          ? this.iceFailZone(z.aimDeg)
          : this.thunderStripe(z, thunderPerp(this.positions[user], z.axisDeg) > 0 ? 0.5 : -1.5);
      this.fail(
        hits.includes(user)
          ? {
              reason: `You were hit by the REAL ${what} — check the orb ring on the cast: real telegraphs hit inside, fake ones hit everywhere OUTSIDE.`,
              ghost: this.nudgeSafe(this.positions[user]),
              hit: hits,
              zone,
            }
          : {
              reason: `${hits.join(', ')} stood in the real ${what}.`,
              hit: hits,
              zone,
            },
      );
      return;
    }

    // fake thunder inverts: only the marked lanes are safe ground
    for (const z of this.zones) {
      if (z.kind !== 'thunder' || z.rf !== 'fake') continue;
      const hits = SPOTS.filter((s) => !inThunderLanes(this.positions[s], z.axisDeg, GRACE));
      if (hits.length === 0) continue;
      const ref = hits.includes(user) ? user : hits[0];
      const d = thunderPerp(this.positions[ref], z.axisDeg);
      const zone = this.thunderStripe(z, d > THUNDER_LANE_W ? 1.5 : -0.5);
      this.fail(
        hits.includes(user)
          ? {
              reason: `The FAKE ${what} inverts — it hit everything OUTSIDE the marked thunder lanes. Stand inside a fake lane.`,
              ghost: this.nudgeSafe(this.positions[user]),
              hit: hits,
              zone,
            }
          : {
              reason: `${hits.join(', ')} stood outside the fake thunder lanes (fakes invert).`,
              hit: hits,
              zone,
            },
      );
      return;
    }

    // fake ice inverts: safe only inside the union of the fake quadrants
    const fakeIce = this.fakeIceZones();
    if (fakeIce.length > 0) {
      const hits = SPOTS.filter(
        (s) => !fakeIce.some((z) => iceCovers(this.positions[s], z.aimDeg)),
      );
      if (hits.length > 0) {
        const p = this.positions[hits.includes(user) ? user : hits[0]];
        // the un-telegraphed quadrant the victim actually stood in
        const bearing = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
        const aim = [45, 135, 225, 315].reduce((a, b) =>
          angDiff(bearing, b) < angDiff(bearing, a) ? b : a,
        );
        const zone = this.iceFailZone(aim);
        this.fail(
          hits.includes(user)
            ? {
                reason: `The FAKE ${what} inverts — only the marked ice quadrants are safe, and you stood outside them.`,
                ghost: this.nudgeSafe({ ...p }),
                hit: hits,
                zone,
              }
            : {
                reason: `${hits.join(', ')} stood outside the fake ice quadrants (fakes invert).`,
                hit: hits,
                zone,
              },
        );
        return;
      }
    }
    this.zones = [];
  }

  private iceFailZone(aimDeg: number): FailZone {
    return {
      kind: 'cone',
      pos: { x: 0, y: 0 },
      dirRad: ((aimDeg - 90) * Math.PI) / 180,
      halfRad: (ICE_HALF_DEG * Math.PI) / 180,
      len: ICE_LEN,
    };
  }

  /** one lane-width stripe of a thunder pattern (center in lane-width units) as a drawable fail zone */
  private thunderStripe(z: ThunderZone, centerLanes: number): FailZone {
    const lane = centerLanes * THUNDER_LANE_W;
    const n = compass(z.axisDeg, 1);
    const u = compass(z.axisDeg + 90, 1);
    return {
      kind: 'line',
      pos: { x: n.x * lane - u.x * 20, y: n.y * lane - u.y * 20 },
      dirRad: Math.atan2(u.y, u.x),
      halfWidth: THUNDER_LANE_W / 2,
      len: 40,
    };
  }

  // ---- the timeline ------------------------------------------------------

  protected handle(ev: KefkaEvent): void {
    const script = this.script;
    const st = (logT: number) => logT - P4_TRIM;
    switch (ev.kind) {
      case 'setup': {
        this.phaseLabel = 'Kefka Says';
        this.retargetPositions(OPENING_RING);
        break;
      }

      case 'mmSpawn': {
        const i = ev.arg as number;
        this.phaseLabel = `Debuffs ${i + 1}/3`;
        const roll = script.mm[i];
        this.spawnPattern(script.mmPattern[i], roll.thunder, roll.ice, st(MM_T[i] + MM_CAST + MM_HIT_DELAY));
        this.hint = `Mystery Magic ${i + 1}: THUNDER lanes are ${roll.thunder.toUpperCase()}, ICE quadrants ${roll.ice.toUpperCase()} — dodge the real, stand INSIDE the fake (fakes hit everything outside them).`;
        break;
      }
      case 'mmResolve': {
        this.resolveZones('Mystery Magic telegraph');
        if (this.result) return;
        this.retargetPositions(OPENING_RING);
        break;
      }

      case 'gcApply': {
        const i = ev.arg as number;
        if (i < 2) {
          const g = script.gc[i as 0 | 1];
          const mine =
            g.water.includes(this.userSpot) || g.lightning.includes(this.userSpot)
              ? markOf(script, this.userSpot)
              : null;
          const parts: string[] = [`Grand Cross ${i + 1} (${g.rf.toUpperCase()}) debuffs are out.`];
          if (mine && mine.gcIdx === i) {
            const win = markWindowOf(script, this.userSpot);
            const spreads = spreadElem(g.rf) === mine.elem;
            parts.push(
              `Your ${mine.elem.toUpperCase()} (${win}) will ${spreads ? 'SPREAD — W/E max melee' : 'STACK — N/S with your role'}.`,
            );
          }
          if (g.shriek.includes(this.userSpot)) {
            parts.push(`You have the ${i === 0 ? 'SHORT' : 'LONG'} SHRIEK — go under the boss when it's time.`);
          }
          if (g.accelShort.includes(this.userSpot) || g.accelLong.includes(this.userSpot)) {
            const acc = accelOf(script, this.userSpot);
            parts.push(
              `Accel bomb (${acc.window}): ${g.rf === 'real' ? 'FREEZE' : 'KEEP MOVING'} when it expires.`,
            );
          }
          this.hint = parts.join(' ');
        } else {
          const wound = script.wounds[this.userSpot];
          const af = script.allagan.includes(this.userSpot);
          this.hint = `${wound.toUpperCase()} Wound + ${af ? 'ALLAGAN FIELD: you must take the OPPOSITE color' : 'BEYOND DEATH: you must take YOUR color'} (${af ? (wound === 'white' ? 'black' : 'white') : wound}).`;
        }
        break;
      }

      case 'neJump': {
        this.phaseLabel = 'Flood of Naught';
        this.nePos = compass(script.neJumpDeg, R_ARENA - 1);
        break;
      }
      case 'antilightShow': {
        this.antilightActive = true;
        this.retarget(this.antilight.duties);
        const need = this.antilight.needed[this.userSpot];
        this.hint = `Flood of Naught is ${script.floodRF.toUpperCase()}${script.floodRF === 'fake' ? ' — the orb colors LIE (sides swap)' : ''}. Get hit by ${need.color.toUpperCase()}, stay off the middle laser!`;
        break;
      }
      case 'antilightHit': {
        this.resolveAntilight();
        if (this.result) return;
        this.antilightActive = false;
        this.retarget(this.windowPlans.short.duties);
        this.hint = `Antilight taken. SHORT window: ${this.windowPlans.short.spread.toUpperCase()} spreads W/E, the other stacks N/S. ${this.windowPlans.short.duties[this.userSpot].label}.`;
        break;
      }
      case 'deathSurge': {
        this.phaseLabel = 'Short resolve';
        break;
      }

      case 'accelArm': {
        const w = ev.arg as WindowKey;
        this.armWindow = w;
        this.armAccum = Object.fromEntries(SPOTS.map((s) => [s, 0])) as Record<Spot, number>;
        for (const s of SPOTS) this.wiggleBase[s] = { ...this.targets[s] };
        const acc = accelOf(script, this.userSpot);
        if (acc.window === w) {
          const rf = script.gc[acc.gcIdx].rf;
          this.hint =
            rf === 'real'
              ? `ACCEL BOMB about to blow — STOP MOVING NOW!`
              : `ACCEL BOMB (fake) about to blow — KEEP WIGGLING!`;
        }
        break;
      }
      case 'accelCheck': {
        const w = ev.arg as WindowKey;
        this.resolveAccel(w);
        if (this.result) return;
        this.armWindow = null;
        // put wiggled targets back on their anchors
        for (const s of SPOTS) this.targets[s] = this.wiggleBase[s];
        break;
      }

      case 'stackSpread': {
        const w = ev.arg as WindowKey;
        this.resolveStackSpread(w);
        if (this.result) return;
        if (w === 'short') {
          this.phaseLabel = '1st gazes';
          this.retarget(this.gazeShort.duties);
          this.hint = `${this.gazeShort.duties[this.userSpot].label}.`;
        } else {
          this.phaseLabel = '2nd gazes';
          // long gaze positions are posed by the gazePose event a moment later
        }
        break;
      }

      case 'recThunderSpawn': {
        this.spawnPattern(script.recThunderPattern, script.bankedThunder, null, st(REC_THUNDER_T + MM_CAST + MM_HIT_DELAY));
        this.gazeRule = { plan: this.gazeShort, rf: script.gc[0].rf };
        this.hint = `REMEMBER: this Thunder is ${script.bankedThunder.toUpperCase()} (Mana Charge banked it). Line up ${script.bankedThunder === 'fake' ? 'INSIDE a lane — fakes hit everything outside them' : 'on the lane edge'} — gazes resolve right after.`;
        break;
      }
      case 'recThunderResolve': {
        this.resolveZones('recorded Thrumming Thunder');
        break;
      }

      case 'gazePose': {
        this.retarget(this.gazeLong.duties);
        this.gazeRule = { plan: this.gazeLong, rf: script.gc[1].rf };
        this.hint = `${this.gazeLong.duties[this.userSpot].label}. ${script.gc[1].rf === 'real' ? 'LOOK AWAY from the shrieks!' : 'LOOK AT the shrieks!'}`;
        break;
      }

      case 'gazeCheck': {
        const w = ev.arg as WindowKey;
        this.resolveGaze(w);
        if (this.result) return;
        this.gazeRule = null;
        if (w === 'short') {
          this.phaseLabel = 'Entropy';
          this.retargetPositions(DROP_CLUSTER);
          this.hint =
            script.infernoRF === 'real'
              ? 'Stack mid — drop the Entropy TWISTERS together, then RUN OUT.'
              : 'Stack mid — Entropy is FAKE, so it drops DONUTS: stay in your hole!';
        } else {
          this.phaseLabel = 'Mana Release';
          this.retargetPositions(DROP_CLUSTER);
          this.hint =
            script.tsunamiRF === 'real'
              ? 'Stack mid — Dynamic Fluid drops DONUTS: stay in your hole, then dodge the final telegraphs.'
              : 'Stack mid — Dynamic Fluid is FAKE, so it drops TWISTERS: run out, then dodge the final telegraphs.';
        }
        break;
      }

      case 'upsurgeHit': {
        // raidwide — cosmetic in the sim
        break;
      }

      case 'entropyDrop': {
        const kind = script.infernoRF === 'real' ? 'twister' : 'donut';
        this.spawnDrops(kind, st(STRAY_FLAMES_T + MM_CAST + MM_HIT_DELAY));
        if (kind === 'twister') this.retargetPositions(escapeRing(script, 'long'));
        break;
      }
      case 'entropyResolve': {
        this.resolveDrops('Entropy');
        if (this.result) return;
        this.phaseLabel = 'Long resolve';
        this.retarget(this.windowPlans.long.duties);
        this.hint = `LONG window: ${this.windowPlans.long.spread.toUpperCase()} spreads W/E, the other stacks N/S. ${this.windowPlans.long.duties[this.userSpot].label}.`;
        break;
      }

      case 'recIceSpawn': {
        this.spawnPattern(script.recIcePattern, null, script.bankedIce, st(REC_ICE_T + MM_CAST + MM_HIT_DELAY));
        this.hint = `REMEMBER: this Blizzard is ${script.bankedIce.toUpperCase()}. All four quadrants show (half real, half fake) — the cardinal seams stay safe either way: hold your stack/spread spot.`;
        break;
      }
      case 'recIceResolve': {
        this.resolveZones('recorded Blizzard cleave');
        break;
      }

      case 'fluidDrop': {
        const kind = script.tsunamiRF === 'real' ? 'donut' : 'twister';
        this.spawnDrops(kind, st(STRAY_SPRAY_T + MM_CAST + MM_HIT_DELAY));
        if (kind === 'twister') this.retargetPositions(escapeRing(script, 'long'));
        break;
      }
      case 'finalMmSpawn': {
        const fThunder = combineRF(script.bankedThunder, script.ringThunder);
        const fIce = combineRF(script.bankedIce, script.ringIce);
        this.spawnPattern(
          script.finalPattern,
          fThunder,
          fIce,
          st(FINAL_MM_T + MM_CAST + MM_HIT_DELAY),
          script.tsunamiRF !== 'real', // donut fluid: everyone stays in the hole
        );
        this.hint = `Mana math: banked ${script.bankedThunder}+ring ${script.ringThunder} → Thunder ${fThunder.toUpperCase()}; banked ${script.bankedIce}+ring ${script.ringIce} → Ice ${fIce.toUpperCase()}. Real hits inside, fake hits outside — stand accordingly!`;
        break;
      }
      case 'fluidResolve': {
        this.resolveDrops('Dynamic Fluid');
        break;
      }
      case 'finalMmResolve': {
        this.resolveZones('final telegraph');
        if (this.result) return;
        this.phaseLabel = 'Ultima Upsurge';
        this.hint = 'All resolved — burn the boss through Ultima Upsurge!';
        break;
      }

      case 'clear': {
        this.result = { kind: 'clear' };
        this.hint = 'Kefka Says resolved — GG!';
        break;
      }
    }
  }

  // ---- resolution checks -------------------------------------------------

  private resolveAntilight(): void {
    const { needed, whiteHitSign, jumpDeg } = this.antilight;
    const m = compass(jumpDeg + 90, 1);
    const user = this.userSpot;
    for (const s of SPOTS) {
      const p = this.positions[s];
      const perp = p.x * m.x + p.y * m.y;
      const laserZone: FailZone = {
        kind: 'line',
        pos: compass(jumpDeg + 180, R_ARENA),
        dirRad: Math.atan2(compass(jumpDeg, 1).y, compass(jumpDeg, 1).x),
        halfWidth: EDGE_HALFW,
        len: 2 * R_ARENA,
      };
      if (Math.abs(perp) <= EDGE_HALFW + GRACE) {
        this.fail({
          reason:
            s === user
              ? 'You stood on the Edge of Death — the middle between the antilight colors is a kill laser.'
              : `${s} stood on the Edge of Death laser.`,
          ghost: s === user ? this.antilight.duties[user].pos : undefined,
          hit: [s],
          zone: laserZone,
        });
        return;
      }
      const got = (perp > 0 ? 1 : -1) === whiteHitSign ? 'white' : 'black';
      if (got !== needed[s].color) {
        const af = this.script.allagan.includes(s);
        const flood = this.script.floodRF;
        this.fail({
          reason:
            s === user
              ? `You took ${got.toUpperCase()} Antilight but needed ${needed[s].color.toUpperCase()} — ${
                  af
                    ? 'Allagan Field takes the OPPOSITE color to your Wound'
                    : 'Beyond Death takes the SAME color as your Wound'
                }${flood === 'fake' ? ', and the FAKE Flood of Naught swapped the sides the orbs showed' : ''}.`
              : `${s} took the wrong Antilight color.`,
          ghost: s === user ? this.antilight.duties[user].pos : undefined,
          hit: [s],
          zone: { kind: 'half', dir: { x: m.x * needed[s].sign * -1, y: m.y * needed[s].sign * -1 } },
        });
        return;
      }
    }
    this.effects.push({ pos: { x: 0, y: 0 }, r: R_ARENA, until: this.t + 0.5 });
  }

  private resolveAccel(w: WindowKey): void {
    const user = this.userSpot;
    for (const s of SPOTS) {
      const acc = accelOf(this.script, s);
      if (acc.window !== w) continue;
      const rf = this.script.gc[acc.gcIdx].rf;
      const moved = this.armAccum[s];
      if (rf === 'real' && moved > STILL_EPS) {
        this.fail({
          reason:
            s === user
              ? `Your Acceleration Bomb was REAL — you moved ${moved.toFixed(1)}y during the stillness check. Freeze before it detonates.`
              : `${s} moved during a real Acceleration Bomb.`,
          hit: [s],
          zone: { kind: 'circle', pos: { ...this.positions[s] }, r: 3 },
        });
        return;
      }
      if (rf === 'fake' && moved < MOTION_MIN) {
        this.fail({
          reason:
            s === user
              ? 'Your Acceleration Bomb was FAKE — fake bombs demand MOTION, and you stood still. Keep wiggling through the detonation.'
              : `${s} stood still through a fake Acceleration Bomb.`,
          hit: [s],
          zone: { kind: 'circle', pos: { ...this.positions[s] }, r: 3 },
        });
        return;
      }
    }
  }

  private resolveStackSpread(w: WindowKey): void {
    const plan = this.windowPlans[w];
    const user = this.userSpot;

    for (const holder of plan.spreadHolders) {
      const src = this.positions[holder];
      this.effects.push({ pos: { ...src }, r: SPREAD8_R, until: this.t + 1.2 });
      const clipped = SPOTS.filter((s) => s !== holder && dist(this.positions[s], src) <= SPREAD8_R);
      if (clipped.length === 0) continue;
      const zone: FailZone = { kind: 'circle', pos: { ...src }, r: SPREAD8_R };
      this.fail(
        holder === user
          ? {
              reason: `Your ${plan.spread} spread (Death Bolt) clipped ${clipped.join(', ')} — take it max melee W/E, alone.`,
              ghost: plan.duties[user].pos,
              hit: clipped,
              zone,
            }
          : clipped.includes(user)
            ? {
                reason: `You stood in ${holder}'s ${plan.spread} spread (Death Bolt, 8y).`,
                ghost: plan.duties[user].pos,
                hit: clipped,
                zone,
              }
            : { reason: `${holder}'s spread clipped ${clipped.join(', ')}.`, hit: clipped, zone },
      );
      return;
    }

    for (const [holder, expected] of Object.entries(plan.stackMembers) as Array<[Spot, Spot[]]>) {
      const src = this.positions[holder];
      this.effects.push({ pos: { ...src }, r: STACK8_R, until: this.t + 1.2 });
      const members = SPOTS.filter((s) => dist(this.positions[s], src) <= STACK8_R);
      if (members.length === expected.length && expected.every((s) => members.includes(s))) continue;
      const hit = members.filter((s) => !expected.includes(s));
      const missed = expected.filter((s) => !members.includes(s));
      const zone: FailZone = { kind: 'circle', pos: { ...src }, r: STACK8_R };
      this.fail({
        reason:
          missed.includes(user)
            ? `You missed ${holder}'s ${w} stack (Death Wave) — it needed you (${expected.join('+')}).`
            : hit.includes(user)
              ? `You joined ${holder}'s stack but belong ${plan.duties[user].label.toLowerCase()}.`
              : `${holder}'s ${w} stack resolved with ${members.length} (needed ${expected.join('+')}).`,
        ghost: plan.duties[user].pos,
        hit,
        missed,
        zone,
      });
      return;
    }
  }

  private resolveGaze(w: WindowKey): void {
    const plan = w === 'short' ? this.gazeShort : this.gazeLong;
    const rf = this.script.gc[w === 'short' ? 0 : 1].rf;
    const user = this.userSpot;
    for (const h of plan.holders) {
      this.effects.push({ pos: { ...this.positions[h] }, r: 3, until: this.t + 1.0 });
    }
    for (const s of SPOTS) {
      const p = this.positions[s];
      const f = this.facing[s];
      const others = plan.holders.filter((h) => h !== s);
      if (rf === 'real') {
        for (const h of others) {
          const hp = this.positions[h];
          const d = dist(p, hp) || 1;
          const dot = (f.x * (hp.x - p.x)) / d + (f.y * (hp.y - p.y)) / d;
          if (dot >= GAZE_AWAY_DOT) {
            this.fail({
              reason:
                s === user
                  ? `Cursed Shriek was REAL — you were looking AT ${h}. Turn your character away (tap a movement key away from them) before it resolves.`
                  : `${s} looked at ${h} during a real shriek.`,
              hit: [s],
              zone: { kind: 'circle', pos: { ...this.positions[h] }, r: 3 },
            });
            return;
          }
        }
      } else {
        if (others.length === 0) continue;
        const ok = others.some((h) => {
          const hp = this.positions[h];
          const d = dist(p, hp) || 1;
          const dot = (f.x * (hp.x - p.x)) / d + (f.y * (hp.y - p.y)) / d;
          return dot >= GAZE_AT_COS;
        });
        if (!ok) {
          this.fail({
            reason:
              s === user
                ? `Cursed Shriek was FAKE — the inverted gaze demands you LOOK AT ${others.join(' or ')}, and you looked away.`
                : `${s} failed to look at the fake shriek.`,
            hit: [s],
            zone: { kind: 'circle', pos: { ...this.positions[others[0]] }, r: 3 },
          });
          return;
        }
      }
    }
  }

  private spawnDrops(kind: 'twister' | 'donut', hitT: number): void {
    this.drops = SPOTS.map((s) => ({ kind, owner: s, pos: { ...this.positions[s] }, hitT }));
  }

  private resolveDrops(what: string): void {
    const user = this.userSpot;
    for (const d of this.drops) {
      const hits = SPOTS.filter((s) => {
        const r = dist(this.positions[s], d.pos);
        return d.kind === 'twister'
          ? r <= STRAY_FLAME_R - GRACE
          : r >= DONUT_R_IN + GRACE && r <= DONUT_R_OUT - GRACE;
      });
      if (hits.length === 0) continue;
      const zone: FailZone =
        d.kind === 'twister'
          ? { kind: 'circle', pos: { ...d.pos }, r: STRAY_FLAME_R }
          : { kind: 'donut', pos: { ...d.pos }, rIn: DONUT_R_IN, rOut: DONUT_R_OUT };
      this.fail(
        hits.includes(user)
          ? {
              reason:
                d.kind === 'twister'
                  ? `You were caught by a dropped ${what} twister — drop them stacked mid, then run clear.`
                  : `You were clipped by a ${what} donut ring — stay in the hole where you dropped it.`,
              ghost: d.kind === 'twister' ? undefined : { ...d.pos },
              hit: hits,
              zone,
            }
          : { reason: `${hits.join(', ')} got caught by the ${what} drop.`, hit: hits, zone },
      );
      return;
    }
    this.drops = [];
  }
}
