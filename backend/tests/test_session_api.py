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
    call_prompts,
    create_session_router,
    error_body,
)


class FakeVoiceDetector:
    def detect(self, _) -> VoiceDetectionResult:
        return VoiceDetectionResult("real", 0.1, 0.9)


class FakeWordMatcher:
    def __init__(self, matched: bool = True) -> None:
        self.matched = matched

    def match(self, _, expected_word: str) -> WordMatchResult:
        return WordMatchResult(self.matched, expected_word, expected_word)


class SilentVoiceDetector:
    def detect(self, _):
        raise ValueError("Audio too short (minimum 1 second of speech)")


class FakeFrameClassifier:
    def __init__(self, fake_score: float = 0.1) -> None:
        self.fake_score = fake_score

    def __call__(self, frames: list[bytes]) -> dict:
        return {
            "avg_fake_score": self.fake_score,
            "max_fake_score": self.fake_score,
            "volatility": 0.0,
            "frame_scores": [self.fake_score for _ in frames],
            "face_detection_rate": 1.0,
        }


def wav_base64() -> str:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(b"\x00\x00" * 16_000)
    return base64.b64encode(buffer.getvalue()).decode()


def response_body(
    session_id: str,
    index: int,
    prompt_type: str,
    *,
    liveness_score: float = 0.9,
    include_audio: bool | None = None,
) -> dict:
    if include_audio is None:
        include_audio = index < 3
    return {
        "session_id": session_id,
        "prompt_index": index,
        "prompt_type": prompt_type,
        "landmark_motion_score": liveness_score,
        "motion_detail": {
            "yaw_peak_degrees": 20.0,
            "yaw_direction": "right",
            "nose_dx_normalized": 0.06,
            "jaw_open_variance": 0.02,
            "blink_count": 2,
            "frames_analyzed": 100,
            "tracking_loss_ratio": 0.01,
        },
        "frames": [
            base64.b64encode(b"frame-one").decode(),
            base64.b64encode(b"frame-two").decode(),
        ],
        "audio_clip": wav_base64() if include_audio else None,
        "audio_mime": "audio/wav" if include_audio else "",
        "capture_meta": {
            "duration_ms": 4000,
            "video_width": 640,
            "video_height": 480,
            "landmarker_fps": 25.0,
        },
    }


class SessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.word_matcher = FakeWordMatcher()
        self.frame_classifier = FakeFrameClassifier()
        self.client = self.make_client(
            FakeVoiceDetector(),
            self.word_matcher,
            self.frame_classifier,
        )

    def make_client(
        self,
        voice_detector,
        word_matcher,
        frame_classifier=None,
    ) -> TestClient:
        app = FastAPI()
        app.include_router(
            create_session_router(
                voice_detector,
                word_matcher,
                frame_classifier or FakeFrameClassifier(),
            )
        )

        @app.exception_handler(ApiProblem)
        async def handle_problem(_, problem: ApiProblem):
            return JSONResponse(
                status_code=problem.status, content=error_body(problem)
            )

        return TestClient(app)

    def test_complete_live_session(self) -> None:
        start = self.client.post(
            "/start-session", json={"candidate_id": "integration-test"}
        )
        self.assertEqual(start.status_code, 200)
        session = start.json()
        self.assertEqual(session["scenario"], "ats_interview")
        self.assertEqual(session["prompt"]["kind"], "scripted")
        self.assertTrue(session["enabled_modules"]["frame"])
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
        self.assertEqual(status["result"]["component_scores"]["frame_classifier"], 0.9)
        self.assertEqual(
            status["result"]["module_detail"]["frame_classifier"]["frames_scored"],
            6,
        )

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

    def test_frame_module_can_be_disabled(self) -> None:
        started = self.client.post(
            "/start-session",
            json={
                "enabled_modules": {
                    "liveness": True,
                    "frame": False,
                    "voice": True,
                }
            },
        )
        self.assertEqual(started.status_code, 200)
        self.assertFalse(started.json()["enabled_modules"]["frame"])

    def test_invalid_frame_is_rejected(self) -> None:
        session = self.client.post("/start-session", json={}).json()
        body = response_body(session["session_id"], 1, "head_turn_right")
        body["frames"] = ["not-base64"]

        response = self.client.post("/submit-response", json=body)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "FRAME_DECODE_FAILED")

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

    def test_video_call_runs_eight_windows_with_an_auto_challenge(self) -> None:
        started = self.client.post(
            "/start-session",
            json={"candidate_id": "call-test", "scenario": "video_call"},
        )
        self.assertEqual(started.status_code, 200)
        session = started.json()
        self.assertEqual(session["scenario"], "video_call")
        self.assertEqual(session["total_prompts"], 8)
        self.assertEqual(session["prompt"]["kind"], "passive")
        status = self.client.get(
            "/session-status", params={"session_id": session["session_id"]}
        ).json()
        self.assertEqual(status["challenge"]["auto_index"], 2)

        prompt = session["prompt"]
        challenge_count = 0
        for index in range(1, 9):
            if prompt["kind"] == "challenge":
                challenge_count += 1
            submitted = self.client.post(
                "/submit-response",
                json=response_body(
                    session["session_id"],
                    index,
                    prompt["type"],
                    include_audio=True,
                ),
            )
            self.assertEqual(submitted.status_code, 200, submitted.text)
            prompt = submitted.json()["next_prompt"]

        self.assertEqual(challenge_count, 1)
        status = self.client.get(
            "/session-status", params={"session_id": session["session_id"]}
        ).json()
        self.assertEqual(status["status"], "complete")
        self.assertEqual(status["challenge"]["state"], "passed")
        self.assertEqual(len(status["completed_prompts"]), 8)
        self.assertIsNotNone(status["rolling_result"])
        self.assertEqual(status["result"], status["rolling_result"])
        self.assertEqual(
            status["result"]["module_detail"]["frame_classifier"]["frames_scored"],
            16,
        )

    def test_operator_can_queue_one_call_challenge(self) -> None:
        session = self.client.post(
            "/start-session", json={"scenario": "video_call"}
        ).json()
        requested = self.client.post(
            "/request-challenge", json={"session_id": session["session_id"]}
        )
        self.assertEqual(requested.status_code, 200)
        self.assertEqual(requested.json()["challenge"]["state"], "queued")
        self.assertEqual(requested.json()["challenge"]["prompt_index"], 2)

        duplicate = self.client.post(
            "/request-challenge", json={"session_id": session["session_id"]}
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(
            duplicate.json()["error"]["code"], "CHALLENGE_ALREADY_ISSUED"
        )

        first = self.client.post(
            "/submit-response",
            json=response_body(
                session["session_id"],
                1,
                "passive_window",
                include_audio=True,
            ),
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["next_prompt"]["kind"], "challenge")
        self.assertEqual(first.json()["next_prompt"]["duration_ms"], 8000)

    def test_challenge_is_rejected_for_an_interview(self) -> None:
        session = self.client.post("/start-session", json={}).json()
        response = self.client.post(
            "/request-challenge", json={"session_id": session["session_id"]}
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["error"]["code"], "CHALLENGE_NOT_SUPPORTED"
        )

    def test_silent_passive_window_returns_a_warning(self) -> None:
        client = self.make_client(
            SilentVoiceDetector(),
            FakeWordMatcher(),
            FakeFrameClassifier(),
        )
        session = client.post(
            "/start-session", json={"scenario": "video_call"}
        ).json()
        response = client.post(
            "/submit-response",
            json=response_body(
                session["session_id"],
                1,
                "passive_window",
                include_audio=True,
            ),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["prompt_result"]["voice_score"])
        self.assertEqual(response.json()["warnings"], ["no_speech_in_window"])

    def test_failed_challenge_forces_a_synthetic_result(self) -> None:
        session = SessionRecord(
            session_id="call",
            created_at="2026-09-27T00:00:00Z",
            candidate_id="test",
            enabled_modules={"liveness": True, "frame": False, "voice": True},
            scenario="video_call",
            prompts=call_prompts(),
            completed_prompts=[
                {
                    "kind": "passive",
                    "liveness_score": 0.9,
                    "voice_score": 0.9,
                    "word_match": None,
                },
                {
                    "kind": "challenge",
                    "liveness_score": 0.2,
                    "voice_score": 0.9,
                    "word_match": False,
                },
            ],
        )

        result = build_result(session)

        self.assertEqual(result["signal"], "synthetic")
        self.assertEqual(result["flag_reason"], "challenge_failed")
        self.assertEqual(result["confidence"], 0.9)
        self.assertEqual(result["failure_reasons"], ["challenge_failed"])

    def test_phrase_failure_is_visible_despite_high_component_scores(self) -> None:
        session = SessionRecord(
            session_id="high-scores",
            created_at="2026-09-27T00:00:00Z",
            candidate_id="test",
            enabled_modules={"liveness": True, "frame": False, "voice": True},
            scenario="video_call",
            prompts=call_prompts(),
            completed_prompts=[
                {
                    "kind": "challenge",
                    "liveness_score": 1.0,
                    "voice_score": 1.0,
                    "word_match": False,
                }
            ],
        )

        result = build_result(session)

        self.assertEqual(result["signal"], "synthetic")
        self.assertEqual(result["flag_reason"], "challenge_failed")
        self.assertEqual(result["confidence"], 0.9)
        self.assertEqual(result["failure_reasons"], ["challenge_failed"])

    def test_multiple_failures_expose_the_exact_reasons(self) -> None:
        session = SessionRecord(
            session_id="multiple",
            created_at="2026-09-27T00:00:00Z",
            candidate_id="test",
            enabled_modules={"liveness": True, "frame": False, "voice": True},
            scenario="video_call",
            prompts=call_prompts(),
            completed_prompts=[
                {
                    "kind": "challenge",
                    "liveness_score": 0.2,
                    "voice_score": 1.0,
                    "word_match": False,
                }
            ],
        )

        result = build_result(session)

        self.assertEqual(result["flag_reason"], "multiple_signals_failed")
        self.assertEqual(
            result["failure_reasons"],
            ["liveness_timing_mismatch", "challenge_failed"],
        )

    def test_deepfake_frame_forces_a_synthetic_result(self) -> None:
        session = SessionRecord(
            session_id="frame-fake",
            created_at="2026-09-27T00:00:00Z",
            candidate_id="test",
            enabled_modules={"liveness": True, "frame": True, "voice": True},
            completed_prompts=[
                {
                    "kind": "scripted",
                    "liveness_score": 1.0,
                    "frame_score": 0.05,
                    "frames_scored": 2,
                    "voice_score": 1.0,
                    "word_match": True,
                }
            ],
        )

        result = build_result(session)

        self.assertEqual(result["signal"], "synthetic")
        self.assertEqual(result["flag_reason"], "frame_classifier_below_threshold")
        self.assertEqual(result["confidence"], 0.95)
        self.assertEqual(result["component_scores"]["frame_classifier"], 0.05)


if __name__ == "__main__":
    unittest.main()
