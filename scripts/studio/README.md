# Bang Motion Studio

Bang Motion Studio is a local, approval-gated workflow for using Codex, Claude Code, or another coding agent with this repository. It does not call an AI API. Projects live as readable JSON and generated files under `scripts/studio/data/projects/<id>/`.

## Choose a workflow

Use the repository as an agent skill for a lightweight workflow. The agent
creates the video from the existing starters and reviews drafts with you in
the conversation. This does not use Studio's persistent approval records or
review URLs. See the root [README](../../README.md#choose-how-to-work).

Use Studio when you want saved project state and browser-based approval gates.

## Requirements and start

Studio's review UI needs Node.js 22.12 or newer. It uses Node's built-in
modules; no `npm install` is needed to run the server. Check the setup with:

```sh
npm run doctor:studio --prefix scripts
```

```sh
npm run studio --prefix scripts
```

Open `http://127.0.0.1:4179`. Set `STUDIO_PORT` or `STUDIO_DATA_DIR` to change the local port or data location. The server refuses non-loopback host binding. The UI sends a required write header and same-origin checks protect state-changing endpoints.

## Agent handoff

Create a project in the browser, copy the generated agent task into Codex or Claude Code, and have the agent read this file and the project's `project.json`. The agent creates structured JSON and submits it with `cli.mjs`. It must stop and return the review URL after each submission. After approval, resume the agent with the project ID and have it inspect `project.json`, the approved snapshots, and persisted revision notes before continuing.

```sh
node scripts/studio/cli.mjs begin <project-id> script
node scripts/studio/cli.mjs submit <project-id> script /tmp/script.json
# Stop here and wait for approval.
node scripts/studio/cli.mjs project <project-id>
# Only after script_approved:
node scripts/studio/cli.mjs begin <project-id> storyboard
node scripts/studio/cli.mjs submit <project-id> storyboard /tmp/storyboard.json
# Stop here and wait for approval.
```

Approvals refer to both a content version and its SHA-256 hash. Editing after approval saves a new immutable version, invalidates the approval, and removes downstream storyboard/render approvals. Revision notes are durable and shown to the agent in project state.

## Data and render handoff

The project stores metadata, brief, script/storyboard versions, approvals, revision notes, render metadata, and quality report separately. Agent-generated animation must be written into the project's `output/` folder with `index.html` as its entry point and assets alongside it. Preview at `/projects/<id>/review/preview`.

For frame capture, use the existing `scripts/render/snap.mjs` and `scripts/render/export-frames.mjs` from the project output directory. The latter captures PNG frames; combine them with the repository's documented FFmpeg path when MP4 was requested. Then submit a quality report listing actual frame paths relative to `output/`. Rendering cannot be marked complete until `output/index.html` exists; requested MP4 projects also require `output/video.mp4` to exist.

Frame capture and MP4 export are optional Studio add-ons. Install and check
their requirements only when needed:

```sh
npm ci --prefix scripts
npm run doctor:render --prefix scripts
```

Frame capture requires Puppeteer and Chrome/Chromium. FFmpeg is needed only
to encode PNG frames as MP4. Set `PUPPETEER_EXECUTABLE_PATH` when Chrome is
installed at a nonstandard location.

Automatic Indonesian voice generation with Pocket TTS is not currently part
of this Studio setup. The Studio does not install Python or model weights.

## Tests

```sh
npm test --prefix scripts
```

The tests use Node's built-in test runner and temporary project data. No model credentials or new runtime packages are needed.
