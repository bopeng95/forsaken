import { makeRng, pick, randInt, shuffle } from './rng';
import type { AttemptScript, Group, Icon, Spot, StartPrefs } from './types';
import { SPOTS, isSupport, partnerOf } from './types';

const SUPPORTS: Spot[] = ['T1', 'T2', 'H1', 'H2'];
const DPS: Spot[] = ['M1', 'M2', 'R1', 'R2'];

/** Set index (1..8) -> which group soaks. AAABBBBA. */
export const SOAK_ORDER: Group[] = ['A', 'A', 'A', 'B', 'B', 'B', 'B', 'A'];

export function groupMembers(script: AttemptScript, g: Group): Spot[] {
  return SPOTS.filter((s) => script.groupOf[s] === g);
}

export function rollAttempt(seed: number): AttemptScript {
  const rng = makeRng(seed);

  const conesOn = rng() < 0.5 ? 'supports' : ('dps' as const);
  const supportStack = pick(rng, SUPPORTS);
  const dpsStack = pick(rng, DPS);

  const groupOf = {} as Record<Spot, Group>;
  const aMembers = new Set<Spot>([supportStack, partnerOf(supportStack), dpsStack, partnerOf(dpsStack)]);
  for (const s of SPOTS) groupOf[s] = aMembers.has(s) ? 'A' : 'B';

  const initialIcon = (s: Spot): Icon => {
    if (s === supportStack || s === dpsStack) return 'stack';
    const side = isSupport(s) ? 'supports' : 'dps';
    return side === conesOn ? 'cone' : 'spread';
  };

  const A = SPOTS.filter((s) => groupOf[s] === 'A');
  const B = SPOTS.filter((s) => groupOf[s] === 'B');

  const assign = (members: Spot[], icons: Icon[]): Partial<Record<Spot, Icon>> => {
    const order = shuffle(rng, members);
    const out: Partial<Record<Spot, Icon>> = {};
    order.forEach((s, i) => (out[s] = icons[i]));
    return out;
  };

  const fromInitial = (members: Spot[]): Partial<Record<Spot, Icon>> => {
    const out: Partial<Record<Spot, Icon>> = {};
    for (const s of members) out[s] = initialIcon(s);
    return out;
  };

  const ODD_REROLL: Icon[] = ['cone', 'cone', 'spread', 'spread'];
  const EVEN_REROLL: Icon[] = ['stack', 'stack', 'cone', 'spread'];

  // soakIcons[i] = icons the soakers hold when soaking set i+1
  const soakIcons: Array<Partial<Record<Spot, Icon>>> = [
    fromInitial(A), // set 1: A initial (2 stacks + cone + spread by construction)
    assign(A, ODD_REROLL), // set 2: rerolled after odd set 1
    assign(A, EVEN_REROLL), // set 3: rerolled after even set 2
    fromInitial(B), // set 4: B initial (2 cones + 2 spreads by construction)
    assign(B, EVEN_REROLL), // set 5: rerolled after even set 4
    assign(B, ODD_REROLL), // set 6: rerolled after odd set 5
    assign(B, EVEN_REROLL), // set 7: rerolled after even set 6
    assign(A, ODD_REROLL), // set 8: rerolled after odd set 3 (the "remember" debuff)
  ];

  // Tower pair orientation per set: first is always true south (like every diagram),
  // the rest hop to a random different 45° step each set.
  const southDeg: number[] = [180];
  for (let i = 1; i < 8; i++) {
    let d = randInt(rng, 8) * 45;
    if (d === southDeg[i - 1]) d = (d + 45 * (1 + randInt(rng, 7))) % 360;
    southDeg.push(d);
  }

  const future = [rng() < 0.5, rng() < 0.5, rng() < 0.5, rng() < 0.5];

  return { seed, conesOn, groupOf, soakIcons, southDeg, future };
}

/** A spot's initial debuff icon: set 1 icons for Group A, set 4 icons for Group B. */
export function initialIconOf(script: AttemptScript, spot: Spot): Icon {
  const set = script.groupOf[spot] === 'A' ? 0 : 3;
  return script.soakIcons[set][spot]!;
}

export function matchesPrefs(script: AttemptScript, spot: Spot, prefs: StartPrefs): boolean {
  if (prefs.group !== 'any' && script.groupOf[spot] !== prefs.group) return false;
  if (prefs.icon !== 'any' && initialIconOf(script, spot) !== prefs.icon) return false;
  return true;
}

/**
 * Rejection-sample seeds until the rolled pattern satisfies the start prefs
 * for the user's spot. Worst satisfiable combo (group A + cone) accepts 1/8
 * of rolls; the cap only matters for combos the UI already forbids (B + stack).
 */
export function findSeed(spot: Spot, prefs: StartPrefs, randomSeed: () => number): number {
  let seed = randomSeed();
  for (let i = 0; i < 10000 && !matchesPrefs(rollAttempt(seed), spot, prefs); i++) {
    seed = randomSeed();
  }
  return seed;
}
