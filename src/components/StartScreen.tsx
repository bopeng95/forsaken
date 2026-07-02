import type { Spot } from '../sim/types';

const GROUPS: Array<{ title: string; spots: Spot[]; cls: string }> = [
  { title: 'Tanks', spots: ['T1', 'T2'], cls: 'tank' },
  { title: 'Healers', spots: ['H1', 'H2'], cls: 'healer' },
  { title: 'Melee', spots: ['M1', 'M2'], cls: 'melee' },
  { title: 'Ranged', spots: ['R1', 'R2'], cls: 'ranged' },
];

export function StartScreen({ onStart }: { onStart: (spot: Spot) => void }) {
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
              <button key={s} className={`spot ${g.cls}`} onClick={() => onStart(s)}>
                {s}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="fine">
        Duplicate-debuff tower flexes use HTMR priority (Healer &gt; Tank &gt; Melee &gt; Ranged, 1
        before 2), per the Kroxy-Rinon plan.
      </p>
    </div>
  );
}
