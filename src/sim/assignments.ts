import {
  MAX_MELEE,
  R_OUTER_RING,
  TOWER_DIST,
  TOWER_HALFSEP,
  WAYMARK_HALF,
  WAYMARK_NUM_R,
  WAYMARK_R,
  prioIndex,
} from './constants';
import { SOAK_ORDER, groupMembers } from './randomizer';
import type { AttemptScript, Group, Spot, Vec2 } from './types';
import { roleOf } from './types';

/**
 * Local frame: dDeg is a compass direction (0 = "relative north" = away from the
 * towers, clockwise) in the frame where the tower pair midpoint is at local south.
 */
export function lp(southDeg: number, dDeg: number, r: number): Vec2 {
  const world = (((southDeg + 180 + dDeg) % 360) * Math.PI) / 180;
  return { x: r * Math.sin(world), y: -r * Math.cos(world) };
}

export interface Duty {
  pos: Vec2;
  label: string;
  /** true if this duty means standing inside a tower at resolution */
  soaksTower?: 'left' | 'right';
}

export interface SetPlan {
  setIdx: number;
  southDeg: number;
  soakGroup: Group;
  parity: 'odd' | 'even';
  towerCenters: { left: Vec2; right: Vec2 };
  duties: Record<Spot, Duty>;
  towerMembers: { left: Spot[]; right: Spot[] };
  /** cone holder -> the player who must be nearest (intended bait) */
  coneBaiter: Partial<Record<Spot, Spot>>;
  /** stack holder -> expected 3 members (incl. holder) */
  stackMembers: Partial<Record<Spot, Spot[]>>;
  spreadHolders: Spot[];
  /** even sets: the 4 players who must be closest to Kefka at the clone snapshot */
  expectedClosest4?: Spot[];
  future?: boolean;
  /**
   * even sets: "relative south" of the frame the Past/Future bait is called in —
   * the NEXT set's tower orientation (set 8, with no next set, uses its own).
   */
  baitFrameSouth?: number;
  baitPos?: Vec2;
  /** safe spot after the cleave locks; only the movement target for set 8 (earlier sets go to next-set duties) */
  dodgePos?: Vec2;
}

// ---- Local-polar spot tables (deg, yalms), towers at local 225/135, r 11.2, radius 5.5.
// Values measured from the analyzer.wtfdig.info log replay where visible,
// by construction otherwise.
const ODD = {
  L_STACK: [225, R_OUTER_RING] as const, // stack on the boss hitbox ring, inside left tower
  L_CONE: [227, 13.7] as const, // in the tower, ~5.3y outside the stack holder (still in the 6y stack)
  // boss-side sliver: in stack radius but OUTSIDE the tower circle (11.2 - 5.4 = 5.8 > 5.5)
  L_HELP_T: [225, 5.4] as const,
  // idle healer: straight out behind the tower — outside the tower circle (5.9y
  // from its center) yet nearer to L_CONE (3.4y) than the stack holder (5.3y),
  // so the cone fires outward at the healer
  L_BAIT_H: [227, 17.1] as const,
  R_STACK: [135, 8.2] as const, // front of right tower, toward "new north"
  R_SPREAD: [141, 15.5] as const, // south side, in tower, >6y out of the stack (7.4y)
  R_HELP_M: [131, 5.4] as const, // idle melee: boss-side sliver, in right stack
  R_HELP_R: [139, 5.4] as const, // idle ranged: boss-side sliver, in right stack
};

const EVEN = {
  L_CONE: [245, 7.3] as const, // inner ring inside the tower, marker side
  R_CONE: [115, 7.3] as const,
  L_SPREAD: [213, 15.2] as const, // south of the tower, inside it
  R_SPREAD: [147, 15.2] as const,
  CLONE_NW: [315, R_OUTER_RING] as const, // idle tank on OUTER ring, relative NW
  CLONE_NE: [45, R_OUTER_RING] as const, // idle melee on OUTER ring, relative NE
};

/**
 * Even-set cone bait: the waymark beside each tower sits at world azimuth
 * southDeg ± 90 (relative 270 left / 90 right). Cardinal-south sets put a
 * LETTER mark there — stand on its boss-side edge; intercard-south sets put a
 * NUMBER mark there — stand at its back corner.
 */
function coneBaitMark(southDeg: number, side: 'left' | 'right'): readonly [number, number] {
  // number-mark corner = 0.8 * half-size * sqrt2 (the diamond is drawn at 0.8 scale, rotated 45°)
  const r =
    southDeg % 90 === 0
      ? WAYMARK_R - WAYMARK_HALF
      : WAYMARK_NUM_R + 0.8 * WAYMARK_HALF * Math.SQRT2;
  return [side === 'left' ? 270 : 90, r];
}

export function towerCenters(southDeg: number): { left: Vec2; right: Vec2 } {
  return {
    left: lp(southDeg, 180 + TOWER_HALFSEP, TOWER_DIST),
    right: lp(southDeg, 180 - TOWER_HALFSEP, TOWER_DIST),
  };
}

/**
 * Starting formation (world coords), from KR raidplan slide 4: partner pairs
 * (T1+H1, T2+H2, M1+R1, M2+R2) stand side by side — the partner is what decides
 * Group A/B. Supports west, DPS east; T/M inner column, H/R outer; 1s north row,
 * 2s south row.
 */
export const SETUP_POS: Record<Spot, Vec2> = {
  H1: { x: -11, y: -3.2 },
  T1: { x: -6.5, y: -3.2 },
  H2: { x: -11, y: 3.5 },
  T2: { x: -6.5, y: 3.5 },
  M1: { x: 6.5, y: -3.2 },
  R1: { x: 11, y: -3.2 },
  M2: { x: 6.5, y: 3.5 },
  R2: { x: 11, y: 3.5 },
};

function byPrio(spots: Spot[]): Spot[] {
  return spots.slice().sort((a, b) => prioIndex(a) - prioIndex(b));
}

export function buildSetPlan(script: AttemptScript, setIdx: number): SetPlan {
  const parity = setIdx % 2 === 1 ? 'odd' : 'even';
  const southDeg = script.southDeg[setIdx - 1];
  const soakGroup = SOAK_ORDER[setIdx - 1];
  const icons = script.soakIcons[setIdx - 1];
  const soakers = groupMembers(script, soakGroup);
  const idle = groupMembers(script, soakGroup === 'A' ? 'B' : 'A');
  const idleByRole = Object.fromEntries(idle.map((s) => [roleOf(s), s])) as Record<
    'T' | 'H' | 'M' | 'R',
    Spot
  >;

  const at = (d: readonly [number, number]) => lp(southDeg, d[0], d[1]);
  const duties = {} as Record<Spot, Duty>;
  const plan: SetPlan = {
    setIdx,
    southDeg,
    soakGroup,
    parity,
    towerCenters: towerCenters(southDeg),
    duties,
    towerMembers: { left: [], right: [] },
    coneBaiter: {},
    stackMembers: {},
    spreadHolders: [],
  };

  if (parity === 'odd') {
    const stacks = byPrio(soakers.filter((s) => icons[s] === 'stack'));
    const cone = soakers.find((s) => icons[s] === 'cone')!;
    const spread = soakers.find((s) => icons[s] === 'spread')!;
    const [stackL, stackR] = stacks;

    duties[stackL] = {
      pos: at(ODD.L_STACK),
      label: 'Soak LEFT tower — STACK on the boss hitbox ring',
      soaksTower: 'left',
    };
    duties[cone] = {
      pos: at(ODD.L_CONE),
      label: `Soak LEFT tower — CONE south, in the stack (${idleByRole.H} baits it)`,
      soaksTower: 'left',
    };
    duties[stackR] = {
      pos: at(ODD.R_STACK),
      label: 'Soak RIGHT tower — STACK in front, toward "new north"',
      soaksTower: 'right',
    };
    duties[spread] = {
      pos: at(ODD.R_SPREAD),
      label: 'Soak RIGHT tower — SPREAD south, inside the tower',
      soaksTower: 'right',
    };
    duties[idleByRole.T] = {
      pos: at(ODD.L_HELP_T),
      label: 'Help LEFT stack — hug the boss, just outside the tower',
    };
    duties[idleByRole.H] = {
      pos: at(ODD.L_BAIT_H),
      label: 'Bait LEFT cone — straight out behind the tower, out of the stack',
    };
    duties[idleByRole.M] = {
      pos: at(ODD.R_HELP_M),
      label: 'Help RIGHT stack — hug the boss, outside the tower',
    };
    duties[idleByRole.R] = {
      pos: at(ODD.R_HELP_R),
      label: 'Help RIGHT stack — hug the boss, outside the tower',
    };

    plan.towerMembers.left = [stackL, cone];
    plan.towerMembers.right = [stackR, spread];
    plan.coneBaiter[cone] = idleByRole.H;
    plan.stackMembers[stackL] = [stackL, cone, idleByRole.T];
    plan.stackMembers[stackR] = [stackR, idleByRole.M, idleByRole.R];
    plan.spreadHolders = [spread];
  } else {
    const [coneL, coneR] = byPrio(soakers.filter((s) => icons[s] === 'cone'));
    const [spreadL, spreadR] = byPrio(soakers.filter((s) => icons[s] === 'spread'));

    duties[coneL] = {
      pos: at(EVEN.L_CONE),
      label: `Soak LEFT tower — CONE on the inner ring at tower edge (${idleByRole.H} baits)`,
      soaksTower: 'left',
    };
    duties[coneR] = {
      pos: at(EVEN.R_CONE),
      label: `Soak RIGHT tower — CONE on the inner ring at tower edge (${idleByRole.R} baits)`,
      soaksTower: 'right',
    };
    duties[spreadL] = {
      pos: at(EVEN.L_SPREAD),
      label: 'Soak LEFT tower — SPREAD south edge',
      soaksTower: 'left',
    };
    duties[spreadR] = {
      pos: at(EVEN.R_SPREAD),
      label: 'Soak RIGHT tower — SPREAD south edge',
      soaksTower: 'right',
    };
    duties[idleByRole.T] = {
      pos: at(EVEN.CLONE_NW),
      label: 'Bait LEFT clone — relative NW, ON the outer ring (no further out!)',
    };
    duties[idleByRole.M] = {
      pos: at(EVEN.CLONE_NE),
      label: 'Bait RIGHT clone — relative NE, ON the outer ring (no further out!)',
    };
    duties[idleByRole.H] = {
      pos: at(coneBaitMark(southDeg, 'left')),
      label: 'Bait LEFT cone on the marker beside the tower',
    };
    duties[idleByRole.R] = {
      pos: at(coneBaitMark(southDeg, 'right')),
      label: 'Bait RIGHT cone on the marker beside the tower',
    };

    plan.towerMembers.left = [coneL, spreadL];
    plan.towerMembers.right = [coneR, spreadR];
    plan.coneBaiter[coneL] = idleByRole.H;
    plan.coneBaiter[coneR] = idleByRole.R;
    plan.spreadHolders = [spreadL, spreadR];
    plan.expectedClosest4 = [coneL, coneR, idleByRole.T, idleByRole.M];

    const future = script.future[setIdx / 2 - 1];
    // The bait is called in the NEXT set's tower frame — those towers telegraph
    // while the bait happens. Set 8 has no next set: use its own frame.
    const baitFrameSouth = setIdx < 8 ? script.southDeg[setIdx] : southDeg;
    plan.future = future;
    plan.baitFrameSouth = baitFrameSouth;
    plan.baitPos = lp(baitFrameSouth, future ? 0 : 180, MAX_MELEE);
    plan.dodgePos = lp(baitFrameSouth, 180, MAX_MELEE);
  }

  return plan;
}
