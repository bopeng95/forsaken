/**
 * Headless end-to-end check: run the full Forsaken sequence with the user's
 * spot on autopilot for many seeds × all 8 spots. Every run must reach Clear —
 * any fail means the strat tables / geometry / timings are inconsistent.
 *
 *   npm run verify
 */
import { stepToward } from '../src/sim/bots';
import { BOT_SPEED } from '../src/sim/constants';
import { SimEngine } from '../src/sim/engine';
import { rollAttempt } from '../src/sim/randomizer';
import { SPOTS } from '../src/sim/types';

const SEEDS = Number(process.env.SEEDS ?? 50);
const DT = 1 / 60;
const MAX_TICKS = 60 * 240;

let runs = 0;
let failures = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const script = rollAttempt(seed);
  for (const spot of SPOTS) {
    runs++;
    const eng = new SimEngine(script, spot);
    let ticks = 0;
    while (!eng.result && ticks++ < MAX_TICKS) {
      // autopilot: walk the user's spot exactly like a bot, then tick the sim
      eng.positions[spot] = stepToward(eng.positions[spot], eng.targets[spot], BOT_SPEED * DT);
      eng.update(DT, { x: 0, y: 0 });
    }
    if (!eng.result) {
      failures++;
      console.error(`HANG seed=${seed} spot=${spot} (no result after ${MAX_TICKS} ticks)`);
    } else if (eng.result.kind !== 'clear') {
      failures++;
      console.error(`FAIL seed=${seed} spot=${spot} @t=${eng.t.toFixed(1)}s set=${eng.currentSet}: ${eng.result.reason}`);
    }
  }
}

console.log(`${runs - failures}/${runs} autopilot runs cleared`);
if (failures > 0) process.exit(1);
