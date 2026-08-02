// ---- P4 "Kefka Says" geometry (yalms) and timings (seconds).
// Every timing below is measured from FFLogs report XGYVrK3yABfdn6ha fight 8
// (a clean P4 clear), quoted as seconds from the phase-4 transition
// (report time 5669325 ms). AoE geometry comes from the Action sheet
// (CastType/EffectRange/XAxisModifier) cross-checked against the logged cast
// source positions/facings; resolution positioning follows the "P4 Kefka Says
// Gazes Mid" raidplan (raidplan.io/plan/ChcTBFAcFMZKFVKo) and the real/fake
// rules in wtfdig's p4-helper (github.com/mczub/wtfdig).

/**
 * Sim-only lead trim: the sim clock runs `logT - P4_TRIM` so the run starts
 * ~1s before the Kefka Says castbar instead of idling through the phase
 * transition. Not a measured timing.
 */
export const P4_TRIM = 4.0;

// ---- Cast timings (log seconds; begincast times, cast lengths from `duration`)
/** Kefka Says begincast 5.16, 4.7s cast */
export const KEFKA_SAYS_T = 5.16;
export const KEFKA_SAYS_CAST = 4.7;

/** Mystery Magic 1/2/3 begincasts (Kefka + clone telegraphs spawn together) */
export const MM_T = [14.74, 29.72, 44.86] as const;
export const MM_CAST = 4.7;
/**
 * telegraph begincast -> damage snapshot: every logged pair (MM sets, recorded
 * casts, Stray Flames/Spray, final telegraphs) resolves 4.99–5.0s after the
 * begincast — the 4.7s cast plus this effect delay.
 */
export const MM_HIT_DELAY = 0.3;

/** Grand Cross 1/2/3 begincasts (Neo Exdeath, 8.7s cast) */
export const GC_T = [15.19, 30.12, 45.13] as const;
export const GC_CAST = 8.7;
/** debuff application times (applydebuff events; GC3's land 1.4s after its cast) */
export const GC_APPLY = [24.15, 39.12, 55.55] as const;

/** the two Chaos casts (Tsunami/Inferno in script order, 8.7s casts) */
export const CHAOS_T = [20.27, 35.24] as const;
export const CHAOS_CAST = 8.7;

/** Dynamic Fluid applied to all 8 (84.0s duration -> expires 113.81) */
export const FLUID_APPLY_T = 29.81;
export const FLUID_DUR = 84.0;
/** Entropy applied to all 8 (45.0s duration -> expires 90.95; always resolves FIRST) */
export const ENTROPY_APPLY_T = 45.97;
export const ENTROPY_DUR = 45.0;

/** Neo Exdeath jump tell (2.7s cast id 50516), then it stands at the arena edge */
export const NE_JUMP_T = 53.01;
export const NE_JUMP_CAST = 2.7;

/** White/Black Antilight + Edge of Death begincast (5.2s) alongside Flood of Naught (4.7s) */
export const ANTILIGHT_T = 61.3;
export const ANTILIGHT_CAST = 5.2;
export const FLOOD_CAST = 4.7;
/** the antilight halves + kill laser hit (cast events at 66.78) */
export const ANTILIGHT_HIT_T = 66.78;

/** Death Surge — the Allagan Field / Beyond Death outcome damage (cosmetic here) */
export const DEATH_SURGE_T = 70.61;

/** Mana Charge (2.7s) — banks the next Thunder and Blizzard tells */
export const MANA_CHARGE_T = 71.94;
export const MANA_CHARGE_CAST = 2.7;

/** Acceleration Bomb expiries (removedebuff): short window 75.15, long 100.12 */
export const ACCEL_EXPIRE = { short: 75.15, long: 100.12 } as const;
/** Death Bolt (spreads) + Death Wave (stacks) resolve moments */
export const STACKSPREAD_T = { short: 75.24, long: 100.26 } as const;

/** recorded Thrumming Thunder begincast (Kefka 50654 + 2 clones; tell banked) */
export const REC_THUNDER_T = 78.18;
/** Cursed Shriek expiries; Death Shriek damage follows ~0.1s later */
export const GAZE_EXPIRE = { short: 84.19, long: 108.14 } as const;

/** Ultima Upsurge begincasts (4.7s raidwides; the 2nd ends the phase) */
export const UPSURGE_T = [88.33, 127.22] as const;
export const UPSURGE_CAST = 4.7;

/** Stray Flames ×8 begincast — the Entropy twisters DROP here, hit 4.99s later */
export const STRAY_FLAMES_T = 91.04;
/** recorded Blizzard III Blowout begincast (Kefka 47765 + 4 clones; tell banked) */
export const REC_ICE_T = 96.16;

/** Mana Release (6.7s) — shows the two rings, combines with the banked tells */
export const MANA_RELEASE_T = 107.43;
export const MANA_RELEASE_CAST = 6.7;

/** Stray Spray ×8 begincast — the Dynamic Fluid drop, hit 4.99s later */
export const STRAY_SPRAY_T = 113.89;
/** final Thunder + Blizzard telegraphs (dodge only if the combined tell is REAL) */
export const FINAL_MM_T = 114.52;

/** the 2nd Ultima Upsurge lands 132.21; the sim clears shortly after */
export const CLEAR_T = 133.5;

// ---- AoE geometry
/**
 * Thrumming Thunder III (47775): CastType 12 rect, EffectRange 40,
 * XAxisModifier 10 = FULL width (the two antilight rects' XAxis 21 tile the
 * 40y arena in halves the same way). Each set spawns two parallel 10y lanes;
 * the logged lane centers sit at signed offsets +5 and -15 along the pattern
 * normal in every set, i.e. hit iff offset ∈ [0,10] ∪ [-20,-10].
 */
export const THUNDER_LANE_W = 10;
export const THUNDER_LEN = 40;
/**
 * Blizzard III Blowout (47768/47771/47774): CastType 13, EffectRange 40, cast
 * from the arena center aimed at the 4 intercardinals (logged facings 45.2 /
 * 135.7 / 225.7 / 315.2) — quadrant cleaves. 47774 is the NE+SW pair, 47771
 * the SE+NW pair; 47768 covers the 2-cone sets.
 */
export const ICE_HALF_DEG = 45;
export const ICE_LEN = 40;
/** Death Bolt / Death Wave (47896–47899): EffectRange 8 */
export const SPREAD8_R = 8;
export const STACK8_R = 8;
/** Stray Flames (47906): EffectRange 6 — the dropped Entropy twister circle */
export const STRAY_FLAME_R = 6;
/**
 * Stray Spray (47909) donut: EffectRange 6; the Action sheet doesn't expose
 * the hole radius — sim estimate ("size roughly the boss hitbox", raidplan
 * slide 18): stand within 2.5y of your drop point to stay in the hole.
 */
export const DONUT_R_IN = 2.5;
export const DONUT_R_OUT = 6;
/**
 * Edge of Death (50070): rect length 48, XAxisModifier 2 = FULL width — a 2y
 * kill laser on the boundary diameter between the two antilight halves.
 * (White/Black Antilight 50068/50069: length 47, width 21, sources at ±9.5y —
 * each covers its half out to 1y past the middle.)
 */
export const EDGE_HALFW = 1.0;

// ---- Check tolerances (sim approximations, tuned; not game data)
/** real Acceleration Bomb: total drift under this over the armed window = still */
export const STILL_EPS = 0.3;
/** fake Acceleration Bomb: must have moved at least this over the armed window */
export const MOTION_MIN = 0.8;
/** seconds before an accel expiry at which the stillness snapshot arms */
export const ACCEL_ARM = 0.7;
/**
 * Hints-mode guidance lead: the FREEZE!/MOVE! accel cue appears this many
 * seconds before bomb expiry (the armed window ACCEL_ARM = 0.7s is too short to
 * read a label and react). Complying early is always safe: stillness before the
 * armed window never fails a real bomb, and motion only accumulates inside the
 * window, where the cue keeps demanding it. Sim-only, not game data.
 */
export const ACCEL_CUE_LEAD = 3.0;
/**
 * Hints ghost clearance: during pure dodges the dashed ghost is pushed until a
 * disc this big fits entirely inside safe ground, so the circle never straddles
 * a telegraph edge (a half-in circle reads as ambiguous). Slightly larger than
 * the ghost's 1.3y draw radius. Sim-only display tuning, not game data.
 */
export const GHOST_CLEAR = 1.6;
/** real gaze: dot(facing, towards holder) must be below this (strictly looking away) */
export const GAZE_AWAY_DOT = 0;
/** fake gaze: must face a shriek holder within 60° */
export const GAZE_AT_COS = 0.5;

// ---- Startup asserts tying the measured web together (import-time, browser + scripts)
if (ACCEL_EXPIRE.short > STACKSPREAD_T.short || ACCEL_EXPIRE.long > STACKSPREAD_T.long) {
  throw new Error('accel bombs must expire before their stack/spread window resolves');
}
for (let i = 0; i < 3; i++) {
  if (GC_T[i] + GC_CAST > GC_APPLY[i] + 1e-9) {
    throw new Error('Grand Cross debuffs cannot apply before the cast ends');
  }
}
if (GAZE_EXPIRE.short <= REC_THUNDER_T + MM_CAST + MM_HIT_DELAY) {
  throw new Error('the short gaze must resolve after the recorded Thunder telegraph');
}
if (ENTROPY_APPLY_T + ENTROPY_DUR >= STRAY_FLAMES_T + MM_CAST + MM_HIT_DELAY) {
  throw new Error('Entropy must expire before the Stray Flames hit');
}
if (FLUID_APPLY_T + FLUID_DUR >= STRAY_SPRAY_T + MM_CAST + MM_HIT_DELAY) {
  throw new Error('Dynamic Fluid must expire before the Stray Spray hit');
}
if (MANA_RELEASE_T + MANA_RELEASE_CAST >= FINAL_MM_T + MM_CAST + MM_HIT_DELAY) {
  throw new Error('Mana Release must finish before the final telegraphs resolve');
}
