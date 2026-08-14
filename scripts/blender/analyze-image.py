r"""Programmatic image analysis for reference images (poor-man's vision).

Loads an image via Blender's bpy.data.images, downsamples it to a coarse
ASCII luminance map and a skin-tone map, and reports overall stats. This lets
the (non-vision) agent describe what a reference image contains.

Usage:
    blender --background --python analyze-image.py -- --image <path> [--cols 128]

Env:
    NX9_IMAGE  path to the image to analyze (alternative to --image)

Output (stdout):
    resolution, average RGB, skin fraction, skin bounding box, luminance ASCII,
    skin ASCII ('S' where skin fraction > 0.3, '.' otherwise), plus a short
    header line describing detected layout (e.g. "face at LEFT half").

Skin heuristic (plain, no ML): R>0.24, R>G, G>B, R-G>0.06, luminance>0.12.
"""
import argparse
import os
import sys

import bpy
import numpy as np


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default=os.environ.get("NX9_IMAGE", ""))
    parser.add_argument("--cols", type=int, default=128)
    parser.add_argument("--crop", default="",
                        help="normalized crop x0,y0,x1,y1 (top-down); e.g. 0.35,0.35,0.78,1.0")
    # Blender passes the whole CLI through; only args after "--" belong to us.
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)

    if not args.image or not os.path.isfile(args.image):
        print(f"ERROR: image not found: {args.image}")
        return 2

    img = bpy.data.images.load(args.image, check_existing=True)
    w, h = img.size
    print(f"image={args.image} size={w}x{h}")

    # pixels: RGBA floats, row-major, bottom-up (Blender convention).
    px = np.array(img.pixels, dtype=np.float32).reshape(h, w, 4)
    # flip vertically so row 0 = top of image (matches how humans view it)
    px = px[::-1, :, :]
    rgb = px[:, :, :3].copy()
    alpha = px[:, :, 3]
    # handle straight vs premultiplied: assume straight alpha if any a<1 with rgb>a
    if np.any((alpha < 1.0) & (rgb.max(axis=2) > alpha + 0.02)):
        # un-premultiply where needed
        safe = np.where(alpha > 0.01, alpha, 1.0)
        rgb = np.clip(rgb / safe[..., None], 0.0, 1.0)
        rgb = np.where((alpha > 0.01)[..., None], rgb, 0.0)

    avg = rgb.reshape(-1, 3).mean(axis=0)
    print(f"avg_rgb=({avg[0]:.3f},{avg[1]:.3f},{avg[2]:.3f})")

    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = (
        (r > 0.24) & (r > g) & (g > b) & ((r - g) > 0.06) & (lum > 0.12)
    )
    skin_frac = float(skin.mean())
    print(f"skin_fraction={skin_frac:.4f}")

    # skin bounding box (row,col) in top-down coords
    if skin_frac > 0.002:
        ys, xs = np.nonzero(skin)
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
        print(f"skin_bbox_topdown rows={y0}..{y1} cols={x0}..{x1} "
              f"(bbox_center=({(x0+x1)/2/w:.3f},{(y0+y1)/2/h:.3f}), "
              f"bbox_size=({(x1-x0)/w:.3f},{(y1-y0)/h:.3f}))")
        # layout guess: where is the skin mass horizontally?
        thirds = skin.sum(axis=0)
        half = w // 2
        left = float(thirds[:half].sum()) / max(1.0, float(skin.sum()))
        print(f"skin_mass_left={left:.2f} (0=all right, 1=all left)")
    else:
        print("skin_bbox_topdown=no-skin-region")

    RAMP = " .:-=+*#%@"
    cols = args.cols
    rows = max(4, int(round(cols * (h / w) * 0.5)))  # ASCII char aspect ~2:1
    sy = np.linspace(0, h, rows + 1).astype(int)
    sx = np.linspace(0, w, cols + 1).astype(int)

    if args.crop:
        x0, y0, x1, y1 = (float(v) for v in args.crop.split(","))
        # normalized, top-down -> pixel ranges (row 0 = top)
        r0, r1 = int(y0 * h), max(int(y1 * h), int(y0 * h) + 1)
        c0, c1 = int(x0 * w), max(int(x1 * w), int(x0 * w) + 1)
        lum = lum[r0:r1, c0:c1]
        skin = skin[r0:r1, c0:c1]
        h, w = lum.shape
        rows = max(4, int(round(cols * (h / w) * 0.5)))
        sy = np.linspace(0, h, rows + 1).astype(int)
        sx = np.linspace(0, w, cols + 1).astype(int)
        print(f"crop rows={r0}..{r1} cols={c0}..{c1} -> {w}x{h}")

    print(f"\n--- luminance ASCII ({cols}x{rows}) ---")
    out = []
    for i in range(rows):
        row = []
        for j in range(cols):
            cell = lum[sy[i]:sy[i + 1], sx[j]:sx[j + 1]]
            v = float(cell.mean())
            row.append(RAMP[min(9, int(v * 10))])
        out.append("".join(row))
    print("\n".join(out))

    print(f"\n--- skin ASCII ({cols}x{rows}) ---")
    out2 = []
    for i in range(rows):
        row = []
        for j in range(cols):
            cell = skin[sy[i]:sy[i + 1], sx[j]:sx[j + 1]]
            f = float(cell.mean())
            row.append("S" if f > 0.3 else ("+" if f > 0.12 else "."))
        out2.append("".join(row))
    print("\n".join(out2))

    print("\nDONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
