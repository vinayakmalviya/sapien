import base64
import binascii
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import fmean
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.audio.analysis import (
    analyze_audio_bytes,
    analyze_voice_bytes,
    suffix_for_mime,
)


PromptType = Literal[
    "head_turn_right",
    "head_turn_left",
    "speak_word",
    "blink",
    "passive_window",
]
Scenario = Literal["ats_interview", "video_call"]

SCRIPTED_PROMPTS = [
    {
        "index": 1,
        "of": 3,
        "type": "head_turn_right",
        "instruction": (
            "Turn your head slightly to the right, then say "
            "'orange river seven bright morning'."
        ),
        "expected_word": "orange river seven bright morning",
        "duration_ms": 6000,
        "kind": "scripted",
    },
    {
        "index": 2,
        "of": 3,
        "type": "speak_word",
        "instruction": "Say 'silver harbour twenty four quiet boats' now.",
        "expected_word": "silver harbour twenty four quiet boats",
        "duration_ms": 6000,
        "kind": "scripted",
    },
    {
        "index": 3,
        "of": 3,
        "type": "blink",
        "instruction": "Blink two times.",
        "expected_word": None,
        "duration_ms": 4000,
        "kind": "scripted",
    },
]

CHALLENGE_POOL = [
    {
        "type": "head_turn_right",
        "instruction": (
            "Please turn your head slightly to the right and say "
            "'blue river seven happy morning'."
        ),
        "expected_word": "blue river seven happy morning",
    },
    {
        "type": "head_turn_left",
        "instruction": (
            "Please turn your head slightly to the left and say "
            "'red apple twenty four quiet garden'."
        ),
        "expected_word": "red apple twenty four quiet garden",
    },
]

CALL_SLOT_COUNT = 8
AUTO_CHALLENGE_INDEX = 2
CHALLENGE_DURATION_MS = 8000
BASE_WEIGHTS = {"liveness": 0.4, "frame": 0.35, "voice": 0.25}
DECISION_THRESHOLD = 0.5
FRAME_FAKE_THRESHOLD = 0.15
VOICE_REAL_THRESHOLD = 0.65
VOICE_FAKE_THRESHOLD = 0.35
MAX_FRAME_BYTES = 2 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def scripted_prompts() -> list[dict[str, Any]]:
    return [dict(prompt) for prompt in SCRIPTED_PROMPTS]


def call_prompts() -> list[dict[str, Any]]:
    return [
        {
            "index": index,
            "of": CALL_SLOT_COUNT,
            "type": "passive_window",
            "instruction": "",
            "expected_word": None,
            "duration_ms": 5000,
            "kind": "passive",
        }
        for index in range(1, CALL_SLOT_COUNT + 1)
    ]


def make_challenge(index: int) -> dict[str, Any]:
    return {
        "index": index,
        "of": CALL_SLOT_COUNT,
        **random.choice(CHALLENGE_POOL),
        "duration_ms": CHALLENGE_DURATION_MS,
        "kind": "challenge",
    }


class ApiProblem(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        detail: Any = None,
    ) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.detail = detail


class EnabledModules(BaseModel):
    liveness: bool = True
    frame: bool = True
    voice: bool = True


class StartSessionRequest(BaseModel):
    candidate_id: str | None = None
    scenario: Scenario = "ats_interview"
    enabled_modules: EnabledModules | None = None


class MotionDetail(BaseModel):
    yaw_peak_degrees: float
    yaw_direction: Literal["right", "left", "none"]
    nose_dx_normalized: float
    jaw_open_variance: float
    blink_count: int
    frames_analyzed: int
    tracking_loss_ratio: float


class CaptureMeta(BaseModel):
    duration_ms: int
    video_width: int
    video_height: int
    landmarker_fps: float


class SubmitResponseRequest(BaseModel):
    session_id: str
    prompt_index: int
    prompt_type: PromptType
    landmark_motion_score: float = Field(ge=0.0, le=1.0)
    motion_detail: MotionDetail
    frames: list[str] = Field(min_length=0, max_length=5)
    audio_clip: str | None
    audio_mime: str
    capture_meta: CaptureMeta


class RequestChallengeRequest(BaseModel):
    session_id: str


@dataclass
class SessionRecord:
    session_id: str
    created_at: str
    candidate_id: str
    enabled_modules: dict[str, bool]
    scenario: Scenario = "ats_interview"
    prompts: list[dict[str, Any]] = field(default_factory=scripted_prompts)
    challenge: dict[str, Any] | None = None
    status: str = "awaiting_start"
    completed_prompts: list[dict[str, Any]] = field(default_factory=list)
    rolling_result: dict[str, Any] | None = None
    result: dict[str, Any] | None = None


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, SessionRecord] = {}

    def get(self, session_id: str) -> SessionRecord:
        session = self.sessions.get(session_id)
        if session is None:
            raise ApiProblem(
                404,
                "SESSION_NOT_FOUND",
                "No session exists with this ID.",
            )
        return session


def error_body(problem: ApiProblem) -> dict[str, Any]:
    return {
        "error": {
            "code": problem.code,
            "message": problem.message,
            "detail": problem.detail,
        }
    }


def renormalized_weights(enabled: dict[str, bool]) -> dict[str, float]:
    active_total = sum(
        weight for name, weight in BASE_WEIGHTS.items() if enabled[name]
    )
    if active_total == 0:
        raise ApiProblem(
            400,
            "VALIDATION_ERROR",
            "At least one detection module must be enabled.",
        )
    return {
        name: round(weight / active_total, 4) if enabled[name] else 0.0
        for name, weight in BASE_WEIGHTS.items()
    }


def build_result(session: SessionRecord) -> dict[str, Any]:
    enabled = session.enabled_modules
    weights = renormalized_weights(enabled)
    completed = session.completed_prompts

    liveness_score = (
        fmean(item["liveness_score"] for item in completed)
        if enabled["liveness"] and completed
        else None
    )
    voice_values = [
        item["voice_score"]
        for item in completed
        if item["voice_score"] is not None
    ]
    voice_score = fmean(voice_values) if enabled["voice"] and voice_values else None
    frame_values = [
        item.get("frame_score")
        for item in completed
        if item.get("frame_score") is not None
    ]
    frame_score = fmean(frame_values) if enabled["frame"] and frame_values else None
    frames_scored = sum(item.get("frames_scored", 0) for item in completed)

    combined = 0.0
    if liveness_score is not None:
        combined += liveness_score * weights["liveness"]
    if voice_score is not None:
        combined += voice_score * weights["voice"]
    if frame_score is not None:
        combined += frame_score * weights["frame"]

    failures: list[str] = []
    if liveness_score is not None and liveness_score < DECISION_THRESHOLD:
        failures.append("liveness_timing_mismatch")
    if voice_score is not None:
        if voice_score < VOICE_FAKE_THRESHOLD:
            failures.append("voice_detection_deepfake")
        elif voice_score < VOICE_REAL_THRESHOLD:
            failures.append("voice_detection_uncertain")
    if frame_score is not None and frame_score < FRAME_FAKE_THRESHOLD:
        failures.append("frame_classifier_below_threshold")
    if session.scenario == "ats_interview" and any(
        item["word_match"] is False for item in completed
    ):
        failures.append("word_mismatch")

    challenge_result = next(
        (item for item in completed if item.get("kind") == "challenge"),
        None,
    )
    challenge_failed = challenge_result is not None and (
        challenge_result["liveness_score"] < DECISION_THRESHOLD
        or challenge_result["word_match"] is False
    )
    if challenge_failed:
        failures.append("challenge_failed")
        combined = min(combined, challenge_result["liveness_score"])

    if voice_score is not None and voice_score < VOICE_FAKE_THRESHOLD:
        combined = min(combined, voice_score)

    flag_reason = None
    if len(failures) > 1:
        flag_reason = "multiple_signals_failed"
    elif failures:
        flag_reason = failures[0]

    voice_label = "disabled"
    if voice_score is not None:
        if voice_score < VOICE_FAKE_THRESHOLD:
            voice_label = "deepfake"
        elif voice_score < VOICE_REAL_THRESHOLD:
            voice_label = "uncertain"
        else:
            voice_label = "real"

    word_values = [
        item["word_match"]
        for item in completed
        if item["word_match"] is not None
    ]
    forced_synthetic = challenge_failed or (
        voice_score is not None and voice_score < VOICE_FAKE_THRESHOLD
    ) or (
        frame_score is not None and frame_score < FRAME_FAKE_THRESHOLD
    )
    signal = (
        "synthetic"
        if forced_synthetic or combined < DECISION_THRESHOLD
        else "real"
    )
    confidence = combined if signal == "real" else 1.0 - combined
    if challenge_failed and challenge_result is not None:
        if challenge_result["liveness_score"] < DECISION_THRESHOLD:
            confidence = max(
                confidence,
                1.0 - challenge_result["liveness_score"],
            )
        if challenge_result["word_match"] is False:
            confidence = max(confidence, 0.9)
    if frame_score is not None and frame_score < FRAME_FAKE_THRESHOLD:
        confidence = max(confidence, 1.0 - frame_score)

    return {
        "session_id": session.session_id,
        "signal": signal,
        "confidence": round(confidence, 2),
        "completed_at": now_iso(),
        "component_scores": {
            "liveness_scorer": (
                round(liveness_score, 2) if liveness_score is not None else None
            ),
            "frame_classifier": (
                round(frame_score, 2) if frame_score is not None else None
            ),
            "voice_detection": (
                round(voice_score, 2) if voice_score is not None else None
            ),
        },
        "module_detail": {
            "liveness_scorer": {
                "enabled": enabled["liveness"],
                "prompts_passed": sum(
                    item["liveness_score"] >= DECISION_THRESHOLD
                    for item in completed
                ),
                "prompts_total": len(session.prompts),
            },
            "frame_classifier": {
                "enabled": enabled["frame"],
                "frames_scored": frames_scored,
                "mean_real_probability": (
                    round(frame_score, 2) if frame_score is not None else 0.0
                ),
            },
            "voice_detection": {
                "enabled": enabled["voice"],
                "label": voice_label,
                "word_match": all(word_values) if word_values else None,
            },
        },
        "thresholds": {
            "decision": DECISION_THRESHOLD,
            "frame_fake": FRAME_FAKE_THRESHOLD,
            "voice_real": VOICE_REAL_THRESHOLD,
            "voice_fake": VOICE_FAKE_THRESHOLD,
        },
        "weights": weights,
        "flag_reason": flag_reason,
        "failure_reasons": failures,
    }


def decode_audio_clip(body: SubmitResponseRequest) -> bytes:
    if not body.audio_clip:
        raise ApiProblem(
            400,
            "VALIDATION_ERROR",
            "This prompt requires an audio clip.",
        )
    try:
        return base64.b64decode(body.audio_clip, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiProblem(
            400,
            "AUDIO_DECODE_FAILED",
            "The audio clip is not valid base64.",
        ) from exc


def decode_frames(encoded_frames: list[str]) -> list[bytes]:
    if not encoded_frames:
        raise ApiProblem(
            400,
            "VALIDATION_ERROR",
            "Frame classification requires at least one captured frame.",
        )

    decoded_frames: list[bytes] = []
    for encoded in encoded_frames:
        if len(encoded) > (MAX_FRAME_BYTES * 4 // 3) + 4:
            raise ApiProblem(
                413,
                "VALIDATION_ERROR",
                "A captured frame exceeds 2 MB.",
            )
        try:
            frame = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ApiProblem(
                400,
                "FRAME_DECODE_FAILED",
                "A captured frame is not valid base64.",
            ) from exc
        if not frame:
            raise ApiProblem(
                400,
                "FRAME_DECODE_FAILED",
                "A captured frame is empty.",
            )
        if len(frame) > MAX_FRAME_BYTES:
            raise ApiProblem(
                413,
                "VALIDATION_ERROR",
                "A captured frame exceeds 2 MB.",
            )
        decoded_frames.append(frame)
    return decoded_frames


def is_short_audio(error: Exception) -> bool:
    message = str(error).casefold()
    return "too short" in message or "no samples" in message


def activate_prompt(session: SessionRecord, index: int) -> dict[str, Any]:
    if session.scenario != "video_call" or session.challenge is None:
        return session.prompts[index - 1]

    challenge = session.challenge
    is_operator_slot = (
        challenge["state"] == "queued" and challenge["prompt_index"] == index
    )
    is_auto_slot = (
        challenge["state"] == "none" and challenge["auto_index"] == index
    )
    if is_operator_slot or is_auto_slot:
        if is_auto_slot:
            challenge.update(
                state="active",
                source="auto",
                prompt_index=index,
            )
        else:
            challenge["state"] = "active"
        session.prompts[index - 1] = make_challenge(index)
    return session.prompts[index - 1]


def create_session_router(
    voice_detector: Any,
    word_matcher: Any,
    frame_classifier: Any,
) -> APIRouter:
    router = APIRouter()
    store = SessionStore()

    @router.post("/start-session")
    async def start_session(body: StartSessionRequest) -> dict[str, Any]:
        requested = body.enabled_modules or EnabledModules()
        enabled = requested.model_dump()
        renormalized_weights(enabled)

        prompts = (
            call_prompts() if body.scenario == "video_call" else scripted_prompts()
        )
        challenge = None
        if body.scenario == "video_call":
            challenge = {
                "state": "none",
                "source": None,
                "prompt_index": None,
                "auto_index": AUTO_CHALLENGE_INDEX,
            }

        session_id = str(uuid4())
        session = SessionRecord(
            session_id=session_id,
            created_at=now_iso(),
            candidate_id=body.candidate_id or "demo-candidate",
            enabled_modules=enabled,
            scenario=body.scenario,
            prompts=prompts,
            challenge=challenge,
        )
        store.sessions[session_id] = session
        return {
            "session_id": session_id,
            "created_at": session.created_at,
            "scenario": session.scenario,
            "total_prompts": len(session.prompts),
            "enabled_modules": enabled,
            "prompt": session.prompts[0],
        }

    @router.post("/submit-response")
    async def submit_response(body: SubmitResponseRequest) -> dict[str, Any]:
        started_at = time.perf_counter()
        session = store.get(body.session_id)
        if session.status == "complete":
            raise ApiProblem(
                409,
                "SESSION_ALREADY_COMPLETE",
                "This session already received every prompt.",
            )

        expected_index = len(session.completed_prompts) + 1
        if body.prompt_index != expected_index:
            raise ApiProblem(
                409,
                "PROMPT_OUT_OF_ORDER",
                (
                    f"Expected prompt index {expected_index}, "
                    f"received {body.prompt_index}."
                ),
            )

        prompt = session.prompts[expected_index - 1]
        if body.prompt_type != prompt["type"]:
            raise ApiProblem(
                400,
                "VALIDATION_ERROR",
                "The prompt type does not match the active prompt.",
            )

        session.status = "scoring"
        voice_score = None
        word_match = None
        transcript = None
        frame_score = None
        frame_detail = None
        frames_scored = 0
        warnings: list[str] = []

        if session.enabled_modules["frame"]:
            frame_bytes = decode_frames(body.frames)
            try:
                frame_result = await run_in_threadpool(
                    frame_classifier,
                    frame_bytes,
                )
            except (OSError, TypeError, ValueError) as exc:
                raise ApiProblem(
                    400,
                    "FRAME_DECODE_FAILED",
                    "A captured frame is not a valid image.",
                ) from exc
            except RuntimeError as exc:
                raise ApiProblem(503, "MODEL_UNAVAILABLE", str(exc)) from exc

            avg_fake_score = frame_result.get("avg_fake_score")
            if avg_fake_score is None:
                raise ApiProblem(
                    503,
                    "MODEL_UNAVAILABLE",
                    "The frame classifier returned no score.",
                )
            frame_score = round(1.0 - float(avg_fake_score), 4)
            frames_scored = len(frame_result.get("frame_scores", []))
            frame_detail = {
                "average_fake_probability": round(float(avg_fake_score), 4),
                "maximum_fake_probability": round(
                    float(frame_result["max_fake_score"]),
                    4,
                ),
                "volatility": round(float(frame_result["volatility"]), 4),
                "face_detection_rate": round(
                    float(frame_result["face_detection_rate"]),
                    4,
                ),
            }
            if frame_detail["face_detection_rate"] == 0:
                warnings.append("no_face_in_captured_frames")

        if prompt["kind"] == "passive" and session.enabled_modules["voice"]:
            audio_bytes = decode_audio_clip(body)
            try:
                voice_result = await analyze_voice_bytes(
                    audio_bytes,
                    suffix_for_mime(body.audio_mime),
                    voice_detector,
                )
                voice_score = round(1.0 - voice_result.score, 4)
            except OverflowError as exc:
                raise ApiProblem(400, "VALIDATION_ERROR", str(exc)) from exc
            except (TypeError, ValueError) as exc:
                if is_short_audio(exc):
                    warnings.append("no_speech_in_window")
                else:
                    raise ApiProblem(400, "AUDIO_DECODE_FAILED", str(exc)) from exc
        elif prompt["expected_word"] and session.enabled_modules["voice"]:
            audio_bytes = decode_audio_clip(body)
            try:
                voice_result, word_result = await analyze_audio_bytes(
                    audio_bytes,
                    suffix_for_mime(body.audio_mime),
                    str(prompt["expected_word"]),
                    voice_detector,
                    word_matcher,
                )
            except OverflowError as exc:
                raise ApiProblem(400, "VALIDATION_ERROR", str(exc)) from exc
            except (TypeError, ValueError) as exc:
                code = (
                    "AUDIO_TOO_SHORT"
                    if is_short_audio(exc)
                    else "AUDIO_DECODE_FAILED"
                )
                raise ApiProblem(400, code, str(exc)) from exc

            voice_score = round(1.0 - voice_result.score, 4)
            word_match = word_result.matched
            transcript = word_result.transcript

        prompt_result = {
            "index": body.prompt_index,
            "liveness_score": round(body.landmark_motion_score, 4),
            "frame_score": frame_score,
            "frame_detail": frame_detail,
            "frames_scored": frames_scored,
            "voice_score": voice_score,
            "word_match": word_match,
            "expected_phrase": prompt["expected_word"],
            "transcript": transcript,
            "latency_ms": round((time.perf_counter() - started_at) * 1000),
        }
        completed_prompt = {
            **prompt_result,
            "type": body.prompt_type,
            "kind": prompt["kind"],
            "submitted_at": now_iso(),
        }
        session.completed_prompts.append(completed_prompt)

        if prompt["kind"] == "challenge" and session.challenge is not None:
            failed = (
                prompt_result["liveness_score"] < DECISION_THRESHOLD
                or prompt_result["word_match"] is False
            )
            session.challenge["state"] = "failed" if failed else "passed"

        if session.scenario == "video_call":
            session.rolling_result = build_result(session)

        is_complete = len(session.completed_prompts) == len(session.prompts)
        if is_complete:
            session.result = session.rolling_result or build_result(session)
            session.status = "complete"
            next_prompt = None
        else:
            session.status = "in_progress"
            next_prompt = activate_prompt(session, expected_index + 1)

        return {
            "session_id": session.session_id,
            "status": "complete" if is_complete else "in_progress",
            "accepted": True,
            "prompt_result": prompt_result,
            "next_prompt": next_prompt,
            "warnings": warnings,
        }

    @router.post("/request-challenge")
    async def request_challenge(body: RequestChallengeRequest) -> dict[str, Any]:
        session = store.get(body.session_id)
        if session.status == "complete":
            raise ApiProblem(
                409,
                "SESSION_ALREADY_COMPLETE",
                "This session already received every prompt.",
            )
        if session.scenario != "video_call":
            raise ApiProblem(
                409,
                "CHALLENGE_NOT_SUPPORTED",
                "Challenges are available only for video call sessions.",
            )
        if session.challenge is None or session.challenge["state"] != "none":
            raise ApiProblem(
                409,
                "CHALLENGE_ALREADY_ISSUED",
                "This session already has a challenge.",
            )

        target_index = len(session.completed_prompts) + 2
        if target_index > len(session.prompts):
            raise ApiProblem(
                409,
                "CHALLENGE_TOO_LATE",
                "No passive window remains after the current window.",
            )

        session.challenge.update(
            state="queued",
            source="operator",
            prompt_index=target_index,
            auto_index=None,
        )
        return {
            "session_id": session.session_id,
            "challenge": session.challenge,
        }

    @router.get("/session-status")
    async def session_status(session_id: str) -> dict[str, Any]:
        session = store.get(session_id)
        return {
            "session_id": session.session_id,
            "scenario": session.scenario,
            "status": session.status,
            "current_prompt_index": min(
                len(session.completed_prompts) + 1,
                len(session.prompts),
            ),
            "total_prompts": len(session.prompts),
            "enabled_modules": session.enabled_modules,
            "completed_prompts": session.completed_prompts,
            "rolling_result": session.rolling_result,
            "challenge": session.challenge,
            "result": session.result,
        }

    @router.get("/get-result")
    async def get_result(session_id: str) -> dict[str, Any]:
        session = store.get(session_id)
        if session.result is None:
            raise ApiProblem(
                409,
                "RESULT_NOT_READY",
                "The session is not complete yet. Poll again.",
            )
        return session.result

    return router
