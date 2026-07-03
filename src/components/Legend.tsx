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

export function Legend() {
  return (
    <aside className="legend">
      <h3>Debuff icons</h3>
      <Item name="Cone">
        <path d="M14 23 L5.1 8.5 A17 17 0 0 1 22.9 8.5 Z" fill="#e05252" />
      </Item>
      <Item name="Spread">
        <circle cx="14" cy="14" r="8" fill="none" stroke="#e0a052" strokeWidth="3" />
        <circle cx="14" cy="14" r="2.5" fill="#e0a052" />
      </Item>
      <Item name="Stack">
        <g
          fill="none"
          stroke="#6ee08c"
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M10.2 6.5 L14 11.4 L17.8 6.5" />
          <path d="M22.4 14.5 L16.3 15.3 L18.6 21" />
          <path d="M5.6 14.5 L11.7 15.3 L9.4 21" />
        </g>
      </Item>
      <Item name="Tower charges">
        <g fill="#c390f0">
          <rect x="3" y="11" width="5" height="5" transform="rotate(45 5.5 13.5)" />
          <rect x="9" y="11" width="5" height="5" transform="rotate(45 11.5 13.5)" />
          <rect x="15" y="11" width="5" height="5" transform="rotate(45 17.5 13.5)" />
          <rect x="21" y="11" width="5" height="5" transform="rotate(45 23.5 13.5)" />
        </g>
      </Item>

      <h3>On the field</h3>
      <Item name="Tower">
        <circle
          cx="14"
          cy="14"
          r="10.5"
          fill="rgba(250,240,180,0.10)"
          stroke="rgba(255,250,220,0.9)"
          strokeWidth="2.5"
        />
      </Item>
      <Item name="Kefka clone">
        <circle
          cx="14"
          cy="14"
          r="9"
          fill="rgba(90,40,120,0.9)"
          stroke="rgba(220,140,255,0.9)"
          strokeWidth="2"
        />
        <text
          x="14"
          y="18"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="rgba(240,200,255,0.95)"
        >
          K
        </text>
      </Item>
    </aside>
  );
}
