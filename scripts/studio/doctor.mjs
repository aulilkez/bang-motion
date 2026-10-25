#!/usr/bin/env node
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const profile = process.argv[2] || "help";
const results = [];
const add = (label, state, detail, required = true) =>
  results.push({ label, state, detail, required });

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: false });
  return !result.error && result.status === 0;
}

function chromeAvailable() {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured && commandExists(configured, ["--version"])) return configured;
  const candidates =
    process.platform === "win32"
      ? ["chrome", "chrome.exe", "msedge", "msedge.exe"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  const locator = process.platform === "win32" ? "where" : "which";
  for (const candidate of candidates) {
    const result = spawnSync(locator, [candidate], { encoding: "utf8" });
    const executable = result.stdout?.trim().split(/\r?\n/)[0];
    if (result.status === 0 && executable && commandExists(executable, ["--version"]))
      return executable;
  }
  return null;
}

const nodeVersion = process.versions.node.split(".").map(Number);
const nodeOk =
  nodeVersion[0] > 22 ||
  (nodeVersion[0] === 22 &&
    (nodeVersion[1] > 12 || (nodeVersion[1] === 12 && nodeVersion[2] >= 0)));

function studioPython() {
  const candidates = [process.env.STUDIO_PYTHON, path.join(root, "scripts/studio/.venv/bin/python"), path.join(root, "scripts/studio/.venv/Scripts/python.exe"), "python3", "python"].filter(Boolean);
  for (const python of candidates) {
    if (python.includes(path.sep) && !existsSync(python)) continue;
    const result = spawnSync(python, ["-c", "import sys; assert sys.version_info >= (3, 10); import fastapi, jinja2, uvicorn, multipart"], { stdio: "ignore" });
    if (result.status === 0) return python;
  }
  return null;
}

if (profile === "skill") {
  for (const file of ["SKILL.md", "references/explainer.md", "references/techniques.md"])
    add(file, (await exists(file)) ? "ready" : "missing", "Skill content and references");
  for (const folder of ["assets/starters/openers", "assets/starters/explainers"])
    add(folder, (await exists(folder)) ? "ready" : "missing", "Starter collection");
  add("Node.js / Python / Studio server", "not required", "Needed only for optional local tools", false);
} else if (profile === "studio") {
  add("Node.js", process.versions.node ? "ready" : "missing", `Found ${process.versions.node}`);
  const python = studioPython();
  add("Python 3 + Studio packages", python ? "ready" : "missing", python || "Create scripts/studio/.venv and install scripts/studio/requirements.txt");
  add("HTMX / Tailwind assets", (await exists("scripts/studio/app/static/vendor/htmx.min.js")) && (await exists("scripts/studio/app/static/css/app.css")) ? "ready" : "missing", "Run npm ci --prefix scripts, then npm run studio:build --prefix scripts");
  add(
    "Studio server and approval workflow",
    (await exists("scripts/studio/app/main.py")) ? "ready" : "missing",
    "FastAPI server with local persistent project storage",
  );
  add(
    "Puppeteer / Chrome / FFmpeg",
    "optional",
    "Install these only when capturing frames or exporting MP4",
    false,
  );
} else if (profile === "render") {
  add("Node.js >= 22.12", nodeOk ? "ready" : "missing", `Found ${process.versions.node}`);
  const puppeteerInstalled = await exists("scripts/node_modules/puppeteer/package.json");
  add(
    "Puppeteer",
    puppeteerInstalled ? "ready" : "missing",
    puppeteerInstalled ? "Render package is installed" : "Run npm ci --prefix scripts",
  );
  const chrome = chromeAvailable();
  add(
    "Chrome / Chromium",
    chrome ? "ready" : "missing",
    chrome || "Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH",
  );
  add(
    "FFmpeg",
    commandExists("ffmpeg", ["-version"]) ? "ready" : "optional",
    "Required only for MP4 encoding from exported PNG frames",
    false,
  );
} else {
  console.log(`Bang Motion setup profiles\n\nUsage: node scripts/studio/doctor.mjs <skill|studio|render>\n\n  skill   Check the lightweight agent-skill files (no server or installs)\n  studio  Check requirements for the local approval and review UI\n  render  Check optional frame-capture and MP4-export tools`);
  process.exit(profile === "help" ? 0 : 2);
}

console.log(`Bang Motion ${profile} profile`);
for (const result of results) {
  const marker = result.state === "ready" ? "OK" : result.state.toUpperCase();
  const optional = result.required ? "" : " (optional)";
  console.log(`${marker.padEnd(10)} ${result.label}${optional} — ${result.detail}`);
}
if (results.some((result) => result.required && result.state !== "ready"))
  process.exitCode = 1;
