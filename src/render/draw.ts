import type { Spot } from '../sim/core/types';
import type { SimEngine } from '../sim/forsaken/engine';
import type { KefkaEngine } from '../sim/kefkasays/engine';
import type { AnyEngine } from '../sim/registry';
import { drawForsaken } from './forsaken';
import { drawKefkaSays } from './kefkasays';

export { ROLE_COLOR } from './common';

export interface DrawOpts {
  viewRotRad: number;
  showHints: boolean;
  focus: Spot | null;
  blindBait: boolean;
  persistIcons: boolean;
}

/** dispatch to the mechanic's render layer */
export function draw(
  ctx: CanvasRenderingContext2D,
  eng: AnyEngine,
  cssSize: number,
  opts: DrawOpts,
): void {
  switch (eng.mechanicId) {
    case 'forsaken':
      drawForsaken(ctx, eng as SimEngine, cssSize, opts);
      break;
    case 'kefkasays':
      drawKefkaSays(ctx, eng as KefkaEngine, cssSize, opts);
      break;
  }
}
