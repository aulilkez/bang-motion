from __future__ import annotations

import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from app.core.store import ProjectStore

store = ProjectStore(os.environ.get("STUDIO_DATA_DIR", HERE / "data"))
store.init()
args = sys.argv[1:]
command = args.pop(0) if args else "help"

def read_json(filename: str):
    return json.loads(Path(filename).expanduser().resolve().read_text(encoding="utf-8"))

try:
    if command == "list": result = store.list()
    elif command == "project": result = store.public_project(store.load(args[0]))
    elif command == "create": result = store.public_project(store.create(read_json(args[0])))
    elif command == "begin": result = store.public_project(store.begin(args[0], args[1]))
    elif command == "submit": result = store.public_project(store.save_content(args[0], args[1], read_json(args[2])))
    elif command == "quality": result = store.public_project(store.save_quality(args[0], read_json(args[1])))
    elif command == "status":
        data = {"message": " ".join(args[2:])}
        result = store.public_project(store.update_status(args[0], args[1], data))
    elif command == "resume": result = store.public_project(store.resume(args[0]))
    else:
        print("Bang Motion Studio local workflow\n\nCommands: list | project <id> | create <brief.json> | begin <id> <script|storyboard|animation> | submit <id> <script|storyboard> <content.json> | quality <id> <report.json> | status <id> <rendering|completed|failed> [message] | resume <id>\n")
        raise SystemExit(2 if command != "help" else 0)
    print(json.dumps(result, ensure_ascii=False, indent=2))
except Exception as error:
    print(f"{type(error).__name__}: {error}", file=sys.stderr)
    issues = getattr(error, "issues", [])
    if issues: print(issues, file=sys.stderr)
    raise SystemExit(1)
