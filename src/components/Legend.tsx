import type { ReactNode } from 'react';

function Item({ name, desc, children }: { name: string; desc: string; children: ReactNode }) {
  return (
    <div className="legend-item">
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true">
        {children}
      </svg>
      <div>
        <span className="name">{name}</span>
        <span className="desc">{desc}</span>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <aside className="legend">
      <h3>Debuff icons</h3>
      <Item name="Cone" desc="Conal AoE fired from you at the nearest other player.">
        <path d="M14 23 L5.1 8.5 A17 17 0 0 1 22.9 8.5 Z" fill="#e05252" />
      </Item>
      <Item name="Spread" desc="Point-blank circle on you — stay clear of others.">
        <circle cx="14" cy="14" r="8" fill="none" stroke="#e0a052" strokeWidth="3" />
        <circle cx="14" cy="14" r="2.5" fill="#e0a052" />
      </Item>
      <Item name="Stack" desc="3-player shared stack centered on you.">
        <g fill="none" stroke="#6ee08c" strokeWidth="2.8">
          <path d="M6 11.5 L14 7 L22 11.5" />
          <path d="M6 17 L14 12.5 L22 17" />
          <path d="M6 22.5 L14 18 L22 22.5" />
        </g>
      </Item>
      <Item name="Charges" desc="Spell's Trouble left — soaking a tower spends one and rerolls your icon.">
        <g fill="#c390f0">
          <rect x="3" y="11" width="5" height="5" transform="rotate(45 5.5 13.5)" />
          <rect x="9" y="11" width="5" height="5" transform="rotate(45 11.5 13.5)" />
          <rect x="15" y="11" width="5" height="5" transform="rotate(45 17.5 13.5)" />
          <rect x="21" y="11" width="5" height="5" transform="rotate(45 23.5 13.5)" />
        </g>
      </Item>

      <h3>On the field</h3>
      <Item name="Tower" desc="Duo tower — exactly 2 players inside when it resolves.">
        <circle
          cx="14"
          cy="14"
          r="10.5"
          fill="rgba(250,240,180,0.10)"
          stroke="rgba(255,250,220,0.9)"
          strokeWidth="2.5"
        />
        <circle cx="11.5" cy="18" r="1.4" fill="rgba(255,250,220,0.9)" />
        <circle cx="16.5" cy="18" r="1.4" fill="rgba(255,250,220,0.9)" />
      </Item>
      <Item
        name="Clone"
        desc="Kefka clone — its aim line tracks the party, locks red at All Things Ending, then it cleaves that half of the arena."
      >
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
      <Item name="Stack point" desc="Party stack spot for Future's/Past's End.">
        <circle cx="14" cy="14" r="9" fill="none" stroke="rgba(255,220,90,0.9)" strokeWidth="2.5" />
      </Item>

      <p className="legend-note">
        Dashed ring = inner hitbox (walkable, used to place cone soaks). Solid ring = outer hitbox
        where clone baiters stand.
      </p>
    </aside>
  );
}
