from pathlib import Path

import librosa
import numpy as np


SR = 16_000
SILENCE_TOP_DB = 30
MIN_SECONDS = 1.0


class AudioValidationError(ValueError):
    pass


def load_audio(path: str | Path) -> np.ndarray:
    try:
        audio, _ = librosa.load(path, sr=SR, mono=True)
    except Exception as exc:
        raise AudioValidationError("The uploaded audio could not be decoded.") from exc

    if audio.size == 0:
        raise AudioValidationError("The uploaded audio contains no samples.")

    trimmed, _ = librosa.effects.trim(audio, top_db=SILENCE_TOP_DB)
    if trimmed.size < SR * MIN_SECONDS:
        raise AudioValidationError("Audio too short (minimum 1 second of speech)")

    return np.asarray(trimmed, dtype=np.float32)
