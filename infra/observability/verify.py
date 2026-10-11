#!/usr/bin/env python3
"""Prove journald -> Vector -> OpenObserve ingestion and removal of private canaries."""
import json
from pathlib import Path
import shlex
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def main() -> None:
    values = {
        key: shlex.split(value)[0]
        for key, value in (
            line.split("=", 1)
            for line in Path("/etc/fsp/observability.env").read_text().splitlines()
        )
    }
    collector = json.loads(Path("/etc/fsp/vector-secrets.json").read_text())
    denied = urllib.request.Request("http://127.0.0.1:5080/api/default/streams", headers={"Authorization": collector["authorization"]})
    try:
        urllib.request.urlopen(denied, timeout=10).close()
    except urllib.error.HTTPError as error:
        if error.code not in (401, 403):
            raise SystemExit(f"Unexpected collector read status: {error.code}") from None
    else:
        raise SystemExit("The collector credential unexpectedly allows reading streams")
    probe = str(uuid.uuid4())
    start = int(time.time() * 1_000_000) - 1_000_000
    payload = json.dumps({
        "level": "INFO",
        "fields": {
            "event": "telemetry_probe", "request_id": probe, "duration_ms": 1,
            "message": "private-canary-must-be-dropped",
            "email": "private-canary@example.invalid",
            "authorization": "private-canary-token",
        },
    })
    subprocess.run(
        ["systemd-run", "--unit=fsp-observe-probe", "--collect", "--wait", "/usr/bin/printf", "%s\n", payload],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(15):
        time.sleep(2)
        query = {"query": {
            "sql": f"SELECT * FROM fsp_logs WHERE request_id = '{probe}'",
            "start_time": start, "end_time": int(time.time() * 1_000_000), "from": 0, "size": 5,
        }}
        request = urllib.request.Request(
            "http://127.0.0.1:5080/api/default/_search", data=json.dumps(query).encode(),
            headers={"Content-Type": "application/json", "Authorization": values["FSP_OBSERVE_AUTH"]},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                hits = json.load(response).get("hits", [])
        except urllib.error.HTTPError:
            continue
        if hits:
            if "private-canary" in json.dumps(hits):
                raise SystemExit("Private canary reached OpenObserve")
            if hits[0].get("event") != "telemetry_probe":
                raise SystemExit("Structured event fields were lost")
            metric_query = {"query": {"sql": "SELECT * FROM fsp_host_memory_total_bytes LIMIT 1", "start_time": int(time.time() * 1_000_000) - 300_000_000, "end_time": int(time.time() * 1_000_000), "from": 0, "size": 1}}
            request = urllib.request.Request("http://127.0.0.1:5080/api/default/_search?type=metrics", data=json.dumps(metric_query).encode(), headers={"Content-Type": "application/json", "Authorization": values["FSP_OBSERVE_AUTH"]})
            with urllib.request.urlopen(request, timeout=10) as response:
                metrics = json.load(response).get("hits", [])
            if not metrics:
                raise SystemExit("No recent host metric reached OpenObserve")
            print(json.dumps({"probe_id": probe, "records": len(hits), "canaries_removed": True, "collector_read_denied": True, "host_metrics": True}))
            return
    raise SystemExit("The journal probe did not reach OpenObserve")


if __name__ == "__main__":
    main()
