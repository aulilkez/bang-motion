# Bang Motion Studio

Bang Motion Studio is a local, approval-gated workflow for using Codex, Claude Code, or another coding agent with this repository. It does not call an AI API. Projects live as readable JSON and generated files under `scripts/studio/data/projects/<id>/`.

## Start

Node.js 22.12 or newer is recommended to match the existing Bang Motion render tooling.

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

## Tests

```sh
npm test --prefix scripts
```

The tests use Node's built-in test runner and temporary project data. No model credentials or new runtime packages are needed.
