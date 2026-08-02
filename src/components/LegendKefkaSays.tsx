import type { ReactNode } from 'react';

function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="legend-item">
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true">
        {children}
      </svg>
      <span className="name">{name}</span>
    </div>
  );
}

export function LegendKefkaSays() {
  return (
    <aside className="legend">
      <h3>Tells</h3>
      {/* in-game orbit rings on the caster; Kefka stacks two — top = lightning, bottom = ice */}
      <Item name="Real cast (ring)">
        <ellipse cx="14" cy="14" rx="11" ry="5" fill="none" stroke="rgba(80,200,150,0.9)" strokeWidth="1.5" />
        <circle cx="20.8" cy="10.1" r="3.2" fill="#4A90E2" />
        <circle cx="7.2" cy="17.9" r="3.2" fill="#4A90E2" />
      </Item>
      <Item name="Fake cast (? ring)">
        <ellipse cx="14" cy="14" rx="11" ry="5" fill="none" stroke="rgba(80,200,150,0.9)" strokeWidth="1.5" />
        <circle cx="20.8" cy="10.1" r="3.2" fill="#cf2621" />
        <circle cx="7.2" cy="17.9" r="3.2" fill="#cf2621" />
        <g fill="#ffd75e" fontSize="5" fontWeight="700" textAnchor="middle">
          <text x="20.8" y="11.9">?</text>
          <text x="7.2" y="19.7">?</text>
        </g>
      </Item>
      {/* slide-6 dots now only appear on the Mana Release "Rings" chip; with hints on,
          fake-applied debuffs get a red "?" badge (icons alone never show real/fake) */}
      <Item name="Real tell (Rings chip)">
        <circle cx="14" cy="14" r="7" fill="#4A90E2" />
      </Item>
      <Item name="Fake tell / debuff">
        <circle cx="14" cy="14" r="7" fill="none" stroke="#cf2621" strokeWidth="2" />
        <text
          x="14"
          y="15"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#cf2621"
          fontSize="11"
          fontWeight="700"
        >
          ?
        </text>
      </Item>

      <h3>On the field</h3>
      <p className="legend-note">
        Telegraphs look identical whether real or fake — reading the caster's orb ring is on you.
        Fakes invert: they hit everything <em>outside</em> the marked area. With hints on, the grid
        guides you: a dashed ghost pulses where to stand (with a short order like SPREAD or SAFE),
        an arrow shows which way to face during gazes (green once you're aligned), and an
        Acceleration Bomb rings your token with FREEZE! (red) or MOVE! (green).
      </p>
      <Item name="Go here (hints)">
        <circle
          cx="14"
          cy="17"
          r="8"
          fill="none"
          stroke="rgba(255,220,90,0.9)"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <text x="14" y="8" textAnchor="middle" fill="rgba(255,220,90,0.95)" fontSize="7" fontWeight="700">
          SAFE
        </text>
      </Item>
      <Item name="Face the arrow">
        <g stroke="rgba(110,220,140,0.95)" strokeWidth="2.5" fill="rgba(110,220,140,0.95)">
          <line x1="4" y1="20" x2="19" y2="8" />
          <path d="M23 5 L20.5 12 L16 6.5 Z" stroke="none" />
        </g>
      </Item>
      <Item name="Accel: FREEZE!/MOVE!">
        <circle cx="14" cy="16" r="9" fill="none" stroke="rgba(255,80,80,0.95)" strokeWidth="2.5" />
        <text x="14" y="8" textAnchor="middle" fill="rgba(255,80,80,0.95)" fontSize="6.5" fontWeight="700">
          FREEZE!
        </text>
      </Item>
      <Item name="Thunder lanes">
        {/* -15° and 24x7 keep the rotated corners inside the 28x28 viewBox */}
        <g fill="rgba(235,200,70,0.45)" stroke="rgba(245,215,90,0.9)" strokeWidth="1">
          <rect x="2" y="4" width="24" height="7" transform="rotate(-15 14 7.5)" />
          <rect x="2" y="17" width="24" height="7" transform="rotate(-15 14 20.5)" />
        </g>
      </Item>
      <Item name="Ice quadrant">
        {/* true 90° wedge, r=12 so the arc's bulge stays inside the viewBox */}
        <path
          d="M14 14 L22.5 5.5 A12 12 0 0 1 22.5 22.5 Z"
          fill="rgba(235,200,70,0.35)"
          stroke="rgba(245,215,90,0.9)"
          strokeWidth="1.2"
        />
      </Item>
      <Item name="Twister drop">
        <circle
          cx="14"
          cy="14"
          r="9"
          fill="rgba(230,120,50,0.35)"
          stroke="rgba(240,150,60,0.9)"
          strokeWidth="2"
        />
      </Item>
      <Item name="Donut (hole safe)">
        <circle cx="14" cy="14" r="10.5" fill="none" stroke="rgba(90,160,240,0.9)" strokeWidth="2" />
        <circle cx="14" cy="14" r="4.5" fill="none" stroke="rgba(90,160,240,0.9)" strokeWidth="2" />
      </Item>
      <Item name="Shriek gaze">
        <ellipse cx="14" cy="14" rx="10" ry="6" fill="#e65078" />
        <circle cx="14" cy="14" r="2.6" fill="#0e0a14" />
      </Item>
      <Item name="Edge of Death">
        <rect x="12" y="1" width="4" height="26" fill="rgba(255,70,110,0.85)" />
      </Item>
    </aside>
  );
}
