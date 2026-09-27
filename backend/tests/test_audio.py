import unittest
from unittest.mock import patch

import numpy as np

from app.audio.voice_detection import label_from_deepfake_score
from app.audio.word_match import WordMatcher, compare_transcript
from vendor.vishield.training.features import SR, load_audio


class FakeWhisperModel:
    def transcribe(self, _: str, fp16: bool, language: str | None) -> dict[str, str]:
        assert fp16 is False
        assert language == "en"
        return {"text": " Orange. "}


class AudioServiceTests(unittest.TestCase):
    def test_voice_score_labels(self) -> None:
        cases = [(0.12, "real"), (0.50, "uncertain"), (0.88, "deepfake")]
        for score, expected_label in cases:
            with self.subTest(score=score):
                self.assertEqual(
                    label_from_deepfake_score(score).label, expected_label
                )

    def test_word_match_uses_whole_normalized_words(self) -> None:
        result = compare_transcript("Orange, now!", "orange")

        self.assertTrue(result.matched)

    def test_word_match_does_not_accept_substrings(self) -> None:
        result = compare_transcript("I said oranges.", "orange")

        self.assertFalse(result.matched)

    def test_word_match_accepts_a_phrase(self) -> None:
        result = compare_transcript(
            "The orange fox walks quietly beneath the silver moon.",
            "the orange fox walks quietly beneath the silver moon",
        )

        self.assertTrue(result.matched)

    def test_word_match_rejects_an_incomplete_phrase(self) -> None:
        result = compare_transcript(
            "The orange fox walks beneath the moon.",
            "the orange fox walks quietly beneath the silver moon",
        )

        self.assertFalse(result.matched)

    def test_word_matcher_uses_loaded_whisper_model(self) -> None:
        matcher = WordMatcher()
        matcher._model = FakeWhisperModel()

        result = matcher.match("unused.wav", "orange")

        self.assertTrue(result.matched)

    def test_word_match_treats_digits_and_number_words_alike(self) -> None:
        self.assertTrue(compare_transcript("Say 7 now", "seven").matched)
        self.assertTrue(compare_transcript("seven", "7").matched)

    def test_word_match_accepts_whisper_spelling_variant(self) -> None:
        self.assertTrue(compare_transcript("Say harbor now", "harbour").matched)

    def test_word_match_normalizes_a_full_challenge_phrase(self) -> None:
        result = compare_transcript(
            "Silver harbor 24 quiet boats.",
            "silver harbour twenty four quiet boats",
        )

        self.assertTrue(result.matched)

    def test_word_matcher_accepts_decoded_audio(self) -> None:
        matcher = WordMatcher(language="en")
        matcher._model = FakeWhisperModel()

        result = matcher.match(np.zeros(SR, dtype=np.float32), "orange")

        self.assertTrue(result.matched)

    @patch("vendor.vishield.training.features.subprocess.run")
    @patch("vendor.vishield.training.features.librosa.load")
    def test_browser_audio_uses_ffmpeg_fallback(self, mock_load, mock_run) -> None:
        mock_load.side_effect = [RuntimeError("unsupported"), (np.ones(SR), SR)]

        audio = load_audio("recording.webm")

        self.assertEqual(audio.size, SR)
        mock_run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
