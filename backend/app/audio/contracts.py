from dataclasses import dataclass
from typing import Literal


VoiceLabel = Literal["real", "deepfake", "uncertain"]


@dataclass(frozen=True, slots=True)
class VoiceDetectionResult:
    label: VoiceLabel
    score: float
    confidence: float


@dataclass(frozen=True, slots=True)
class WordMatchResult:
    matched: bool
    expected_word: str
    transcript: str
