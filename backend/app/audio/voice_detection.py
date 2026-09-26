from pathlib import Path
from typing import Any

from .contracts import VoiceDetectionResult


REAL_THRESHOLD = 0.35
FAKE_THRESHOLD = 0.65
DEFAULT_CLASSIFIER_PATH = (
    Path(__file__).resolve().parents[2]
    / "vendor"
    / "vishield"
    / "model"
    / "deepfake_detector_w2v.joblib"
)


class VoiceDetectorNotConfiguredError(RuntimeError):
    pass


class VoiceDetector:
    def __init__(self, classifier_path: Path = DEFAULT_CLASSIFIER_PATH) -> None:
        self.classifier_path = classifier_path
        self._classifier: Any | None = None

    @property
    def is_loaded(self) -> bool:
        return self._classifier is not None

    def load(self) -> None:
        import joblib

        from vendor.vishield.training.w2v import load_model

        if not self.classifier_path.is_file():
            raise VoiceDetectorNotConfiguredError(
                f"Missing Vishield classifier: {self.classifier_path}"
            )

        classifier = joblib.load(self.classifier_path)
        if not hasattr(classifier, "predict_proba"):
            raise VoiceDetectorNotConfiguredError(
                "The Vishield classifier must provide predict_proba()."
            )
        if 1 not in classifier.classes_:
            raise VoiceDetectorNotConfiguredError(
                "The Vishield classifier does not contain deepfake class 1."
            )

        load_model()
        self._classifier = classifier

    def detect(self, audio_path: str | Path) -> VoiceDetectionResult:
        import numpy as np

        from vendor.vishield.training.w2v import embed_file

        if not self.is_loaded:
            raise VoiceDetectorNotConfiguredError(
                "VoiceDetector.load() must succeed during application startup."
            )

        embedding = embed_file(audio_path)
        probabilities = self._classifier.predict_proba(
            np.asarray(embedding, dtype=np.float32).reshape(1, -1)
        )[0]
        fake_index = list(self._classifier.classes_).index(1)
        return label_from_deepfake_score(float(probabilities[fake_index]))


def label_from_deepfake_score(score: float) -> VoiceDetectionResult:
    if not 0.0 <= score <= 1.0:
        raise ValueError("Deepfake score must be between 0.0 and 1.0.")

    if score < REAL_THRESHOLD:
        return VoiceDetectionResult("real", score, 1.0 - score)
    if score > FAKE_THRESHOLD:
        return VoiceDetectionResult("deepfake", score, score)
    return VoiceDetectionResult("uncertain", score, 1.0 - abs(score - 0.5) * 2.0)
