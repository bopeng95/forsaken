/**
 * Headless end-to-end check: run every mechanic's full sequence with the user's
 * spot on autopilot for many seeds × all 8 spots. Every run must reach Clear —
 * any fail means the strat tables / geometry / timings are inconsistent.
 *
 *   npm run verify              # all mechanics
 *   MECHANIC=forsaken npm run verify
 */
import { SPOTS } from '../src/sim/core/types';
import { MECHANICS } from '../src/sim/registry';

const SEEDS = Number(process.env.SEEDS ?? 50);
const ONLY = process.env.MECHANIC;
const DT = 1 / 60;
const MAX_TICKS = 60 * 240;

let runs = 0;
let failures = 0;

for (const def of Object.values(MECHANICS)) {
  if (ONLY && def.id !== ONLY) continue;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const script = def.roll(seed);
    for (const spot of SPOTS) {
      runs++;
      const eng = def.create(script, spot);
      let ticks = 0;
      while (!eng.result && ticks++ < MAX_TICKS) {
        // autopilot: the engine only moves the user's spot from input — fake it
        // by walking the user exactly like a bot, then tick the sim
        def.autopilot(eng, spot, DT);
        eng.update(DT, { x: 0, y: 0 });
      }
      if (!eng.result) {
        failures++;
        console.error(
          `HANG ${def.id} seed=${seed} spot=${spot} (no result after ${MAX_TICKS} ticks)`,
        );
      } else if (eng.result.kind !== 'clear') {
        failures++;
        console.error(
          `FAIL ${def.id} seed=${seed} spot=${spot} @t=${eng.t.toFixed(1)}s: ${eng.result.reason}`,
        );
      }
    }
  }
}

console.log(`${runs - failures}/${runs} autopilot runs cleared`);
if (failures > 0) process.exit(1);
