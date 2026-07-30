import { compass } from '../core/motion';
import type { Spot, Vec2 } from '../core/types';
import { SPOTS, isSupport } from '../core/types';
import { markOf, markWindowOf } from './randomizer';
import type { KefkaScript, WindowKey, WoundColor } from './types';
import { spreadElem } from './types';

/** where to stand + what the HUD hint says (same shape as Forsaken's Duty) */
export interface Duty {
  pos: Vec2;
  label: string;
}

// ---- Fixed world-frame spots (yalms), from the "Gazes Mid" raidplan markers
// (600px arena canvas = 40y, so yalms = px/15). Slide 15: stack clusters sit
// N/S at r≈9.5–12.5, spreads W/E at r≈14 ("EVERYONE MAX MELEE, don't wall").

/** stack cluster positions, radially in line so everyone sits ON the N-S seam
 * (the recorded-ice quadrant cleaves aim at intercardinals — cardinal seams
 * dodge the real quadrants AND count as covered by adjacent fake ones, see
 * engine iceHit/iceCovers) */
const STACK_R_NEAR = 9.6;
const STACK_R_MID = 11.4;
const STACK_R_FAR = 13.2;
/** spread holders on the W/E cardinal seam, raidplan slide 15 (r≈14) */
const SPREAD_R_POS = 14;

/**
 * Opening ring while Mystery Magic 1–3 telegraphs: supports on the west arc,
 * DPS east (mirrors the party's pre-pull split), on the boss outer ring where
 * every telegraph pattern leaves nearby safe ground.
 */
export const OPENING_RING: Record<Spot, Vec2> = {
  H1: compass(315, 8),
  T1: compass(285, 8),
  T2: compass(255, 8),
  H2: compass(225, 8),
  M1: compass(45, 8),
  R1: compass(75, 8),
  R2: compass(105, 8),
  M2: compass(135, 8),
};

/**
 * The twister/donut drop cluster. The raidplan stacks dead center; the sim's
 * bot steering never enters the boss deadzone (r 3.7), so the cluster is a
 * tight column just south of it — exactly on the S cardinal seam (safe from
 * every real ice quadrant, and covered by an adjacent fake one) and packed so
 * every donut hole covers everyone. The randomizer constrains the final
 * thunder axis (real lanes miss this column, fake lanes cover it) when the
 * Dynamic Fluid drop is the stay-in-hole kind.
 */
export const DROP_CLUSTER: Record<Spot, Vec2> = Object.fromEntries(
  SPOTS.map((s, i) => [s, { x: 0, y: 3.9 + i * 0.3 }]),
) as Record<Spot, Vec2>;

/** members of a role side ordered T1 T2 H1 H2 / M1 M2 R1 R2 */
function side(sup: boolean): Spot[] {
  return SPOTS.filter((s) => isSupport(s) === sup);
}

export interface WindowPlan {
  window: WindowKey;
  /** the element that spreads this window (real cast = lightning, fake = water) */
  spread: 'water' | 'lightning';
  duties: Record<Spot, Duty>;
  spreadHolders: Spot[];
  /** stack holder -> expected 3 members (incl. holder) */
  stackMembers: Partial<Record<Spot, Spot[]>>;
}

/**
 * Stack/spread window duties (Death Bolt r8 spreads / Death Wave r8 stacks):
 * spread holders go Supports W / DPS E; each role side's stack (the marked
 * holder + the 2 side members without marks this window) goes N (supports) /
 * S (DPS), lined up radially on the cardinal seam.
 */
export function buildWindowPlan(script: KefkaScript, window: WindowKey): WindowPlan {
  const gcIdx = window === 'short' ? script.shortMarksFrom : ((1 - script.shortMarksFrom) as 0 | 1);
  const g = script.gc[gcIdx];
  const spread = spreadElem(g.rf);
  const stackElem = spread === 'water' ? 'lightning' : 'water';
  const duties = {} as Record<Spot, Duty>;
  const plan: WindowPlan = { window, spread, duties, spreadHolders: [], stackMembers: {} };

  for (const supSide of [true, false]) {
    const members = side(supSide);
    const spreadHolder = g[spread].find((s) => members.includes(s))!;
    const stackHolder = g[stackElem].find((s) => members.includes(s))!;
    const helpers = members.filter((s) => s !== spreadHolder && s !== stackHolder);
    const stackDeg = supSide ? 0 : 180; // supports N, DPS S
    const spreadDeg = supSide ? 270 : 90; // supports W, DPS E

    duties[spreadHolder] = {
      pos: compass(spreadDeg, SPREAD_R_POS),
      label: `Your ${spread.toUpperCase()} spreads (${window}) — max melee ${supSide ? 'WEST' : 'EAST'}, alone`,
    };
    duties[stackHolder] = {
      pos: compass(stackDeg, STACK_R_MID),
      label: `Your ${stackElem.toUpperCase()} is the ${window} stack — ${supSide ? 'NORTH' : 'SOUTH'}, supports join you`,
    };
    duties[helpers[0]] = {
      pos: compass(stackDeg, STACK_R_NEAR),
      label: `Share the ${supSide ? 'NORTH' : 'SOUTH'} ${window} stack`,
    };
    duties[helpers[1]] = {
      pos: compass(stackDeg, STACK_R_FAR),
      label: `Share the ${supSide ? 'NORTH' : 'SOUTH'} ${window} stack`,
    };
    plan.spreadHolders.push(spreadHolder);
    plan.stackMembers[stackHolder] = [stackHolder, ...helpers];
  }
  return plan;
}

// ---- Gazes ---------------------------------------------------------------

export interface GazePlan {
  holders: [Spot, Spot];
  duties: Record<Spot, Duty>;
}

/**
 * 1st gaze (raidplan slide 16): shriek holders inside the hitbox (only them!),
 * everyone else lined up along the live Thrumming Thunder lane edge —
 * supports toward the north end of the line, DPS south.
 * The frame follows the recorded-thunder pattern axis: n = pattern normal
 * (hit lanes at n·p ∈ [0,10] ∪ [-20,-10]), u = lane direction. A REAL
 * recorded thunder hits its lanes, so the lineup sits at a small NEGATIVE n
 * offset (the gap just off the near lane); a FAKE one inverts — only the
 * lanes are safe — so the whole formation mirrors to a POSITIVE offset just
 * inside the near lane.
 */
export function buildGazeShortPlan(script: KefkaScript): GazePlan {
  const holders = script.gc[0].shriek;
  const axis = script.recThunderPattern.thunderAxisDeg;
  const n = compass(axis, 1);
  let u = compass(axis + 90, 1);
  if (u.y > 0) u = { x: -u.x, y: -u.y }; // u points to the north-ish end (supports' side)
  const laneSign = script.bankedThunder === 'fake' ? 1 : -1;
  const at = (off: number, along: number): Vec2 => ({
    x: n.x * off * laneSign + u.x * along,
    y: n.y * off * laneSign + u.y * along,
  });
  const lineWord =
    script.bankedThunder === 'fake'
      ? 'Line up INSIDE the fake thunder lane'
      : 'Line up on the thunder edge';

  const rfWord = script.gc[0].rf === 'real' ? 'party looks AWAY' : 'party looks AT them';
  const duties = {} as Record<Spot, Duty>;
  const [supHolder, dpsHolder] = holders;
  duties[supHolder] = {
    pos: at(1.4, 2.2),
    label: `Your SHRIEK (short) — under the boss, north side; ${rfWord}`,
  };
  duties[dpsHolder] = {
    pos: at(1.4, -2.2),
    label: `Your SHRIEK (short) — under the boss, south side; ${rfWord}`,
  };
  const supLine = side(true).filter((s) => s !== supHolder);
  const dpsLine = side(false).filter((s) => s !== dpsHolder);
  supLine.forEach((s, i) => {
    duties[s] = {
      pos: at(2.1, 7.2 + i * 2.6),
      label: `${lineWord}, north side — shrieks (${holders.join('+')}) resolve soon`,
    };
  });
  dpsLine.forEach((s, i) => {
    duties[s] = {
      pos: at(2.1, -(7.2 + i * 2.6)),
      label: `${lineWord}, south side — shrieks (${holders.join('+')}) resolve soon`,
    };
  });
  return { holders, duties };
}

/**
 * 2nd gaze (raidplan slide 20): holders under the boss (support N, DPS S of
 * it), everyone else on a loose ring — supports on the north arc, DPS south.
 * No telegraphs are live, so this uses the true-north frame.
 */
export function buildGazeLongPlan(script: KefkaScript): GazePlan {
  const holders = script.gc[1].shriek;
  const rfWord = script.gc[1].rf === 'real' ? 'party looks AWAY' : 'party looks AT them';
  const duties = {} as Record<Spot, Duty>;
  const [supHolder, dpsHolder] = holders;
  duties[supHolder] = {
    pos: compass(0, 2.2),
    label: `Your SHRIEK (long) — under the boss, north; ${rfWord}`,
  };
  duties[dpsHolder] = {
    pos: compass(180, 2.2),
    label: `Your SHRIEK (long) — under the boss, south; ${rfWord}`,
  };
  const supLine = side(true).filter((s) => s !== supHolder);
  const dpsLine = side(false).filter((s) => s !== dpsHolder);
  supLine.forEach((s, i) => {
    duties[s] = {
      pos: compass(315 + i * 45, 8.2),
      label: `North arc for the long shrieks (${holders.join('+')})`,
    };
  });
  dpsLine.forEach((s, i) => {
    duties[s] = {
      pos: compass(135 + i * 45, 8.2),
      label: `South arc for the long shrieks (${holders.join('+')})`,
    };
  });
  return { holders, duties };
}

// ---- Antilight -----------------------------------------------------------

export interface AntilightPlan {
  /** the boundary diameter runs along the jump azimuth; sides are ±(jump+90) */
  jumpDeg: number;
  /** +1: White Antilight HITS the (jump+90) side (orb side already flip-adjusted) */
  whiteHitSign: 1 | -1;
  /** the color each player must be hit by, and which side that is */
  needed: Record<Spot, { color: WoundColor; sign: 1 | -1 }>;
  duties: Record<Spot, Duty>;
}

/**
 * Flood of Naught: Allagan Field takes the OPPOSITE color to their Wound,
 * Beyond Death the SAME (the debuffs' own real/fake is internally consistent
 * and ignorable — raidplan slide 3); a fake Flood cast swaps which side each
 * color HITS relative to the displayed orbs. Slots fan out per side, well
 * clear of the Edge of Death kill laser on the boundary.
 */
export function buildAntilightPlan(script: KefkaScript): AntilightPlan {
  const jumpDeg = script.neJumpDeg;
  const whiteHitSign = (
    script.floodRF === 'real' ? script.whiteSideSign : -script.whiteSideSign
  ) as 1 | -1;
  const needed = {} as AntilightPlan['needed'];
  const duties = {} as Record<Spot, Duty>;

  // frame: a = along the boundary (toward NE's jump spot), m = the +side normal
  const a = compass(jumpDeg, 1);
  const m = compass(jumpDeg + 90, 1);
  // 8 slots per side so any wound distribution fits (log had a 5/3 split)
  const slots: Array<[number, number]> = [
    [5.5, -7], [5.5, -2.5], [5.5, 2.5], [5.5, 7],
    [9.5, -7], [9.5, -2.5], [9.5, 2.5], [9.5, 7],
  ];
  const used = { 1: 0, [-1]: 0 } as Record<1 | -1, number>;

  for (const s of SPOTS) {
    const wound = script.wounds[s];
    const isAF = script.allagan.includes(s);
    const color: WoundColor = isAF ? (wound === 'white' ? 'black' : 'white') : wound;
    const sign = (color === 'white' ? whiteHitSign : -whiteHitSign) as 1 | -1;
    needed[s] = { color, sign };
    const [perp, along] = slots[used[sign]++];
    duties[s] = {
      pos: {
        x: m.x * perp * sign + a.x * along,
        y: m.y * perp * sign + a.y * along,
      },
      label: `${isAF ? 'ALLAGAN FIELD: take the OPPOSITE color' : 'BEYOND DEATH: take YOUR color'} — get hit by ${color.toUpperCase()} (never touch the middle laser!)`,
    };
  }
  return { jumpDeg, whiteHitSign, needed, duties };
}

// ---- Twister escape ring -------------------------------------------------

/**
 * Where each player runs after dropping a twister mid: a wide ring spot chosen
 * NEAR their next window's duty (so long-window stillness bombs and the next
 * stacks are reachable in time), ≥6y from the drop cluster and from each other.
 */
export function escapeRing(script: KefkaScript, window: WindowKey): Record<Spot, Vec2> {
  const gcIdx = window === 'short' ? script.shortMarksFrom : ((1 - script.shortMarksFrom) as 0 | 1);
  const g = script.gc[gcIdx];
  const spread = spreadElem(g.rf);
  const out = {} as Record<Spot, Vec2>;
  for (const supSide of [true, false]) {
    const members = side(supSide);
    const spreadHolder = g[spread].find((s) => members.includes(s))!;
    const others = members.filter((s) => s !== spreadHolder);
    // spread holder toward their W/E cardinal; stack trio fans around N/S
    out[spreadHolder] = compass(supSide ? 270 : 90, 13);
    const base = supSide ? 0 : 180;
    [-45, 0, 45].forEach((d, i) => {
      out[others[i]] = compass(base + d, 13);
    });
  }
  return out;
}

/** everyone's mark/gaze/bomb summary for the intro hint */
export function introHint(script: KefkaScript, spot: Spot): string {
  const mark = markOf(script, spot);
  const win = markWindowOf(script, spot);
  const parts = [`You are ${spot}.`];
  parts.push(`Debuffs land soon — your water/lightning mark resolves in the ${win.toUpperCase()} window.`);
  void mark;
  return parts.join(' ');
}
