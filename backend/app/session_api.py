import base64
import binascii
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import fmean
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.audio.analysis import analyze_audio_bytes, suffix_for_mime


PromptType = Literal["head_turn_right", "head_turn_left", "speak_word", "blink"]

PROMPTS = [
    {
        "index": 1,
        "of": 3,
        "type": "head_turn_right",
        "instruction": "Turn your head slightly to the right, then say 'orange river seven bright morning'.",
        "expected_word": "orange river seven bright morning",
        "duration_ms": 6000,
    },
    {
        "index": 2,
        "of": 3,
        "type": "speak_word",
        "instruction": "Say 'silver harbour twenty four quiet boats' now.",
        "expected_word": "silver harbour twenty four quiet boats",
        "duration_ms": 6000,
    },
    {
        "index": 3,
        "of": 3,
        "type": "blink",
        "instruction": "Blink two times.",
        "expected_word": None,
        "duration_ms": 4000,
    },
]

BASE_WEIGHTS = {"liveness": 0.4, "frame": 0.35, "voice": 0.25}
DECISION_THRESHOLD = 0.5
FRAME_FAKE_THRESHOLD = 0.15
VOICE_REAL_THRESHOLD = 0.65
VOICE_FAKE_THRESHOLD = 0.35


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
    frame: bool = False
    voice: bool = True


class StartSessionRequest(BaseModel):
    candidate_id: str | None = None
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


@dataclass
class SessionRecord:
    session_id: str
    created_at: str
    candidate_id: str
    enabled_modules: dict[str, bool]
    status: str = "awaiting_start"
    completed_prompts: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None


class SessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, SessionRecord] = {}

    def get(self, session_id: str) -> SessionRecord:
        session = self.sessions.get(session_id)
        if session is None:
            raise ApiProblem(404, "SESSION_NOT_FOUND", "No session exists with this ID.")
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
        if enabled["liveness"]
        else None
    )
    voice_values = [
        item["voice_score"]
        for item in completed
        if item["voice_score"] is not None
    ]
    voice_score = fmean(voice_values) if enabled["voice"] and voice_values else None
    frame_score = None

    combined = 0.0
    if liveness_score is not None:
        combined += liveness_score * weights["liveness"]
    if voice_score is not None:
        combined += voice_score * weights["voice"]

    failures: list[str] = []
    if liveness_score is not None and liveness_score < DECISION_THRESHOLD:
        failures.append("liveness_timing_mismatch")
    if voice_score is not None:
        if voice_score < VOICE_FAKE_THRESHOLD:
            failures.append("voice_detection_deepfake")
        elif voice_score < VOICE_REAL_THRESHOLD:
            failures.append("voice_detection_uncertain")
    if any(item["word_match"] is False for item in completed):
        failures.append("word_mismatch")

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

    return {
        "session_id": session.session_id,
        "signal": "real" if combined >= DECISION_THRESHOLD else "synthetic",
        "confidence": round(combined, 2),
        "completed_at": now_iso(),
        "component_scores": {
            "liveness_scorer": round(liveness_score, 2)
            if liveness_score is not None
            else None,
            "frame_classifier": frame_score,
            "voice_detection": round(voice_score, 2)
            if voice_score is not None
            else None,
        },
        "module_detail": {
            "liveness_scorer": {
                "enabled": enabled["liveness"],
                "prompts_passed": sum(
                    item["liveness_score"] >= DECISION_THRESHOLD
                    for item in completed
                ),
                "prompts_total": len(PROMPTS),
            },
            "frame_classifier": {
                "enabled": False,
                "frames_scored": 0,
                "mean_real_probability": 0.0,
            },
            "voice_detection": {
                "enabled": enabled["voice"],
                "label": voice_label,
                "word_match": all(
                    item["word_match"] is not False for item in completed
                ),
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
    }


def create_session_router(voice_detector: Any, word_matcher: Any) -> APIRouter:
    router = APIRouter()
    store = SessionStore()

    @router.post("/start-session")
    async def start_session(body: StartSessionRequest) -> dict[str, Any]:
        requested = body.enabled_modules or EnabledModules()
        enabled = requested.model_dump()
        if enabled["frame"]:
            raise ApiProblem(
                503,
                "MODEL_UNAVAILABLE",
                "The frame classifier is not available on this branch yet.",
            )
        renormalized_weights(enabled)

        session_id = str(uuid4())
        session = SessionRecord(
            session_id=session_id,
            created_at=now_iso(),
            candidate_id=body.candidate_id or "demo-candidate",
            enabled_modules=enabled,
        )
        store.sessions[session_id] = session
        return {
            "session_id": session_id,
            "created_at": session.created_at,
            "total_prompts": len(PROMPTS),
            "enabled_modules": enabled,
            "prompt": PROMPTS[0],
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
                f"Expected prompt index {expected_index}, received {body.prompt_index}.",
            )

        prompt = PROMPTS[expected_index - 1]
        if body.prompt_type != prompt["type"]:
            raise ApiProblem(
                400,
                "VALIDATION_ERROR",
                "The prompt type does not match the active prompt.",
            )

        session.status = "scoring"
        voice_score = None
        word_match = None
        warnings: list[str] = []

        if prompt["expected_word"] and session.enabled_modules["voice"]:
            if not body.audio_clip:
                raise ApiProblem(
                    400,
                    "VALIDATION_ERROR",
                    "This prompt requires an audio clip.",
                )
            try:
                audio_bytes = base64.b64decode(body.audio_clip, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ApiProblem(
                    400,
                    "AUDIO_DECODE_FAILED",
                    "The audio clip is not valid base64.",
                ) from exc

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
                    if "too short" in str(exc).casefold()
                    else "AUDIO_DECODE_FAILED"
                )
                raise ApiProblem(400, code, str(exc)) from exc

            voice_score = round(1.0 - voice_result.score, 4)
            word_match = word_result.matched

        prompt_result = {
            "index": body.prompt_index,
            "liveness_score": round(body.landmark_motion_score, 4),
            "frame_score": 0.0,
            "voice_score": voice_score,
            "word_match": word_match,
            "latency_ms": round((time.perf_counter() - started_at) * 1000),
        }
        session.completed_prompts.append(
            {
                **prompt_result,
                "type": body.prompt_type,
                "submitted_at": now_iso(),
            }
        )
        is_complete = len(session.completed_prompts) == len(PROMPTS)
        if is_complete:
            session.result = build_result(session)
            session.status = "complete"
        else:
            session.status = "in_progress"

        return {
            "session_id": session.session_id,
            "status": "complete" if is_complete else "in_progress",
            "accepted": True,
            "prompt_result": prompt_result,
            "next_prompt": None
            if is_complete
            else PROMPTS[len(session.completed_prompts)],
            "warnings": warnings,
        }

    @router.get("/session-status")
    async def session_status(session_id: str) -> dict[str, Any]:
        session = store.get(session_id)
        return {
            "session_id": session.session_id,
            "status": session.status,
            "current_prompt_index": min(
                len(session.completed_prompts) + 1, len(PROMPTS)
            ),
            "total_prompts": len(PROMPTS),
            "enabled_modules": session.enabled_modules,
            "completed_prompts": session.completed_prompts,
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
