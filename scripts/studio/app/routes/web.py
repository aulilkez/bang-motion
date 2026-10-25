from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from ..core.store import ProjectStore
from ..core.state import store
from ..core.workflow import EXPLAINER_STYLES, OPENER_STYLES


router = APIRouter()
APP_DIR = Path(__file__).resolve().parents[1]
TEMPLATES = Jinja2Templates(directory=str(APP_DIR / "templates"))
def agent_task(project: dict[str, Any], kind: str, port: int) -> str:
    task = "script" if kind == "script" else "storyboard" if kind == "storyboard" else "animation"
    opening = f"node scripts/studio/cli.mjs begin {project['id']} {task}"
    if kind == "script":
        instructions = "Read any script revision notes from project.json. Create a structured script JSON with title, language, durationSeconds, and sections containing id, title, startSeconds, endSeconds, narration, sceneGoal, visualDescription. Keep sections within the requested duration."
    elif kind == "storyboard":
        instructions = "Read the immutable approved script snapshot and its version. Create storyboard JSON with title, scriptVersion, and scenes containing id, startSeconds, durationSeconds, goal, visualDescription, objects, objectMotion, cameraMotion, transition, onScreenText, narration, scriptSectionIds, assetsNeeded, starter. Use the project's chosen starter. Keep every scene within the video duration and avoid slideshow-like scenes."
    else:
        instructions = (
            f"Use the approved storyboard and chosen Bang Motion starter to build the animation. Put the playable deliverable at scripts/studio/data/projects/{project['id']}/output/index.html with assets alongside it. Include the required window.OPENER timeline interface. Start the local Studio server if needed and use its preview route. Capture representative frames with scripts/render/snap.mjs; inspect the actual images, fix issues, and repeat. If MP4 was requested, use scripts/render/export-frames.mjs with URL=http://127.0.0.1:{port}/projects/{project['id']}/preview/index.html and OUT=.../output/frames, then combine the captured sequence using the documented ffmpeg command. Never report a render as complete until files exist and have been checked. Submit a quality JSON to cli.mjs only after frame paths exist; status must be passed with concrete checks."
        )
    if kind == "animation":
        deliver = f"Write reports/quality.json with result, frames (paths relative to output), and checks. Submit it with node scripts/studio/cli.mjs quality {project['id']} scripts/studio/data/projects/{project['id']}/reports/quality.json. Then mark rendering, and only mark completed after verified output/index.html{' and output/video.mp4' if project['brief']['exportMp4'] else ''} exist."
    else:
        deliver = f"Save the result to /tmp/{project['id']}-{task}.json, then run: node scripts/studio/cli.mjs submit {project['id']} {task} /tmp/{project['id']}-{task}.json. Stop and give the user this review URL: http://127.0.0.1:{port}/projects/{project['id']}/review/{task}. Do not continue before approval."
    return (
        f"Bang Motion Studio task\nProject ID: {project['id']}\nCurrent status: {project['status']}\n\n"
        f"Read scripts/studio/README.md and inspect the project JSON at scripts/studio/data/projects/{project['id']}/project.json. Read the relevant approved snapshots and persisted revision notes before acting. Use existing Bang Motion tooling and starter files; do not introduce a model API dependency.\n\n"
        f"First, run: {opening}\n\n{instructions}\n\n{deliver}"
    )


def render(request: Request, template: str, context: dict[str, Any], status_code: int = 200) -> HTMLResponse:
    return TEMPLATES.TemplateResponse(request=request, name=template, context=context, status_code=status_code, headers={"cache-control": "no-store"})


def port_for(request: Request) -> int:
    return request.url.port or int(os.environ.get("STUDIO_PORT", "4179"))


def redirect_response(request: Request, location: str) -> Response:
    if request.headers.get("hx-request") == "true":
        return Response(status_code=204, headers={"HX-Redirect": location})
    return RedirectResponse(location, status_code=303)


def dashboard_context(request: Request, flash: dict[str, str] | None = None) -> dict[str, Any]:
    return {
        "request": request,
        "projects": store.list(),
        "explainer_styles": [(key, key.replace("-", " ").title()) for key in EXPLAINER_STYLES],
        "opener_styles": [(key, key.replace("-", " ").title()) for key in sorted(OPENER_STYLES)],
        "flash": flash,
    }


@router.get("/studio")
@router.get("/studio/")
@router.get("/studio/index.html")
async def dashboard(request: Request) -> HTMLResponse:
    return render(request, "dashboard.html", dashboard_context(request))


@router.get("/", include_in_schema=False)
async def root_redirect() -> Response:
    return RedirectResponse("/studio/index.html", status_code=307)


@router.post("/studio/projects")
async def create_project(request: Request) -> Response:
    form = await request.form()
    brief = {
        "title": form.get("title"),
        "topic": form.get("topic"),
        "originalPrompt": form.get("originalPrompt"),
        "purpose": form.get("purpose"),
        "durationSeconds": _form_number(form.get("durationSeconds")),
        "language": form.get("language"),
        "format": form.get("format"),
        "style": form.get("style"),
        "aspectRatio": form.get("aspectRatio"),
        "voiceover": form.get("voiceover"),
        "subtitles": form.get("subtitles"),
        "music": form.get("music"),
        "exportMp4": form.get("exportMp4") != "false",
    }
    project = store.create(brief)
    return redirect_response(request, f"/projects/{project['id']}/review/script")


@router.get("/projects/{project_id}/review/{kind}")
async def review_page(request: Request, project_id: str, kind: str) -> HTMLResponse:
    if kind not in ("script", "storyboard", "preview"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found.")
    project = store.load(project_id)
    if kind == "preview":
        preview_path = Path(project["_dir"]) / "output" / "index.html"
        return render(request, "review.html", {
            "request": request, "project": ProjectStore.public_project(project),
            "kind": kind, "preview_exists": preview_path.is_file(), "flash": None,
        })
    version = project[f"{kind}Version"]
    content = project[kind]
    active_approval = project.get("approvals", {}).get(kind)
    history = project.get("approvalHistory", {}).get(kind, [])
    last_approval = history[-1] if history else None
    is_approved = bool(active_approval and active_approval.get("version") == version and active_approval.get("hash") == project.get(f"{kind}Hash"))
    awaiting = project["status"] == ("script_review" if kind == "script" else "storyboard_review")
    total_duration = sum(float(scene.get("durationSeconds", 0)) for scene in (content or {}).get("scenes", []))
    context = {
        "request": request,
        "project": ProjectStore.public_project(project),
        "kind": kind,
        "content": content,
        "content_json": json.dumps(content, ensure_ascii=False, indent=2) if content is not None else "",
        "version": version,
        "hash": project.get(f"{kind}Hash") or "",
        "last_approval": last_approval,
        "changed_after_approval": bool(last_approval and not is_approved),
        "is_approved": is_approved,
        "awaiting": awaiting,
        "port": port_for(request),
        "agent_task": agent_task(ProjectStore.public_project(project), "storyboard" if project["status"] == "script_approved" else "animation" if project["status"] == "storyboard_approved" else kind, port_for(request)),
        "can_add_scene": len((content or {}).get("scenes", [])) < 100 and total_duration + 5 <= project["brief"]["durationSeconds"],
        "flash": None,
    }
    return render(request, "review.html", context)


@router.post("/studio/projects/{project_id}/{kind}/save")
async def save_review_content(request: Request, project_id: str, kind: str) -> Response:
    form = await request.form()
    try:
        value = json.loads(str(form.get("contentJson", "")))
    except json.JSONDecodeError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Content must be valid JSON.") from None
    version_raw = form.get("expectedVersion")
    expected_version = int(version_raw) if version_raw not in (None, "") else None
    store.save_content(project_id, kind, value, expected_version)
    return redirect_response(request, f"/projects/{project_id}/review/{kind}")


@router.post("/studio/projects/{project_id}/{kind}/decision")
async def submit_decision(request: Request, project_id: str, kind: str) -> Response:
    form = await request.form()
    store.decide(
        project_id, kind, str(form.get("decision", "")),
        _form_number(form.get("version")), str(form.get("hash", "")),
        str(form.get("note", "")),
    )
    return redirect_response(request, f"/projects/{project_id}/review/{kind}")


def _form_number(value: Any) -> int | float:
    try:
        parsed = float(value)
        return int(parsed) if parsed.is_integer() else parsed
    except (TypeError, ValueError):
        return value
