/* =========================================================
   Capture selected timeline moments as PNGs; do not render the full video.

   The script seeks window.OPENER to each requested time, waits for the
   browser to draw, and saves a PNG. Six to twenty frames are usually enough
   for a visual review.

   Prerequisite (optional — use ?debug=1 for manual review without Node):
     npm install --prefix /path/to/bang-motion/scripts

   Run from the video project directory, without starting a server:
     node /path/to/bang-motion/scripts/render/snap.mjs shots 1 3.5 8 12 20
     URL="file:///path/to/video-project/index.html?clean=1" node /path/to/bang-motion/scripts/render/snap.mjs shots 1 3.5 8
   Output: shots/t1_00.png, shots/t3_50.png, ...

   The page must expose window.OPENER = { W, H, ready, seek(t) }.
   ?clean=1 disables autoplay and review controls.
   ========================================================= */
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const [outDir, ...times] = process.argv.slice(2);
if (!outDir || !times.length) { console.log('Usage: node snap.mjs <output-folder> <seconds> [<seconds> ...]'); process.exit(1); }
const URL = process.env.URL || pathToFileURL(process.cwd()).href + '/index.html?clean=1';
await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-gpu', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.OPENER && window.OPENER.ready && (!window.OPENER.clipsReady || window.OPENER.clipsReady())', { timeout: 60000 });
const { W, H } = await page.evaluate(() => ({ W: window.OPENER.W || 1920, H: window.OPENER.H || 1080 }));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
for (const ts of times) {
  const t = Number(ts);
  await page.evaluate(async (time) => {
    if (window.OPENER.seekFrame) { await window.OPENER.seekFrame(time); window.OPENER.seek(time); }   // ada klip video
    else {
      window.OPENER.seek(time);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.OPENER.seek(time);   // dua kali: GSAP menulis style, lalu render loop menggambar
    }
  }, t);
  await page.screenshot({ path: `${outDir}/t${t.toFixed(2).replace('.', '_')}.png`, clip: { x: 0, y: 0, width: W, height: H } });
  process.stdout.write(`${t} `);
}
await browser.close(); console.log('\nselesai');
