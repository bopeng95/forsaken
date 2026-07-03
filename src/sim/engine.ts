import { SETUP_POS, buildSetPlan, lp, type SetPlan } from './assignments';
import { clampToArena, dist, stepToward } from './bots';
import {
  ATE_CAST,
  BAIT_CENTER_EPS,
  BAIT_DELAY,
  BAIT_WINDOW,
  BOT_SPEED,
  CLEAVE_TO_SOAK,
  CLONE_SPREAD_R,
  CONE_HALF_DEG,
  CONE_LEN,
  DASH_CHARGES,
  DASH_DIST,
  DASH_DURATION,
  DASH_RECHARGE,
  FP_CAST,
  FP_CAST_DELAY,
  MOVE_SPEED,
  R_TOWER,
  SETUP_T,
  SPREAD_R,
  SPRINT_COOLDOWN,
  SPRINT_DURATION,
  SPRINT_SPEED,
  STACK_R,
  TELEGRAPH_T,
} from './constants';
import type { AttemptScript, FailInfo, FailZone, Icon, Result, Spot, Vec2 } from './types';
import { SPOTS } from './types';

type EventKind = 'spawn' | 'resolve' | 'snapshot' | 'bait' | 'lock' | 'cleave' | 'clear';

interface TimelineEvent {
  t: number;
  kind: EventKind;
  set: number;
}

interface CastSeg {
  t0: number;
  t1: number;
  label: string;
}

export interface VisualEffect {
  kind: 'cone' | 'spread' | 'stack';
  pos: Vec2;
  dirRad?: number;
  until: number;
}

export interface Clone {
  pos: Vec2;
  /** aim point: tracks the party until All Things Ending locks it */
  aim: Vec2;
  locked: boolean;
}

/** which set the same group soaks next (for icon rerolls); AAABBBBA */
const NEXT_SOAK: Record<number, number | null> = {
  1: 2,
  2: 3,
  3: 8,
  4: 5,
  5: 6,
  6: 7,
  7: null,
  8: null,
};

export class SimEngine {
  readonly script: AttemptScript;
  readonly userSpot: Spot;
  readonly plans: SetPlan[];

  t = 0;
  positions: Record<Spot, Vec2>;
  icons: Record<Spot, Icon | null>;
  stacksLeft: Record<Spot, number>;
  targets: Record<Spot, Vec2>;
  hint: string;
  result: Result | null = null;

  /** towers of the currently telegraphed set (spawn..resolve) */
  activeTowers: { plan: SetPlan; spawnT: number; resolveT: number } | null = null;
  effects: VisualEffect[] = [];
  clones: Clone[] = [];
  /** unit vector toward the locked bait (danger half), set at lock */
  cleaveDir: Vec2 | null = null;
  baitMarker: Vec2 | null = null;
  /** last set that spawned (for HUD progress) */
  currentSet = 0;

  private sprintUntil = -Infinity;
  private sprintReadyAt = 0;

  private dashCharges = DASH_CHARGES;
  /** next charge refill time; meaningful only while charges < max */
  private dashRechargeAt = 0;
  private dashUntil = -Infinity;
  private dashDir: Vec2 = { x: 0, y: 0 };
  private lastMoveDir: Vec2 | null = null;

  private timeline: TimelineEvent[];
  private nextEvent = 0;
  private castSegs: CastSeg[] = [];

  constructor(script: AttemptScript, userSpot: Spot) {
    this.script = script;
    this.userSpot = userSpot;
    this.plans = Array.from({ length: 8 }, (_, i) => buildSetPlan(script, i + 1));

    this.positions = { ...SETUP_POS };
    this.targets = { ...SETUP_POS };
    this.stacksLeft = Object.fromEntries(SPOTS.map((s) => [s, 4])) as Record<Spot, number>;
    this.icons = Object.fromEntries(SPOTS.map((s) => [s, null])) as Record<Spot, Icon | null>;
    // Group A holds its set-1 icons, Group B holds its (remembered) set-4 icons.
    for (const [s, icon] of Object.entries(script.soakIcons[0])) this.icons[s as Spot] = icon!;
    for (const [s, icon] of Object.entries(script.soakIcons[3])) this.icons[s as Spot] = icon!;

    const group = script.groupOf[userSpot];
    this.hint = `You are ${userSpot} — Group ${group} (soaks towers ${
      group === 'A' ? '1, 2, 3 and 8' : '4, 5, 6 and 7'
    }). Read your icon!`;

    // Timeline, matching the cactbot log cadence: towers resolve every 10s.
    // Even towers spawn as the preceding odd set resolves; Future's/Past's End
    // resolves 1.3s BEFORE the even soak (clone snapshot + explosion); odd
    // towers 3/5/7 spawn at the bait call, so the whole bait/lock/cleave
    // sequence runs during their telegraph and the cleave lands CLEAVE_TO_SOAK
    // before the soak (1.0 + 4.7 + 5.0 + 0.3 = 10, asserted in constants.ts).
    // Events are processed in push order, which breaks equal-t ties:
    // resolve(odd) before spawn(even), bait before spawn(next odd).
    this.timeline = [];
    this.timeline.push({ t: SETUP_T, kind: 'spawn', set: 1 });
    let oddResolve = SETUP_T + TELEGRAPH_T;
    this.timeline.push({ t: oddResolve, kind: 'resolve', set: 1 });
    for (let set = 2; set <= 8; set += 2) {
      const resolve = oddResolve + TELEGRAPH_T; // spawns at oddResolve
      const snapshot = oddResolve + FP_CAST_DELAY + FP_CAST; // F/P cast end
      const bait = resolve + BAIT_DELAY;
      const lock = bait + BAIT_WINDOW;
      const cleave = lock + ATE_CAST;
      this.timeline.push({ t: oddResolve, kind: 'spawn', set });
      this.timeline.push({ t: snapshot, kind: 'snapshot', set });
      this.timeline.push({ t: resolve, kind: 'resolve', set });
      this.timeline.push({ t: bait, kind: 'bait', set });
      if (set < 8) this.timeline.push({ t: bait, kind: 'spawn', set: set + 1 });
      this.timeline.push({ t: lock, kind: 'lock', set });
      this.timeline.push({ t: cleave, kind: 'cleave', set });
      this.castSegs.push({
        t0: oddResolve + FP_CAST_DELAY,
        t1: snapshot,
        label: this.script.future[set / 2 - 1] ? "Future's End" : "Past's End",
      });
      this.castSegs.push({ t0: lock, t1: cleave, label: 'All Things Ending' });
      if (set < 8) {
        oddResolve = cleave + CLEAVE_TO_SOAK; // = bait + TELEGRAPH_T
        this.timeline.push({ t: oddResolve, kind: 'resolve', set: set + 1 });
      } else {
        this.timeline.push({ t: cleave + 1.5, kind: 'clear', set: 8 });
      }
    }
  }

  get castBar(): { label: string; frac: number } | null {
    for (const c of this.castSegs) {
      if (this.t >= c.t0 && this.t < c.t1) {
        return { label: c.label, frac: (this.t - c.t0) / (c.t1 - c.t0) };
      }
    }
    return null;
  }

  update(dt: number, userInput: Vec2, autopilot: boolean, sprint = false, dash = false): void {
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

    if (dash && !autopilot && this.dashCharges > 0 && this.t >= this.dashUntil) {
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
      if (s === this.userSpot && !autopilot) {
        if (this.t < this.dashUntil) {
          const k = (DASH_DIST / DASH_DURATION) * dt;
          this.positions[s] = clampToArena({
            x: this.positions[s].x + this.dashDir.x * k,
            y: this.positions[s].y + this.dashDir.y * k,
          });
          continue;
        }
        const len = Math.hypot(userInput.x, userInput.y);
        if (len > 1e-6) {
          this.lastMoveDir = { x: userInput.x / len, y: userInput.y / len };
          const k = (userSpeed * dt) / Math.max(1, len);
          this.positions[s] = clampToArena({
            x: this.positions[s].x + userInput.x * k,
            y: this.positions[s].y + userInput.y * k,
          });
        }
      } else {
        this.positions[s] = stepToward(this.positions[s], this.targets[s], step);
      }
    }

    // unlocked clones keep their aim trained on the user — the boss targets YOU
    if (this.clones.length > 0 && !this.clones[0].locked) {
      const aim = { ...this.positions[this.userSpot] };
      for (const c of this.clones) c.aim = aim;
    }

    // timeline
    while (this.nextEvent < this.timeline.length && this.timeline[this.nextEvent].t <= this.t) {
      const ev = this.timeline[this.nextEvent++];
      this.handle(ev);
      if (this.result) return;
    }

    this.effects = this.effects.filter((e) => e.until > this.t);
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

  private fail(info: FailInfo): void {
    this.result = { kind: 'fail', ...info };
  }

  private handle(ev: TimelineEvent): void {
    const plan = this.plans[ev.set - 1];
    switch (ev.kind) {
      case 'spawn': {
        this.currentSet = ev.set;
        this.activeTowers = { plan, spawnT: ev.t, resolveT: ev.t + TELEGRAPH_T };
        // Odd sets 3/5/7 spawn mid-bait (at the bait call) — leave everyone on
        // the bait; they get their duty targets at the cleave lock.
        if (ev.set !== 1 && ev.set % 2 === 1) break;
        for (const s of SPOTS) this.targets[s] = plan.duties[s].pos;
        let hint = `Set ${ev.set} — ${plan.duties[this.userSpot].label}`;
        if (ev.set % 2 === 0) {
          // even towers spawn as the odd set resolves — surface the reroll
          const prevOdd = this.plans[ev.set - 2];
          const soaked =
            prevOdd.towerMembers.left.includes(this.userSpot) ||
            prevOdd.towerMembers.right.includes(this.userSpot);
          if (soaked) {
            const mine = this.icons[this.userSpot];
            hint = `New icon: ${mine?.toUpperCase()}${ev.set === 4 ? ' — REMEMBER IT for set 8!' : ''}. ${hint}`;
          }
        }
        this.hint = hint;
        break;
      }
      case 'resolve': {
        this.resolveTowers(plan);
        // on fail, keep the tower telegraph on the frozen scene
        if (this.result) return;
        this.activeTowers = null;
        // odd resolve: the even spawn at the same instant sets the next hint
        if (plan.parity === 'even') this.hint = 'Towers soaked — get ready to stack!';
        break;
      }
      case 'snapshot': {
        // Future's/Past's End resolves: clones spawn on the 4 closest players
        // and explode point-blank, 1.3s before the even towers are soaked.
        if (!this.checkSnapshot(plan)) return;
        const aim = { ...this.positions[this.userSpot] };
        this.clones = plan.expectedClosest4!.map((s) => ({
          pos: { ...this.positions[s] },
          aim,
          locked: false,
        }));
        this.resolveCloneExplosions(plan);
        break;
      }
      case 'bait': {
        this.baitMarker = plan.baitPos!;
        for (const s of SPOTS) this.targets[s] = plan.baitPos!;
        this.hint = plan.future
          ? "FUTURE'S END — everyone stack max melee OPPOSITE the new towers"
          : "PAST'S END — everyone stack max melee BETWEEN the new towers";
        break;
      }
      case 'lock': {
        // Aims freeze on the bait — the boss targets YOU — as All Things Ending begins.
        const u = this.positions[this.userSpot];
        const lockedAim = { ...u };
        for (const c of this.clones) {
          c.aim = lockedAim;
          c.locked = true;
        }
        // The cleave orientation follows the USER's bait: the danger half
        // CONTAINS the user for Future (clones cleave in front, toward the
        // bait), the OPPOSITE half for Past (they cleave behind). A perfect
        // bait reproduces the fixed relative-north direction of the bait
        // frame. The boundary stays a center diameter, not per-clone
        // half-planes: KR parks boss-hugging helpers at 5.4y while an old
        // clone spawn can sit at 8.4y on the same azimuth (180° tower flip),
        // and a baiter clone at relative ±45° would tilt a bait-aimed
        // boundary onto the r-131° helpers — the strat's own spots only
        // clear through-center. A user at the arena center can't define a
        // diameter — fall back to the ideal frame.
        const r = Math.hypot(u.x, u.y);
        this.cleaveDir =
          r < BAIT_CENTER_EPS
            ? lp(plan.baitFrameSouth!, 0, 1)
            : plan.future
              ? { x: u.x / r, y: u.y / r }
              : { x: -u.x / r, y: -u.y / r };
        this.baitMarker = null;
        const next = ev.set < 8 ? this.plans[ev.set] : null;
        for (const s of SPOTS) this.targets[s] = next ? next.duties[s].pos : plan.dodgePos!;
        this.hint = plan.future
          ? 'ALL THINGS ENDING — the cleave locked onto YOUR side: CROSS to the tower side!'
          : "ALL THINGS ENDING — the cleave hits the half OPPOSITE you: don't cross, head to your tower job.";
        break;
      }
      case 'cleave': {
        const d = this.cleaveDir!;
        const caught = SPOTS.filter((s) => {
          const p = this.positions[s];
          return p.x * d.x + p.y * d.y > 0;
        });
        if (caught.length > 0) {
          const next = ev.set < 8 ? this.plans[ev.set] : null;
          this.cleaveDir = null; // the fail zone replaces the live telegraph
          const bots = caught.filter((s) => s !== this.userSpot);
          const also = bots.length > 0 ? ` It also clipped ${bots.join(', ')}.` : '';
          this.fail(
            caught.includes(this.userSpot)
              ? {
                  reason: plan.future
                    ? `All Things Ending hit you — FUTURE clones cleave the half toward the bait (YOU). Cross to the other side once the cast starts.${also}`
                    : `All Things Ending hit you — PAST clones cleave the half OPPOSITE the bait (you), so your side was safe. You shouldn't have crossed.${also}`,
                  ghost: next ? next.duties[this.userSpot].pos : plan.dodgePos!,
                  hit: caught,
                  zone: { kind: 'half', dir: { ...d } },
                }
              : {
                  reason: `Your ${plan.future ? 'FUTURE' : 'PAST'} bait was misaimed — the cleave follows YOUR position at the lock and clipped ${bots.join(', ')} on their dodge spots. Bait max melee ${plan.future ? 'OPPOSITE' : 'BETWEEN'} the new towers with the party.`,
                  ghost: plan.baitPos!,
                  hit: caught,
                  zone: { kind: 'half', dir: { ...d } },
                },
          );
          return;
        }
        this.clones = [];
        this.cleaveDir = null;
        if (ev.set < 8) this.hint = 'Cleave dodged — the towers resolve NOW!';
        break;
      }
      case 'clear': {
        this.result = { kind: 'clear' };
        this.hint = 'Forsaken resolved — GG!';
        break;
      }
    }
  }

  // ---- resolution checks ------------------------------------------------

  private resolveTowers(plan: SetPlan): void {
    const user = this.userSpot;
    const inTower = (center: Vec2): Spot[] =>
      SPOTS.filter((s) => dist(this.positions[s], center) <= R_TOWER);

    // 1) tower membership
    for (const side of ['left', 'right'] as const) {
      const expected = plan.towerMembers[side];
      const actual = inTower(plan.towerCenters[side]);
      const same =
        actual.length === expected.length && expected.every((s) => actual.includes(s));
      if (same) continue;

      const sideName = side.toUpperCase();
      const zone: FailZone = { kind: 'circle', pos: plan.towerCenters[side], r: R_TOWER };
      if (expected.includes(user) && !actual.includes(user)) {
        this.fail({
          reason: `You missed your tower — you were assigned the ${sideName} tower (set ${plan.setIdx}).`,
          ghost: plan.duties[user].pos,
          zone,
        });
      } else if (actual.includes(user) && !expected.includes(user)) {
        this.fail({
          reason: `You soaked the ${sideName} tower, but it belonged to ${expected.join(' + ')}.`,
          ghost: plan.duties[user].pos,
          zone,
        });
      } else {
        this.fail({
          reason: `The ${sideName} tower resolved with ${actual.length} player(s) — towers need exactly 2.`,
          zone,
        });
      }
      return;
    }

    // 2) trigger icons of all soakers simultaneously (positions at this instant)
    const soakers = [...plan.towerMembers.left, ...plan.towerMembers.right];

    // cones first: each fires at the nearest player
    for (const c of soakers) {
      if (this.icons[c] !== 'cone') continue;
      const src = this.positions[c];
      let nearest: Spot | null = null;
      let best = Infinity;
      for (const s of SPOTS) {
        if (s === c) continue;
        const d = dist(src, this.positions[s]);
        if (d < best) {
          best = d;
          nearest = s;
        }
      }
      const dirRad = Math.atan2(this.positions[nearest!].y - src.y, this.positions[nearest!].x - src.x);
      const half = (CONE_HALF_DEG * Math.PI) / 180;
      const hits = SPOTS.filter((s) => {
        if (s === c) return false;
        const p = this.positions[s];
        const d = dist(src, p);
        if (d > CONE_LEN) return false;
        const a = Math.atan2(p.y - src.y, p.x - src.x);
        let diff = Math.abs(a - dirRad);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        return diff <= half;
      });
      this.effects.push({ kind: 'cone', pos: { ...src }, dirRad, until: this.t + 1.2 });

      const baiter = plan.coneBaiter[c]!;
      const ok = hits.length === 1 && hits[0] === baiter;
      if (ok) continue;
      const hit = hits.filter((s) => s !== baiter);
      const missed = hits.includes(baiter) ? [] : [baiter];
      const zone: FailZone = { kind: 'cone', pos: { ...src }, dirRad };
      if (user === baiter && nearest !== user) {
        this.fail({
          reason: `You failed to bait ${c}'s cone — ${nearest} was closer than you.`,
          ghost: plan.duties[user].pos,
          hit,
          missed,
          zone,
        });
      } else if (hits.includes(user) && user !== baiter) {
        this.fail({
          reason: `You were clipped by ${c}'s cone (it fires at the nearest player and hits everyone in the wedge).`,
          ghost: plan.duties[user].pos,
          hit,
          missed,
          zone,
        });
      } else if (user === c) {
        this.fail({
          reason: `Your cone hit ${hits.join(', ') || 'nobody'} — it must hit only ${baiter}. Position so ${baiter} is nearest.`,
          ghost: plan.duties[user].pos,
          hit,
          missed,
          zone,
        });
      } else {
        this.fail({
          reason: `${c}'s cone hit ${hits.length} players (${hits.join(', ')}) — it must hit only ${baiter}.`,
          hit,
          missed,
          zone,
        });
      }
      return;
    }

    // spreads: nobody else within radius
    for (const sp of soakers) {
      if (this.icons[sp] !== 'spread') continue;
      const src = this.positions[sp];
      this.effects.push({ kind: 'spread', pos: { ...src }, until: this.t + 1.2 });
      const clipped = SPOTS.filter((s) => s !== sp && dist(this.positions[s], src) <= SPREAD_R);
      if (clipped.length === 0) continue;
      const zone: FailZone = { kind: 'circle', pos: { ...src }, r: SPREAD_R };
      if (sp === user) {
        this.fail({
          reason: `Your SPREAD clipped ${clipped.join(', ')} — keep it isolated south of the tower.`,
          ghost: plan.duties[user].pos,
          hit: clipped,
          zone,
        });
      } else if (clipped.includes(user)) {
        this.fail({
          reason: `You stood in ${sp}'s spread AoE.`,
          ghost: plan.duties[user].pos,
          hit: clipped,
          zone,
        });
      } else {
        this.fail({ reason: `${sp}'s spread clipped ${clipped.join(', ')}.`, hit: clipped, zone });
      }
      return;
    }

    // stacks: exactly 3 players inside
    for (const h of soakers) {
      if (this.icons[h] !== 'stack') continue;
      const src = this.positions[h];
      this.effects.push({ kind: 'stack', pos: { ...src }, until: this.t + 1.2 });
      const members = SPOTS.filter((s) => dist(this.positions[s], src) <= STACK_R);
      if (members.length === 3) continue;
      const expected = plan.stackMembers[h] ?? [];
      const hit = members.filter((s) => !expected.includes(s));
      const missed = expected.filter((s) => !members.includes(s));
      const zone: FailZone = { kind: 'circle', pos: { ...src }, r: STACK_R };
      if (members.length < 3 && expected.includes(user) && !members.includes(user)) {
        this.fail({
          reason: `${h}'s stack only had ${members.length} — you were supposed to share it.`,
          ghost: plan.duties[user].pos,
          hit,
          missed,
          zone,
        });
      } else if (members.length > 3 && members.includes(user) && !expected.includes(user)) {
        this.fail({
          reason: `${h}'s stack had ${members.length} players — you didn't belong in it.`,
          ghost: plan.duties[user].pos,
          hit,
          missed,
          zone,
        });
      } else {
        this.fail({
          reason: `${h}'s stack resolved with ${members.length} players — it needs exactly 3.`,
          ghost: expected.includes(user) ? plan.duties[user].pos : undefined,
          hit,
          missed,
          zone,
        });
      }
      return;
    }

    // 3) consume a debuff stack + reroll
    const next = NEXT_SOAK[plan.setIdx];
    const nextIcons = next ? this.script.soakIcons[next - 1] : null;
    for (const s of soakers) {
      this.stacksLeft[s] = Math.max(0, this.stacksLeft[s] - 1);
      this.icons[s] = nextIcons ? nextIcons[s]! : null;
    }
  }

  private checkSnapshot(plan: SetPlan): boolean {
    const user = this.userSpot;
    const sorted = SPOTS.slice().sort(
      (a, b) => Math.hypot(this.positions[a].x, this.positions[a].y) - Math.hypot(this.positions[b].x, this.positions[b].y),
    );
    const actual = sorted.slice(0, 4);
    const expected = plan.expectedClosest4!;
    const same = expected.every((s) => actual.includes(s));
    if (same) return true;

    // the "closest 4" boundary: everyone inside this ring got a clone
    const zone: FailZone = {
      kind: 'circle',
      pos: { x: 0, y: 0 },
      r: Math.hypot(this.positions[sorted[3]].x, this.positions[sorted[3]].y),
    };
    if (actual.includes(user) && !expected.includes(user)) {
      this.fail({
        reason: 'A Kefka clone spawned on you — you were among the 4 players closest to the boss.',
        ghost: plan.duties[user].pos,
        zone,
      });
    } else if (expected.includes(user) && !actual.includes(user)) {
      this.fail({
        reason: 'You were assigned a clone bait but were not among the 4 closest to the boss.',
        ghost: plan.duties[user].pos,
        zone,
      });
    } else {
      this.fail({ reason: `Clones spawned on the wrong players (${actual.join(', ')}).`, zone });
    }
    return false;
  }

  /** Each clone detonates point-blank on its baiter as it spawns (BAD6–BAD9). */
  private resolveCloneExplosions(plan: SetPlan): void {
    const user = this.userSpot;
    const label = plan.future ? "Future's End" : "Past's End";
    for (const b of plan.expectedClosest4!) {
      const src = this.positions[b];
      this.effects.push({ kind: 'spread', pos: { ...src }, until: this.t + 1.2 });
      const clipped = SPOTS.filter(
        (s) => s !== b && dist(this.positions[s], src) <= CLONE_SPREAD_R,
      );
      if (clipped.length === 0) continue;
      const zone: FailZone = { kind: 'circle', pos: { ...src }, r: CLONE_SPREAD_R };
      if (b === user) {
        this.fail({
          reason: `The clone that spawned on you exploded onto ${clipped.join(', ')} — keep your bait spot isolated.`,
          ghost: plan.duties[user].pos,
          hit: clipped,
          zone,
        });
      } else if (clipped.includes(user)) {
        this.fail({
          reason: `You were caught in the clone explosion on ${b} — ${label} detonates on the 4 baiters.`,
          ghost: plan.duties[user].pos,
          hit: clipped,
          zone,
        });
      } else {
        this.fail({
          reason: `${b}'s clone explosion clipped ${clipped.join(', ')}.`,
          hit: clipped,
          zone,
        });
      }
      return;
    }
  }
}
