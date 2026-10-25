# Bang Motion

Bang Motion is an agent skill and a local review studio for making animated
videos with HTML, CSS, and GSAP. Choose the lightweight skill workflow or the
approval-gated Studio workflow below. Both produce a playable `index.html`.

> **Update notice:** Bang Motion is actively maintained and updated regularly.
> Some features or components may change, become temporarily unavailable, or
> behave unexpectedly while updates are in progress. If something breaks, check
> the latest setup instructions and report the issue with the affected workflow
> and error details.

## Choose how to work

| | Skill-only | Studio + Render |
|---|---|---|
| Best for | Ask an agent to make a video directly | Review script and storyboard in a browser before animation |
| Setup | Install or clone the skill | Run the local Studio; install render tools only when needed |
| Approval | Review in the agent conversation | Persistent project state and review URLs |
| Output | `index.html` and any assets | `index.html`, assets, review snapshots, optional MP4 |

### 1. Skill-only — lightweight

Install this repository as a skill for Codex:

```sh
git clone https://github.com/aulilkez/bang-motion.git ~/.codex/skills/bang-motion
```

For Claude Code, Gemini CLI, Cursor, or another agent, clone the repository
and add it to the agent's skills or project instructions. Ask the agent to
read `SKILL.md`, then describe the video you want. Include its topic, audience,
duration, language, aspect ratio, style, and voice-over preference.

This path does not need the Studio server, Python, or npm packages to create
and watch an animation. The agent reviews drafts with you in the conversation;
it does not create persistent Studio approval URLs.

### 2. Studio + Render — review and export

Studio stores each project locally and provides browser links for script and
storyboard review. Animation generation is gated on approval at each stage.

Studio uses Python 3.10+, FastAPI, HTMX, and locally compiled Tailwind CSS.
Set up the Python environment and browser assets once:

```sh
python3 -m venv scripts/studio/.venv
scripts/studio/.venv/bin/pip install -r scripts/studio/requirements.txt
npm ci --prefix scripts
npm run studio:build --prefix scripts
```

On Windows, use `scripts\\studio\\.venv\\Scripts\\python.exe -m pip` to
install the Python requirements.

Check the setup and start Studio:

```sh
npm run doctor:studio --prefix scripts
npm run studio --prefix scripts
```

Open [http://127.0.0.1:4179](http://127.0.0.1:4179). Create a project and give
the generated agent task to Codex or Claude Code. The agent returns a review
URL after preparing each draft. Approve or request changes in the browser,
then resume the agent with the project ID.

Its server binds to loopback and keeps project data under
`scripts/studio/data/`; it does not need an AI API key.

For frame capture and MP4 export, check the optional render tools. If you
skipped the Studio setup above, install the Node packages first with
`npm ci --prefix scripts`.

```sh
npm ci --prefix scripts
npm run doctor:render --prefix scripts
```

Frame capture needs Puppeteer and Chrome/Chromium. Set
`PUPPETEER_EXECUTABLE_PATH` if Chrome is not detected automatically. MP4
encoding also needs FFmpeg. These tools are only needed for rendering and
export; they are not required to use the Studio review UI.

The review server is local to this computer. For the agent handoff, approval
URLs look like:

```text
http://127.0.0.1:4179/projects/<project-id>/review/script
http://127.0.0.1:4179/projects/<project-id>/review/storyboard
```

See [the Studio guide](scripts/studio/README.md) for the workflow and CLI.

## Styles and starters

- **Explainers:** cartoon collage, visual journalism, white catalog, vintage
  sketch, continuous action, and cartoon stage.
- **Openers and promos:** ten style directions, including cinematic dark,
  paper and print, retro analog, flat pop with photos, and grainy gradient.

The agent chooses a starter from [`assets/starters/`](assets/starters/) and
follows the motion and visual guidance in [`SKILL.md`](SKILL.md) and
[`references/`](references/).

## Preview and export

Open the generated `index.html` in a modern browser. Add `?debug=1` to scrub
the timeline when the starter supports it. Frame capture uses
`scripts/render/snap.mjs`; full frame export uses
`scripts/render/export-frames.mjs`. FFmpeg combines exported PNG frames into
an MP4. The browser animation may load GSAP and fonts from a CDN.

Check a setup profile at any time:

```sh
npm run doctor:skill --prefix scripts
npm run doctor:studio --prefix scripts
npm run doctor:render --prefix scripts
```

## Repository layout

```text
SKILL.md                  Agent instructions and motion rules
assets/starters/          Opener and explainer HTML starters
references/               Animation, style, and architecture guides
scripts/studio/            Local approval workflow, UI, and setup checker
scripts/render/            Frame snapshots and PNG export
scripts/utilities/         Local server and voice-over pause tool
scripts/ae/bridge/         After Effects asset helpers
```

Run the Studio workflow tests with `npm test --prefix scripts`.

## License

[MIT](LICENSE) © Bang Tutorial
