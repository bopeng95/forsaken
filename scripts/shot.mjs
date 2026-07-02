/* Visual smoke: drive the app headless, screenshot key moments. */
import { chromium } from 'playwright';

const OUT = process.env.OUT ?? 'shots';
const url = 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url);
await page.waitForSelector('text=Forsaken');
await page.screenshot({ path: `${OUT}/01-start.png` });

// pick H2 and watch on autopilot
await page.click('button:has-text("H2")');
await page.waitForSelector('canvas.arena');
await page.check('input[type=checkbox]');
await page.screenshot({ path: `${OUT}/02-setup.png` });

// timeline: set1 resolves 13.5s, set2 23.5s, snapshot 24.5s (set3 telegraphs),
// lock 29.2s, cleave 34.2s, set3 soak 34.5s; then +21s per even/odd pair
const shotAt = [
  [12000, '03-towers1-odd'], // set 1 towers + soak spots
  [20000, '04-towers2-even'], // even towers + Future/Past cast bar
  [27000, '05-clones-bait'], // clones out, bait marker, set 3 telegraphing
  [32000, '06-cleave'], // All Things Ending half-room while towers 3 tick down
  [40000, '07-set4'],
];
let elapsed = 0;
for (const [t, name] of shotAt) {
  await page.waitForTimeout(t - elapsed);
  elapsed = t;
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// let the run finish to the clear screen (full run ~95s)
await page.waitForSelector('text=Forsaken resolved', { timeout: 90000 });
await page.screenshot({ path: `${OUT}/08-clear.png` });

// new run without autopilot -> stand still -> expect a fail overlay + ghost
await page.click('button:has-text("Try Again")');
await page.uncheck('input[type=checkbox]');
await page.waitForSelector('.result-banner.fail', { timeout: 40000 });
await page.screenshot({ path: `${OUT}/09-fail.png` });

console.log('console/page errors:', errors.length ? errors : 'none');
await browser.close();
