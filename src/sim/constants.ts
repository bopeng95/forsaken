import type { Spot } from './types';

// ---- World geometry (yalms). North = up, compass angles in degrees clockwise from N.
// Measured from FFLogs report mvDy6P2xHjCdZptq (v2 API event coordinates,
// arena center = map (100,100), Kefka fixed exactly there) plus the Action
// sheet EffectRange values for the AoE sizes. The old diagram-derived layout
// was uniformly inflated by 7/5; rescaling by 5/7 lands exactly on the
// game-data numbers (towers 8.0y / r4, spread = stack = 5).
export const R_ARENA = 20;
/** Kefka's outer hitbox / target ring — clone baiters stand ON this. */
export const R_OUTER_RING = 6.0;
/** inner hitbox ring — even-set cone soakers stand ON it (observed 4.9–5.0y) */
export const R_INNER_RING = 5.0;
/**
 * bots path around this radius so they don't clip through the boss (not lethal
 * to the player). Must stay below the odd-set stack helpers at r≈3.86.
 */
export const R_DEADZONE = 3.4;

/** every logged tower (94 casts, 11 pulls) sits at exactly 8.00y from center */
export const TOWER_DIST = 8.0;
/** towers sit at relative-south ± this (degrees) — pair is 90° apart in every log */
export const TOWER_HALFSEP = 45;
/** Action 47806 "the Path of Light": EffectRange 4 */
export const R_TOWER = 4.0;

/**
 * Waymarks (diagram layout rescaled ×5/7 — FFLogs doesn't expose waymark
 * placement): letters A/B/C/D on the cardinals at 12y; numbers 1/2/3/4 on the
 * intercards at exactly letters / sqrt2, so each number sits on the midpoint
 * of the A-B-C-D square's edge (the path A-2-B-3-C-4-D-1 traces that square).
 * Keeping this relation also keeps the even-set letter-mark cone bait nearest
 * to its cone soaker (observed baiters stand at 9.8–10.8y).
 */
export const WAYMARK_R = 12.0;
export const WAYMARK_NUM_R = WAYMARK_R / Math.SQRT2;
/** letter marks are circles of this radius (yalms) */
export const WAYMARK_LETTER_R = 1.25;
/** number marks are world-axis-aligned squares of this half-side (yalms) */
export const WAYMARK_NUM_HALF = 1.14;

// ---- AoE sizes (Action sheet: Spellscatter/Spelldriver/F-P-End EffectRange 5)
export const STACK_R = 5;
export const SPREAD_R = 5;
/**
 * clone spawn explosion (Future's/Past's End damage) — point-blank on each
 * baiter. Kept equal to SPREAD_R because the renderer draws all 'spread'
 * effects at SPREAD_R (and the game value is also 5).
 */
export const CLONE_SPREAD_R = SPREAD_R;
export const CONE_HALF_DEG = 45;
/** Action 47810 "Spellwave": CastType 13 cone, EffectRange 40 (spans the arena) */
export const CONE_LEN = 40;
/** hitbox ring 6 + melee reach 3.5 — real bait stacks observed at 8.9–9.6y */
export const MAX_MELEE = 9.5;

// ---- Movement
export const MOVE_SPEED = 6.0;
/** bots "sprint" slightly so they always make position after big tower rotations */
export const BOT_SPEED = 6.6;
/** FFXIV Sprint is +30% movement speed */
export const SPRINT_SPEED = MOVE_SPEED * 1.3;
export const SPRINT_DURATION = 10;
/** recharge starts at the press, not when the buff ends */
export const SPRINT_COOLDOWN = 60;
/** Dash (key 1) modeled on Dancer's En Avant: a 10y burst with charges */
export const DASH_DIST = 10;
export const DASH_CHARGES = 3;
export const DASH_RECHARGE = 30;
/** rendered as a very fast slide, not a teleport */
export const DASH_DURATION = 0.25;

// ---- Timings (seconds), matched to the cactbot dancing_mad timeline:
// towers resolve every ~10s; Future's/Past's End resolves 1.3s BEFORE the even
// soak (clones spawn on the 4 closest and explode), and the bait/lock/cleave
// sequence overlaps the next odd set's telegraph, the cleave landing 0.3s
// before its soak.
/**
 * Sim-only start buffer: delay from run start (t=0, icons already shown) to
 * tower 1's telegraph spawning. Not a measured in-game timing — kept short so
 * the first soak (SETUP_T + TELEGRAPH_T = 11s) matches the ~10–11s rhythm of
 * every later set instead of the real fight's idle 13.2s lead-in.
 */
export const SETUP_T = 1.0;
/** tower spawn -> soak resolution */
export const TELEGRAPH_T = 10;
/** even resolve -> bait call (everyone heads to the Past/Future stack) */
export const BAIT_DELAY = 1.0;
/** bait call -> All Things Ending cast start (bait lock) */
export const BAIT_WINDOW = 4.7;
/** All Things Ending cast time (lock -> cleave) */
export const ATE_CAST = 5.0;
/** All Things Ending cleave -> the next odd set's towers resolve */
export const CLEAVE_TO_SOAK = 0.3;
/** odd resolve -> Future's/Past's End castbar starts */
export const FP_CAST_DELAY = 2.3;
/**
 * Future's/Past's End cast time. The cast ends at odd resolve + 8.7 (cactbot:
 * 257.8 - 249.1), 1.3s before the even soak — the clone snapshot + explosion.
 */
export const FP_CAST = 6.4;
/** how long a (re)assigned Spell's Trouble icon stays visible (unless "display debuff indefinitely" is on) */
export const ICON_SHOW_T = 5.0;

// The odd towers spawn at the bait call and resolve CLEAVE_TO_SOAK after the
// cleave — consistent with the 10s telegraph by construction:
// 4.7 + 5.0 + 0.3 = 10.
if (Math.abs(BAIT_WINDOW + ATE_CAST + CLEAVE_TO_SOAK - TELEGRAPH_T) > 1e-9) {
  throw new Error('bait sequence must span exactly one tower telegraph');
}
// The F/P End cast (snapshot + clone explosion) must resolve before the even soak.
if (FP_CAST_DELAY + FP_CAST >= TELEGRAPH_T) {
  throw new Error("Future's/Past's End must resolve before the even towers");
}

/**
 * If the user is closer than this to the arena center at the cleave lock, their
 * position can't define a diameter — fall back to the ideal frame direction.
 */
export const BAIT_CENTER_EPS = 1;

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
