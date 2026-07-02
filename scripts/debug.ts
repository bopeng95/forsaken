/* Debug one seed: dump plan + positions at each resolve. SEED=49 npx tsx scripts/debug.ts */
import { SimEngine } from '../src/sim/engine';
import { rollAttempt } from '../src/sim/randomizer';
import { SPOTS } from '../src/sim/types';

const seed = Number(process.env.SEED ?? 49);
const script = rollAttempt(seed);
console.log('conesOn:', script.conesOn);
console.log('groups:', script.groupOf);
console.log('south:', script.southDeg.join(','));
console.log('future:', script.future.map((f) => (f ? 'F' : 'P')).join(','));
script.soakIcons.forEach((ic, i) => console.log(`set ${i + 1} icons:`, ic));

const eng = new SimEngine(script, 'T1');
const dt = 1 / 60;
let lastSet = 0;
let lastHint = '';
while (!eng.result && eng.t < 240) {
  eng.update(dt, { x: 0, y: 0 }, true);
  if (eng.currentSet !== lastSet && eng.activeTowers) {
    lastSet = eng.currentSet;
    const p = eng.activeTowers.plan;
    console.log(`\n== set ${p.setIdx} south=${p.southDeg} towers L=${p.towerMembers.left} R=${p.towerMembers.right}`);
    for (const s of SPOTS) console.log(`  ${s}: -> (${p.duties[s].pos.x.toFixed(1)},${p.duties[s].pos.y.toFixed(1)}) ${p.duties[s].label}`);
  }
  if (eng.hint !== lastHint) {
    lastHint = eng.hint;
    const pos = SPOTS.map((s) => `${s}(${eng.positions[s].x.toFixed(1)},${eng.positions[s].y.toFixed(1)})`).join(' ');
    console.log(`t=${eng.t.toFixed(1)} hint="${lastHint}"\n  pos: ${pos}`);
  }
}
console.log('\nresult:', eng.result, 't=', eng.t.toFixed(1));
