import os
import re
from pathlib import Path
from typing import Any

from .contracts import WordMatchResult


NUMBER_WORDS = {
    word: str(value)
    for value, word in enumerate(
        "zero one two three four five six seven eight nine ten eleven twelve "
        "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split()
    )
}
NUMBER_WORDS.update(
    {
        word: str(value)
        for value, word in zip(
            range(30, 100, 10),
            "thirty forty fifty sixty seventy eighty ninety".split(),
        )
    }
)


def normalize_words(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9']+", text.casefold())
    return [NUMBER_WORDS.get(token, token) for token in tokens]


def compare_transcript(transcript: str, expected_word: str) -> WordMatchResult:
    expected_tokens = normalize_words(expected_word)
    if not expected_tokens:
        raise ValueError("Expected phrase cannot be empty.")

    transcript_tokens = normalize_words(transcript)
    phrase_length = len(expected_tokens)
    matched = any(
        transcript_tokens[index : index + phrase_length] == expected_tokens
        for index in range(len(transcript_tokens) - phrase_length + 1)
    )
    return WordMatchResult(
        matched=matched,
        expected_word=" ".join(expected_tokens),
        transcript=transcript.strip(),
    )


class WordMatcher:
    def __init__(
        self, model_name: str = "base", language: str | None = None
    ) -> None:
        self.model_name = model_name
        self.language = language or os.getenv("SAPIEN_WHISPER_LANGUAGE", "en") or None
        self._model: Any | None = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        import whisper

        self._model = whisper.load_model(self.model_name)

    def warm_up(self) -> None:
        import numpy as np

        self.match(np.zeros(16_000, dtype=np.float32), "warm up")

    def match(self, audio: Any, expected_word: str) -> WordMatchResult:
        """Transcribe a decoded 16 kHz mono array, or a file path."""
        if self._model is None:
            raise RuntimeError("WordMatcher.load() must succeed during startup.")

        source = audio if hasattr(audio, "dtype") else str(audio)
        transcription = self._model.transcribe(
            source, fp16=False, language=self.language
        )
        transcript = str(transcription.get("text", ""))
        return compare_transcript(transcript, expected_word)
