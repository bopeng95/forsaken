import type { RF } from '../core/engine';
import type { Spot } from '../core/types';

export type Element2 = 'water' | 'lightning';
export type WindowKey = 'short' | 'long';
export type WoundColor = 'white' | 'black';
export type ChaosKind = 'tsunami' | 'inferno';

/**
 * Debuffs applied by one Grand Cross. Every pair is 1 support + 1 dps.
 * Across both casts each player holds exactly one water-or-lightning mark and
 * exactly one Acceleration Bomb; 2 players per cast get Cursed Shriek
 * (cast 1's shrieks resolve as the SHORT gaze, cast 2's as the LONG).
 */
export interface GrandCross {
  rf: RF;
  water: [Spot, Spot];
  lightning: [Spot, Spot];
  shriek: [Spot, Spot];
  /** bombs expiring at the short / long stack-spread window */
  accelShort: [Spot, Spot];
  accelLong: [Spot, Spot];
}

/**
 * One Mystery Magic telegraph pattern (all measured from FFLogs report
 * XGYVrK3yABfdn6ha fight 8 clone cast positions/facings):
 * - thunder: two parallel 10y-wide, arena-length lanes along a diagonal.
 *   `thunderAxisDeg` is the compass azimuth of the lane-pattern normal; a
 *   point at signed offset d = p·n(axis) is HIT iff d ∈ [0,10] ∪ [-20,-10]
 *   (the observed lanes sit at center-offsets +5 and -15 in every set).
 * - ice: quadrant cleaves from the arena center aimed at intercardinals,
 *   in opposite pairs. Pair 0 = NE+SW (45°/225°), pair 1 = SE+NW (135°/315°).
 */
export interface MmPattern {
  thunderAxisDeg: number;
  /** which opposite-quadrant pair carries this set's ice roll */
  icePair: 0 | 1;
  /** 4-cone sets (MM3, recorded ice) also show the other pair with the opposite tell */
  bothIcePairs: boolean;
}

export interface MmRoll {
  thunder: RF;
  ice: RF;
}

/** Full pre-rolled script of one Kefka Says attempt. */
export interface KefkaScript {
  seed: number;
  /** Grand Cross 1 (applies t≈24.2) and 2 (t≈39.1) */
  gc: [GrandCross, GrandCross];
  /** which gc's water/lightning marks resolve at the SHORT window (other → LONG) */
  shortMarksFrom: 0 | 1;
  /** cast order of the two Chaos casts (Entropy always RESOLVES first regardless) */
  chaosOrder: [ChaosKind, ChaosKind];
  tsunamiRF: RF;
  infernoRF: RF;
  /** Grand Cross 3: wound color per player (independent coin — log had a 5/3 split) */
  wounds: Record<Spot, WoundColor>;
  /** the 4 Allagan Field holders; the other 4 hold Beyond Death */
  allagan: Spot[];
  floodRF: RF;
  /** compass azimuth Neo Exdeath jumps to for Flood of Naught (edge, card/intercard) */
  neJumpDeg: number;
  /**
   * which side of the jump-axis diameter shows the WHITE orb: +1 = the
   * (neJumpDeg + 90) side. The side actually HIT by White Antilight flips
   * when the Flood of Naught cast is fake.
   */
  whiteSideSign: 1 | -1;
  /** Mystery Magic 1..3 element tells */
  mm: [MmRoll, MmRoll, MmRoll];
  mmPattern: [MmPattern, MmPattern, MmPattern];
  /** recorded Thrumming Thunder (t≈78–83): tell banked by Mana Charge */
  bankedThunder: RF;
  recThunderPattern: MmPattern;
  /** recorded Blizzard Blowout (t≈96–101) */
  bankedIce: RF;
  recIcePattern: MmPattern;
  /** the two rings displayed during Mana Release; same tell twice = REAL final AoE */
  ringThunder: RF;
  ringIce: RF;
  finalPattern: MmPattern;
}

/** Start-screen constraints on new pattern rolls ('any' = unconstrained). */
export interface KefkaPrefs {
  mark: Element2 | 'any';
  markWindow: WindowKey | 'any';
  gaze: 'yes' | 'no' | 'any';
  field: 'allagan' | 'beyond' | 'any';
}

/** Mana Release double negative: same tell twice = real, differing = fake. */
export function combineRF(a: RF, b: RF): RF {
  return a === b ? 'real' : 'fake';
}

/** the element that SPREADS in a window: real cast = lightning, fake = water */
export function spreadElem(rf: RF): Element2 {
  return rf === 'real' ? 'lightning' : 'water';
}
