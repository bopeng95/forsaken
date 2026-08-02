/* Debug one seed: dump the rolled script + positions at each hint change.
 *   MECHANIC=forsaken SEED=49 npx tsx scripts/debug.ts */
import { SPOTS } from '../src/sim/core/types';
import type { SimEngine } from '../src/sim/forsaken/engine';
import type { KefkaEngine } from '../src/sim/kefkasays/engine';
import { MECHANICS } from '../src/sim/registry';

const def = MECHANICS[(process.env.MECHANIC ?? 'forsaken') as keyof typeof MECHANICS];
if (!def) throw new Error(`unknown mechanic ${process.env.MECHANIC}`);
const seed = Number(process.env.SEED ?? 49);
const spot = (process.env.SPOT ?? 'T1') as (typeof SPOTS)[number];

const script = def.roll(seed);
for (const line of def.describe(script)) console.log(line);

const eng = def.create(script, spot);
const dt = 1 / 60;
let lastSet = 0;
let lastHint = '';
let lastCue = 'null';
while (!eng.result && eng.t < 240) {
  // autopilot: walk the user's spot exactly like a bot, then tick the sim
  def.autopilot(eng, spot, dt);
  eng.update(dt, { x: 0, y: 0 });
  if (def.id === 'forsaken') {
    const fe = eng as SimEngine;
    if (fe.currentSet !== lastSet && fe.activeTowers) {
      lastSet = fe.currentSet;
      const p = fe.activeTowers.plan;
      console.log(`\n== set ${p.setIdx} south=${p.southDeg} towers L=${p.towerMembers.left} R=${p.towerMembers.right}`);
      for (const s of SPOTS) console.log(`  ${s}: -> (${p.duties[s].pos.x.toFixed(1)},${p.duties[s].pos.y.toFixed(1)}) ${p.duties[s].label}`);
    }
  }
  if (eng.hint !== lastHint) {
    lastHint = eng.hint;
    const pos = SPOTS.map((s) => `${s}(${eng.positions[s].x.toFixed(1)},${eng.positions[s].y.toFixed(1)})`).join(' ');
    console.log(`t=${eng.t.toFixed(1)} hint="${lastHint}"\n  pos: ${pos}`);
  }
  // kefkasays guides via on-grid cues instead of hint text — trace those too
  if (def.id === 'kefkasays') {
    const ke = eng as KefkaEngine;
    const cue = JSON.stringify(ke.gridCue);
    if (cue !== lastCue) {
      lastCue = cue;
      const tgt = eng.targets[spot];
      const g = ke.ghostPos;
      console.log(
        `t=${eng.t.toFixed(1)} cue=${cue} target=(${tgt.x.toFixed(1)},${tgt.y.toFixed(1)}) ghost=(${g.x.toFixed(1)},${g.y.toFixed(1)})`,
      );
    }
  }
}
console.log('\nresult:', eng.result, 't=', eng.t.toFixed(1));
