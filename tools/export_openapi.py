#!/usr/bin/env python3
import json
from pathlib import Path

from app.main import create_app


target = Path(__file__).resolve().parents[1] / "docs" / "openapi.json"
target.write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")
print(target)
