import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectStore, ConflictError } from "../store.mjs";
import { STATUS, contentHash } from "../workflow.mjs";

const brief = {
  originalPrompt: "Make an explainer about the sky.",
  title: "Blue sky",
  topic: "Rayleigh scattering",
  purpose: "Curious teens",
  durationSeconds: 30,
  language: "English",
  style: "cartoon-collage",
  aspectRatio: "16:9",
  voiceover: "script-only",
  subtitles: "requested",
  music: "none",
};
const script = {
  title: "Blue sky",
  language: "English",
  durationSeconds: 30,
  sections: [
    {
      id: "s1",
      title: "Sunlight arrives",
      startSeconds: 0,
      endSeconds: 15,
      narration: "Sunlight contains many colors.",
      sceneGoal: "Introduce visible light.",
      visualDescription: "A sunbeam enters a blue atmosphere.",
    },
    {
      id: "s2",
      title: "Blue scatters",
      startSeconds: 15,
      endSeconds: 30,
      narration: "Air scatters blue light in every direction.",
      sceneGoal: "Explain scattering.",
      visualDescription: "Blue rays scatter toward the viewer.",
    },
  ],
};
function storyboard(version = 1) {
  return {
    title: "Blue sky",
    scriptVersion: version,
    scenes: [
      {
        id: "scene-1",
        startSeconds: 0,
        durationSeconds: 15,
        goal: "Introduce light",
        visualDescription: "Sunlight moves into a layered atmosphere.",
        objects: ["sun", "earth", "rays"],
        objectMotion: "Rays travel diagonally and fan outward.",
        cameraMotion: "Slow push into the sky.",
        transition: "Light wipe into next scene.",
        onScreenText: ["Sunlight"],
        narration: "Sunlight contains many colors.",
        scriptSectionIds: ["s1"],
        assetsNeeded: ["sun illustration", "ray texture"],
        starter: "assets/starters/explainers/cartoon-collage.html",
      },
      {
        id: "scene-2",
        startSeconds: 15,
        durationSeconds: 15,
        goal: "Show scattering",
        visualDescription:
          "Blue rays bounce through the air around the viewer.",
        objects: ["molecules", "blue rays"],
        objectMotion: "Rays scatter in several directions.",
        cameraMotion: "Gentle orbit around the viewer.",
        transition: "Dissolve into close-up.",
        onScreenText: ["Scattering"],
        narration: "Air scatters blue light in every direction.",
        scriptSectionIds: ["s2"],
        assetsNeeded: ["molecule shapes"],
        starter: "assets/starters/explainers/cartoon-collage.html",
      },
    ],
  };
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bang-studio-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return new ProjectStore(dir);
}

test("script gate, versions, revision decisions, and resume survive store reconstruction", async (t) => {
  const store = await fixture(t);
  let p = await store.create(brief);
  await assert.rejects(
    store.saveContent(p.id, "script", script),
    ConflictError,
  );
  p = await store.begin(p.id, "script");
  assert.equal(p.status, STATUS.GENERATING_SCRIPT);
  p = await store.saveContent(p.id, "script", script);
  assert.equal(p.status, STATUS.SCRIPT_REVIEW);
  assert.equal(p.scriptVersion, 1);
  const hash = contentHash(script);
  p = await store.decide(
    p.id,
    "script",
    "request_changes",
    1,
    hash,
    "Tighten opening narration.",
  );
  assert.equal(p.status, STATUS.SCRIPT_CHANGES);
  assert.equal(p.revisions.at(-1).note, "Tighten opening narration.");
  p = await store.begin(p.id, "script");
  p = await store.saveContent(p.id, "script", script, 1);
  p = await store.decide(p.id, "script", "approve", 2, contentHash(script));
  assert.equal(p.status, STATUS.SCRIPT_APPROVED);
  const afterRestart = new ProjectStore(store.root);
  const reloaded = await afterRestart.load(p.id);
  assert.equal(reloaded.status, STATUS.SCRIPT_APPROVED);
  assert.equal(reloaded.approvals.script.version, 2);
  await afterRestart.updateStatus(p.id, STATUS.FAILED, {
    message: "agent stopped",
  });
  const resumed = await new ProjectStore(store.root).resume(p.id);
  assert.equal(resumed.status, STATUS.SCRIPT_APPROVED);
  const edited = structuredClone(resumed.script);
  edited.sections[0].visualDescription = "Replace the first scene visual.";
  const changedAfterApproval = await store.saveContent(
    p.id,
    "script",
    edited,
    resumed.scriptVersion,
  );
  assert.equal(changedAfterApproval.approvals.script, null);
  assert.equal(changedAfterApproval.approvalHistory.script.length, 1);
  assert.equal(changedAfterApproval.scriptVersion, 3);
});

test("storyboard is gated by current script approval and animation by storyboard approval", async (t) => {
  const store = await fixture(t);
  let p = await store.create(brief);
  await store.begin(p.id, "script");
  p = await store.saveContent(p.id, "script", script);
  await assert.rejects(store.begin(p.id, "storyboard"), ConflictError);
  p = await store.decide(p.id, "script", "approve", 1, contentHash(script));
  p = await store.begin(p.id, "storyboard");
  assert.equal(p.status, STATUS.GENERATING_STORYBOARD);
  const initialBoard = storyboard();
  p = await store.saveContent(p.id, "storyboard", initialBoard);
  assert.equal(p.storyboardVersion, 1);
  await assert.rejects(store.begin(p.id, "animation"), ConflictError);
  const revisedBoard = structuredClone(initialBoard);
  revisedBoard.scenes[0].visualDescription =
    "Sunlight sweeps into the atmosphere in a continuous move.";
  p = await store.saveContent(p.id, "storyboard", revisedBoard, 1);
  assert.equal(p.storyboardVersion, 2);
  assert.equal(p.approvals.storyboard, null);
  await assert.rejects(
    store.decide(p.id, "storyboard", "approve", 1, contentHash(initialBoard)),
    ConflictError,
  );
  p = await store.decide(
    p.id,
    "storyboard",
    "approve",
    2,
    contentHash(revisedBoard),
  );
  p = await store.begin(p.id, "animation");
  assert.equal(p.status, STATUS.GENERATING_ANIMATION);
  const out = path.join(p.dir, "output");
  await mkdir(path.join(out, "shots"), { recursive: true });
  await writeFile(path.join(out, "shots", "frame.png"), "png");
  p = await store.saveQuality(p.id, {
    result: "passed",
    frames: ["shots/frame.png"],
    checks: [{ name: "composition", passed: true }],
  });
  assert.equal(p.status, STATUS.QUALITY_CHECK);
  await store.updateStatus(p.id, STATUS.RENDERING);
  await writeFile(path.join(out, "index.html"), "<html></html>");
  await writeFile(path.join(out, "video.mp4"), "mp4");
  p = await store.updateStatus(p.id, STATUS.COMPLETED);
  assert.equal(p.status, STATUS.COMPLETED);
});

test("approval bound to an older content hash is rejected and an edit invalidates approval", async (t) => {
  const store = await fixture(t);
  let p = await store.create(brief);
  await store.begin(p.id, "script");
  p = await store.saveContent(p.id, "script", script);
  const oldHash = p.scriptHash;
  const changed = structuredClone(script);
  changed.sections[0].narration = "Updated narration.";
  p = await store.saveContent(p.id, "script", changed, 1);
  assert.equal(p.scriptVersion, 2);
  assert.equal(p.approvals.script, null);
  await assert.rejects(
    store.decide(p.id, "script", "approve", 1, oldHash),
    ConflictError,
  );
  await assert.rejects(store.begin(p.id, "storyboard"), ConflictError);
});
