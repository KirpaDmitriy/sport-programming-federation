#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]


def check() -> int:
    registry_path = ROOT / "experiments" / "registry.json"
    registry = json.loads(registry_path.read_text())
    failures = []
    seen = set()
    required = {"id", "change", "expected_effect", "failure_condition", "command", "artifact", "status"}
    for record in registry.get("experiments", []):
        missing = required - record.keys()
        if missing:
            failures.append(f"{record.get('id', '<unknown>')}: missing {sorted(missing)}")
            continue
        if record["id"] in seen:
            failures.append(f"{record['id']}: duplicate id")
        seen.add(record["id"])
        artifact = ROOT / record["artifact"]
        if not artifact.is_file():
            failures.append(f"{record['id']}: artifact not found")
            continue
        if record["status"] != "passed":
            failures.append(f"{record['id']}: status is not passed")
        if artifact.suffix == ".xml":
            suite = ElementTree.parse(artifact).getroot()
            if int(suite.attrib.get("failures", 0)) or int(suite.attrib.get("errors", 0)):
                failures.append(f"{record['id']}: junit artifact contains failures")
    if not seen:
        failures.append("registry has no experiments")
    if failures:
        print(json.dumps({"status": "failed", "problems": failures}, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "ok", "experiments": len(seen)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if sys.argv[1:] != ["check"]:
        print("usage: python3 tools/experiments.py check", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(check())
