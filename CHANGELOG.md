# Changelog

## Unreleased

- Consolidate Puppeteer under `scripts/` so capture, frame export, and the After Effects SVG renderer share one install location.
- Document that `export-frames.mjs` writes PNG files and ffmpeg creates the MP4; use a fresh output directory for each render.

## 1.19.0 — 2026-09-15

**Shot size — move the camera to the subject**
- Defines “zoom in/out” as a clear change in shot size (wide ↔ medium close-up ↔ close-up) that follows the subject, rather than an almost invisible camera drift of a few percent.
- `references/techniques.md` §3b explains how to choose the target and timing, use two motion tempos, derive camera scale from subject size, clamp the world edges, and keep labels on the screen layer.

## 1.18.0 — 2026-09-15

**Video as a footage layer**
- Every starter includes `clip(el, {at, in, out, rate, hold})`. Video clips follow the timeline clock, stay in sync during playback and scrubbing, and can be trimmed, slowed, held, masked, and animated with other elements.
- `scripts/render/snap.mjs` and `scripts/render/export-frames.mjs` wait for video frames to be ready, keeping MP4 exports frame-accurate.
- Usage, clip sources (user files, MCP generation, or licensed stock), formats, and layout patterns are covered in `references/techniques.md` §9b.
- The deliverable remains `index.html` (plus `assets/` when using video or audio), with no launcher file.

## 1.17.0 — 2026-09-14

**Openers and promos**
- Choose a structure instead of inheriting one: create three candidates from the 19-concept menu, compare each structure fingerprint with the previous project, use no more than two canonical components, and start from an opener starter with no sample scene order (`references/opener-concepts.md`, `assets/starters/openers/opener.html`).
- Concept examples are principles, not scripts. Do not copy their openings, endings, or signature moments. Derive the palette, shapes, and objects from the brand, and state the source of every color.
- Adds UI animation guidance for apps and SaaS, camera moves that follow important clicks, and photo guidance for openers (user-provided, MCP-generated, or licensed stock).

**Typography, backgrounds, and rendering**
- Word highlighting is optional; headlines and claims do not get automatic periods.
- Backgrounds must move. Change background color when needed, with a visible cue. Adds grainy-gradient encoding guidance and a menu of object-rendering styles.

**Explainers**
- Adds six styles: continuous action, cartoon collage, visual journalism, white catalog, vintage sketch, and cartoon stage (`references/explainer.md`, `references/cartoon-stage.md`).

**After Effects**
- Build directly through the Higgsfield bridge/MCP (`references/ae-bridge-higgsfield.md`, `scripts/ae/bridge/`).

**Tools**
- Visual checks at key seconds (`scripts/render/snap.mjs`), MP4 export (`scripts/render/export-frames.mjs`), and browser-based voice-over pause detection (`scripts/utilities/voiceover-pauses.html`).
