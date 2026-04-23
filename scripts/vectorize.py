#!/usr/bin/env python3
"""
High-quality logo PNG → SVG vectorizer.

Key quality improvements over naive approach:
- scipy B-spline fitting → smooth cubic Bezier (C) commands instead of polygons
- RETR_TREE + fill-rule="evenodd" → letter holes (O, e, g) are punched out correctly
- More colors + lower min-area → small details preserved
- 2× upscale before tracing → finer edge capture

Usage: python3 vectorize.py <input_png> <output_svg> [n_colors=12]
"""
import sys
import cv2
import numpy as np
from scipy.interpolate import splprep, splev


# ── Bezier path from contour ────────────────────────────────────────────────

def contour_to_bezier_path(contour: np.ndarray, smoothing: float = 0.6) -> str:
    """
    Fit a closed periodic B-spline to the contour, then emit SVG cubic Bezier
    (C) commands. The 1/3-rule converts spline tangents into Bezier control points.
    Falls back to a simple polyline for very short contours.
    """
    pts = contour.reshape(-1, 2).astype(float)
    n = len(pts)
    if n < 4:
        return _polyline_path(pts)

    # Subsample if very dense (speeds up splprep, quality unchanged)
    if n > 600:
        step = n // 300
        pts = pts[::step]
        n = len(pts)

    # Append first point to close the curve
    x = np.append(pts[:, 0], pts[0, 0])
    y = np.append(pts[:, 1], pts[0, 1])

    # Smoothing: smaller → tighter to pixels, larger → smoother
    s = smoothing * n

    try:
        tck, _ = splprep([x, y], s=s, per=True, k=3, quiet=True)
    except Exception:
        return _polyline_path(pts)

    # Evaluate spline + derivative at output sample count
    n_out = max(n * 2, 60)
    t_vals = np.linspace(0, 1, n_out, endpoint=False)
    xs, ys = splev(t_vals, tck)
    dxs, dys = splev(t_vals, tck, der=1)

    # 1/3-rule: control point offset = tangent * (segment_dt / 3)
    dt = 1.0 / n_out

    parts = [f"M {xs[0]:.2f} {ys[0]:.2f}"]
    for i in range(n_out):
        j = (i + 1) % n_out
        cp1x = xs[i] + dxs[i] * dt / 3
        cp1y = ys[i] + dys[i] * dt / 3
        cp2x = xs[j] - dxs[j] * dt / 3
        cp2y = ys[j] - dys[j] * dt / 3
        parts.append(
            f"C {cp1x:.2f},{cp1y:.2f} {cp2x:.2f},{cp2y:.2f} {xs[j]:.2f},{ys[j]:.2f}"
        )
    parts.append("Z")
    return " ".join(parts)


def _polyline_path(pts: np.ndarray) -> str:
    d = f"M {pts[0,0]:.1f} {pts[0,1]:.1f}"
    for p in pts[1:]:
        d += f" L {p[0]:.1f} {p[1]:.1f}"
    return d + " Z"


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: vectorize.py <input_png> <output_svg> [n_colors]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    n_colors  = int(sys.argv[3])   if len(sys.argv) > 3 else 12
    min_area  = int(sys.argv[4])   if len(sys.argv) > 4 else 8
    smoothing = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Cannot read {input_path}", file=sys.stderr)
        sys.exit(1)

    h, w = img.shape[:2]

    # ── 1. Composite transparency onto white ─────────────────────────────────
    if img.shape[2] == 4:
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        rgb = img[:, :, :3].astype(np.float32)
        img_bgr = (rgb * alpha + 255.0 * (1 - alpha)).astype(np.uint8)
    else:
        img_bgr = img[:, :, :3]

    # ── 2. 2× upscale for better edge capture ───────────────────────────────
    scale = 2
    img_big = cv2.resize(img_bgr, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
    img_big = cv2.bilateralFilter(img_big, d=5, sigmaColor=30, sigmaSpace=30)
    bh, bw = img_big.shape[:2]

    # ── 3. K-means color quantization ────────────────────────────────────────
    pixels = img_big.reshape(-1, 3).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2)
    _, labels, centers = cv2.kmeans(
        pixels, n_colors, None, criteria, 15, cv2.KMEANS_PP_CENTERS
    )
    centers = centers.astype(np.uint8)
    labels = labels.reshape(bh, bw).astype(np.int32)

    # ── 4. Trace each color layer with RETR_TREE (hole-aware) ────────────────
    MIN_AREA_PX = min_area  # in original-space pixels; small → preserve details

    # svg_entries: list of (largest_area, svg_element_string)
    svg_entries: list[tuple[float, str]] = []

    for color_idx in range(n_colors):
        b_v, g_v, r_v = (
            int(centers[color_idx][0]),
            int(centers[color_idx][1]),
            int(centers[color_idx][2]),
        )

        # Skip near-white (background)
        if r_v > 235 and g_v > 235 and b_v > 235:
            continue

        mask = (labels == color_idx).astype(np.uint8) * 255

        # Morphological cleanup: close tiny specks, fill micro-gaps
        k3 = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=1)

        # RETR_TREE gives full hierarchy so we can handle holes via evenodd
        contours, hierarchy = cv2.findContours(
            mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE
        )

        if hierarchy is None or len(contours) == 0:
            continue

        # Build a single compound <path> for this color.
        # All contours (outer boundaries AND holes) go into one path.
        # SVG fill-rule="evenodd" automatically punches out holes.
        compound_parts: list[str] = []
        largest_area = 0.0

        for contour in contours:
            real_area = cv2.contourArea(contour) / (scale * scale)
            if real_area < MIN_AREA_PX:
                continue

            # Scale back to original coordinate space
            contour_orig = (contour.astype(float) / scale)
            path_d = contour_to_bezier_path(contour_orig, smoothing=smoothing)
            if path_d:
                compound_parts.append(path_d)
                if real_area > largest_area:
                    largest_area = real_area

        if not compound_parts:
            continue

        fill = f"#{r_v:02x}{g_v:02x}{b_v:02x}"
        d_attr = " ".join(compound_parts)
        svg_entries.append((
            largest_area,
            f'  <path d="{d_attr}" fill="{fill}" fill-rule="evenodd" stroke="none"/>',
        ))

    # Paint largest areas first (big background shapes behind fine details)
    svg_entries.sort(key=lambda x: x[0], reverse=True)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        + "\n".join(el for _, el in svg_entries)
        + "\n</svg>\n"
    )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg)

    print("ok")


if __name__ == "__main__":
    main()
