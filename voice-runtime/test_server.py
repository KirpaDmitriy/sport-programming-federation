import importlib.util
import struct
import unittest
import wave
from io import BytesIO
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("silero_server", Path(__file__).with_name("server.py"))
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class ServerTests(unittest.TestCase):
    def test_request_boundaries(self):
        self.assertEqual(
            SERVER.parse_request(
                '{"text":"  Привет  ","voice":"eugene","sample_rate":24000}'.encode()
            ),
            ("Привет", "eugene", 24000),
        )
        for body in (b"", b"[]", b'{"text":""}', b'{"text":"ok","voice":"unknown"}'):
            with self.assertRaises(ValueError):
                SERVER.parse_request(body)

    def test_wav_is_mono_pcm16(self):
        body = SERVER.encode_wav((-2.0, -0.5, 0.5, 2.0), 24_000)
        with wave.open(BytesIO(body), "rb") as wav:
            self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate()), (1, 2, 24_000))
            self.assertEqual(struct.unpack("<hhhh", wav.readframes(4)), (-32767, -16384, 16384, 32767))


if __name__ == "__main__":
    unittest.main()
