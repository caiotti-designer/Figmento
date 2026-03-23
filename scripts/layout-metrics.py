#!/usr/bin/env python3
"""
Layout quality metrics via HuggingFace evaluate.

Takes JSON from stdin with bounding boxes, returns alignment + overlap scores.
Install: pip install evaluate datasets numpy

Input format (JSON via stdin):
{
  "bboxes": [[cx, cy, w, h], ...],  // normalized 0-1, center-x/y + width/height
  "categories": [1, 2, 1, ...]      // element category IDs (optional)
}

Output (JSON to stdout):
{
  "alignment": { "ACLayoutGAN": 0.12, "LayoutGAN++": 0.08, "NDN": 0.15 },
  "overlap": { "ACLayoutGAN": 0.02, "LayoutGAN++": 0.01, "LayoutGAN": 0.03 },
  "summary": { "alignment_avg": 0.117, "overlap_avg": 0.02, "quality": "good" }
}

Lower scores = better alignment/less overlap.
"""
import json
import sys

try:
    import numpy as np
    import evaluate
except ImportError:
    print(json.dumps({
        "error": "Missing dependencies. Run: pip install evaluate datasets numpy"
    }))
    sys.exit(1)


def main():
    data = json.load(sys.stdin)
    bboxes = data.get("bboxes", [])

    if not bboxes:
        print(json.dumps({"error": "No bboxes provided"}))
        sys.exit(1)

    # Shape: (1, N, 4) — batch of 1, N elements, 4 coords (cx, cy, w, h)
    bbox_arr = np.array([bboxes], dtype=np.float32)
    mask_arr = np.ones((1, len(bboxes)), dtype=bool)

    results = {}

    # Alignment metric
    try:
        alignment = evaluate.load("creative-graphic-design/layout-alignment")
        alignment.add_batch(bbox=bbox_arr, mask=mask_arr)
        scores = alignment.compute()
        results["alignment"] = {}
        for key, val in scores.items():
            clean_key = key.replace("alignment-", "")
            results["alignment"][clean_key] = round(float(np.mean(val)), 4)
    except Exception as e:
        results["alignment_error"] = str(e)

    # Overlap metric
    try:
        overlap = evaluate.load("creative-graphic-design/layout-overlap")
        overlap.add_batch(bbox=bbox_arr, mask=mask_arr)
        scores = overlap.compute()
        results["overlap"] = {}
        for key, val in scores.items():
            clean_key = key.replace("overlap-", "")
            results["overlap"][clean_key] = round(float(np.mean(val)), 4)
    except Exception as e:
        results["overlap_error"] = str(e)

    # Summary
    if "alignment" in results and "overlap" in results:
        align_avg = sum(results["alignment"].values()) / len(results["alignment"])
        overlap_avg = sum(results["overlap"].values()) / len(results["overlap"])
        quality = "excellent" if align_avg < 0.05 and overlap_avg < 0.01 else \
                  "good" if align_avg < 0.15 and overlap_avg < 0.05 else \
                  "needs_work" if align_avg < 0.3 and overlap_avg < 0.1 else "poor"
        results["summary"] = {
            "alignment_avg": round(align_avg, 4),
            "overlap_avg": round(overlap_avg, 4),
            "quality": quality,
        }

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
