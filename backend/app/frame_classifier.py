import io
from typing import List, Dict, cast

import numpy as np
import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from safetensors.torch import load_file
from torchvision import transforms

from app.efficientvit_model import ImprovedEfficientViT


_MODEL_REPO = "faisalishfaq2005/deepfake-detection-efficientnet-vit"
_MODEL_FILE = "model.safetensors"
_model = None
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_preprocess = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ]
)


def load_model() -> ImprovedEfficientViT:
    """Download the safetensors checkpoint and load the model once."""
    global _model
    if _model is None:
        checkpoint_path = hf_hub_download(repo_id=_MODEL_REPO, filename=_MODEL_FILE)
        model = ImprovedEfficientViT()
        model.load_state_dict(load_file(checkpoint_path, device="cpu"), strict=True)
        model.eval()
        _model = model.to(_device)
    return _model


def _bytes_to_image(frame_bytes: bytes) -> Image.Image:
    with Image.open(io.BytesIO(frame_bytes)) as image:
        return image.convert("RGB")


def _predict_images(images: List[Image.Image]) -> List[float]:
    """Return fake probabilities for already-cropped face images."""
    if not images:
        return []

    tensors: List[torch.Tensor] = [cast(torch.Tensor, _preprocess(image)) for image in images]
    batch = torch.stack(tensors).to(_device)
    with torch.inference_mode():
        logits = load_model()(batch).squeeze(1)
        probabilities = torch.sigmoid(logits)
    return probabilities.detach().cpu().tolist()


def classify_frame(frame_bytes: bytes) -> Dict:
    """Classify one cropped face; 0 means real and 1 means fake."""
    fake_score = _predict_images([_bytes_to_image(frame_bytes)])[0]
    return {"fake_score": float(fake_score)}


def classify_frame_batch(frames: List[bytes]) -> Dict:
    """Classify cropped faces together and aggregate their fake scores."""
    if not frames:
        return {"avg_fake_score": None, "max_fake_score": None, "volatility": None, "frame_scores": []}

    scores = _predict_images([_bytes_to_image(frame) for frame in frames])
    scores_arr = np.array(scores)

    return {
        "avg_fake_score": float(scores_arr.mean()),
        "max_fake_score": float(scores_arr.max()),
        "volatility": float(scores_arr.std()),
        "frame_scores": scores,
    }
