import io
import unittest
from unittest.mock import patch

from PIL import Image

from app.frame_classifier import classify_frame, classify_frame_batch


def jpeg_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(buffer, format="JPEG")
    return buffer.getvalue()


class FrameClassifierTests(unittest.TestCase):
    @patch("app.frame_classifier._crop_face", return_value=None)
    @patch("app.frame_classifier.load_model")
    def test_frame_score_uses_the_fake_label(self, load_model, _) -> None:
        load_model.return_value = lambda image: [
            {"label": "Real", "score": 0.8},
            {"label": "Fake", "score": 0.2},
        ]

        result = classify_frame(jpeg_bytes())

        self.assertEqual(result["fake_score"], 0.2)
        self.assertFalse(result["face_detected"])

    @patch("app.frame_classifier.classify_frame")
    def test_batch_returns_aggregate_scores(self, classify) -> None:
        classify.side_effect = [
            {"fake_score": 0.2, "face_detected": True},
            {"fake_score": 0.4, "face_detected": False},
        ]

        result = classify_frame_batch([b"one", b"two"])

        self.assertAlmostEqual(result["avg_fake_score"], 0.3)
        self.assertEqual(result["max_fake_score"], 0.4)
        self.assertAlmostEqual(result["volatility"], 0.1)
        self.assertEqual(result["face_detection_rate"], 0.5)


if __name__ == "__main__":
    unittest.main()
