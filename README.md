# Bang Motion

Bang Motion is an AI agent skill for creating animated videos with HTML, CSS,
and GSAP. Projects use Bang Motion's motion rules and starters to create a
playable `index.html` that feels like a video rather than a slide deck.

Works with Codex, Claude Code, Gemini CLI, Cursor, and other coding agents.

## Quick start

Install the skill in your coding agent, then ask it for a video. Include the
topic, audience, length, language, aspect ratio, and any style or voice-over
preferences. The agent will read `SKILL.md` and use the matching starter.

For a review-first workflow, start Bang Motion Studio:

```sh
npm run studio --prefix scripts
```

Open [http://127.0.0.1:4179](http://127.0.0.1:4179), create a project, and copy
the agent task into Codex or Claude Code. The agent prepares the script and
returns a review URL. Approve or request changes in the browser. After script
approval, resume the agent to prepare the storyboard; animation starts only
after storyboard approval.

Example prompt:

> Create a 120-second science video in Indonesian about why the sky is blue.
> Use cartoon collage, 16:9, for curious teens, with voice-over and subtitles.

Studio runs on this computer, saves projects under `scripts/studio/data/`, and
does not require an AI API key. Review URLs such as
`http://127.0.0.1:4179/projects/<project-id>/review/script` are local to this
computer. See [the Studio guide](scripts/studio/README.md) for the agent
commands and render handoff.

## Use as an agent skill

Install the Claude Code plugin with:

```text
/plugin marketplace add bangtutorial/bang-motion
/plugin install bang-motion@bang-motion
```

For another agent, clone this repository and add `SKILL.md` to its skills or
project instructions:

```sh
git clone https://github.com/bangtutorial/bang-motion.git
```

| Agent               | Setup                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Codex               | Add the repository to your skills folder, or tell Codex to read `SKILL.md`. |
| Gemini CLI / Cursor | Add `SKILL.md` to project instructions (`GEMINI.md` or `.cursor/rules`).    |

The detailed workflow and motion rules are in [SKILL.md](SKILL.md). The
[`references/`](references/) folder explains styles, techniques, and the
animation architecture.

## Styles and starters

Choose a style to guide the look; the agent should still derive colors, type,
and assets from the project brief and brand.

- **Explainers:** cartoon collage, visual journalism, white catalog, vintage
  sketch, continuous action, and cartoon stage.
- **Openers and promos:** ten style directions, including cinematic dark,
  paper and print, retro analog, flat pop with photos, and grainy gradient.

Starters are in [`assets/starters/`](assets/starters/). Keep the final HTML and
any required assets together; the primary deliverable remains `index.html`.

## Preview and export

Open the generated `index.html` in a browser. Add `?debug=1` to scrub the
timeline when the starter supports it.

To capture key frames, install the optional render dependency once:

```sh
npm install --prefix scripts
node /path/to/bang-motion/scripts/render/snap.mjs shots 1 3.5 8 12
```

To export an MP4, start the local server from the animation project folder:

```sh
python /path/to/bang-motion/scripts/utilities/serve.py 5178
```

In a second terminal, from that same project folder:

```sh
node /path/to/bang-motion/scripts/render/export-frames.mjs
ffmpeg -framerate 60 -i frames/f%05d.png -c:v libx264 -pix_fmt yuv420p -crf 16 -movflags +faststart output.mp4
```

`export-frames.mjs` creates PNGs; FFmpeg combines them into an MP4. Both tools
are optional. `scripts/utilities/voiceover-pauses.html` can detect pauses in an
audio file in the browser without an API key.

Run the Studio workflow tests with `npm test --prefix scripts`.

## Repository layout

```text
SKILL.md                  Agent instructions and motion rules
assets/starters/          Opener and explainer HTML starters
references/               Animation, style, and architecture guides
scripts/studio/            Local approval workflow and review UI
scripts/render/            Frame snapshots and PNG export
scripts/utilities/         Local server and voice-over pause tool
scripts/ae/bridge/         After Effects asset helpers
```

## Requirements

- **To create or watch a video:** a coding agent and a modern browser. The
  animation may load GSAP or fonts from a CDN.
- **To run Studio:** Node.js 22.12 or newer. Studio uses Node's built-in
  modules and does not add runtime dependencies.
- **To capture frames or export video:** Node.js, Puppeteer, and Chrome. MP4
  export also requires FFmpeg.

## License

[MIT](LICENSE) © Bang Tutorial
