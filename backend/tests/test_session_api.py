import base64
import io
import unittest
import wave

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.audio.contracts import VoiceDetectionResult, WordMatchResult
from app.session_api import (
    ApiProblem,
    SessionRecord,
    build_result,
    create_session_router,
    error_body,
)


class FakeVoiceDetector:
    def detect(self, _) -> VoiceDetectionResult:
        return VoiceDetectionResult("real", 0.1, 0.9)


class FakeWordMatcher:
    def match(self, _, expected_word: str) -> WordMatchResult:
        return WordMatchResult(True, expected_word, expected_word)


def wav_base64() -> str:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(b"\x00\x00" * 16_000)
    return base64.b64encode(buffer.getvalue()).decode()


def response_body(session_id: str, index: int, prompt_type: str) -> dict:
    return {
        "session_id": session_id,
        "prompt_index": index,
        "prompt_type": prompt_type,
        "landmark_motion_score": 0.9,
        "motion_detail": {
            "yaw_peak_degrees": 20.0,
            "yaw_direction": "right",
            "nose_dx_normalized": 0.06,
            "jaw_open_variance": 0.02,
            "blink_count": 2,
            "frames_analyzed": 100,
            "tracking_loss_ratio": 0.01,
        },
        "frames": [],
        "audio_clip": wav_base64() if index < 3 else None,
        "audio_mime": "audio/wav" if index < 3 else "",
        "capture_meta": {
            "duration_ms": 4000,
            "video_width": 640,
            "video_height": 480,
            "landmarker_fps": 25.0,
        },
    }


class SessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(
            create_session_router(FakeVoiceDetector(), FakeWordMatcher())
        )

        @app.exception_handler(ApiProblem)
        async def handle_problem(_, problem: ApiProblem):
            return JSONResponse(
                status_code=problem.status, content=error_body(problem)
            )

        self.client = TestClient(app)

    def test_complete_live_session(self) -> None:
        start = self.client.post(
            "/start-session", json={"candidate_id": "integration-test"}
        )
        self.assertEqual(start.status_code, 200)
        session = start.json()
        self.assertFalse(session["enabled_modules"]["frame"])
        self.assertEqual(session["prompt"]["duration_ms"], 6000)
        self.assertGreaterEqual(len(session["prompt"]["expected_word"].split()), 5)

        prompt_types = ["head_turn_right", "speak_word", "blink"]
        for index, prompt_type in enumerate(prompt_types, start=1):
            submitted = self.client.post(
                "/submit-response",
                json=response_body(session["session_id"], index, prompt_type),
            )
            self.assertEqual(submitted.status_code, 200, submitted.text)
            if index == 1:
                next_prompt = submitted.json()["next_prompt"]
                self.assertEqual(next_prompt["duration_ms"], 6000)
                self.assertGreaterEqual(len(next_prompt["expected_word"].split()), 5)

        status = self.client.get(
            "/session-status", params={"session_id": session["session_id"]}
        ).json()
        self.assertEqual(status["status"], "complete")
        self.assertEqual(len(status["completed_prompts"]), 3)
        self.assertEqual(status["result"]["signal"], "real")
        self.assertEqual(status["result"]["component_scores"]["voice_detection"], 0.9)

        result = self.client.get(
            "/get-result", params={"session_id": session["session_id"]}
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), status["result"])

    def test_unknown_session_returns_frontend_error_shape(self) -> None:
        response = self.client.get(
            "/session-status", params={"session_id": "missing"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "SESSION_NOT_FOUND")

    def test_unavailable_frame_module_is_rejected(self) -> None:
        response = self.client.post(
            "/start-session",
            json={
                "enabled_modules": {
                    "liveness": True,
                    "frame": True,
                    "voice": True,
                }
            },
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "MODEL_UNAVAILABLE")

    def test_deepfake_voice_cannot_be_outweighed_by_liveness(self) -> None:
        session = SessionRecord(
            session_id="test",
            created_at="2026-09-27T00:00:00Z",
            candidate_id="test",
            enabled_modules={"liveness": True, "frame": False, "voice": True},
            completed_prompts=[
                {"liveness_score": 0.9, "voice_score": 0.01, "word_match": True},
                {"liveness_score": 0.9, "voice_score": 0.02, "word_match": True},
                {"liveness_score": 0.9, "voice_score": None, "word_match": None},
            ],
        )

        result = build_result(session)

        self.assertEqual(result["signal"], "synthetic")
        self.assertEqual(result["flag_reason"], "voice_detection_deepfake")


if __name__ == "__main__":
    unittest.main()
