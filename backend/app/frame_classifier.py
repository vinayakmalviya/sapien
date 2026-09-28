import io
from typing import Any

import cv2
import numpy as np
from PIL import Image
from transformers import pipeline

_MODEL_NAME = "dima806/deepfake_vs_real_image_detection"
_classifier = None
_face_detector = None
_FACE_MARGIN = 0.2


def is_model_loaded() -> bool:
    return _classifier is not None


def load_model() -> Any:
    global _classifier
    if _classifier is None:
        _classifier = pipeline("image-classification", model=_MODEL_NAME)
    return _classifier


def warm_up() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (224, 224), "white").save(buffer, format="JPEG")
    classify_frame(buffer.getvalue())


def _bytes_to_image(frame_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(frame_bytes)).convert("RGB")


def _crop_face(image: Image.Image) -> Image.Image | None:
    global _face_detector
    if _face_detector is None:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_detector = cv2.CascadeClassifier(cascade_path)
    gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    faces = _face_detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
    )
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    m = int(_FACE_MARGIN * w)
    return image.crop((max(0, x - m), max(0, y - m), x + w + m, y + h + m))


def classify_frame(frame_bytes: bytes) -> dict[str, float | bool]:
    classifier = load_model()
    image = _bytes_to_image(frame_bytes)
    face = _crop_face(image)
    face_detected = face is not None
    if face_detected:
        image = face
    results = classifier(image)

    fake_result = next(
        (result for result in results if result["label"].casefold() == "fake"),
        None,
    )
    if fake_result is None:
        raise RuntimeError("The frame model did not return a Fake label.")

    return {
        "fake_score": float(fake_result["score"]),
        "face_detected": face_detected,
    }


def classify_frame_batch(frames: list[bytes]) -> dict[str, Any]:
    if not frames:
        return {
            "avg_fake_score": None,
            "max_fake_score": None,
            "volatility": None,
            "frame_scores": [],
            "face_detection_rate": None,
        }

    results = [classify_frame(f) for f in frames]
    scores = [r["fake_score"] for r in results]
    scores_arr = np.array(scores)

    return {
        "avg_fake_score": float(scores_arr.mean()),
        "max_fake_score": float(scores_arr.max()),
        "volatility": float(scores_arr.std()),
        "frame_scores": scores,
        "face_detection_rate": float(
            np.mean([result["face_detected"] for result in results])
        ),
    }
