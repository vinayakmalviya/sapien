import unittest

from app.audio.voice_detection import label_from_deepfake_score
from app.audio.word_match import WordMatcher, compare_transcript


class FakeWhisperModel:
    def transcribe(self, _: str, fp16: bool) -> dict[str, str]:
        assert fp16 is False
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

    def test_word_matcher_uses_loaded_whisper_model(self) -> None:
        matcher = WordMatcher()
        matcher._model = FakeWhisperModel()

        result = matcher.match("unused.wav", "orange")

        self.assertTrue(result.matched)


if __name__ == "__main__":
    unittest.main()
