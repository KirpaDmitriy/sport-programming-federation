#!/usr/bin/env python3
import json
from tempfile import TemporaryDirectory
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def main() -> None:
    with TemporaryDirectory() as directory:
        app = create_app(Path(directory) / "smoke.sqlite3")
        with TestClient(app) as client:
            health = client.get("/api/v1/health")
            page = client.get("/")
            matches = client.get("/api/v1/vacancies/ml-engineer/matches")
        health.raise_for_status()
        page.raise_for_status()
        matches.raise_for_status()
        candidates = matches.json()
        if len(candidates) != 5 or candidates[0]["match"]["score"] < candidates[-1]["match"]["score"]:
            raise RuntimeError("ranked demo candidates are incomplete")
        print(json.dumps({
            "status": "ok",
            "offline": health.json()["offline"],
            "candidate_count": len(candidates),
            "top_candidate": candidates[0]["id"],
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
