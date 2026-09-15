r"""Probe the torso centreline: x positions, coincident pairs, boundary rims."""
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
    polys = obj.data.polygons
    # centreline verts
    cl = [v for v in verts if abs(v.co.x) < 0.02]
    print(f"{obj.name}: verts={len(verts)} faces={len(polys)}")
    xs = sorted({round(v.co.x, 4) for v in cl})
    print(f"  centreline |x|<0.02: {len(cl)} verts, x values: {xs[:20]}")
    # coincident pairs near x=0 (distance < 2mm)
    near = [v for v in verts if abs(v.co.x) < 0.004]
    print(f"  |x|<0.004: {len(near)} verts, x values: {sorted({round(v.co.x, 5) for v in near})[:12]}")
    # boundary edges: count + y-band
    edge_faces = {}
    for fi, p in enumerate(polys):
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(fi)
    boundary = [ek for ek, fis in edge_faces.items() if len(fis) == 1]
    print(f"  boundary edges: {len(boundary)}")
    bands = {}
    for ek in boundary:
        mid = (verts[ek[0]].co + verts[ek[1]].co) * 0.5
        bands.setdefault(round(mid.y * 20) / 20.0, 0)
        bands[round(mid.y * 20) / 20.0] += 1
    print(f"  boundary y-bands: {dict(sorted(bands.items()))}")
print("DONE")
