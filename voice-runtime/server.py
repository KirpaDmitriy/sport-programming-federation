#!/usr/bin/env python3

import array
import io
import json
import os
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


VOICES = frozenset(("aidar", "baya", "kseniya", "xenia", "eugene"))
SAMPLE_RATES = frozenset((8_000, 24_000, 48_000))
MAX_BODY_BYTES = 16 * 1024
MAX_TEXT_CHARACTERS = 4_000


def parse_request(body: bytes) -> tuple[str, str, int]:
    if not body or len(body) > MAX_BODY_BYTES:
        raise ValueError("invalid request size")
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid JSON") from error
    if not isinstance(value, dict):
        raise ValueError("request must be an object")
    text = value.get("text")
    voice = value.get("voice", "eugene")
    sample_rate = value.get("sample_rate", 24_000)
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARACTERS:
        raise ValueError("invalid text")
    if voice not in VOICES:
        raise ValueError("invalid voice")
    if sample_rate not in SAMPLE_RATES:
        raise ValueError("invalid sample rate")
    return text.strip(), voice, sample_rate


def encode_wav(samples, sample_rate: int) -> bytes:
    pcm = array.array(
        "h",
        (round(max(-1.0, min(1.0, float(sample))) * 32767) for sample in samples),
    )
    if sys.byteorder != "little":
        pcm.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


class SileroRuntime:
    def __init__(self, model_path: Path, threads: int) -> None:
        import torch

        torch.set_num_threads(threads)
        torch.set_num_interop_threads(1)
        self._model = torch.package.PackageImporter(str(model_path)).load_pickle(
            "tts_models", "model"
        )
        self._lock = threading.Lock()
        self._model.apply_tts(
            text="Проверка готовности интервьюера.",
            speaker="eugene",
            sample_rate=24_000,
            put_accent=True,
            put_yo=True,
        )

    def synthesize(self, text: str, voice: str, sample_rate: int) -> bytes:
        with self._lock:
            samples = self._model.apply_tts(
                text=text,
                speaker=voice,
                sample_rate=sample_rate,
                put_accent=True,
                put_yo=True,
            )
        return encode_wav(samples, sample_rate)


def handler(runtime: SileroRuntime):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path != "/health":
                self.send_error(404)
                return
            self._respond(200, b'{"status":"ok","model":"v5_5_ru","device":"cpu"}', "application/json")

        def do_POST(self) -> None:
            if self.path != "/synthesize":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_BODY_BYTES:
                    raise ValueError("invalid request size")
                text, voice, sample_rate = parse_request(self.rfile.read(length))
                audio = runtime.synthesize(text, voice, sample_rate)
            except ValueError as error:
                self._respond(422, json.dumps({"error": str(error)}).encode(), "application/json")
                return
            self._respond(200, audio, "audio/wav")

        def _respond(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args) -> None:
            print(format % args, flush=True)

    return Handler


def main() -> None:
    model_path = Path(os.environ.get("SILERO_MODEL_PATH", "/opt/fsp/models/v5_5_ru.pt"))
    threads = int(os.environ.get("SILERO_CPU_THREADS", "4"))
    if threads < 1 or threads > 32:
        raise SystemExit("SILERO_CPU_THREADS must be between 1 and 32")
    runtime = SileroRuntime(model_path, threads)
    host = os.environ.get("SILERO_HOST", "127.0.0.1")
    port = int(os.environ.get("SILERO_PORT", "4050"))
    ThreadingHTTPServer((host, port), handler(runtime)).serve_forever()


if __name__ == "__main__":
    main()
