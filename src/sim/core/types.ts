export type Spot = 'T1' | 'T2' | 'H1' | 'H2' | 'M1' | 'M2' | 'R1' | 'R2';
export type RoleKind = 'T' | 'H' | 'M' | 'R';

export type MechanicId = 'forsaken' | 'kefkasays';

export interface Vec2 {
  x: number;
  y: number;
}

export const SPOTS: Spot[] = ['T1', 'T2', 'H1', 'H2', 'M1', 'M2', 'R1', 'R2'];

export function roleOf(spot: Spot): RoleKind {
  return spot[0] as RoleKind;
}

export function isSupport(spot: Spot): boolean {
  const r = roleOf(spot);
  return r === 'T' || r === 'H';
}

/** Pair partner within role: T1<->H1, T2<->H2, M1<->R1, M2<->R2 */
export function partnerOf(spot: Spot): Spot {
  const n = spot[1];
  switch (roleOf(spot)) {
    case 'T':
      return `H${n}` as Spot;
    case 'H':
      return `T${n}` as Spot;
    case 'M':
      return `R${n}` as Spot;
    case 'R':
      return `M${n}` as Spot;
  }
}

export type FailZone =
  | { kind: 'cone'; pos: Vec2; dirRad: number; halfRad?: number; len?: number }
  | { kind: 'circle'; pos: Vec2; r: number }
  /** arena half-plane through the center; dir points into the danger half */
  | { kind: 'half'; dir: Vec2 }
  /** rectangle from pos extending len along dirRad, halfWidth to each side */
  | { kind: 'line'; pos: Vec2; dirRad: number; halfWidth: number; len: number }
  | { kind: 'donut'; pos: Vec2; rIn: number; rOut: number };

export type FailInfo = {
  reason: string;
  /** where the user should have been, if applicable */
  ghost?: Vec2;
  /** players wrongly caught by the failing AoE */
  hit?: Spot[];
  /** players the failing AoE was supposed to hit but missed */
  missed?: Spot[];
  /** the AoE area that caused the fail, drawn highlighted on the frozen scene */
  zone?: FailZone;
};

export type Result = { kind: 'clear' } | ({ kind: 'fail' } & FailInfo);
