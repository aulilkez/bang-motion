#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectStore } from "./store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const store = new ProjectStore(
  process.env.STUDIO_DATA_DIR || path.join(here, "data"),
);
await store.init();
const [command, ...args] = process.argv.slice(2);
const help = `Bang Motion Studio local workflow\n\nCommands:\n  list\n  project <id>\n  create <brief.json>\n  begin <id> <script|storyboard|animation>\n  submit <id> <script|storyboard> <content.json>\n  quality <id> <quality-report.json>\n  status <id> <rendering|completed|failed> [message]\n  resume <id>\n\nStart the review server separately: npm run studio --prefix scripts\n`;
const read = async (file) =>
  JSON.parse(await readFile(path.resolve(file), "utf8"));
const out = (value) => console.log(JSON.stringify(value, null, 2));
try {
  if (command === "list") out(await store.list());
  else if (command === "project")
    out(store.publicProject(await store.load(args[0])));
  else if (command === "create")
    out(store.publicProject(await store.create(await read(args[0]))));
  else if (command === "begin")
    out(store.publicProject(await store.begin(args[0], args[1])));
  else if (command === "submit")
    out(
      store.publicProject(
        await store.saveContent(args[0], args[1], await read(args[2])),
      ),
    );
  else if (command === "quality")
    out(
      store.publicProject(
        await store.saveQuality(args[0], await read(args[1])),
      ),
    );
  else if (command === "status")
    out(
      store.publicProject(
        await store.updateStatus(args[0], args[1], {
          message: args.slice(2).join(" "),
        }),
      ),
    );
  else if (command === "resume")
    out(store.publicProject(await store.resume(args[0])));
  else {
    console.log(help);
    if (command && command !== "help") process.exitCode = 2;
  }
} catch (error) {
  console.error(`${error.name}: ${error.message}`);
  if (error.issues?.length) console.error(error.issues);
  process.exitCode = 1;
}
