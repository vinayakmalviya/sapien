from pathlib import Path

import numpy as np
import torch
from transformers import Wav2Vec2Model

from .features import load_audio


MODEL_NAME = "facebook/wav2vec2-base"
LAYER = 6
_model: Wav2Vec2Model | None = None


def load_model() -> Wav2Vec2Model:
    global _model
    if _model is None:
        _model = Wav2Vec2Model.from_pretrained(MODEL_NAME).eval()
    return _model


@torch.no_grad()
def embed(audio: np.ndarray) -> np.ndarray:
    normalized = (audio - audio.mean()) / (audio.std() + 1e-7)
    inputs = torch.tensor(normalized, dtype=torch.float32)[None]
    hidden_states = load_model()(inputs, output_hidden_states=True).hidden_states
    return hidden_states[LAYER][0].mean(0).numpy()


def embed_file(path: str | Path) -> np.ndarray:
    return embed(load_audio(path))
