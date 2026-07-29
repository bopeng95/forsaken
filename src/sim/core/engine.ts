import {
  BOT_SPEED,
  DASH_CHARGES,
  DASH_DIST,
  DASH_DURATION,
  DASH_RECHARGE,
  MOVE_SPEED,
  SPRINT_COOLDOWN,
  SPRINT_DURATION,
  SPRINT_SPEED,
} from './constants';
import { clampToArena, stepToward } from './motion';
import type { FailInfo, MechanicId, Result, Spot, Vec2 } from './types';
import { SPOTS } from './types';

export type RF = 'real' | 'fake';

export interface CastSeg {
  t0: number;
  t1: number;
  label: string;
  /** who is casting (HUD groups one bar row per caster); omitted = the boss */
  caster?: string;
  /** real/fake tell shown beside the bar (Kefka Says orb rings) */
  rf?: RF;
  /** per-element thunder/ice tells shown beside the bar; thunder renders above ice */
  tells?: { thunder?: RF; ice?: RF };
}

export interface CastBar {
  label: string;
  frac: number;
  caster?: string;
  rf?: RF;
  tells?: { thunder?: RF; ice?: RF };
}

/**
 * Mechanic-agnostic sim shell: the clock, player movement (user input +
 * sprint/dash, bots walking to `targets`), facing, the fixed event timeline
 * pump and the cast-bar segments. Each mechanic subclasses this, builds its
 * timeline in the constructor and resolves events in `handle()`.
 */
export abstract class BaseEngine<E extends { t: number }> {
  abstract readonly mechanicId: MechanicId;
  readonly userSpot: Spot;

  t = 0;
  positions: Record<Spot, Vec2>;
  targets: Record<Spot, Vec2>;
  /**
   * unit vector each player looks along — the last movement direction, like a
   * character running with legacy controls. Mechanics may override bot facing
   * in afterMove() (gaze windows).
   */
  facing: Record<Spot, Vec2>;
  hint = '';
  result: Result | null = null;

  private sprintUntil = -Infinity;
  private sprintReadyAt = 0;

  private dashCharges = DASH_CHARGES;
  /** next charge refill time; meaningful only while charges < max */
  private dashRechargeAt = 0;
  private dashUntil = -Infinity;
  private dashDir: Vec2 = { x: 0, y: 0 };
  protected lastMoveDir: Vec2 | null = null;

  protected timeline: E[] = [];
  private nextEvent = 0;
  protected castSegs: CastSeg[] = [];

  constructor(userSpot: Spot, startPositions: Record<Spot, Vec2>) {
    this.userSpot = userSpot;
    this.positions = { ...startPositions };
    this.targets = { ...startPositions };
    // everyone starts facing the boss (arena center)
    this.facing = Object.fromEntries(
      SPOTS.map((s) => {
        const p = startPositions[s];
        const r = Math.hypot(p.x, p.y) || 1;
        return [s, { x: -p.x / r, y: -p.y / r }];
      }),
    ) as Record<Spot, Vec2>;
  }

  /** every cast bar overlapping the current sim time (multiple bosses may cast at once) */
  get castBars(): CastBar[] {
    const out: CastBar[] = [];
    for (const c of this.castSegs) {
      if (this.t >= c.t0 && this.t < c.t1) {
        out.push({
          label: c.label,
          frac: (this.t - c.t0) / (c.t1 - c.t0),
          caster: c.caster,
          rf: c.rf,
          tells: c.tells,
        });
      }
    }
    return out;
  }

  get sprint(): { activeLeft: number; cooldownLeft: number } {
    return {
      activeLeft: Math.max(0, this.sprintUntil - this.t),
      cooldownLeft: Math.max(0, this.sprintReadyAt - this.t),
    };
  }

  get dash(): { charges: number; rechargeLeft: number } {
    return {
      charges: this.dashCharges,
      rechargeLeft:
        this.dashCharges < DASH_CHARGES ? Math.max(0, this.dashRechargeAt - this.t) : 0,
    };
  }

  update(dt: number, userInput: Vec2, sprint = false, dash = false): void {
    if (this.result) return;
    // clamp dt so a background tab doesn't teleport the sim
    dt = Math.min(dt, 0.1);
    this.t += dt;

    if (sprint && this.t >= this.sprintReadyAt) {
      this.sprintUntil = this.t + SPRINT_DURATION;
      this.sprintReadyAt = this.t + SPRINT_COOLDOWN;
    }

    if (this.dashCharges < DASH_CHARGES && this.t >= this.dashRechargeAt) {
      this.dashCharges++;
      this.dashRechargeAt += DASH_RECHARGE;
    }

    if (dash && this.dashCharges > 0 && this.t >= this.dashUntil) {
      const inLen = Math.hypot(userInput.x, userInput.y);
      const dir =
        inLen > 1e-6 ? { x: userInput.x / inLen, y: userInput.y / inLen } : this.lastMoveDir;
      if (dir) {
        if (this.dashCharges === DASH_CHARGES) this.dashRechargeAt = this.t + DASH_RECHARGE;
        this.dashCharges--;
        this.dashDir = dir;
        this.dashUntil = this.t + DASH_DURATION;
      }
    }

    // movement
    const step = BOT_SPEED * dt;
    const userSpeed = this.t < this.sprintUntil ? SPRINT_SPEED : MOVE_SPEED;
    for (const s of SPOTS) {
      if (s === this.userSpot) {
        if (this.t < this.dashUntil) {
          const k = (DASH_DIST / DASH_DURATION) * dt;
          this.positions[s] = clampToArena({
            x: this.positions[s].x + this.dashDir.x * k,
            y: this.positions[s].y + this.dashDir.y * k,
          });
          this.facing[s] = { ...this.dashDir };
          continue;
        }
        const len = Math.hypot(userInput.x, userInput.y);
        if (len > 1e-6) {
          this.lastMoveDir = { x: userInput.x / len, y: userInput.y / len };
          this.facing[s] = this.lastMoveDir;
          const k = (userSpeed * dt) / Math.max(1, len);
          this.positions[s] = clampToArena({
            x: this.positions[s].x + userInput.x * k,
            y: this.positions[s].y + userInput.y * k,
          });
        }
      } else {
        const prev = this.positions[s];
        const next = stepToward(prev, this.targets[s], step);
        const mx = next.x - prev.x;
        const my = next.y - prev.y;
        const moved = Math.hypot(mx, my);
        if (moved > 1e-4) this.facing[s] = { x: mx / moved, y: my / moved };
        this.positions[s] = next;
      }
    }

    this.afterMove(dt);

    // timeline
    while (this.nextEvent < this.timeline.length && this.timeline[this.nextEvent].t <= this.t) {
      const ev = this.timeline[this.nextEvent++];
      this.handle(ev);
      if (this.result) return;
    }

    this.afterEvents(dt);
  }

  protected fail(info: FailInfo): void {
    this.result = { kind: 'fail', ...info };
  }

  /** runs after movement, before due events (Forsaken: clone aim tracking; Kefka Says: bot facing overrides) */
  protected afterMove(_dt: number): void {}

  /** runs after due events on ticks that didn't end the sim (Forsaken: expired-effect GC) */
  protected afterEvents(_dt: number): void {}

  protected abstract handle(ev: E): void;
}
