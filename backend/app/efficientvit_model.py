"""Model architecture for faisalishfaq2005/deepfake-detection-efficientnet-vit.

Adapted from the model's MIT-licensed Hugging Face repository:
https://huggingface.co/faisalishfaq2005/deepfake-detection-efficientnet-vit
"""

import math

import torch
from torch import nn
from torchvision.models import efficientnet_b0


class ImprovedEfficientBackbone(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        # The downloaded checkpoint contains the trained backbone weights, so
        # do not separately download torchvision's ImageNet checkpoint.
        self.efficientnet = efficientnet_b0(weights=None)
        self.features = self.efficientnet.features

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.features(inputs)


class ImprovedPatchEmbedding(nn.Module):
    def __init__(self, in_channels: int = 1280, embed_dim: int = 384) -> None:
        super().__init__()
        self.proj = nn.Linear(in_channels, embed_dim)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.proj(inputs.flatten(2).transpose(1, 2))


class ImprovedViTBlock(nn.Module):
    def __init__(self, embed_dim: int = 384, num_heads: int = 4, mlp_ratio: int = 4) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(embed_dim)
        self.attn = nn.MultiheadAttention(embed_dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(embed_dim)
        self.mlp = nn.Sequential(
            nn.Linear(embed_dim, embed_dim * mlp_ratio),
            nn.GELU(),
            nn.Linear(embed_dim * mlp_ratio, embed_dim),
        )
        self.dropout = nn.Dropout(0.2)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        normalized = self.norm1(inputs)
        attended = self.attn(normalized, normalized, normalized)[0]
        inputs = inputs + self.dropout(attended)
        return inputs + self.dropout(self.mlp(self.norm2(inputs)))


class ImprovedEfficientViT(nn.Module):
    def __init__(self, embed_dim: int = 384, depth: int = 6, num_heads: int = 4) -> None:
        super().__init__()
        self.backbone = ImprovedEfficientBackbone()
        self.patch_embed = ImprovedPatchEmbedding(embed_dim=embed_dim)
        self.cls_token = nn.Parameter(torch.randn(1, 1, embed_dim))
        self.pos_embed: torch.Tensor
        self.register_buffer("pos_embed", self._get_sinusoidal_encoding(50, embed_dim))
        self.patch_dropout = nn.Dropout(0.2)
        self.pos_dropout = nn.Dropout(0.2)
        self.blocks = nn.ModuleList(
            [ImprovedViTBlock(embed_dim, num_heads) for _ in range(depth)]
        )
        self.head = nn.Sequential(
            nn.LayerNorm(embed_dim),
            nn.Linear(embed_dim, 128),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(128, 1),
        )
        nn.init.trunc_normal_(self.cls_token, std=0.02)

    @staticmethod
    def _get_sinusoidal_encoding(seq_len: int, dim: int) -> torch.Tensor:
        encoding = torch.zeros(seq_len, dim)
        position = torch.arange(seq_len, dtype=torch.float).unsqueeze(1)
        divisor = torch.exp(
            torch.arange(0, dim, 2).float() * (-math.log(10000.0) / dim)
        )
        encoding[:, 0::2] = torch.sin(position * divisor)
        encoding[:, 1::2] = torch.cos(position * divisor)
        return encoding.unsqueeze(0)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        tokens = self.patch_dropout(self.patch_embed(self.backbone(inputs)))
        cls_tokens = self.cls_token.expand(tokens.shape[0], -1, -1)
        encoded = torch.cat((cls_tokens, tokens), dim=1)
        encoded = self.pos_dropout(encoded + self.pos_embed[:, : encoded.size(1), :])

        for block in self.blocks:
            encoded = block(encoded)

        return self.head(encoded[:, 0])
