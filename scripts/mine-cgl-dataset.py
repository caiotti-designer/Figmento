#!/usr/bin/env python3
"""
CGL-Dataset V2 Mining Pipeline
Downloads 60K e-commerce ad posters, clusters element positions by category,
extracts composition patterns, and outputs YAML layout blueprints.

Install: pip install datasets numpy scikit-learn pyyaml
Run:     python scripts/mine-cgl-dataset.py
Output:  figmento-mcp-server/knowledge/layouts/ads/cgl-*.yaml
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

try:
    import numpy as np
    from sklearn.cluster import KMeans
    import yaml
except ImportError:
    print("Install dependencies: pip install datasets numpy scikit-learn pyyaml")
    sys.exit(1)

# Output directory
OUTPUT_DIR = Path(__file__).parent.parent / "figmento-mcp-server" / "knowledge" / "layouts" / "ads"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Category names from CGL-Dataset
CATEGORIES = {0: "logo", 1: "text", 2: "underlay", 3: "embellishment", 4: "highlighted_text"}

# Canvas size (all CGL images are 513x750)
CW, CH = 513, 750


def load_dataset():
    """Load CGL-Dataset V2 from HuggingFace."""
    from datasets import load_dataset
    print("Downloading CGL-Dataset V2 (60K samples)... This may take a while on first run.")
    ds = load_dataset("creative-graphic-design/CGL-Dataset-v2", split="train")
    print(f"Loaded {len(ds)} samples.")
    return ds


def extract_elements(ds):
    """Extract normalized bounding boxes grouped by category."""
    elements_by_category = defaultdict(list)
    layout_compositions = []  # Each layout's full element set

    for row in ds:
        ann = row["annotations"]
        bboxes = ann["bbox"]
        cats = ann["category_id"]

        layout_elements = []
        for bbox, cat_id in zip(bboxes, cats):
            x, y, w, h = bbox
            # Normalize to 0-1
            nx = x / CW
            ny = y / CH
            nw = w / CW
            nh = h / CH
            cx = nx + nw / 2
            cy = ny + nh / 2

            elem = {
                "category": CATEGORIES.get(cat_id, "unknown"),
                "cx": cx, "cy": cy,
                "w": nw, "h": nh,
                "x": nx, "y": ny,
                "area": nw * nh,
            }
            elements_by_category[cat_id].append(elem)
            layout_elements.append(elem)

        if layout_elements:
            layout_compositions.append(layout_elements)

    return elements_by_category, layout_compositions


def analyze_category_positions(elements_by_category):
    """Analyze where each element type is typically placed."""
    stats = {}
    for cat_id, elements in elements_by_category.items():
        cat_name = CATEGORIES.get(cat_id, "unknown")
        positions = np.array([[e["cx"], e["cy"]] for e in elements])
        sizes = np.array([[e["w"], e["h"]] for e in elements])
        areas = np.array([e["area"] for e in elements])

        stats[cat_name] = {
            "count": len(elements),
            "position": {
                "cx_mean": round(float(positions[:, 0].mean()), 3),
                "cy_mean": round(float(positions[:, 1].mean()), 3),
                "cx_std": round(float(positions[:, 0].std()), 3),
                "cy_std": round(float(positions[:, 1].std()), 3),
                "cx_median": round(float(np.median(positions[:, 0])), 3),
                "cy_median": round(float(np.median(positions[:, 1])), 3),
            },
            "size": {
                "w_mean": round(float(sizes[:, 0].mean()), 3),
                "h_mean": round(float(sizes[:, 1].mean()), 3),
                "w_median": round(float(np.median(sizes[:, 0])), 3),
                "h_median": round(float(np.median(sizes[:, 1])), 3),
            },
            "area": {
                "mean": round(float(areas.mean()), 4),
                "median": round(float(np.median(areas)), 4),
            },
            "vertical_distribution": {
                "top_third": round(float((positions[:, 1] < 0.333).mean()), 3),
                "middle_third": round(float(((positions[:, 1] >= 0.333) & (positions[:, 1] < 0.667)).mean()), 3),
                "bottom_third": round(float((positions[:, 1] >= 0.667).mean()), 3),
            },
            "horizontal_distribution": {
                "left_third": round(float((positions[:, 0] < 0.333).mean()), 3),
                "center_third": round(float(((positions[:, 0] >= 0.333) & (positions[:, 0] < 0.667)).mean()), 3),
                "right_third": round(float((positions[:, 0] >= 0.667).mean()), 3),
            },
        }

    return stats


def cluster_layout_compositions(layout_compositions, n_clusters=8):
    """Cluster full layouts by their element arrangement to find archetypes."""
    # Encode each layout as a fixed-size feature vector
    # Features: for each category, encode (present?, cx, cy, w, h)
    feature_dim = len(CATEGORIES) * 5  # 5 categories × 5 features each
    vectors = []

    for layout in layout_compositions:
        vec = np.zeros(feature_dim)
        cat_elements = defaultdict(list)
        for elem in layout:
            cat_idx = list(CATEGORIES.values()).index(elem["category"])
            cat_elements[cat_idx].append(elem)

        for cat_idx in range(len(CATEGORIES)):
            base = cat_idx * 5
            if cat_elements[cat_idx]:
                elems = cat_elements[cat_idx]
                # Use the largest element of this category
                largest = max(elems, key=lambda e: e["area"])
                vec[base] = 1.0  # present
                vec[base + 1] = largest["cx"]
                vec[base + 2] = largest["cy"]
                vec[base + 3] = largest["w"]
                vec[base + 4] = largest["h"]

        vectors.append(vec)

    X = np.array(vectors)
    print(f"Clustering {len(X)} layouts into {n_clusters} archetypes...")

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X)

    # Analyze each cluster
    archetypes = []
    for cluster_id in range(n_clusters):
        mask = labels == cluster_id
        cluster_size = mask.sum()
        cluster_layouts = [layout_compositions[i] for i in range(len(layout_compositions)) if mask[i]]

        # Compute average element positions in this cluster
        cat_stats = {}
        for cat_idx, cat_name in CATEGORIES.items():
            positions = []
            sizes = []
            for layout in cluster_layouts:
                for elem in layout:
                    if elem["category"] == cat_name:
                        positions.append([elem["cx"], elem["cy"]])
                        sizes.append([elem["w"], elem["h"]])
                        break  # Largest only already encoded

            if positions:
                pos = np.array(positions)
                sz = np.array(sizes)
                cat_stats[cat_name] = {
                    "presence": round(len(positions) / len(cluster_layouts), 2),
                    "cx": round(float(pos[:, 0].mean()), 3),
                    "cy": round(float(pos[:, 1].mean()), 3),
                    "w": round(float(sz[:, 0].mean()), 3),
                    "h": round(float(sz[:, 1].mean()), 3),
                }

        # Name the archetype based on dominant element positions
        archetype_name = generate_archetype_name(cat_stats, cluster_id)

        archetypes.append({
            "id": f"cgl-archetype-{cluster_id + 1}",
            "name": archetype_name,
            "sample_count": int(cluster_size),
            "frequency": round(float(cluster_size / len(layout_compositions)), 3),
            "elements": cat_stats,
        })

    # Sort by frequency
    archetypes.sort(key=lambda a: a["frequency"], reverse=True)
    return archetypes


def generate_archetype_name(cat_stats, idx):
    """Generate a descriptive name based on element positions."""
    text_pos = cat_stats.get("text", {})
    logo_pos = cat_stats.get("logo", {})
    underlay_pos = cat_stats.get("underlay", {})

    name_parts = []

    # Text position
    if text_pos:
        cy = text_pos.get("cy", 0.5)
        if cy < 0.33:
            name_parts.append("text-top")
        elif cy > 0.67:
            name_parts.append("text-bottom")
        else:
            name_parts.append("text-center")

    # Logo position
    if logo_pos and logo_pos.get("presence", 0) > 0.3:
        cy = logo_pos.get("cy", 0.5)
        cx = logo_pos.get("cx", 0.5)
        if cy < 0.2:
            name_parts.append("logo-top")
        elif cy > 0.8:
            name_parts.append("logo-bottom")

    # Underlay presence
    if underlay_pos and underlay_pos.get("presence", 0) > 0.5:
        name_parts.append("with-underlay")

    if not name_parts:
        name_parts.append(f"pattern-{idx + 1}")

    return "-".join(name_parts)


def archetypes_to_blueprints(archetypes):
    """Convert cluster archetypes to Figmento layout blueprint YAMLs."""
    blueprints = []

    for arch in archetypes:
        if arch["frequency"] < 0.03:  # Skip very rare patterns (<3%)
            continue

        zones = []
        elements_list = []

        for cat_name, stats in arch["elements"].items():
            if stats["presence"] < 0.2:  # Skip rarely present elements
                continue

            cy = stats["cy"]
            h = stats["h"]
            y_start = max(0, cy - h / 2)
            y_end = min(1, cy + h / 2)

            zones.append({
                "name": cat_name.replace("_", "-"),
                "y_start_pct": round(y_start, 2),
                "y_end_pct": round(y_end, 2),
                "x_center_pct": round(stats["cx"], 2),
                "width_pct": round(stats["w"], 2),
                "elements": [{"role": cat_name, "presence": stats["presence"]}],
            })
            elements_list.append(cat_name)

        # Sort zones by y position
        zones.sort(key=lambda z: z["y_start_pct"])

        blueprint = {
            "id": arch["id"],
            "name": f"CGL Ad Pattern: {arch['name']}",
            "category": "ads",
            "subcategory": "e-commerce",
            "source": "CGL-Dataset V2 (60K poster analysis)",
            "sample_count": arch["sample_count"],
            "frequency": arch["frequency"],
            "mood": ["commercial", "promotional", "product"],
            "canvas_ratio": "513:750 (portrait, ~2:3)",
            "zones": zones,
            "anti_generic": [
                "Composition derived from 60K real e-commerce designs — use proportions, not exact positions",
                "Vary element sizes by ±15% for visual interest",
                "Text zones should avoid high-detail image areas",
            ],
            "memorable_element": "Product hero image filling the negative space between text elements",
            "whitespace_ratio": round(1.0 - sum(s.get("area", s["w"] * s["h"]) for s in arch["elements"].values() if s["presence"] > 0.2), 2),
        }

        blueprints.append(blueprint)

    return blueprints


def save_blueprints(blueprints):
    """Save blueprints as individual YAML files."""
    for bp in blueprints:
        filename = f"{bp['id']}.yaml"
        filepath = OUTPUT_DIR / filename
        with open(filepath, "w", encoding="utf-8") as f:
            yaml.dump(bp, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print(f"  Saved: {filepath}")


def save_statistics(stats, archetypes):
    """Save analysis statistics as a summary YAML."""
    summary = {
        "source": "CGL-Dataset V2 (creative-graphic-design/CGL-Dataset-v2)",
        "total_samples": 60548,
        "canvas_size": "513x750 pixels (portrait)",
        "categories": CATEGORIES,
        "category_statistics": stats,
        "layout_archetypes": archetypes,
    }

    filepath = OUTPUT_DIR / "cgl-analysis-summary.yaml"
    with open(filepath, "w", encoding="utf-8") as f:
        yaml.dump(summary, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    print(f"  Saved: {filepath}")


def main():
    print("=" * 60)
    print("CGL-Dataset V2 Mining Pipeline")
    print("=" * 60)

    # Step 1: Load
    ds = load_dataset()

    # Step 2: Extract
    print("\nExtracting element positions...")
    elements_by_category, layout_compositions = extract_elements(ds)
    for cat_id, elems in elements_by_category.items():
        print(f"  {CATEGORIES[cat_id]}: {len(elems)} elements")

    # Step 3: Analyze per-category statistics
    print("\nAnalyzing category positions...")
    stats = analyze_category_positions(elements_by_category)
    for cat_name, s in stats.items():
        pos = s["position"]
        vert = s["vertical_distribution"]
        print(f"  {cat_name}: center=({pos['cx_mean']:.2f}, {pos['cy_mean']:.2f}), "
              f"top={vert['top_third']:.0%} mid={vert['middle_third']:.0%} bot={vert['bottom_third']:.0%}")

    # Step 4: Cluster layouts
    print("\nClustering layout compositions...")
    archetypes = cluster_layout_compositions(layout_compositions, n_clusters=8)
    for arch in archetypes:
        print(f"  {arch['name']}: {arch['sample_count']} samples ({arch['frequency']:.1%})")

    # Step 5: Generate blueprints
    print("\nGenerating layout blueprints...")
    blueprints = archetypes_to_blueprints(archetypes)
    print(f"  Generated {len(blueprints)} blueprints")

    # Step 6: Save
    print("\nSaving output files...")
    save_blueprints(blueprints)
    save_statistics(stats, archetypes)

    print(f"\nDone! {len(blueprints)} new blueprints in {OUTPUT_DIR}")
    print("These are now available via get_layout_blueprint(category='ads')")


if __name__ == "__main__":
    main()
