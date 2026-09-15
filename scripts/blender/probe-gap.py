r"""Probe the torso front: is there a real gap down the centreline?
Sample vertex x values at several heights; find the widest x-gap."""
import os
import sys

import bpy

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
blend = os.environ.get(
    "NX9_BLEND", os.path.join(REPO, "output", "normal-human", "mpfb-preview.blend"))
bpy.ops.wm.open_mainfile(filepath=blend)

for obj in bpy.data.objects:
    if obj.type != "MESH" or "躯干" not in obj.name:
        continue
    verts = obj.data.vertices
    # heights in Blender frame: chest ~1.2, waist ~1.05, hips ~0.95
    for h in (1.28, 1.20, 1.12, 1.05, 0.98, 0.90):
        xs = sorted(v.co.x for v in verts if abs(v.co.z - h) < 0.04 and v.co.y < -0.02)
        if len(xs) < 10:
            print(f"z={h}: only {len(xs)} verts")
            continue
        # widest gap between consecutive verts
        gaps = [(xs[i + 1] - xs[i], xs[i], xs[i + 1]) for i in range(len(xs) - 1)]
        gaps.sort(reverse=True)
        print(f"z={h}: n={len(xs)} min_x={xs[0]:.4f} max_x={xs[-1]:.4f} "
              f"top3 gaps: " + "; ".join(f"{g[0]*1000:.2f}mm at x {g[1]:.4f}..{g[2]:.4f}" for g in gaps[:3]))
print("DONE")
