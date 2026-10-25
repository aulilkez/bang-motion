#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.STUDIO_PYTHON, path.join(here, ".venv", "bin", "python"), path.join(here, ".venv", "Scripts", "python.exe"), "python3", "python"].filter(Boolean);
const python = candidates.find((candidate) => {
  if (candidate.includes(path.sep) && !existsSync(candidate)) return false;
  return spawnSync(candidate, ["-c", "import sys; raise SystemExit(sys.version_info < (3, 10))"], { stdio: "ignore" }).status === 0;
});
if (!python) { console.error("Python 3 is required to run Studio tests."); process.exit(1); }
const result = spawnSync(python, ["-m", "unittest", "discover", "-s", path.join(here, "app", "tests"), "-v"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
