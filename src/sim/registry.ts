import { BOT_SPEED } from './core/constants';
import type { BaseEngine } from './core/engine';
import { stepToward } from './core/motion';
import type { MechanicId, Spot } from './core/types';
import { SPOTS } from './core/types';
import { SimEngine } from './forsaken/engine';
import { matchesPrefs, rollAttempt } from './forsaken/randomizer';
import type { AttemptScript, StartPrefs } from './forsaken/types';
import { KefkaEngine } from './kefkasays/engine';
import { describeKefka, matchesKefkaPrefs, rollKefka } from './kefkasays/randomizer';
import type { KefkaPrefs, KefkaScript } from './kefkasays/types';

/** any mechanic engine, seen through the BaseEngine surface */
export type AnyEngine = BaseEngine<{ t: number }>;

/**
 * One entry per implemented mechanic. Pure TS (no React) so the headless
 * scripts can drive every mechanic through the same interface. UI-only pieces
 * (legend, prefs panel, description markup) live in per-mechanic components
 * keyed by `id`.
 */
export interface MechanicDef {
  id: MechanicId;
  /** start screen h1 / mechanic tab label */
  title: string;
  /** start screen subtitle line */
  subtitle: string;
  defaultPrefs: unknown;
  roll(seed: number): unknown;
  matches(script: unknown, spot: Spot, prefs: unknown): boolean;
  create(script: unknown, spot: Spot): AnyEngine;
  /**
   * Headless harness hook: the engines have no autopilot (removed in e1e5972),
   * they only move the user's spot from input — fake it by stepping the user
   * like a bot before each tick.
   */
  autopilot(eng: AnyEngine, spot: Spot, dt: number): void;
  /** camera rotation target (rad) for the rotate-view option */
  viewRotTarget(eng: AnyEngine): number;
  /** rotate-view checkbox label; null = mechanic has no rotating frame, hide it */
  rotateLabel: string | null;
  /** debug-script dump of a rolled script */
  describe(script: unknown): string[];
}

const forsaken: MechanicDef = {
  id: 'forsaken',
  title: 'Forsaken',
  subtitle: 'Dancing Mad (Ultimate) · P2 Forsaken Kefka · 8 towers · Kroxy-Rinon strat',
  defaultPrefs: { group: 'any', icon: 'any' } satisfies StartPrefs,
  roll: (seed) => rollAttempt(seed),
  matches: (script, spot, prefs) =>
    matchesPrefs(script as AttemptScript, spot, prefs as StartPrefs),
  create: (script, spot) => new SimEngine(script as AttemptScript, spot),
  autopilot: (eng, spot, dt) => {
    eng.positions[spot] = stepToward(eng.positions[spot], eng.targets[spot], BOT_SPEED * dt);
  },
  viewRotTarget: (eng) => {
    const e = eng as SimEngine;
    return e.currentSet > 0
      ? (((180 - e.plans[e.currentSet - 1].southDeg) % 360) * Math.PI) / 180
      : 0;
  },
  rotateLabel: 'rotate towers south',
  describe: (s) => {
    const script = s as AttemptScript;
    return [
      `conesOn: ${script.conesOn}`,
      `groups: ${SPOTS.map((sp) => `${sp}=${script.groupOf[sp]}`).join(' ')}`,
      `south: ${script.southDeg.join(',')}`,
      `future: ${script.future.map((f) => (f ? 'F' : 'P')).join(',')}`,
      ...script.soakIcons.map((ic, i) => `set ${i + 1} icons: ${JSON.stringify(ic)}`),
    ];
  },
};

const kefkasays: MechanicDef = {
  id: 'kefkasays',
  title: 'Kefka Says',
  subtitle: 'Dancing Mad (Ultimate) · P4 Kefka Says · real/fake debuffs · Gazes Mid strat',
  defaultPrefs: {
    mark: 'any',
    markWindow: 'any',
    gaze: 'any',
    field: 'any',
  } satisfies KefkaPrefs,
  roll: (seed) => rollKefka(seed),
  matches: (script, spot, prefs) =>
    matchesKefkaPrefs(script as KefkaScript, spot, prefs as KefkaPrefs),
  create: (script, spot) => new KefkaEngine(script as KefkaScript, spot),
  autopilot: (eng, spot, dt) => {
    const e = eng as KefkaEngine;
    e.positions[spot] = stepToward(e.positions[spot], e.targets[spot], BOT_SPEED * dt);
    // the engine only overrides BOT facing during gaze windows — mirror it for
    // the fake-autopiloted user spot
    const f = e.idealFacing(spot);
    if (f) e.facing[spot] = f;
  },
  viewRotTarget: () => 0,
  rotateLabel: null,
  describe: (script) => describeKefka(script as KefkaScript),
};

export const MECHANICS: Partial<Record<MechanicId, MechanicDef>> = { forsaken, kefkasays };

export const MECHANIC_IDS = Object.keys(MECHANICS) as MechanicId[];

/**
 * Rejection-sample seeds until the rolled pattern satisfies the start prefs
 * for the user's spot. Every mechanic's pref combos accept a healthy fraction
 * of rolls (Forsaken worst satisfiable: 1/8; Kefka Says worst: ~1/32), so the
 * cap only matters for combos the UI already forbids.
 */
export function findSeed(
  def: MechanicDef,
  spot: Spot,
  prefs: unknown,
  randomSeed: () => number,
): number {
  let seed = randomSeed();
  for (let i = 0; i < 10000 && !def.matches(def.roll(seed), spot, prefs); i++) {
    seed = randomSeed();
  }
  return seed;
}
