import { createHash } from "node:crypto";

export const STATUS = Object.freeze({
  DRAFT: "draft",
  GENERATING_SCRIPT: "generating_script",
  SCRIPT_REVIEW: "script_review",
  SCRIPT_CHANGES: "script_revision_requested",
  SCRIPT_APPROVED: "script_approved",
  GENERATING_STORYBOARD: "generating_storyboard",
  STORYBOARD_REVIEW: "storyboard_review",
  STORYBOARD_CHANGES: "storyboard_revision_requested",
  STORYBOARD_APPROVED: "storyboard_approved",
  GENERATING_ANIMATION: "generating_animation",
  QUALITY_CHECK: "quality_check",
  RENDERING: "rendering",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const EXPLAINER_STYLES = Object.freeze({
  "cartoon-collage": {
    label: "Cartoon collage",
    starter: "assets/starters/explainers/cartoon-collage.html",
  },
  "visual-journalism": {
    label: "Visual journalism",
    starter: "assets/starters/explainers/visual-journalism.html",
  },
  "white-catalog": {
    label: "White catalog",
    starter: "assets/starters/explainers/white-catalog.html",
  },
  "vintage-sketch": {
    label: "Vintage sketch",
    starter: "assets/starters/explainers/vintage-sketch.html",
  },
  "continuous-action": {
    label: "Continuous action",
    starter: "assets/starters/explainers/continuous-action.html",
  },
  "cartoon-stage": {
    label: "Cartoon stage",
    starter: "assets/starters/explainers/cartoon-stage.html",
  },
});

export const OPENER_STYLES = Object.freeze({
  "cinematic-dark": "Cinematic dark",
  "poster-color-block": "Poster color-block",
  "editorial-light": "Editorial light",
  "paper-print": "Paper and print",
  "retro-analog": "Retro / analog",
  "brutalist-mono": "Brutalist mono",
  "pastel-playful": "Pastel playful",
  "luxury-dark": "Luxury dark",
  "flat-pop-photos": "Flat pop with photos",
  "grainy-gradient": "Grainy gradient",
});

export const FORMATS = Object.freeze({
  explainer: "Explainer",
  opener: "Opener / promo",
});

export class ValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function requireText(value, label, maxLength = 1200) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label} is required.`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return value.trim();
}

function requireFinite(value, label, min, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new ValidationError(
      `${label} must be a number from ${min} to ${max}.`,
    );
  }
  return value;
}

export function validateBrief(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Project brief must be a JSON object.");
  }

  const format = input.format || "explainer";
  if (!Object.hasOwn(FORMATS, format)) {
    throw new ValidationError("Format must be explainer or opener.");
  }

  const style = requireText(input.style, "Animation style", 80);
  if (format === "explainer" && !Object.hasOwn(EXPLAINER_STYLES, style)) {
    throw new ValidationError(
      "Choose one of the six available explainer styles.",
    );
  }
  if (format === "opener" && !Object.hasOwn(OPENER_STYLES, style)) {
    throw new ValidationError(
      "Choose one of the available opener style directions.",
    );
  }

  const aspectRatio = input.aspectRatio || "16:9";
  if (!["16:9", "9:16"].includes(aspectRatio)) {
    throw new ValidationError(
      "The current starters support 16:9 and 9:16 in this Studio MVP.",
    );
  }

  const voiceover = input.voiceover || "script-only";
  if (!["none", "script-only", "audio-provided"].includes(voiceover)) {
    throw new ValidationError(
      "Voice-over preference must be none, script-only, or audio-provided.",
    );
  }
  const subtitles = input.subtitles || "none";
  if (!["none", "requested"].includes(subtitles)) {
    throw new ValidationError(
      "Subtitles preference must be none or requested.",
    );
  }
  const music = input.music || "none";
  if (!["none", "music-only", "under-voiceover"].includes(music)) {
    throw new ValidationError(
      "Music preference must be none, music-only, or under-voiceover.",
    );
  }

  return {
    originalPrompt: requireText(input.originalPrompt, "Prompt", 6000),
    title: requireText(input.title, "Title", 120),
    topic: requireText(input.topic, "Topic", 1000),
    purpose: requireText(input.purpose, "Purpose / target audience", 1200),
    durationSeconds: requireFinite(input.durationSeconds, "Duration", 5, 600),
    language: requireText(input.language, "Language", 80),
    format,
    style,
    aspectRatio,
    voiceover,
    subtitles,
    music,
    exportMp4: input.exportMp4 !== false,
    createdFrom: input.createdFrom || "studio-ui",
  };
}

export function starterForBrief(brief) {
  if (brief.format === "opener") return "assets/starters/openers/opener.html";
  return EXPLAINER_STYLES[brief.style].starter;
}

export function validateScript(script, brief) {
  if (!script || typeof script !== "object" || Array.isArray(script)) {
    throw new ValidationError("Script must be a JSON object.");
  }
  requireText(script.title, "Script title", 180);
  requireText(script.language, "Script language", 80);
  if (script.language !== brief.language)
    throw new ValidationError("Script language must match the project brief.");
  if (script.durationSeconds !== brief.durationSeconds)
    throw new ValidationError(
      "Script durationSeconds must match the project brief.",
    );
  if (
    !Array.isArray(script.sections) ||
    script.sections.length < 1 ||
    script.sections.length > 80
  ) {
    throw new ValidationError("Script must contain between 1 and 80 sections.");
  }

  const ids = new Set();
  for (const [index, section] of script.sections.entries()) {
    const label = `Section ${index + 1}`;
    if (!section || typeof section !== "object" || Array.isArray(section))
      throw new ValidationError(`${label} must be an object.`);
    const id = requireText(section.id, `${label} ID`, 80);
    if (ids.has(id)) throw new ValidationError(`Duplicate section ID: ${id}.`);
    ids.add(id);
    requireText(section.title, `${label} title`, 180);
    requireFinite(
      section.startSeconds,
      `${label} start time`,
      0,
      brief.durationSeconds,
    );
    requireFinite(
      section.endSeconds,
      `${label} end time`,
      0.01,
      brief.durationSeconds,
    );
    if (section.endSeconds <= section.startSeconds) {
      throw new ValidationError(
        `${label} end time must be after its start time.`,
      );
    }
    if (brief.voiceover === "none") {
      if (
        section.narration !== undefined &&
        typeof section.narration !== "string"
      )
        throw new ValidationError(`${label} narration must be text.`);
    } else requireText(section.narration, `${label} narration`, 5000);
    requireText(section.sceneGoal, `${label} scene goal`, 1000);
    requireText(section.visualDescription, `${label} visual description`, 1600);
  }
  return script;
}

export function validateStoryboard(storyboard, brief, script, scriptVersion) {
  if (
    !storyboard ||
    typeof storyboard !== "object" ||
    Array.isArray(storyboard)
  ) {
    throw new ValidationError("Storyboard must be a JSON object.");
  }
  requireText(storyboard.title, "Storyboard title", 180);
  if (storyboard.scriptVersion !== scriptVersion) {
    throw new ValidationError(
      "Storyboard must reference the currently approved script version.",
    );
  }
  if (
    !Array.isArray(storyboard.scenes) ||
    storyboard.scenes.length < 1 ||
    storyboard.scenes.length > 100
  ) {
    throw new ValidationError(
      "Storyboard must contain between 1 and 100 scenes.",
    );
  }

  const scriptSectionIds = new Set(
    script.sections.map((section) => section.id),
  );
  const sceneIds = new Set();
  for (const [index, scene] of storyboard.scenes.entries()) {
    const label = `Scene ${index + 1}`;
    if (!scene || typeof scene !== "object" || Array.isArray(scene))
      throw new ValidationError(`${label} must be an object.`);
    const id = requireText(scene.id, `${label} ID`, 80);
    if (sceneIds.has(id))
      throw new ValidationError(`Duplicate scene ID: ${id}.`);
    sceneIds.add(id);
    requireFinite(
      scene.startSeconds,
      `${label} start time`,
      0,
      brief.durationSeconds,
    );
    requireFinite(
      scene.durationSeconds,
      `${label} duration`,
      0.1,
      brief.durationSeconds,
    );
    if (
      scene.startSeconds + scene.durationSeconds >
      brief.durationSeconds + 0.01
    ) {
      throw new ValidationError(
        `${label} extends beyond the project duration.`,
      );
    }
    requireText(scene.goal, `${label} goal`, 1000);
    requireText(scene.visualDescription, `${label} visual description`, 1800);
    if (
      !Array.isArray(scene.objects) ||
      scene.objects.some((item) => typeof item !== "string")
    ) {
      throw new ValidationError(
        `${label} objects must be an array of strings.`,
      );
    }
    requireText(scene.objectMotion, `${label} object motion`, 1000);
    requireText(scene.cameraMotion, `${label} camera motion`, 1000);
    requireText(scene.transition, `${label} transition`, 500);
    if (
      !Array.isArray(scene.onScreenText) ||
      scene.onScreenText.some((item) => typeof item !== "string")
    ) {
      throw new ValidationError(
        `${label} on-screen text must be an array of strings.`,
      );
    }
    if (brief.voiceover === "none") {
      if (scene.narration !== undefined && typeof scene.narration !== "string")
        throw new ValidationError(`${label} narration must be text.`);
    } else requireText(scene.narration, `${label} narration`, 5000);
    if (
      !Array.isArray(scene.scriptSectionIds) ||
      scene.scriptSectionIds.length === 0
    ) {
      throw new ValidationError(
        `${label} must link to at least one script section.`,
      );
    }
    if (
      scene.scriptSectionIds.some(
        (sectionId) => !scriptSectionIds.has(sectionId),
      )
    ) {
      throw new ValidationError(
        `${label} references a missing script section.`,
      );
    }
    if (
      !Array.isArray(scene.assetsNeeded) ||
      scene.assetsNeeded.some((item) => typeof item !== "string")
    ) {
      throw new ValidationError(
        `${label} asset requirements must be an array of strings.`,
      );
    }
    if (scene.starter !== starterForBrief(brief)) {
      throw new ValidationError(
        `${label} must use the starter selected for this project style.`,
      );
    }
  }
  return storyboard;
}

export function validateQualityReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new ValidationError("Quality report must be a JSON object.");
  }
  if (!["passed", "needs_changes"].includes(report.result)) {
    throw new ValidationError(
      "Quality result must be passed or needs_changes.",
    );
  }
  if (!Array.isArray(report.frames) || report.frames.length === 0) {
    throw new ValidationError(
      "Quality report must list at least one reviewed frame.",
    );
  }
  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    throw new ValidationError(
      "Quality report must contain at least one check.",
    );
  }
  for (const check of report.checks) {
    if (
      !check ||
      typeof check.name !== "string" ||
      typeof check.passed !== "boolean"
    ) {
      throw new ValidationError(
        "Each quality check needs a name and boolean passed value.",
      );
    }
  }
  if (
    report.frames.some((frame) => typeof frame !== "string" || !frame.trim())
  ) {
    throw new ValidationError(
      "Quality report frame paths must be non-empty strings.",
    );
  }
  if (
    report.result === "passed" &&
    report.checks.some((check) => !check.passed)
  ) {
    throw new ValidationError(
      "A passing quality report cannot contain failed checks.",
    );
  }
  return report;
}
