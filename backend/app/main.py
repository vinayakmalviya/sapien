import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.audio.voice_detection import VoiceDetector
from app.audio.word_match import WordMatcher
from vendor.vishield.training.features import AudioValidationError


MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_AUDIO_SUFFIXES = {".flac", ".m4a", ".mp3", ".ogg", ".wav", ".webm"}

voice_detector = VoiceDetector()
word_matcher = WordMatcher(model_name=os.getenv("SAPIEN_WHISPER_MODEL", "tiny"))


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await run_in_threadpool(voice_detector.load)
    await run_in_threadpool(word_matcher.load)
    yield


app = FastAPI(title="Sapien API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "services": {
            "voice_detection": voice_detector.is_loaded,
            "word_match": word_matcher.is_loaded,
        },
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

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(audio_bytes)
            temporary_path = Path(temporary_file.name)

        voice_result, word_result = await asyncio.gather(
            run_in_threadpool(voice_detector.detect, temporary_path),
            run_in_threadpool(word_matcher.match, temporary_path, expected_word),
        )
    except AudioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return {
        "voice_detection": {
            **asdict(voice_result),
            "human_probability": round(1.0 - voice_result.score, 6),
        },
        "word_match": asdict(word_result),
        "flag_reason": None if word_result.matched else "expected_word_mismatch",
    }
