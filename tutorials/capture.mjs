/* Deterministic frame capture: drive window.seek(t) and screenshot each frame. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const v = process.argv[2] || 'slack';
const EXE = process.env.PW_CHROMIUM;
if (!EXE) { console.error('Set PW_CHROMIUM to the chromium executable'); process.exit(1); }

const outDir = join(__dirname, 'frames', v);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1120, height: 760 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));

const url = 'file://' + join(__dirname, 'frame.html') + '?v=' + v;
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1' && typeof window.seek === 'function', null, { timeout: 15000 });
await page.waitForTimeout(300); // let fonts/SVG settle

const total = await page.evaluate(() => window.TOTAL);
const fps = await page.evaluate(() => window.FPS);
const frames = Math.round(total * fps);
console.log(`[${v}] total=${total.toFixed(2)}s fps=${fps} frames=${frames}`);

for (let f = 0; f < frames; f++) {
  const t = f / fps;
  await page.evaluate((tt) => window.seek(tt), t);
  await page.screenshot({ path: join(outDir, String(f).padStart(4, '0') + '.png') });
  if (f % 60 === 0) process.stdout.write(`  ${f}/${frames}\r`);
}
console.log(`\n[${v}] captured ${frames} frames -> ${outDir}`);
await browser.close();
