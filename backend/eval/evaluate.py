"""
Score a labeled folder of images through classify_frame and report accuracy.

Usage (from backend/):
    python -m eval.evaluate PATH_TO_DATASET [--limit 300]

PATH_TO_DATASET must contain 'real/' and 'fake/' subfolders of images (case-insensitive).
Results are only as trustworthy as the data: use frames captured the way the app captures them.
"""

import argparse
import glob
import os
import random

import numpy as np

from app.frame_classifier import classify_frame


def _auc(scores, labels):
    pos, neg = scores[labels == 1], scores[labels == 0]
    return float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset")
    parser.add_argument("--limit", type=int, default=300, help="max images per class")
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    random.seed(0)
    scores, labels, no_face = [], [], 0
    for name, label in (("real", 0), ("fake", 1)):
        folder = next(d for d in glob.glob(os.path.join(args.dataset, "*")) if os.path.basename(d).lower() == name)
        files = sorted(glob.glob(os.path.join(folder, "*")))
        for path in random.sample(files, min(args.limit, len(files))):
            with open(path, "rb") as f:
                result = classify_frame(f.read())
            scores.append(result["fake_score"])
            labels.append(label)
            no_face += not result["face_detected"]

    scores, labels = np.array(scores), np.array(labels)
    pred = scores > args.threshold
    print(f"images: {len(labels)} (no face found in {no_face})")
    print(f"accuracy @ {args.threshold}: {np.mean(pred == labels):.3f}")
    print(f"false alarm rate (real flagged fake): {np.mean(pred[labels == 0]):.3f}")
    print(f"miss rate (fake called real): {np.mean(~pred[labels == 1]):.3f}")
    print(f"AUC: {_auc(scores, labels):.3f}")


if __name__ == "__main__":
    main()
