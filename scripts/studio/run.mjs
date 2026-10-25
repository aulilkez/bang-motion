#!/usr/bin/env node
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.STUDIO_PYTHON, path.join(here, ".venv", "bin", "python"), path.join(here, ".venv", "Scripts", "python.exe"), "python3", "python"].filter(Boolean);
let python = candidates.find((candidate) => {
  if (candidate.includes(path.sep) && !existsSync(candidate)) return false;
  const check = spawnSync(candidate, ["-c", "import sys; raise SystemExit(sys.version_info < (3, 10))"], { stdio: "ignore" });
  return check.status === 0;
});
if (!python) { console.error("Python 3.10+ is required. Install scripts/studio/requirements.txt in scripts/studio/.venv."); process.exit(1); }
const child = spawn(python, [path.join(here, "run.py"), ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
child.on("error", (error) => { console.error(error.message); process.exit(1); });
child.on("exit", (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 1); });
