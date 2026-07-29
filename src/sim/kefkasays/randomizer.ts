import type { RF } from '../core/engine';
import { makeRng, randInt, shuffle, type Rng } from '../core/rng';
import type { Spot } from '../core/types';
import type {
  ChaosKind,
  Element2,
  GrandCross,
  KefkaPrefs,
  KefkaScript,
  MmPattern,
  WindowKey,
  WoundColor,
} from './types';

const SUPPORTS: Spot[] = ['T1', 'T2', 'H1', 'H2'];
const DPS: Spot[] = ['M1', 'M2', 'R1', 'R2'];

function rf(rng: Rng): RF {
  return rng() < 0.5 ? 'real' : 'fake';
}

/** a random telegraph pattern: diagonal thunder-lane axis + ice quadrant pair */
function rollPattern(rng: Rng, bothIcePairs: boolean): MmPattern {
  return {
    thunderAxisDeg: 45 + randInt(rng, 4) * 90,
    icePair: (randInt(rng, 2) as 0 | 1),
    bothIcePairs,
  };
}

/**
 * Roll one attempt. Constraints (raidplan slide 2 + the debuff log):
 * - marks: each Grand Cross applies 1 sup + 1 dps Compressed Water and 1 sup +
 *   1 dps Forked Lightning; across both casts every player gets exactly one.
 * - shrieks: 1 sup + 1 dps per cast, all four holders distinct.
 * - accel bombs: every player exactly one; each cast contributes 1 sup + 1 dps
 *   to the short window and 1 sup + 1 dps to the long window.
 * One cast's marks resolve in the short window, the other's in the long.
 */
export function rollKefka(seed: number): KefkaScript {
  const rng = makeRng(seed);

  // marks: shuffle each role side; first half marks from GC1, second from GC2
  const sup = shuffle(rng, SUPPORTS);
  const dps = shuffle(rng, DPS);
  // shrieks: an independent shuffle; first 1+1 from GC1 (short gaze), next from GC2
  const supShriek = shuffle(rng, SUPPORTS);
  const dpsShriek = shuffle(rng, DPS);
  // accel: 4 slots per role side — (gc1,short),(gc1,long),(gc2,short),(gc2,long)
  const supAccel = shuffle(rng, SUPPORTS);
  const dpsAccel = shuffle(rng, DPS);

  const gcAt = (i: 0 | 1): GrandCross => ({
    rf: rf(rng),
    water: [sup[i * 2], dps[i * 2]],
    lightning: [sup[i * 2 + 1], dps[i * 2 + 1]],
    shriek: [supShriek[i], dpsShriek[i]],
    accelShort: [supAccel[i * 2], dpsAccel[i * 2]],
    accelLong: [supAccel[i * 2 + 1], dpsAccel[i * 2 + 1]],
  });
  const gc: [GrandCross, GrandCross] = [gcAt(0), gcAt(1)];

  const chaosOrder: [ChaosKind, ChaosKind] =
    rng() < 0.5 ? ['tsunami', 'inferno'] : ['inferno', 'tsunami'];

  const wounds = {} as Record<Spot, WoundColor>;
  for (const s of [...SUPPORTS, ...DPS]) wounds[s] = rng() < 0.5 ? 'white' : 'black';
  const allagan = shuffle(rng, [...SUPPORTS, ...DPS]).slice(0, 4);

  const script: KefkaScript = {
    seed,
    gc,
    shortMarksFrom: (randInt(rng, 2) as 0 | 1),
    chaosOrder,
    tsunamiRF: rf(rng),
    infernoRF: rf(rng),
    wounds,
    allagan,
    floodRF: rf(rng),
    neJumpDeg: randInt(rng, 8) * 45,
    whiteSideSign: rng() < 0.5 ? 1 : -1,
    mm: [
      { thunder: rf(rng), ice: rf(rng) },
      { thunder: rf(rng), ice: rf(rng) },
      { thunder: rf(rng), ice: rf(rng) },
    ],
    mmPattern: [rollPattern(rng, false), rollPattern(rng, false), rollPattern(rng, true)],
    bankedThunder: rf(rng),
    recThunderPattern: rollPattern(rng, false),
    bankedIce: rf(rng),
    recIcePattern: rollPattern(rng, true),
    ringThunder: rf(rng),
    ringIce: rf(rng),
    finalPattern: rollPattern(rng, false),
  };

  // Real Tsunami = the Dynamic Fluid drop is a stay-in-hole donut, and the
  // final telegraphs resolve 0.6s after it — nobody can leave the hole in
  // time. Keep the final thunder lanes off the S drop column in that case
  // (the game's own arrangements never force this collision either: the one
  // logged pull survived it stacked dead center).
  if (
    script.tsunamiRF === 'real' &&
    script.bankedThunder === script.ringThunder &&
    (script.finalPattern.thunderAxisDeg === 135 || script.finalPattern.thunderAxisDeg === 225)
  ) {
    script.finalPattern.thunderAxisDeg = script.finalPattern.thunderAxisDeg === 135 ? 45 : 315;
  }
  return script;
}

// ---- Per-player lookups --------------------------------------------------

/** which Grand Cross (0|1) gave this player their water/lightning mark, and which */
export function markOf(script: KefkaScript, spot: Spot): { gcIdx: 0 | 1; elem: Element2 } {
  for (const gcIdx of [0, 1] as const) {
    const g = script.gc[gcIdx];
    if (g.water.includes(spot)) return { gcIdx, elem: 'water' };
    if (g.lightning.includes(spot)) return { gcIdx, elem: 'lightning' };
  }
  throw new Error(`${spot} has no mark`); // unreachable: the roll covers all 8
}

export function markWindowOf(script: KefkaScript, spot: Spot): WindowKey {
  return markOf(script, spot).gcIdx === script.shortMarksFrom ? 'short' : 'long';
}

/** which GC's shriek this player holds, if any (gc 0 = short gaze, 1 = long) */
export function shriekOf(script: KefkaScript, spot: Spot): 0 | 1 | null {
  if (script.gc[0].shriek.includes(spot)) return 0;
  if (script.gc[1].shriek.includes(spot)) return 1;
  return null;
}

/** this player's accel bomb: which GC applied it and which window it expires in */
export function accelOf(script: KefkaScript, spot: Spot): { gcIdx: 0 | 1; window: WindowKey } {
  for (const gcIdx of [0, 1] as const) {
    const g = script.gc[gcIdx];
    if (g.accelShort.includes(spot)) return { gcIdx, window: 'short' };
    if (g.accelLong.includes(spot)) return { gcIdx, window: 'long' };
  }
  throw new Error(`${spot} has no accel bomb`); // unreachable
}

export function matchesKefkaPrefs(script: KefkaScript, spot: Spot, prefs: KefkaPrefs): boolean {
  if (prefs.mark !== 'any' && markOf(script, spot).elem !== prefs.mark) return false;
  if (prefs.markWindow !== 'any' && markWindowOf(script, spot) !== prefs.markWindow) return false;
  if (prefs.gaze !== 'any' && (shriekOf(script, spot) !== null) !== (prefs.gaze === 'yes')) {
    return false;
  }
  if (prefs.field !== 'any' && script.allagan.includes(spot) !== (prefs.field === 'allagan')) {
    return false;
  }
  return true;
}

export function describeKefka(script: KefkaScript): string[] {
  const g = (i: 0 | 1) => {
    const x = script.gc[i];
    return `GC${i + 1} ${x.rf.toUpperCase()}: water=${x.water} lightning=${x.lightning} shriek=${x.shriek} accelS=${x.accelShort} accelL=${x.accelLong}`;
  };
  const pat = (p: MmPattern) =>
    `axis=${p.thunderAxisDeg} icePair=${p.icePair}${p.bothIcePairs ? '+both' : ''}`;
  return [
    g(0),
    g(1),
    `short marks from GC${script.shortMarksFrom + 1}`,
    `chaos: ${script.chaosOrder.join(' then ')} (tsunami ${script.tsunamiRF}, inferno ${script.infernoRF})`,
    `wounds: ${Object.entries(script.wounds)
      .map(([s, c]) => `${s}=${c[0].toUpperCase()}`)
      .join(' ')}`,
    `allagan: ${script.allagan.join(',')} (rest Beyond Death)`,
    `flood ${script.floodRF}, NE jump ${script.neJumpDeg}°, white orb sign ${script.whiteSideSign}`,
    ...script.mm.map(
      (m, i) =>
        `MM${i + 1}: thunder ${m.thunder}, ice ${m.ice} (${pat(script.mmPattern[i])})`,
    ),
    `banked thunder ${script.bankedThunder} (${pat(script.recThunderPattern)}), banked ice ${script.bankedIce} (${pat(script.recIcePattern)})`,
    `rings: thunder ${script.ringThunder}, ice ${script.ringIce} -> final thunder ${
      script.bankedThunder === script.ringThunder ? 'REAL' : 'fake'
    }, final ice ${script.bankedIce === script.ringIce ? 'REAL' : 'fake'} (${pat(script.finalPattern)})`,
  ];
}
