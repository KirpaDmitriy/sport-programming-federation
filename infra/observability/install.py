#!/usr/bin/env python3
"""Install FSP observability. No backups, snapshots or application activation."""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import platform
import secrets
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request

HERE = Path(__file__).resolve().parent
PINS = (
    ("openobserve", "https://downloads.openobserve.ai/releases/openobserve/v1.0.4/openobserve-v1.0.4-linux-amd64.tar.gz", "5c1b18bc072658c045ff32ca7dd0d2e3f22fac1209755d7a0ef5fd6448896e61"),
    ("vector", "https://github.com/vectordotdev/vector/releases/download/v0.59.0/vector-0.59.0-x86_64-unknown-linux-gnu.tar.gz", "fb15878d1cd68445e0658792a8fa7ccf02ae8a353c6cc5d6fe867b171993e19f"),
)


def run(*args: str, **kwargs) -> None:
    subprocess.run(args, check=True, **kwargs)


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = shlex.split(value)[0] if value else ""
    return values


def main() -> None:
    if os.geteuid() != 0 or platform.machine() != "x86_64":
        raise SystemExit("Run as root on the FSP amd64 stand")
    with tempfile.TemporaryDirectory(prefix="fsp-observability-install-") as temporary:
        staging = Path(temporary)
        for binary, url, expected in PINS:
            archive = staging / f"{binary}.tar.gz"
            with urllib.request.urlopen(url, timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            with archive.open("rb") as content:
                if hashlib.file_digest(content, "sha256").hexdigest() != expected:
                    raise SystemExit(f"Checksum mismatch: {binary}")
            with tarfile.open(archive) as tar:
                matches = [member for member in tar.getmembers() if member.isfile() and Path(member.name).name == binary]
                if len(matches) != 1:
                    raise SystemExit(f"Ambiguous binary: {binary}")
                source = tar.extractfile(matches[0])
                assert source is not None
                with source, (staging / binary).open("wb") as output:
                    shutil.copyfileobj(source, output)
            (staging / binary).chmod(0o755)
        # All artifacts have been authenticated before changing the host.
        for user in ("fsp-observe", "fsp-vector"):
            if subprocess.run(["id", "-u", user], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
                run("useradd", "--system", "--no-create-home", "--shell", "/usr/sbin/nologin", user)
        run("install", "-d", "-m", "755", "/opt/fsp-observability/bin", "/etc/fsp")
        env_path = Path("/etc/fsp/observability.env")
        existing = read_env(env_path) if env_path.exists() else {}
        values = read_env(HERE / "openobserve.env.example")
        values["ZO_ROOT_USER_EMAIL"] = existing.get("ZO_ROOT_USER_EMAIL", "observe-admin@nddev.link")
        values["ZO_ROOT_USER_PASSWORD"] = existing.get("ZO_ROOT_USER_PASSWORD", secrets.token_urlsafe(36))
        values["FSP_OBSERVE_AUTH"] = "Basic " + base64.b64encode(
            f'{values["ZO_ROOT_USER_EMAIL"]}:{values["ZO_ROOT_USER_PASSWORD"]}'.encode()
        ).decode()
        # Temporary activation state, never a configuration backup.
        with tempfile.NamedTemporaryFile(mode="w", dir="/etc/fsp", prefix=".observe-env-", delete=False) as output:
            os.fchmod(output.fileno(), 0o600)
            for key, value in values.items():
                output.write(f"{key}={shlex.quote(value)}\n")
            temporary_env = Path(output.name)
        temporary_env.replace(env_path)
        for binary, _, _ in PINS:
            destination = Path("/opt/fsp-observability/bin") / binary
            run("install", "-m", "755", str(staging / binary), str(destination.with_suffix(".new")))
            destination.with_suffix(".new").replace(destination)
        for service in ("fsp-openobserve.service", "fsp-vector.service"):
            run("install", "-m", "644", str(HERE / service), f"/etc/systemd/system/{service}")
        run("install", "-m", "644", str(HERE / "vector.yaml"), "/etc/fsp/vector.yaml")
        run("systemd-analyze", "verify", "/etc/systemd/system/fsp-openobserve.service", "/etc/systemd/system/fsp-vector.service")
        run("systemctl", "daemon-reload")
        run("systemctl", "enable", "--now", "fsp-openobserve.service")
        for _ in range(60):
            try:
                with urllib.request.urlopen("http://127.0.0.1:5080/healthz", timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(1)
        else:
            raise SystemExit("OpenObserve health check failed; inspect its local journal")
        run("systemctl", "enable", "--now", "fsp-vector.service")
        run("systemctl", "is-active", "fsp-openobserve.service", "fsp-vector.service")
        print("FSP observability installed; UI is loopback-only; credentials remain in /etc/fsp/observability.env")


if __name__ == "__main__":
    main()
