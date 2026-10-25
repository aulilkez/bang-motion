/* =========================================================
   Render an animation to a sequence of PNG frames.

   This is not a screen recording: the script seeks the timeline to each
   frame, waits for the browser to draw it, and then captures the image.

   Prerequisites:
     npm install --prefix /path/to/bang-motion/scripts
     python /path/to/bang-motion/scripts/utilities/serve.py 5178
     (start the server from the video project directory)

   Run from the video project directory:
     node /path/to/bang-motion/scripts/render/export-frames.mjs
     ffmpeg -framerate 60 -i frames/f%05d.png -c:v libx264 -pix_fmt yuv420p -crf 16 output.mp4

   This script creates PNG files only. ffmpeg creates the MP4.
   ========================================================= */

import puppeteer from 'puppeteer';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const URL   = process.env.URL   || 'http://127.0.0.1:5178/index.html?clean=1';
const FPS   = Number(process.env.FPS   || 60);
const REQUESTED_OUT = process.env.OUT || 'frames';
const SCALE = Number(process.env.SCALE || 1);   // 1 = 1920x1080, 0.5 = 960x540

async function prepareOutputDirectory(requestedPath, chooseFreshName) {
  let candidate = requestedPath;
  let suffix = 2;

  while (true) {
    await mkdir(dirname(candidate), { recursive: true });
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let contents;
      try {
        contents = await readdir(candidate);
      } catch {
        if (chooseFreshName) {
          candidate = `frames-${String(suffix).padStart(2, '0')}`;
          suffix += 1;
          continue;
        }
        throw new Error(`Output path exists and is not a directory: ${candidate}`);
      }
      if (contents.length === 0) return candidate;
      if (!chooseFreshName) {
        throw new Error(`Output directory is not empty: ${candidate}. Choose a new OUT path.`);
      }

      candidate = `frames-${String(suffix).padStart(2, '0')}`;
      suffix += 1;
    }
  }
}

const OUT = await prepareOutputDirectory(REQUESTED_OUT, process.env.OUT === undefined);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--enable-gpu', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: SCALE });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  await page.waitForFunction(
    'window.OPENER && window.OPENER.ready && (!window.OPENER.clipsReady || window.OPENER.clipsReady())',
    { timeout: 120000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.OPENER.tl.pause(0); });

  const duration = await page.evaluate(() => window.OPENER.DURATION);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('The page must expose a positive window.OPENER.DURATION value.');
  }
  const totalFrames = Math.ceil(duration * FPS);
  console.log(`${totalFrames} frames at ${FPS} fps (${duration}s) -> ${OUT}/`);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const time = frame / FPS;

    // Allow GSAP to update before the browser captures the frame.
    await page.evaluate(async (targetTime) => {
      if (window.OPENER.seekFrame) {
        await window.OPENER.seekFrame(targetTime);
      } else {
        (window.OPENER.seek || window.OPENER.tl.time.bind(window.OPENER.tl))(targetTime);
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);

    await page.screenshot({
      path: `${OUT}/f${String(frame).padStart(5, '0')}.png`,
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      optimizeForSpeed: true,
    });

    if (frame % FPS === 0) {
      process.stdout.write(`\r${frame}/${totalFrames}  ${time.toFixed(1)}s`);
    }
  }

  console.log(`\nFinished: ${totalFrames} frames in ${OUT}/`);
} finally {
  await browser.close();
}
