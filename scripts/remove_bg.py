#!/usr/bin/env python3
"""
Remove background from a logo PNG.

Root cause of the old approach's failure:
  cv2.floodFill with neighbor-relative tolerance follows anti-aliased gradients
  (white → light-gray → logo edge), eventually eating into colored logo parts.

This approach instead:
  1. Hard HSV threshold: classify each pixel as "white-like" or "not" independently
     (no gradient-following possible).
  2. Connected-component analysis to find which white regions touch the image
     corners (= exterior background). Interior white (inside letter O, etc.) is
     also transparent — which is correct for background removal.
  3. 1px erosion removes the sub-pixel white halo left by anti-aliasing.
  4. Gaussian blur on alpha for a smooth edge.

Usage: python3 remove_bg.py <input_png> <output_png> [sat_thresh=30] [val_thresh=220]
"""
import sys
import cv2
import numpy as np
from PIL import Image


def remove_background(
    input_path: str,
    output_path: str,
    sat_thresh: int = 30,   # HSV S channel: below this = "white-like"
    val_thresh: int = 220,  # HSV V channel: above this = "white-like"
) -> None:
    img_bgr = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img_bgr is None:
        raise FileNotFoundError(f"Cannot read {input_path}")

    # Handle images that already have an alpha channel
    if img_bgr.shape[2] == 4:
        orig_alpha = img_bgr[:, :, 3]
        img_bgr = img_bgr[:, :, :3]
    else:
        orig_alpha = None

    h, w = img_bgr.shape[:2]

    # ── 1. Hard white classification (per-pixel, no gradient following) ──────
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    S = img_hsv[:, :, 1].astype(np.int32)
    V = img_hsv[:, :, 2].astype(np.int32)

    # A pixel is "white-like" if it has low saturation AND high brightness.
    # This rejects even light-purple or light-blue (they have S > 30).
    white_mask = ((S < sat_thresh) & (V > val_thresh)).astype(np.uint8)

    # ── 2. Connected components → identify exterior background ──────────────
    n_labels, labels = cv2.connectedComponents(white_mask, connectivity=8)

    # Labels that touch any image corner belong to the exterior background.
    corner_coords = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    bg_labels: set[int] = set()
    for cy, cx in corner_coords:
        lbl = int(labels[cy, cx])
        if lbl != 0:
            bg_labels.add(lbl)

    # Also include labels that touch the full image border (handles logos with
    # background that doesn't reach the exact corner pixel).
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[0, :] = True
    border_mask[-1, :] = True
    border_mask[:, 0] = True
    border_mask[:, -1] = True
    for lbl in np.unique(labels[border_mask]):
        if lbl != 0:
            bg_labels.add(int(lbl))

    # Build the background mask from those labels
    bg_mask = np.zeros((h, w), dtype=np.uint8)
    for lbl in bg_labels:
        bg_mask[labels == lbl] = 255

    # ── 3. Erode by 1px to remove sub-pixel white halo from anti-aliasing ───
    kernel = np.ones((2, 2), np.uint8)
    bg_mask = cv2.dilate(bg_mask, kernel, iterations=1)  # grow bg slightly

    # Alpha: 0 = background, 255 = foreground
    alpha = (255 - bg_mask).astype(np.uint8)

    # ── 4. Smooth the alpha edge ─────────────────────────────────────────────
    alpha_f = alpha.astype(np.float32)
    alpha_f = cv2.GaussianBlur(alpha_f, (3, 3), sigmaX=0.8)
    alpha = np.clip(alpha_f, 0, 255).astype(np.uint8)

    # Respect original alpha if present
    if orig_alpha is not None:
        alpha = np.minimum(alpha, orig_alpha)

    # ── 5. Save RGBA PNG ──────────────────────────────────────────────────────
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    result = np.dstack([img_rgb, alpha])
    Image.fromarray(result, "RGBA").save(output_path, "PNG")
    print("ok")


def main():
    if len(sys.argv) < 3:
        print("Usage: remove_bg.py <input_png> <output_png> [sat_thresh] [val_thresh]",
              file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    sat_thresh = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    val_thresh = int(sys.argv[4]) if len(sys.argv) > 4 else 220

    remove_background(input_path, output_path, sat_thresh, val_thresh)


if __name__ == "__main__":
    main()
