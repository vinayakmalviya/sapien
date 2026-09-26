"""
Deepfake artifact detection service using a pretrained ViT classifier (dima806/deepfake_vs_real_image_detection) for inference only.
"""

from transformers import pipeline
from PIL import Image
import io
import numpy as np
from typing import List, Dict

_MODEL_NAME = "dima806/deepfake_vs_real_image_detection"
_classifier = None

def load_model():
    """Load the model once at startup, not per-request."""
    global _classifier
    if _classifier is None:
        _classifier = pipeline("image-classification", model=_MODEL_NAME)
    return _classifier


def _bytes_to_image(frame_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(frame_bytes)).convert("RGB")


def classify_frame(frame_bytes: bytes) -> Dict:
    """Classify a single frame and return a 'fake_score' between 0 and 1."""
    classifier = load_model()
    image = _bytes_to_image(frame_bytes)
    results = classifier(image)  # e.g. [{'label': 'Fake', 'score': 0.87}, {'label': 'Real', 'score': 0.13}]

    fake_result = next((r for r in results if r["label"].lower() == "fake"), None)
    fake_score = fake_result["score"] if fake_result else 1 - results[0]["score"]

    return {"fake_score": fake_score}


def classify_frame_batch(frames: List[bytes]) -> Dict:
    """Classify a batch of frames captured during a challenge window and return an aggregate score."""
    if not frames:
        return {"avg_fake_score": None, "max_fake_score": None, "volatility": None, "frame_scores": []}

    scores = [classify_frame(f)["fake_score"] for f in frames]
    scores_arr = np.array(scores)

    return {
        "avg_fake_score": float(scores_arr.mean()),
        "max_fake_score": float(scores_arr.max()),
        "volatility": float(scores_arr.std()),
        "frame_scores": scores,
    }