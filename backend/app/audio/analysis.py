import asyncio
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi.concurrency import run_in_threadpool

from vendor.vishield.training.features import SR, decode_audio


MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_AUDIO_SECONDS = 30
ALLOWED_AUDIO_SUFFIXES = {".flac", ".m4a", ".mp3", ".ogg", ".wav", ".webm"}
MIME_SUFFIXES = {
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
}


def suffix_for_mime(mime_type: str) -> str:
    base_type = mime_type.partition(";")[0].strip().casefold()
    return MIME_SUFFIXES.get(base_type, ".webm")


async def analyze_audio_bytes(
    audio_bytes: bytes,
    suffix: str,
    expected_word: str,
    voice_detector: Any,
    word_matcher: Any,
):
    if not audio_bytes:
        raise ValueError("The audio clip is empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise OverflowError("The audio clip exceeds 25 MB.")
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise TypeError("Unsupported audio file type.")

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(audio_bytes)
            temporary_path = Path(temporary_file.name)

        audio = await run_in_threadpool(decode_audio, temporary_path)
        if audio.size > SR * MAX_AUDIO_SECONDS:
            raise OverflowError(
                f"The audio clip exceeds {MAX_AUDIO_SECONDS} seconds."
            )

        return await asyncio.gather(
            run_in_threadpool(voice_detector.detect, audio),
            run_in_threadpool(word_matcher.match, audio, expected_word),
        )
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


async def analyze_voice_bytes(
    audio_bytes: bytes,
    suffix: str,
    voice_detector: Any,
):
    if not audio_bytes:
        raise ValueError("The audio clip is empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise OverflowError("The audio clip exceeds 25 MB.")
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise TypeError("Unsupported audio file type.")

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(audio_bytes)
            temporary_path = Path(temporary_file.name)

        audio = await run_in_threadpool(decode_audio, temporary_path)
        if audio.size > SR * MAX_AUDIO_SECONDS:
            raise OverflowError(
                f"The audio clip exceeds {MAX_AUDIO_SECONDS} seconds."
            )
        return await run_in_threadpool(voice_detector.detect, audio)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
