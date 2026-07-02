import type { Spot } from './types';

// ---- World geometry (yalms). North = up, compass angles in degrees clockwise from N.
// Measured from the analyzer.wtfdig.info log replay (arena rim = canvas edge,
// scale anchored at R_ARENA = 20).
export const R_ARENA = 20;
/** Kefka's outer hitbox / target ring — clone baiters stand ON this. */
export const R_OUTER_RING = 8.4;
/** inner hitbox ring — even-set cone soakers stand just outside where towers cross it */
export const R_INNER_RING = 7.0;
/**
 * bots path around this radius so they don't clip through the boss (not lethal
 * to the player). Must stay below the odd-set stack helpers at r≈5.4.
 */
export const R_DEADZONE = 4.8;

export const TOWER_DIST = 11.2;
/** towers sit at relative-south ± this (degrees) — ±45 measured from the log replay */
export const TOWER_HALFSEP = 45;
export const R_TOWER = 5.5;

/**
 * Waymarks: numbers 1/2/3/4 on the intercards at 11.5y (measured from the log
 * replay); letters A/B/C/D on the cardinals at exactly numbers x sqrt2, so each
 * number sits on the midpoint of the A-B-C-D square's edge (the path
 * A-2-B-3-C-4-D-1 traces that square). Keeping the letters on this radius also
 * keeps the even-set letter-mark cone bait nearest to its cone soaker.
 */
export const WAYMARK_NUM_R = 11.5;
export const WAYMARK_R = WAYMARK_NUM_R * Math.SQRT2;
/** marker half-size (yalms) — shared by rendering and the bait-on-marker math */
export const WAYMARK_HALF = 1.5;

// ---- AoE sizes
export const STACK_R = 7;
export const SPREAD_R = 5.5;
export const CONE_HALF_DEG = 45;
export const CONE_LEN = 30;
export const MAX_MELEE = 12;

// ---- Movement
export const MOVE_SPEED = 6.0;
/** bots "sprint" slightly so they always make position after big tower rotations */
export const BOT_SPEED = 6.6;
/** FFXIV Sprint is +30% movement speed */
export const SPRINT_SPEED = MOVE_SPEED * 1.3;
export const SPRINT_DURATION = 10;
/** recharge starts at the press, not when the buff ends */
export const SPRINT_COOLDOWN = 60;

// ---- Timings (seconds), matched to the cactbot dancing_mad timeline:
// towers resolve every ~10s; the even-set Past/Future sequence overlaps the
// next odd set's telegraph, with the cleave landing 0.3s before its soak.
export const SETUP_T = 3.5;
/** tower spawn -> soak resolution */
export const TELEGRAPH_T = 10;
/** even resolve -> clone snapshot (clones spawn on the 4 closest) */
export const SNAPSHOT_DELAY = 1.0;
/** clone snapshot -> All Things Ending cast start (bait lock) */
export const BAIT_WINDOW = 4.7;
/** All Things Ending cast time (lock -> cleave) */
export const ATE_CAST = 5.0;
/** All Things Ending cleave -> the next odd set's towers resolve */
export const CLEAVE_TO_SOAK = 0.3;
/** odd resolve -> Future's/Past's End castbar starts */
export const FP_CAST_DELAY = 3.0;
/** Future's/Past's End cast time (castbar visual only) */
export const FP_CAST = 6.4;

// The odd towers spawn at the snapshot and resolve CLEAVE_TO_SOAK after the
// cleave — consistent with the 10s telegraph by construction:
// 4.7 + 5.0 + 0.3 = 10.
if (Math.abs(BAIT_WINDOW + ATE_CAST + CLEAVE_TO_SOAK - TELEGRAPH_T) > 1e-9) {
  throw new Error('bait sequence must span exactly one tower telegraph');
}

export const BAIT_TOL = 4.5;

/**
 * Tower flex priority for duplicate debuffs, leftmost entry takes the LEFT tower.
 * Kroxy-Rinon uses "HTMR" (Healer > Tank > Melee > Ranged, 1 before 2).
 * Note: the Icy Veins write-up instead describes conga H1 T1 T2 H2 / R1 M1 M2 R2
 * (ranged leftmost among DPS); swap M/R below if your group runs that.
 */
export const TOWER_PRIO: Spot[] = ['H1', 'H2', 'T1', 'T2', 'M1', 'M2', 'R1', 'R2'];

export function prioIndex(spot: Spot): number {
  return TOWER_PRIO.indexOf(spot);
}
