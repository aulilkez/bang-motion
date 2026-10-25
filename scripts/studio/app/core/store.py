from __future__ import annotations

import copy
import json
import os
import re
import shutil
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .workflow import (
    STATUS,
    ConflictError,
    ValidationError,
    content_hash,
    starter_for_brief,
    validate_brief,
    validate_quality_report,
    validate_script,
    validate_storyboard,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ProjectStore:
    def __init__(self, root: str | Path):
        self.root = Path(root).expanduser().resolve()
        self.projects_root = self.root / "projects"
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    def init(self) -> None:
        self.projects_root.mkdir(parents=True, exist_ok=True)

    def _lock(self, project_id: str) -> threading.RLock:
        with self._locks_guard:
            return self._locks.setdefault(project_id, threading.RLock())

    def dir(self, project_id: str) -> Path:
        if not isinstance(project_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", project_id, re.I):
            raise ValidationError("Invalid project ID.")
        return self.projects_root / project_id

    @staticmethod
    def _write_json(file_path: Path, value: Any) -> None:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f"{file_path.name}.", suffix=".tmp", dir=file_path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temp_name, 0o600)
            os.replace(temp_name, file_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    @staticmethod
    def _read_json(file_path: Path) -> Any:
        with file_path.open("r", encoding="utf-8") as stream:
            return json.load(stream)

    def load(self, project_id: str) -> dict[str, Any]:
        directory = self.dir(project_id)
        project = self._read_json(directory / "project.json")
        project["_dir"] = str(directory)
        project["script"] = (
            self._read_json(directory / "script" / f"{project['scriptVersion']}.json")
            if project.get("scriptVersion") else None
        )
        project["storyboard"] = (
            self._read_json(directory / "storyboard" / f"{project['storyboardVersion']}.json")
            if project.get("storyboardVersion") else None
        )
        approval_data = self._read_json(directory / "approvals.json")
        project["approvals"] = approval_data.get("active", approval_data)
        project["approvalHistory"] = approval_data.get("history") or {
            "script": [approval_data["script"]] if approval_data.get("script") else [],
            "storyboard": [approval_data["storyboard"]] if approval_data.get("storyboard") else [],
        }
        project["revisions"] = self._read_json(directory / "revisions.json")
        return project

    @staticmethod
    def public_project(project: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in project.items() if key != "_dir"}

    def _persist(self, project: dict[str, Any]) -> None:
        directory = Path(project["_dir"])
        metadata = {
            key: value for key, value in project.items()
            if key not in {"_dir", "script", "storyboard", "approvals", "approvalHistory", "revisions"}
        }
        self._write_json(directory / "project.json", metadata)
        self._write_json(directory / "approvals.json", {
            "active": project["approvals"],
            "history": project["approvalHistory"],
        })
        self._write_json(directory / "revisions.json", project["revisions"])

    def create(self, data: dict[str, Any]) -> dict[str, Any]:
        brief = validate_brief(data)
        project_id = str(uuid.uuid4())
        directory = self.dir(project_id)
        for name in ("script", "storyboard", "output", "reports"):
            (directory / name).mkdir(parents=True, exist_ok=True)
        project = {
            "id": project_id,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
            "status": STATUS["DRAFT"],
            "brief": brief,
            "starter": starter_for_brief(brief),
            "scriptVersion": 0,
            "storyboardVersion": 0,
            "scriptHash": None,
            "storyboardHash": None,
            "resumeStatus": None,
            "qualityReport": None,
            "render": None,
            "error": None,
            "approvals": {"script": None, "storyboard": None},
            "approvalHistory": {"script": [], "storyboard": []},
            "revisions": [],
            "_dir": str(directory),
        }
        self._persist(project)
        return self.load(project_id)

    def list(self) -> list[dict[str, Any]]:
        self.init()
        items = []
        for entry in self.projects_root.iterdir():
            if not entry.is_dir():
                continue
            try:
                items.append(self.public_project(self.load(entry.name)))
            except (OSError, ValueError, KeyError):
                continue
        return sorted(items, key=lambda item: item["updatedAt"], reverse=True)

    def save_content(
        self, project_id: str, kind: str, value: Any, expected_version: int | None = None
    ) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            if kind not in ("script", "storyboard"):
                raise ValidationError("Content kind must be script or storyboard.")
            key = f"{kind}Version"
            if expected_version is not None and expected_version != project[key]:
                raise ConflictError(f"This {kind} has changed since it was opened.", self.public_project(project))
            if kind == "script":
                allowed = {
                    STATUS["GENERATING_SCRIPT"], STATUS["SCRIPT_REVIEW"],
                    STATUS["SCRIPT_CHANGES"], STATUS["SCRIPT_APPROVED"],
                }
                if project["status"] not in allowed:
                    raise ConflictError("Script cannot be edited in the current workflow state.", self.public_project(project))
                validate_script(value, project["brief"])
                project[key] += 1
                project["scriptHash"] = content_hash(value)
                project["script"] = copy.deepcopy(value)
                project["storyboardVersion"] = 0
                project["storyboardHash"] = None
                project["storyboard"] = None
                project["approvals"] = {"script": None, "storyboard": None}
                project["qualityReport"] = None
                project["render"] = None
                project["status"] = STATUS["SCRIPT_REVIEW"]
            else:
                allowed = {
                    STATUS["GENERATING_STORYBOARD"], STATUS["STORYBOARD_REVIEW"],
                    STATUS["STORYBOARD_CHANGES"], STATUS["STORYBOARD_APPROVED"],
                }
                if project["status"] not in allowed:
                    raise ConflictError("Storyboard cannot be edited before the script is approved.", self.public_project(project))
                approval = project["approvals"].get("script")
                if not approval or approval.get("version") != project["scriptVersion"] or approval.get("hash") != project["scriptHash"]:
                    raise ConflictError("Current script approval is required.", self.public_project(project))
                validate_storyboard(value, project["brief"], project["script"], project["scriptVersion"])
                project[key] += 1
                project["storyboardHash"] = content_hash(value)
                project["storyboard"] = copy.deepcopy(value)
                project["approvals"]["storyboard"] = None
                project["qualityReport"] = None
                project["render"] = None
                project["status"] = STATUS["STORYBOARD_REVIEW"]
            self._write_json(Path(project["_dir"]) / kind / f"{project[key]}.json", value)
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def begin(self, project_id: str, stage: str) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            status_by_stage = {
                "script": STATUS["GENERATING_SCRIPT"],
                "storyboard": STATUS["GENERATING_STORYBOARD"],
                "animation": STATUS["GENERATING_ANIMATION"],
            }
            if stage not in status_by_stage:
                raise ValidationError("Stage must be script, storyboard, or animation.")
            if project["status"] == status_by_stage[stage]:
                return project
            if stage == "script" and project["status"] not in (STATUS["DRAFT"], STATUS["SCRIPT_CHANGES"]):
                raise ConflictError("Script generation is not available in the current state.", self.public_project(project))
            if stage == "storyboard":
                approval = project["approvals"].get("script")
                if (
                    project["status"] not in (STATUS["SCRIPT_APPROVED"], STATUS["STORYBOARD_CHANGES"])
                    or not approval
                    or approval.get("version") != project["scriptVersion"]
                    or approval.get("hash") != project["scriptHash"]
                ):
                    raise ConflictError("Approve the current script before generating a storyboard.", self.public_project(project))
            if stage == "animation":
                approval = project["approvals"].get("storyboard")
                if (
                    project["status"] != STATUS["STORYBOARD_APPROVED"]
                    or not approval
                    or approval.get("version") != project["storyboardVersion"]
                    or approval.get("hash") != project["storyboardHash"]
                ):
                    raise ConflictError("Approve the current storyboard before generating animation.", self.public_project(project))
            project["status"] = status_by_stage[stage]
            project["error"] = None
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def decide(
        self, project_id: str, kind: str, decision: str, version: int, hash_value: str, note: str = ""
    ) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            is_script = kind == "script"
            review_status = STATUS["SCRIPT_REVIEW"] if is_script else STATUS["STORYBOARD_REVIEW"]
            version_key = "scriptVersion" if is_script else "storyboardVersion"
            hash_key = "scriptHash" if is_script else "storyboardHash"
            if kind not in ("script", "storyboard") or project["status"] != review_status or version != project[version_key] or hash_value != project[hash_key]:
                raise ConflictError("The reviewed version is no longer current. Reload before deciding.", self.public_project(project))
            if decision not in ("approve", "request_changes"):
                raise ValidationError("Decision must be approve or request_changes.")
            if decision == "request_changes":
                if not isinstance(note, str) or not note.strip():
                    raise ValidationError("Add a note describing the requested changes.")
                project["revisions"].append({
                    "id": str(uuid.uuid4()), "kind": kind, "version": version,
                    "note": note.strip(), "createdAt": utc_now(), "resolvedAt": None,
                })
                project["status"] = STATUS["SCRIPT_CHANGES"] if is_script else STATUS["STORYBOARD_CHANGES"]
            else:
                approval = {"version": version, "hash": hash_value, "approvedAt": utc_now()}
                project["approvals"][kind] = approval
                project["approvalHistory"][kind].append(approval)
                project["status"] = STATUS["SCRIPT_APPROVED"] if is_script else STATUS["STORYBOARD_APPROVED"]
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def update_status(self, project_id: str, status: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            data = data or {}
            if status == STATUS["QUALITY_CHECK"]:
                raise ValidationError("Submit a frame-backed quality report to enter quality_check.")
            if status == STATUS["RENDERING"]:
                if project["status"] != STATUS["QUALITY_CHECK"] or not project.get("qualityReport") or project["qualityReport"].get("result") != "passed":
                    raise ConflictError("A passing quality report is required before rendering.", self.public_project(project))
                project["status"] = status
            elif status == STATUS["COMPLETED"]:
                if project["status"] != STATUS["RENDERING"]:
                    raise ConflictError("Project must be rendering before completion.", self.public_project(project))
                output = Path(project["_dir"]) / "output"
                index_path = output / "index.html"
                if not index_path.exists() or index_path.stat().st_size == 0:
                    raise ValidationError("output/index.html must not be empty.")
                if project["brief"]["exportMp4"]:
                    mp4_path = output / "video.mp4"
                    if not mp4_path.exists() or mp4_path.stat().st_size == 0:
                        raise ValidationError("output/video.mp4 must not be empty.")
                project["status"] = status
                project["render"] = {
                    **(project.get("render") or {}), "completedAt": utc_now(),
                    "verifiedIndex": True, "verifiedMp4": project["brief"]["exportMp4"],
                }
            elif status == STATUS["FAILED"]:
                message = data.get("message")
                if not isinstance(message, str) or not message.strip():
                    raise ValidationError("Error message is required.")
                project["resumeStatus"] = project["status"]
                project["status"] = status
                project["error"] = {"message": message.strip()[:2000], "at": utc_now()}
            else:
                raise ValidationError("Use quality, rendering, complete, or failed as a reported status.")
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def save_quality(self, project_id: str, report: Any) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            if project["status"] != STATUS["GENERATING_ANIMATION"]:
                raise ConflictError("Animation must be generated before quality review.", self.public_project(project))
            validate_quality_report(report)
            output = (Path(project["_dir"]) / "output").resolve()
            for frame in report["frames"]:
                target = (output / frame).resolve()
                if not target.is_relative_to(output) or not target.is_file():
                    raise ValidationError("Quality frame paths must exist inside the project output folder.")
                target.read_bytes()
            project["qualityReport"] = copy.deepcopy(report)
            project["status"] = STATUS["QUALITY_CHECK"] if report["result"] == "passed" else STATUS["GENERATING_ANIMATION"]
            self._write_json(Path(project["_dir"]) / "reports" / "quality.json", report)
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def resume(self, project_id: str) -> dict[str, Any]:
        with self._lock(project_id):
            project = self.load(project_id)
            if project["status"] != STATUS["FAILED"] or not project.get("resumeStatus"):
                raise ConflictError("Only interrupted projects can be resumed.", self.public_project(project))
            project["status"] = project["resumeStatus"]
            project["resumeStatus"] = None
            project["error"] = None
            project["updatedAt"] = utc_now()
            self._persist(project)
            return self.load(project_id)

    def get_content(self, project_id: str, kind: str) -> dict[str, Any]:
        project = self.load(project_id)
        if kind not in ("script", "storyboard"):
            raise ValidationError("Content kind must be script or storyboard.")
        return {"project": self.public_project(project), "content": project[kind]}

    def output_file(self, project_id: str, relative: str) -> tuple[Path, dict[str, Any]]:
        project = self.load(project_id)
        root = (Path(project["_dir"]) / "output").resolve()
        target = (root / relative).resolve()
        if target != root and not target.is_relative_to(root):
            raise ValidationError("Invalid output path.")
        return target, self.public_project(project)
