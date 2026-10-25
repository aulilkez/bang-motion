from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from ..core.state import store
from ..core.workflow import STATUS, ValidationError


router = APIRouter()
async def request_json(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if len(raw) > 2_000_000:
        raise ValidationError("Request body exceeds 2 MB.")
    try:
        parsed = json.loads(raw or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValidationError("Request body must be valid JSON.") from None
    if not isinstance(parsed, dict):
        raise ValidationError("Request body must be a JSON object.")
    return parsed


def json_project(project: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(ProjectStore.public_project(project), status_code=status_code, headers={"cache-control": "no-store"})


@router.get("/api/projects")
async def list_projects() -> JSONResponse:
    return JSONResponse(store.list(), headers={"cache-control": "no-store"})


@router.post("/api/projects")
async def create_project(request: Request) -> JSONResponse:
    return json_project(store.create(await request_json(request)), 201)


@router.get("/api/projects/{project_id}")
async def get_project(project_id: str) -> JSONResponse:
    return json_project(store.load(project_id))


@router.get("/api/projects/{project_id}/{kind}")
async def get_content(project_id: str, kind: str) -> JSONResponse:
    return JSONResponse(store.get_content(project_id, kind), headers={"cache-control": "no-store"})


@router.post("/api/projects/{project_id}/begin")
async def begin_stage(project_id: str, request: Request) -> JSONResponse:
    data = await request_json(request)
    return json_project(store.begin(project_id, data.get("stage")))


@router.put("/api/projects/{project_id}/{kind}")
async def save_content(project_id: str, kind: str, request: Request) -> JSONResponse:
    data = await request_json(request)
    return json_project(store.save_content(project_id, kind, data.get("content"), data.get("expectedVersion")))


@router.post("/api/projects/{project_id}/{kind}")
async def decide(project_id: str, kind: str, request: Request) -> JSONResponse:
    if "decision" not in request.query_params:
        return JSONResponse({"error": "Decision query parameter is required."}, status_code=404)
    data = await request_json(request)
    return json_project(store.decide(project_id, kind, data.get("decision"), data.get("version"), data.get("hash"), data.get("note", "")))


@router.post("/api/projects/{project_id}/quality")
async def save_quality(project_id: str, request: Request) -> JSONResponse:
    return json_project(store.save_quality(project_id, await request_json(request)))


@router.post("/api/projects/{project_id}/status")
async def update_status(project_id: str, request: Request) -> JSONResponse:
    data = await request_json(request)
    if data.get("status") == "resume":
        return json_project(store.resume(project_id))
    return json_project(store.update_status(project_id, data.get("status"), data))


@router.get("/projects/{project_id}/preview/")
async def preview_index(project_id: str) -> Response:
    return await preview_file(project_id, "index.html")


@router.get("/projects/{project_id}/preview/{relative:path}")
async def preview_path(project_id: str, relative: str) -> Response:
    return await preview_file(project_id, relative or "index.html")


async def preview_file(project_id: str, relative: str) -> Response:
    file_path, _ = store.output_file(project_id, relative)
    if not file_path.is_file():
        return JSONResponse({"error": "Not found."}, status_code=404)
    return FileResponse(file_path, headers={"cache-control": "no-store", "x-content-type-options": "nosniff"})
