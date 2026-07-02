export type Spot = 'T1' | 'T2' | 'H1' | 'H2' | 'M1' | 'M2' | 'R1' | 'R2';
export type RoleKind = 'T' | 'H' | 'M' | 'R';
export type Icon = 'cone' | 'spread' | 'stack';
export type Group = 'A' | 'B';

export interface Vec2 {
  x: number;
  y: number;
}

export const SPOTS: Spot[] = ['T1', 'T2', 'H1', 'H2', 'M1', 'M2', 'R1', 'R2'];

export function roleOf(spot: Spot): RoleKind {
  return spot[0] as RoleKind;
}

export function isSupport(spot: Spot): boolean {
  const r = roleOf(spot);
  return r === 'T' || r === 'H';
}

/** Pair partner within role: T1<->H1, T2<->H2, M1<->R1, M2<->R2 */
export function partnerOf(spot: Spot): Spot {
  const n = spot[1];
  switch (roleOf(spot)) {
    case 'T':
      return `H${n}` as Spot;
    case 'H':
      return `T${n}` as Spot;
    case 'M':
      return `R${n}` as Spot;
    case 'R':
      return `M${n}` as Spot;
  }
}

/** Full script of one attempt, rolled up-front from a seed. */
export interface AttemptScript {
  seed: number;
  /** which role side got cones (other side got spreads) in the initial roll */
  conesOn: 'supports' | 'dps';
  groupOf: Record<Spot, Group>;
  /** icons held by the 4 soakers of each set, index 0..7 = set 1..8 */
  soakIcons: Array<Partial<Record<Spot, Icon>>>;
  /** compass angle (deg, 0=N cw) of "relative south" (tower pair midpoint), per set */
  southDeg: number[];
  /** Future's End (true) or Past's End (false), for casts resolving after sets 2,4,6,8 */
  future: boolean[];
}

/** Start-screen constraints on new pattern rolls ('any' = unconstrained). */
export type GroupPref = Group | 'any';
export type IconPref = Icon | 'any';

export interface StartPrefs {
  group: GroupPref;
  icon: IconPref;
}

export type FailZone =
  | { kind: 'cone'; pos: Vec2; dirRad: number }
  | { kind: 'circle'; pos: Vec2; r: number };

export type FailInfo = {
  reason: string;
  /** where the user should have been, if applicable */
  ghost?: Vec2;
  /** players wrongly caught by the failing AoE */
  hit?: Spot[];
  /** players the failing AoE was supposed to hit but missed */
  missed?: Spot[];
  /** the AoE area that caused the fail, drawn highlighted on the frozen scene */
  zone?: FailZone;
};

export type Result = { kind: 'clear' } | ({ kind: 'fail' } & FailInfo);
