"""Evaluate the frame classifier against real/ and fake/ image folders."""

import argparse
import csv
import io
import json
import random
import sys
import urllib.request
from pathlib import Path

from PIL import Image


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.frame_classifier import classify_frame_batch  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024


def find_images(folder: Path) -> list[Path]:
    return sorted(
        path
        for path in folder.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def find_csv_images(
    csv_path: Path, images_root: Path, split: str
) -> tuple[dict[str, list[Path]], dict]:
    """Join CSV records to local images by label folder and image_id."""
    image_index = {
        (path.parent.name.lower(), path.stem): path
        for path in images_root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    }
    selected = {"real": [], "fake": []}
    rows_in_split = {"real": 0, "fake": 0}
    missing = {"real": 0, "fake": 0}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_columns = {"image_id", "label", "dataset_split"}
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(
                f"CSV is missing required columns: {', '.join(sorted(missing_columns))}"
            )

        for row in reader:
            if split != "all" and row["dataset_split"].strip().lower() != split:
                continue

            label = row["label"].strip().lower()
            if label not in selected:
                continue
            rows_in_split[label] += 1
            path = image_index.get((label, row["image_id"].strip()))
            if path is None:
                missing[label] += 1
            else:
                selected[label].append(path)

    metadata = {
        "csv": str(csv_path),
        "dataset_split": split,
        "csv_rows_in_split": rows_in_split,
        "missing_local_images": missing,
    }
    return selected, metadata


def download_csv_sample(
    csv_path: Path,
    images_root: Path,
    split: str,
    limit: int,
    seed: int,
) -> dict:
    """Download a deterministic, balanced CSV sample into label folders."""
    rows_by_label = {"real": [], "fake": []}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        for row in csv.DictReader(csv_file):
            if split != "all" and row["dataset_split"].strip().lower() != split:
                continue
            label = row["label"].strip().lower()
            if label in rows_by_label:
                rows_by_label[label].append(row)

    downloaded = {"real": 0, "fake": 0}
    already_present = {"real": 0, "fake": 0}
    failures = []
    for offset, (label, rows) in enumerate(rows_by_label.items()):
        randomizer = random.Random(seed + offset)
        initial_sample = randomizer.sample(rows, min(limit, len(rows)))
        initial_ids = {row["image_id"] for row in initial_sample}
        remaining = [row for row in rows if row["image_id"] not in initial_ids]
        randomizer.shuffle(remaining)
        candidates = initial_sample + remaining
        label_folder = images_root / label
        label_folder.mkdir(parents=True, exist_ok=True)

        acquired = 0
        for index, row in enumerate(candidates, start=1):
            if acquired >= limit:
                break
            image_id = row["image_id"].strip()
            existing = next(
                (
                    path
                    for suffix in IMAGE_SUFFIXES
                    if (path := label_folder / f"{image_id}{suffix}").exists()
                ),
                None,
            )
            if existing is not None:
                already_present[label] += 1
                acquired += 1
                continue

            try:
                request = urllib.request.Request(
                    row["image_url"], headers={"User-Agent": "Sapien-Evaluator/1.0"}
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    image_bytes = response.read(MAX_DOWNLOAD_BYTES + 1)
                if len(image_bytes) > MAX_DOWNLOAD_BYTES:
                    raise ValueError("image exceeds 20 MB download limit")

                with Image.open(io.BytesIO(image_bytes)) as image:
                    image.verify()
                    image_format = (image.format or "JPEG").lower()
                suffix = ".jpg" if image_format == "jpeg" else f".{image_format}"
                if suffix not in IMAGE_SUFFIXES:
                    raise ValueError(f"unsupported downloaded image format: {image_format}")
                (label_folder / f"{image_id}{suffix}").write_bytes(image_bytes)
                downloaded[label] += 1
                acquired += 1
            except Exception as error:
                failures.append(
                    {
                        "image_id": image_id,
                        "label": label,
                        "url": row["image_url"],
                        "error": str(error),
                    }
                )
            print(
                f"Resolved {label} images {acquired}/{limit} (attempt {index})",
                file=sys.stderr,
            )

    return {
        "downloaded": downloaded,
        "already_present": already_present,
        "download_failures": failures,
    }


def select_images(paths: list[Path], limit: int | None, seed: int) -> list[Path]:
    if limit is None or len(paths) <= limit:
        return paths
    return sorted(random.Random(seed).sample(paths, limit))


def safe_divide(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def roc_auc(records: list[dict]) -> float | None:
    """Calculate ROC-AUC from average ranks, including tied scores."""
    ranked = sorted(records, key=lambda record: record["score"])
    positive_count = sum(record["actual"] == 1 for record in ranked)
    negative_count = len(ranked) - positive_count
    if not positive_count or not negative_count:
        return None

    positive_rank_sum = 0.0
    index = 0
    while index < len(ranked):
        group_end = index + 1
        while (
            group_end < len(ranked)
            and ranked[group_end]["score"] == ranked[index]["score"]
        ):
            group_end += 1
        average_rank = ((index + 1) + group_end) / 2
        positive_rank_sum += average_rank * sum(
            record["actual"] == 1 for record in ranked[index:group_end]
        )
        index = group_end

    return (
        positive_rank_sum - positive_count * (positive_count + 1) / 2
    ) / (positive_count * negative_count)


def best_balanced_threshold(records: list[dict]) -> dict | None:
    """Find the in-sample threshold with the highest balanced accuracy."""
    if not records:
        return None

    thresholds = sorted({record["score"] for record in records})
    best = None
    for threshold in thresholds:
        true_positive = sum(
            record["actual"] == 1 and record["score"] >= threshold
            for record in records
        )
        true_negative = sum(
            record["actual"] == 0 and record["score"] < threshold
            for record in records
        )
        positive_count = sum(record["actual"] == 1 for record in records)
        negative_count = len(records) - positive_count
        fake_recall = safe_divide(true_positive, positive_count)
        real_recall = safe_divide(true_negative, negative_count)
        if fake_recall is None or real_recall is None:
            continue
        candidate = {
            "threshold": threshold,
            "balanced_accuracy": (fake_recall + real_recall) / 2,
            "fake_recall": fake_recall,
            "real_recall_specificity": real_recall,
        }
        if best is None or candidate["balanced_accuracy"] > best["balanced_accuracy"]:
            best = candidate
    return best


def evaluate(
    labeled_paths: list[tuple[Path, int]], batch_size: int, threshold: float
) -> dict:
    records = []
    errors = []

    for start in range(0, len(labeled_paths), batch_size):
        batch_items = labeled_paths[start : start + batch_size]
        try:
            result = classify_frame_batch([path.read_bytes() for path, _ in batch_items])
            scores = result["frame_scores"]
            records.extend(
                {
                    "path": str(path),
                    "actual": actual,
                    "score": score,
                    "predicted": int(score >= threshold),
                }
                for (path, actual), score in zip(batch_items, scores, strict=True)
            )
        except Exception:
            # Isolate unreadable images rather than losing the whole evaluation.
            for path, actual in batch_items:
                try:
                    score = classify_frame_batch([path.read_bytes()])["frame_scores"][0]
                    records.append(
                        {
                            "path": str(path),
                            "actual": actual,
                            "score": score,
                            "predicted": int(score >= threshold),
                        }
                    )
                except Exception as error:
                    errors.append({"path": str(path), "error": str(error)})

        completed = min(start + batch_size, len(labeled_paths))
        print(f"Processed {completed}/{len(labeled_paths)}", file=sys.stderr)

    true_positive = sum(r["actual"] == 1 and r["predicted"] == 1 for r in records)
    true_negative = sum(r["actual"] == 0 and r["predicted"] == 0 for r in records)
    false_positive = sum(r["actual"] == 0 and r["predicted"] == 1 for r in records)
    false_negative = sum(r["actual"] == 1 and r["predicted"] == 0 for r in records)

    precision = safe_divide(true_positive, true_positive + false_positive)
    recall = safe_divide(true_positive, true_positive + false_negative)
    specificity = safe_divide(true_negative, true_negative + false_positive)
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else None
    )
    scores_by_class = {
        label: [r["score"] for r in records if r["actual"] == actual]
        for label, actual in (("real", 0), ("fake", 1))
    }

    return {
        "threshold": threshold,
        "evaluated_images": len(records),
        "errors": errors,
        "confusion_matrix": {
            "true_real": true_negative,
            "real_called_fake": false_positive,
            "fake_called_real": false_negative,
            "true_fake": true_positive,
        },
        "metrics": {
            "accuracy": safe_divide(true_positive + true_negative, len(records)),
            "balanced_accuracy": (
                (recall + specificity) / 2
                if recall is not None and specificity is not None
                else None
            ),
            "fake_precision": precision,
            "fake_recall": recall,
            "real_recall_specificity": specificity,
            "f1": f1,
            "roc_auc": roc_auc(records),
        },
        "in_sample_threshold_analysis": best_balanced_threshold(records),
        "score_summary": {
            label: {
                "count": len(scores),
                "average_fake_score": sum(scores) / len(scores) if scores else None,
                "minimum_fake_score": min(scores) if scores else None,
                "maximum_fake_score": max(scores) if scores else None,
            }
            for label, scores in scores_by_class.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate real/fake folders, or join FINAL_DATASET.csv to local images "
            "by image_id."
        )
    )
    parser.add_argument("dataset", type=Path, help="Dataset directory or CSV file")
    parser.add_argument(
        "--images-root",
        type=Path,
        help="Folder containing real/ and fake/; defaults to the CSV's directory",
    )
    parser.add_argument(
        "--split",
        choices=("train", "val", "test", "all"),
        default="test",
        help="CSV dataset split to evaluate (default: test)",
    )
    parser.add_argument(
        "--download-missing",
        action="store_true",
        help="Download the selected CSV sample URLs and cache them locally",
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument(
        "--max-per-class",
        type=int,
        help="Randomly sample at most this many images from each class.",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if not 0 <= args.threshold <= 1:
        parser.error("--threshold must be between 0 and 1")

    dataset_metadata = {}
    if args.dataset.suffix.lower() == ".csv":
        images_root = args.images_root or args.dataset.parent
        if args.download_missing:
            if args.max_per_class is None:
                parser.error("--download-missing requires --max-per-class")
            dataset_metadata["download"] = download_csv_sample(
                args.dataset,
                images_root,
                args.split,
                args.max_per_class,
                args.seed,
            )
        csv_images, csv_metadata = find_csv_images(args.dataset, images_root, args.split)
        dataset_metadata.update(csv_metadata)
        available_real = csv_images["real"]
        available_fake = csv_images["fake"]
    else:
        available_real = find_images(args.dataset / "real")
        available_fake = find_images(args.dataset / "fake")

    real_paths = select_images(available_real, args.max_per_class, args.seed)
    fake_paths = select_images(available_fake, args.max_per_class, args.seed)
    if not real_paths or not fake_paths:
        parser.error(
            "the selected evaluation requires matching local REAL and FAKE images; "
            f"found real={len(real_paths)}, fake={len(fake_paths)}"
        )

    labeled_paths = [(path, 0) for path in real_paths] + [
        (path, 1) for path in fake_paths
    ]
    random.Random(args.seed).shuffle(labeled_paths)
    result = evaluate(labeled_paths, args.batch_size, args.threshold)
    result["dataset"] = dataset_metadata
    result["selected_images"] = {"real": len(real_paths), "fake": len(fake_paths)}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
