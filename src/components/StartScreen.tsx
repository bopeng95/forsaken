import type { GroupPref, IconPref, Spot, StartPrefs } from '../sim/types';

const GROUPS: Array<{ title: string; spots: Spot[]; cls: string }> = [
  { title: 'Tanks', spots: ['T1', 'T2'], cls: 'tank' },
  { title: 'Healers', spots: ['H1', 'H2'], cls: 'healer' },
  { title: 'Melee', spots: ['M1', 'M2'], cls: 'melee' },
  { title: 'Ranged', spots: ['R1', 'R2'], cls: 'ranged' },
];

const GROUP_OPTIONS: Array<{ value: GroupPref; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
];

const ICON_OPTIONS: Array<{ value: IconPref; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'cone', label: 'Cone' },
  { value: 'spread', label: 'Spread' },
  { value: 'stack', label: 'Stack' },
];

export function StartScreen({
  onStart,
  prefs,
  onPrefsChange,
}: {
  onStart: (spot: Spot, prefs: StartPrefs) => void;
  prefs: StartPrefs;
  onPrefsChange: (prefs: StartPrefs) => void;
}) {
  // Stack holders (and their partners) are Group A by definition, so B + stack
  // can never roll — picking one side of the conflict resets the other to Any.
  const setGroup = (group: GroupPref) =>
    onPrefsChange({ group, icon: group === 'B' && prefs.icon === 'stack' ? 'any' : prefs.icon });
  const setIcon = (icon: IconPref) =>
    onPrefsChange({ icon, group: icon === 'stack' && prefs.group === 'B' ? 'any' : prefs.group });

  return (
    <div className="start">
      <h1>Forsaken</h1>
      <p className="sub">
        Dancing Mad (Ultimate) · P2 Forsaken Kefka · 8 towers · Kroxy-Rinon strat
      </p>
      <p className="desc">
        Pick your spot. You move with <kbd>WASD</kbd> / arrow keys — the other seven players
        resolve the mechanic correctly, so every failure is yours to own. Debuffs, tower
        directions and Future/Past are random every pull.
      </p>
      <div className="picker">
        {GROUPS.map((g) => (
          <div key={g.title} className="picker-group">
            <span className="picker-title">{g.title}</span>
            {g.spots.map((s) => (
              <button key={s} className={`spot ${g.cls}`} onClick={() => onStart(s, prefs)}>
                {s}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="prefs">
        <div className="pref-row">
          <span className="pref-label">Your group</span>
          {GROUP_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle${prefs.group === o.value ? ' active' : ''}`}
              disabled={o.value === 'B' && prefs.icon === 'stack'}
              onClick={() => setGroup(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="pref-row">
          <span className="pref-label">First debuff</span>
          {ICON_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle${prefs.icon === o.value ? ' active' : ''}`}
              disabled={o.value === 'stack' && prefs.group === 'B'}
              onClick={() => setIcon(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="pref-note">
          Group A soaks sets 1–3 &amp; 8 · Group B soaks sets 4–7 · applies to every pull, including
          Try Again
        </p>
      </div>
      <p className="fine">
        Duplicate-debuff tower flexes use HTMR priority (Healer &gt; Tank &gt; Melee &gt; Ranged, 1
        before 2), per the Kroxy-Rinon plan.
      </p>
    </div>
  );
}
