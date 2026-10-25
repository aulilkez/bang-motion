from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.core.store import ProjectStore
from app.core.workflow import ConflictError
from app.main import app
from app.routes import api, web


def brief():
    return {"title": "Test animation", "topic": "Light", "originalPrompt": "Explain light", "purpose": "Children", "durationSeconds": 20, "language": "Indonesian", "format": "explainer", "style": "cartoon-collage", "aspectRatio": "16:9", "voiceover": "script-only", "subtitles": "none", "music": "none"}


def script():
    return {"title": "Light", "language": "Indonesian", "durationSeconds": 20, "sections": [{"id": "s1", "title": "The sun", "startSeconds": 0, "endSeconds": 20, "narration": "Light travels.", "sceneGoal": "Introduce light", "visualDescription": "A sunbeam travels across the sky."}]}


def storyboard(version=1):
    return {"title": "Light", "scriptVersion": version, "scenes": [{"id": "sc1", "startSeconds": 0, "durationSeconds": 20, "goal": "Show light moving", "visualDescription": "A glowing beam sweeps across a layered sky.", "objects": ["sun", "beam"], "objectMotion": "Beam arcs and particles drift.", "cameraMotion": "Camera tracks along the beam.", "transition": "Glow wipe", "onScreenText": ["Light travels"], "narration": "Light travels.", "scriptSectionIds": ["s1"], "assetsNeeded": [], "starter": "assets/starters/explainers/cartoon-collage.html"}]}


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ProjectStore(Path(self.temp.name))
        self.store.init()
        self.project = self.store.create(brief())

    def tearDown(self):
        self.temp.cleanup()

    def test_gates_versions_revisions_and_restart_persistence(self):
        with self.assertRaises(ConflictError): self.store.begin(self.project["id"], "storyboard")
        self.store.begin(self.project["id"], "script")
        self.store.save_content(self.project["id"], "script", script())
        current = self.store.load(self.project["id"])
        self.store.decide(self.project["id"], "script", "request_changes", 1, current["scriptHash"], "Add one more fact")
        self.assertEqual(self.store.load(self.project["id"])["revisions"][0]["note"], "Add one more fact")
        self.store.begin(self.project["id"], "script")
        updated = script(); updated["sections"][0]["narration"] = "Light moves very fast."
        self.store.save_content(self.project["id"], "script", updated, 1)
        current = self.store.load(self.project["id"])
        self.store.decide(self.project["id"], "script", "approve", 2, current["scriptHash"])
        restarted = ProjectStore(Path(self.temp.name)).load(self.project["id"])
        self.assertEqual(restarted["status"], "script_approved")
        self.assertEqual(restarted["scriptVersion"], 2)

    def test_storyboard_gate_quality_and_completion(self):
        self.store.begin(self.project["id"], "script")
        self.store.save_content(self.project["id"], "script", script())
        project = self.store.load(self.project["id"])
        self.store.decide(self.project["id"], "script", "approve", 1, project["scriptHash"])
        self.store.begin(self.project["id"], "storyboard")
        self.store.save_content(self.project["id"], "storyboard", storyboard())
        project = self.store.load(self.project["id"])
        self.store.decide(self.project["id"], "storyboard", "approve", 1, project["storyboardHash"])
        self.store.begin(self.project["id"], "animation")
        output = Path(project["_dir"]) / "output" / "frames" / "0.png"
        output.parent.mkdir(parents=True); output.write_bytes(b"frame")
        report = {"result": "passed", "frames": ["frames/0.png"], "checks": [{"name": "frame reviewed", "passed": True, "details": "Checked"}]}
        self.store.save_quality(self.project["id"], report)
        self.store.update_status(self.project["id"], "rendering", {})
        index = Path(project["_dir"]) / "output" / "index.html"; index.write_text("<h1>Animation</h1>")
        (Path(project["_dir"]) / "output" / "video.mp4").write_bytes(b"mp4")
        completed = self.store.update_status(self.project["id"], "completed", {})
        self.assertEqual(completed["status"], "completed")

    def test_stale_approval_rejected_and_review_url_works(self):
        self.store.begin(self.project["id"], "script")
        self.store.save_content(self.project["id"], "script", script())
        project = self.store.load(self.project["id"])
        self.store.decide(self.project["id"], "script", "approve", 1, project["scriptHash"])
        with self.assertRaises(ConflictError): self.store.decide(self.project["id"], "script", "approve", 1, "0" * 64)
        paths = {route.path for route in [*api.router.routes, *web.router.routes]}
        self.assertIn("/projects/{project_id}/review/{kind}", paths)
        self.assertIn("/api/projects", paths)


if __name__ == "__main__": unittest.main()
