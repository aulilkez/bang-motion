from __future__ import annotations

import os
from pathlib import Path

from .store import ProjectStore


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
store = ProjectStore(os.environ.get("STUDIO_DATA_DIR", DEFAULT_DATA_DIR))
