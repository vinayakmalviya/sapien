import os
import shutil
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from app.audio.analysis import (
    ALLOWED_AUDIO_SUFFIXES,
    MAX_AUDIO_BYTES,
    analyze_audio_bytes,
)
from app.audio.voice_detection import VoiceDetector
from app.audio.word_match import WordMatcher
from app.frame_classifier import classify_frame, load_model
from app.session_api import ApiProblem, create_session_router, error_body
from vendor.vishield.training.features import AudioValidationError


load_dotenv()

voice_detector = VoiceDetector()
word_matcher = WordMatcher(model_name=os.getenv("SAPIEN_WHISPER_MODEL", "base.en"))


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await run_in_threadpool(voice_detector.load)
    await run_in_threadpool(word_matcher.load)
    await run_in_threadpool(voice_detector.warm_up)
    await run_in_threadpool(word_matcher.warm_up)
    await run_in_threadpool(load_model)
    yield


app = FastAPI(title="Sapien API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.include_router(create_session_router(voice_detector, word_matcher))


@app.exception_handler(ApiProblem)
async def handle_api_problem(_, problem: ApiProblem) -> JSONResponse:
    return JSONResponse(status_code=problem.status, content=error_body(problem))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_, error: RequestValidationError) -> JSONResponse:
    problem = ApiProblem(
        400,
        "VALIDATION_ERROR",
        "The request body is invalid.",
        error.errors(),
    )
    return JSONResponse(status_code=400, content=error_body(problem))


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "services": {
            "voice_detection": voice_detector.is_loaded,
            "word_match": word_matcher.is_loaded,
        },
        "ffmpeg": shutil.which("ffmpeg") is not None,
    }


@app.post("/submit-audio")
async def submit_audio(
    expected_word: str = Form(..., min_length=1),
    audio_clip: UploadFile = File(...),
) -> dict[str, object]:
    suffix = Path(audio_clip.filename or "audio.wav").suffix.casefold() or ".wav"
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise HTTPException(status_code=415, detail="Unsupported audio file type.")

    audio_bytes = await audio_clip.read(MAX_AUDIO_BYTES + 1)
    await audio_clip.close()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="The audio clip is empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="The audio clip exceeds 25 MB.")

    try:
        voice_result, word_result = await analyze_audio_bytes(
            audio_bytes,
            suffix,
            expected_word,
            voice_detector,
            word_matcher,
        )
    except AudioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverflowError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "voice_detection": {
            **asdict(voice_result),
            "human_probability": round(1.0 - voice_result.score, 6),
        },
        "word_match": asdict(word_result),
        "flag_reason": None if word_result.matched else "expected_word_mismatch",
    }


# dev
@app.post("/classify-frame")
async def classify_uploaded_frame(
    frame: Annotated[UploadFile, File(...)],
):
    frame_bytes = await frame.read()
    return classify_frame(frame_bytes)