import type { MechanicId, Spot } from '../sim/core/types';
import type { GroupPref, IconPref, StartPrefs } from '../sim/forsaken/types';
import type { KefkaPrefs } from '../sim/kefkasays/types';
import { MECHANICS, MECHANIC_IDS } from '../sim/registry';

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

/** Forsaken-only start-screen body: description, pref pickers, fine print. */
function ForsakenStartBody({
  prefs,
  onPrefsChange,
}: {
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
    <>
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
    </>
  );
}

/** Kefka Says start-screen body: pref pickers over the rolled debuff combo. */
function KefkaStartBody({
  prefs,
  onPrefsChange,
}: {
  prefs: KefkaPrefs;
  onPrefsChange: (prefs: KefkaPrefs) => void;
}) {
  const row = <K extends keyof KefkaPrefs>(
    label: string,
    key: K,
    options: Array<{ value: KefkaPrefs[K]; label: string }>,
  ) => (
    <div className="pref-row">
      <span className="pref-label">{label}</span>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={`toggle${prefs[key] === o.value ? ' active' : ''}`}
          onClick={() => onPrefsChange({ ...prefs, [key]: o.value })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="prefs">
        {row('Your mark', 'mark', [
          { value: 'any', label: 'Any' },
          { value: 'water', label: 'Water' },
          { value: 'lightning', label: 'Lightning' },
        ])}
        {row('Mark timer', 'markWindow', [
          { value: 'any', label: 'Any' },
          { value: 'short', label: 'Short' },
          { value: 'long', label: 'Long' },
        ])}
        {row('Shriek', 'gaze', [
          { value: 'any', label: 'Any' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ])}
        {row('GC3 debuff', 'field', [
          { value: 'any', label: 'Any' },
          { value: 'allagan', label: 'Allagan Field' },
          { value: 'beyond', label: 'Beyond Death' },
        ])}
        <p className="pref-note">
          Water/Lightning marks stack or spread depending on the cast's real/fake tell · every
          player gets one mark, one Accel Bomb, and maybe a Shriek
        </p>
      </div>
      <p className="fine">
        Resolution follows the "Gazes Mid" raidplan: stacks N (supports) / S (DPS), spreads W/E,
        shrieks under the boss, twisters dropped mid.
      </p>
    </>
  );
}

export function StartScreen({
  mechanic,
  onMechanic,
  forsakenPrefs,
  onForsakenPrefs,
  kefkaPrefs,
  onKefkaPrefs,
  onStart,
}: {
  mechanic: MechanicId;
  onMechanic: (m: MechanicId) => void;
  forsakenPrefs: StartPrefs;
  onForsakenPrefs: (prefs: StartPrefs) => void;
  kefkaPrefs: KefkaPrefs;
  onKefkaPrefs: (prefs: KefkaPrefs) => void;
  onStart: (spot: Spot) => void;
}) {
  const def = MECHANICS[mechanic]!;

  return (
    <div className="start">
      {MECHANIC_IDS.length > 1 && (
        <div className="pref-row mech-row">
          <span className="pref-label">Mechanic</span>
          {MECHANIC_IDS.map((id) => (
            <button
              key={id}
              className={`toggle${mechanic === id ? ' active' : ''}`}
              onClick={() => onMechanic(id)}
            >
              {MECHANICS[id]!.title}
            </button>
          ))}
        </div>
      )}
      <h1>{def.title}</h1>
      <p className="sub">{def.subtitle}</p>
      <p className="desc">
        Pick your spot. You move with <kbd>WASD</kbd> / arrow keys — the other seven players
        resolve the mechanic correctly, so every failure is yours to own.{' '}
        {mechanic === 'forsaken'
          ? 'Debuffs, tower directions and Future/Past are random every pull.'
          : 'Debuffs and every real/fake tell are random every pull.'}
      </p>
      <div className="picker">
        {GROUPS.map((g) => (
          <div key={g.title} className="picker-group">
            <span className="picker-title">{g.title}</span>
            {g.spots.map((s) => (
              <button key={s} className={`spot ${g.cls}`} onClick={() => onStart(s)}>
                {s}
              </button>
            ))}
          </div>
        ))}
      </div>
      {mechanic === 'forsaken' ? (
        <ForsakenStartBody prefs={forsakenPrefs} onPrefsChange={onForsakenPrefs} />
      ) : (
        <KefkaStartBody prefs={kefkaPrefs} onPrefsChange={onKefkaPrefs} />
      )}
      <p className="fine">
        Disclaimer: safe positions are approximations and may not be completely accurate — use this
        to learn where you need to be, not as a pixel-perfect reference.
      </p>
    </div>
  );
}
