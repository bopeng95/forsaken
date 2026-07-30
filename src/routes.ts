import { SPOTS } from './sim/core/types';
import type { MechanicId, Spot } from './sim/core/types';
import type { StartPrefs } from './sim/forsaken/types';
import type { KefkaPrefs } from './sim/kefkasays/types';

/**
 * URL scheme: '/' is the start screen (never carries a query); a running sim lives at
 * '/<slug>?role=<spot>' plus one query param per non-default start pref. Seeds are
 * deliberately NOT in the URL — reloading or sharing a link rolls a fresh pattern that
 * matches the prefs, keeping URLs stable across R presses.
 */

/** URL path segment per mechanic. Ids stay unhyphenated (scripts key on them); URLs get the dash. */
export const SLUGS: Record<MechanicId, string> = { forsaken: 'forsaken', kefkasays: 'kefka-says' };

export const DEFAULT_FORSAKEN_PREFS: StartPrefs = { group: 'any', icon: 'any' };
export const DEFAULT_KEFKA_PREFS: KefkaPrefs = {
  mark: 'any',
  markWindow: 'any',
  gaze: 'any',
  field: 'any',
};

/** A parsed sim URL. Both pref objects are present; the inactive mechanic's stay at defaults. */
export interface Route {
  mechanic: MechanicId;
  spot: Spot;
  forsakenPrefs: StartPrefs;
  kefkaPrefs: KefkaPrefs;
}

/** Read a query param constrained to an allowed set; anything else (or absent) falls back to 'any'. */
function pick<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | 'any' {
  const v = params.get(key);
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : 'any';
}

/** Parse a location into a route; null means start screen (also for any malformed sim URL). */
export function parseRoute(pathname: string, search: string): Route | null {
  const slug = pathname.replace(/^\/+|\/+$/g, '');
  const mechanic = (Object.keys(SLUGS) as MechanicId[]).find((id) => SLUGS[id] === slug);
  if (!mechanic) return null;
  const params = new URLSearchParams(search);
  const role = params.get('role');
  if (!role || !SPOTS.includes(role as Spot)) return null;

  const forsakenPrefs: StartPrefs = { ...DEFAULT_FORSAKEN_PREFS };
  const kefkaPrefs: KefkaPrefs = { ...DEFAULT_KEFKA_PREFS };
  if (mechanic === 'forsaken') {
    forsakenPrefs.group = pick(params, 'group', ['A', 'B']);
    forsakenPrefs.icon = pick(params, 'icon', ['cone', 'spread', 'stack']);
    // group B never holds a stack (StartScreen disables the combo); an impossible pair
    // would make findSeed spin its full rejection cap and return a non-matching seed
    if (forsakenPrefs.group === 'B' && forsakenPrefs.icon === 'stack') forsakenPrefs.icon = 'any';
  } else {
    kefkaPrefs.mark = pick(params, 'mark', ['water', 'lightning']);
    kefkaPrefs.markWindow = pick(params, 'markWindow', ['short', 'long']);
    kefkaPrefs.gaze = pick(params, 'gaze', ['yes', 'no']);
    kefkaPrefs.field = pick(params, 'field', ['allagan', 'beyond']);
  }
  return { mechanic, spot: role as Spot, forsakenPrefs, kefkaPrefs };
}

/** Build a sim URL: /<slug>?role=<spot> plus only the pref fields that aren't 'any'. */
export function buildUrl(
  mechanic: MechanicId,
  spot: Spot,
  prefs: StartPrefs | KefkaPrefs,
): string {
  const params = new URLSearchParams({ role: spot });
  for (const [k, v] of Object.entries(prefs)) {
    if (v !== 'any') params.set(k, v);
  }
  return `/${SLUGS[mechanic]}?${params.toString()}`;
}
