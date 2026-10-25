#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const staticDir = path.join(here, "app", "static");
await mkdir(path.join(staticDir, "vendor"), { recursive: true });
await copyFile(path.join(root, "node_modules", "htmx.org", "dist", "htmx.min.js"), path.join(staticDir, "vendor", "htmx.min.js"));
const cli = path.join(root, "node_modules", "tailwindcss", "lib", "cli.js");
const child = spawn(process.execPath, [cli, "-c", path.join(here, "app", "tailwind.config.cjs"), "-i", path.join(staticDir, "css", "input.css"), "-o", path.join(staticDir, "css", "app.css"), "--minify"], { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code ?? 1));
