from __future__ import annotations

import hashlib
import json
import math
from typing import Any


STATUS = {
    "DRAFT": "draft",
    "GENERATING_SCRIPT": "generating_script",
    "SCRIPT_REVIEW": "script_review",
    "SCRIPT_CHANGES": "script_revision_requested",
    "SCRIPT_APPROVED": "script_approved",
    "GENERATING_STORYBOARD": "generating_storyboard",
    "STORYBOARD_REVIEW": "storyboard_review",
    "STORYBOARD_CHANGES": "storyboard_revision_requested",
    "STORYBOARD_APPROVED": "storyboard_approved",
    "GENERATING_ANIMATION": "generating_animation",
    "QUALITY_CHECK": "quality_check",
    "RENDERING": "rendering",
    "COMPLETED": "completed",
    "FAILED": "failed",
}

EXPLAINER_STYLES = {
    "cartoon-collage": "assets/starters/explainers/cartoon-collage.html",
    "visual-journalism": "assets/starters/explainers/visual-journalism.html",
    "white-catalog": "assets/starters/explainers/white-catalog.html",
    "vintage-sketch": "assets/starters/explainers/vintage-sketch.html",
    "continuous-action": "assets/starters/explainers/continuous-action.html",
    "cartoon-stage": "assets/starters/explainers/cartoon-stage.html",
}
OPENER_STYLES = {
    "cinematic-dark", "poster-color-block", "editorial-light", "paper-print",
    "retro-analog", "brutalist-mono", "pastel-playful", "luxury-dark",
    "flat-pop-photos", "grainy-gradient",
}


class ValidationError(Exception):
    def __init__(self, message: str, issues: list[Any] | None = None):
        super().__init__(message)
        self.issues = issues or []


class ConflictError(Exception):
    def __init__(self, message: str, current: dict[str, Any] | None = None):
        super().__init__(message)
        self.current = current


def _js_number(value: int | float) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value == 0:
        return "0"
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        return str(int(value))
    return json.dumps(value, allow_nan=False, separators=(",", ":"))


def stable_stringify(value: Any) -> str:
    """Match the JavaScript stableStringify used for existing approval hashes."""
    if isinstance(value, dict):
        parts = []
        for key in sorted(value):
            parts.append(
                f"{json.dumps(key, ensure_ascii=False)}:{stable_stringify(value[key])}"
            )
        return "{" + ",".join(parts) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValidationError("JSON numbers must be finite.")
        return _js_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    raise ValidationError("Content must contain JSON-compatible values.")


def content_hash(value: Any) -> str:
    return hashlib.sha256(stable_stringify(value).encode("utf-8")).hexdigest()


def _text(value: Any, label: str, max_length: int = 1200) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{label} is required.")
    if len(value) > max_length:
        raise ValidationError(f"{label} must be {max_length} characters or fewer.")
    return value.strip()


def _finite(value: Any, label: str, minimum: float, maximum: float) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < minimum
        or value > maximum
    ):
        raise ValidationError(f"{label} must be a number from {minimum:g} to {maximum:g}.")
    return value


def validate_brief(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValidationError("Project brief must be a JSON object.")
    fmt = data.get("format") or "explainer"
    if fmt not in ("explainer", "opener"):
        raise ValidationError("Format must be explainer or opener.")
    style = _text(data.get("style"), "Animation style", 80)
    if fmt == "explainer" and style not in EXPLAINER_STYLES:
        raise ValidationError("Choose one of the six available explainer styles.")
    if fmt == "opener" and style not in OPENER_STYLES:
        raise ValidationError("Choose one of the available opener style directions.")
    aspect = data.get("aspectRatio") or "16:9"
    if aspect not in ("16:9", "9:16"):
        raise ValidationError("The current starters support 16:9 and 9:16 in this Studio MVP.")
    voiceover = data.get("voiceover") or "script-only"
    if voiceover not in ("none", "script-only", "audio-provided"):
        raise ValidationError("Voice-over preference must be none, script-only, or audio-provided.")
    subtitles = data.get("subtitles") or "none"
    if subtitles not in ("none", "requested"):
        raise ValidationError("Subtitles preference must be none or requested.")
    music = data.get("music") or "none"
    if music not in ("none", "music-only", "under-voiceover"):
        raise ValidationError("Music preference must be none, music-only, or under-voiceover.")
    duration = _finite(data.get("durationSeconds"), "Duration", 5, 600)
    return {
        "originalPrompt": _text(data.get("originalPrompt"), "Prompt", 6000),
        "title": _text(data.get("title"), "Title", 120),
        "topic": _text(data.get("topic"), "Topic", 1000),
        "purpose": _text(data.get("purpose"), "Purpose / target audience", 1200),
        "durationSeconds": duration,
        "language": _text(data.get("language"), "Language", 80),
        "format": fmt,
        "style": style,
        "aspectRatio": aspect,
        "voiceover": voiceover,
        "subtitles": subtitles,
        "music": music,
        "exportMp4": data.get("exportMp4") is not False,
        "createdFrom": data.get("createdFrom") or "studio-ui",
    }


def starter_for_brief(brief: dict[str, Any]) -> str:
    if brief["format"] == "opener":
        return "assets/starters/openers/opener.html"
    return EXPLAINER_STYLES[brief["style"]]


def validate_script(script: Any, brief: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(script, dict):
        raise ValidationError("Script must be a JSON object.")
    _text(script.get("title"), "Script title", 180)
    _text(script.get("language"), "Script language", 80)
    if script["language"] != brief["language"]:
        raise ValidationError("Script language must match the project brief.")
    if script.get("durationSeconds") != brief["durationSeconds"]:
        raise ValidationError("Script durationSeconds must match the project brief.")
    sections = script.get("sections")
    if not isinstance(sections, list) or not 1 <= len(sections) <= 80:
        raise ValidationError("Script must contain between 1 and 80 sections.")
    ids: set[str] = set()
    for index, section in enumerate(sections, start=1):
        label = f"Section {index}"
        if not isinstance(section, dict):
            raise ValidationError(f"{label} must be an object.")
        section_id = _text(section.get("id"), f"{label} ID", 80)
        if section_id in ids:
            raise ValidationError(f"Duplicate section ID: {section_id}.")
        ids.add(section_id)
        _text(section.get("title"), f"{label} title", 180)
        start = _finite(section.get("startSeconds"), f"{label} start time", 0, brief["durationSeconds"])
        end = _finite(section.get("endSeconds"), f"{label} end time", 0.01, brief["durationSeconds"])
        if end <= start:
            raise ValidationError(f"{label} end time must be after its start time.")
        if brief["voiceover"] == "none":
            if "narration" in section and not isinstance(section["narration"], str):
                raise ValidationError(f"{label} narration must be text.")
        else:
            _text(section.get("narration"), f"{label} narration", 5000)
        _text(section.get("sceneGoal"), f"{label} scene goal", 1000)
        _text(section.get("visualDescription"), f"{label} visual description", 1600)
    return script


def validate_storyboard(
    storyboard: Any,
    brief: dict[str, Any],
    script: dict[str, Any],
    script_version: int,
) -> dict[str, Any]:
    if not isinstance(storyboard, dict):
        raise ValidationError("Storyboard must be a JSON object.")
    _text(storyboard.get("title"), "Storyboard title", 180)
    if storyboard.get("scriptVersion") != script_version:
        raise ValidationError("Storyboard must reference the currently approved script version.")
    scenes = storyboard.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 100:
        raise ValidationError("Storyboard must contain between 1 and 100 scenes.")
    section_ids = {section["id"] for section in script["sections"]}
    scene_ids: set[str] = set()
    for index, scene in enumerate(scenes, start=1):
        label = f"Scene {index}"
        if not isinstance(scene, dict):
            raise ValidationError(f"{label} must be an object.")
        scene_id = _text(scene.get("id"), f"{label} ID", 80)
        if scene_id in scene_ids:
            raise ValidationError(f"Duplicate scene ID: {scene_id}.")
        scene_ids.add(scene_id)
        start = _finite(scene.get("startSeconds"), f"{label} start time", 0, brief["durationSeconds"])
        duration = _finite(scene.get("durationSeconds"), f"{label} duration", 0.1, brief["durationSeconds"])
        if start + duration > brief["durationSeconds"] + 0.01:
            raise ValidationError(f"{label} extends beyond the project duration.")
        _text(scene.get("goal"), f"{label} goal", 1000)
        _text(scene.get("visualDescription"), f"{label} visual description", 1800)
        for field, label_text in (("objects", "objects"), ("onScreenText", "on-screen text"), ("assetsNeeded", "asset requirements")):
            value = scene.get(field)
            if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
                raise ValidationError(f"{label} {label_text} must be an array of strings.")
        _text(scene.get("objectMotion"), f"{label} object motion", 1000)
        _text(scene.get("cameraMotion"), f"{label} camera motion", 1000)
        _text(scene.get("transition"), f"{label} transition", 500)
        if brief["voiceover"] == "none":
            if "narration" in scene and not isinstance(scene["narration"], str):
                raise ValidationError(f"{label} narration must be text.")
        else:
            _text(scene.get("narration"), f"{label} narration", 5000)
        links = scene.get("scriptSectionIds")
        if not isinstance(links, list) or not links:
            raise ValidationError(f"{label} must link to at least one script section.")
        if any(section_id not in section_ids for section_id in links):
            raise ValidationError(f"{label} references a missing script section.")
        if scene.get("starter") != starter_for_brief(brief):
            raise ValidationError(f"{label} must use the starter selected for this project style.")
    return storyboard


def validate_quality_report(report: Any) -> dict[str, Any]:
    if not isinstance(report, dict):
        raise ValidationError("Quality report must be a JSON object.")
    if report.get("result") not in ("passed", "needs_changes"):
        raise ValidationError("Quality result must be passed or needs_changes.")
    frames = report.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValidationError("Quality report must list at least one reviewed frame.")
    checks = report.get("checks")
    if not isinstance(checks, list) or not checks:
        raise ValidationError("Quality report must contain at least one check.")
    for check in checks:
        if not isinstance(check, dict) or not isinstance(check.get("name"), str) or not isinstance(check.get("passed"), bool):
            raise ValidationError("Each quality check needs a name and boolean passed value.")
    if any(not isinstance(frame, str) or not frame.strip() for frame in frames):
        raise ValidationError("Quality report frame paths must be non-empty strings.")
    if report["result"] == "passed" and any(not check["passed"] for check in checks):
        raise ValidationError("A passing quality report cannot contain failed checks.")
    return report
