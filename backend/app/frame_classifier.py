"""
Deepfake artifact detection service using a pretrained ViT classifier (dima806/deepfake_vs_real_image_detection) for inference only.
"""

from transformers import pipeline
from PIL import Image
import cv2
import io
import numpy as np
from typing import List, Dict, Optional

_MODEL_NAME = "dima806/deepfake_vs_real_image_detection"
_classifier = None
_face_detector = None
_FACE_MARGIN = 0.2  # extra context around the detected face, as a fraction of its width

def load_model():
    """Load the model once at startup, not per-request."""
    global _classifier
    if _classifier is None:
        _classifier = pipeline("image-classification", model=_MODEL_NAME)
    return _classifier


def _bytes_to_image(frame_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(frame_bytes)).convert("RGB")


def _crop_face(image: Image.Image) -> Optional[Image.Image]:
    """Crop to the largest detected face (with a margin), or None if no face is found."""
    global _face_detector
    if _face_detector is None:
        _face_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    faces = _face_detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    m = int(_FACE_MARGIN * w)
    return image.crop((max(0, x - m), max(0, y - m), x + w + m, y + h + m))


def classify_frame(frame_bytes: bytes) -> Dict:
    """Classify a single frame and return a 'fake_score' between 0 and 1.

    The frame is cropped to the face first: on compressed video frames the uncropped model
    scored everything as real. If no face is found the full frame is scored and
    'face_detected' is False.
    """
    classifier = load_model()
    image = _bytes_to_image(frame_bytes)
    face = _crop_face(image)
    face_detected = face is not None
    if face_detected:
        image = face
    results = classifier(image)  # e.g. [{'label': 'Fake', 'score': 0.87}, {'label': 'Real', 'score': 0.13}]

    fake_result = next((r for r in results if r["label"].lower() == "fake"), None)
    fake_score = fake_result["score"] if fake_result else 1 - results[0]["score"]

    return {"fake_score": fake_score, "face_detected": face_detected}


def classify_frame_batch(frames: List[bytes]) -> Dict:
    """Classify a batch of frames captured during a challenge window and return an aggregate score."""
    if not frames:
        return {"avg_fake_score": None, "max_fake_score": None, "volatility": None, "frame_scores": [], "face_detection_rate": None}

    results = [classify_frame(f) for f in frames]
    scores = [r["fake_score"] for r in results]
    scores_arr = np.array(scores)

    return {
        "avg_fake_score": float(scores_arr.mean()),
        "max_fake_score": float(scores_arr.max()),
        "volatility": float(scores_arr.std()),
        "frame_scores": scores,
        "face_detection_rate": float(np.mean([r["face_detected"] for r in results])),
    }