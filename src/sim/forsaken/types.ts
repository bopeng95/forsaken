import type { Spot } from '../core/types';

export type Icon = 'cone' | 'spread' | 'stack';
export type Group = 'A' | 'B';

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
