import re
from pathlib import Path
from typing import Any

from .contracts import WordMatchResult


def normalize_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.casefold())


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
    def __init__(self, model_name: str = "tiny") -> None:
        self.model_name = model_name
        self._model: Any | None = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        import whisper

        self._model = whisper.load_model(self.model_name)

    def match(self, audio_path: str | Path, expected_word: str) -> WordMatchResult:
        if self._model is None:
            raise RuntimeError("WordMatcher.load() must succeed during startup.")

        transcription = self._model.transcribe(str(audio_path), fp16=False)
        transcript = str(transcription.get("text", ""))
        return compare_transcript(transcript, expected_word)
