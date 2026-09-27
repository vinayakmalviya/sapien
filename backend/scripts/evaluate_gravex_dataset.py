"""Evaluate the Sapien classifier on a balanced GRAVEX-200K sample.

The Kaggle Hugging Face adapter requires a concrete tabular file path. GRAVEX-200K
is distributed as image folders, so this evaluator downloads/resolves the dataset
with kagglehub and discovers images from their real/fake parent directories.
"""

import argparse
import csv
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from scripts.evaluate_dataset import evaluate, select_images  # noqa: E402


DATASET_HANDLE = "muhammadbilal6305/200k-real-vs-ai-visuals-by-mbilal"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
REAL_DIRECTORY_NAMES = {"real", "real_images", "realimages", "authentic"}
FAKE_DIRECTORY_NAMES = {
    "fake",
    "fake_images",
    "fakeimages",
    "ai",
    "ai_images",
    "ai_generated",
    "aigenerated",
    "synthetic",
}


def normalize_directory_name(name: str) -> str:
    return name.strip().lower().replace("-", "_").replace(" ", "_")


def label_from_path(path: Path, dataset_root: Path) -> str | None:
    """Use the nearest recognized parent directory as the image label."""
    relative_parent = path.parent.relative_to(dataset_root)
    for parent_name in reversed(relative_parent.parts):
        normalized = normalize_directory_name(parent_name)
        if normalized in REAL_DIRECTORY_NAMES:
            return "real"
        if normalized in FAKE_DIRECTORY_NAMES:
            return "fake"
    return None


def discover_images(dataset_root: Path) -> tuple[dict[str, list[Path]], int]:
    images = {"real": [], "fake": []}
    unlabeled_count = 0

    for path in dataset_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        label = label_from_path(path, dataset_root)
        if label is None:
            unlabeled_count += 1
        else:
            images[label].append(path)

    images["real"].sort()
    images["fake"].sort()
    return images, unlabeled_count


def find_version_root(dataset_root: Path, split: str) -> tuple[Path, Path]:
    """Find the version folder and nested image root from common entry points."""
    candidates = [dataset_root, *list(dataset_root.parents)[:3]]
    version_root = next(
        (
            candidate
            for candidate in candidates
            if (candidate / f"{split}_labels.csv").is_file()
        ),
        None,
    )
    if version_root is None:
        raise ValueError(f"could not find {split}_labels.csv near {dataset_root}")

    data_candidates = [
        dataset_root,
        version_root / "my_real_vs_ai_dataset",
        version_root / "my_real_vs_ai_dataset" / "my_real_vs_ai_dataset",
    ]
    data_root = next(
        (
            candidate
            for candidate in data_candidates
            if (candidate / "real").is_dir()
            and (candidate / "ai_images").is_dir()
        ),
        None,
    )
    if data_root is None:
        raise ValueError("could not find the real/ and ai_images/ directories")
    return version_root, data_root


def load_split_images(
    dataset_root: Path, split: str
) -> tuple[dict[str, list[Path]], dict]:
    """Resolve the official CSV split without scanning all 200,000 images."""
    version_root, data_root = find_version_root(dataset_root, split)
    csv_path = version_root / f"{split}_labels.csv"
    images = {"real": [], "fake": []}
    missing = {"real": 0, "fake": 0}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_columns = {"filename", "label"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(
                f"{csv_path.name} is missing columns: "
                f"{', '.join(sorted(missing_columns))}"
            )

        for row in reader:
            # GRAVEX uses 1=real and 0=AI/fake.
            label = "real" if row["label"].strip() == "1" else "fake"
            folder = "real" if label == "real" else "ai_images"
            path = data_root / folder / row["filename"].strip()
            if path.is_file():
                images[label].append(path)
            else:
                missing[label] += 1

    return images, {
        "version_root": str(version_root),
        "data_root": str(data_root),
        "labels_csv": str(csv_path),
        "split": split,
        "missing_images": missing,
    }


def resolve_dataset_root(local_root: Path | None) -> Path:
    if local_root is not None:
        root = local_root.resolve()
        if not root.is_dir():
            raise ValueError(f"Dataset directory does not exist: {root}")
        return root

    try:
        import kagglehub
    except ImportError as error:
        raise RuntimeError(
            "kagglehub is not installed; run: python -m pip install kagglehub"
        ) from error

    # Outside Kaggle, this downloads the dataset to KaggleHub's local cache.
    return Path(kagglehub.dataset_download(DATASET_HANDLE)).resolve()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate a balanced sample from the GRAVEX-200K image dataset."
    )
    parser.add_argument(
        "--dataset-root",
        type=Path,
        help="Use an existing extracted dataset instead of downloading with KaggleHub",
    )
    parser.add_argument(
        "--max-per-class",
        type=int,
        default=100,
        help="Number of real and fake images to sample (default: 100 each)",
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--split",
        choices=("train", "val", "test"),
        default="test",
        help="Official CSV split to evaluate (default: test)",
    )
    parser.add_argument(
        "--inventory-only",
        action="store_true",
        help="Discover and count files without running model inference",
    )
    args = parser.parse_args()

    if args.max_per_class < 1:
        parser.error("--max-per-class must be at least 1")
    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if not 0 <= args.threshold <= 1:
        parser.error("--threshold must be between 0 and 1")

    try:
        dataset_root = resolve_dataset_root(args.dataset_root)
    except (RuntimeError, ValueError) as error:
        parser.error(str(error))

    try:
        images, split_metadata = load_split_images(dataset_root, args.split)
    except ValueError as error:
        parser.error(str(error))
    inventory = {
        "dataset": DATASET_HANDLE,
        "dataset_root": str(dataset_root),
        **split_metadata,
        "available_images": {
            "real": len(images["real"]),
            "fake": len(images["fake"]),
        },
    }

    if args.inventory_only:
        print(json.dumps(inventory, indent=2))
        return
    if not images["real"] or not images["fake"]:
        parser.error(
            "could not find both real and fake image folders; "
            f"found real={len(images['real'])}, fake={len(images['fake'])}"
        )

    real_paths = select_images(images["real"], args.max_per_class, args.seed)
    fake_paths = select_images(images["fake"], args.max_per_class, args.seed + 1)
    labeled_paths = [(path, 0) for path in real_paths] + [
        (path, 1) for path in fake_paths
    ]

    # Shuffling prevents batches from containing only one class while preserving
    # deterministic results for a given seed.
    import random

    random.Random(args.seed).shuffle(labeled_paths)
    result = evaluate(labeled_paths, args.batch_size, args.threshold)
    result["dataset"] = inventory
    result["selected_images"] = {
        "real": len(real_paths),
        "fake": len(fake_paths),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
