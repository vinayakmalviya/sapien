from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile

import librosa
import numpy as np


SR = 16_000
SILENCE_TOP_DB = 30
MIN_SECONDS = 1.0


class AudioValidationError(ValueError):
    pass


def decode_audio(path: str | Path) -> np.ndarray:
    try:
        audio, _ = librosa.load(path, sr=SR, mono=True)
        return audio
    except Exception:
        converted_path: Path | None = None
        try:
            with NamedTemporaryFile(suffix=".wav", delete=False) as converted_file:
                converted_path = Path(converted_file.name)

            subprocess.run(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(path),
                    "-ar",
                    str(SR),
                    "-ac",
                    "1",
                    "-y",
                    str(converted_path),
                ],
                check=True,
                capture_output=True,
                timeout=30,
            )
            audio, _ = librosa.load(converted_path, sr=SR, mono=True)
            return audio
        except (OSError, subprocess.SubprocessError) as exc:
            raise AudioValidationError(
                "The uploaded audio could not be decoded. Check that FFmpeg is installed."
            ) from exc
        finally:
            if converted_path is not None:
                converted_path.unlink(missing_ok=True)


def load_audio(path: str | Path) -> np.ndarray:
    audio = decode_audio(path)

    if audio.size == 0:
        raise AudioValidationError("The uploaded audio contains no samples.")

    trimmed, _ = librosa.effects.trim(audio, top_db=SILENCE_TOP_DB)
    if trimmed.size < SR * MIN_SECONDS:
        raise AudioValidationError("Audio too short (minimum 1 second of speech)")

    return np.asarray(trimmed, dtype=np.float32)
