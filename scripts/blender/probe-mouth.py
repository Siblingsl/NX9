r"""Locate the head skin boundary edges (are the mouth/nostrils open?)."""
import os
import sys

import bpy

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
blend = os.environ.get(
    "NX9_BLEND", os.path.join(REPO, "output", "normal-human", "mpfb-preview.blend"))
bpy.ops.wm.open_mainfile(filepath=blend)

for obj in bpy.data.objects:
    if obj.type != "MESH" or "头部" not in obj.name:
        continue
    verts = obj.data.vertices
    polys = obj.data.polygons
    edge_faces = {}
    for fi, p in enumerate(polys):
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(fi)
    boundary = [ek for ek, fis in edge_faces.items() if len(fis) == 1]
    print(f"{obj.name}: boundary edges = {len(boundary)}")
    # per-region
    regions = {
        "neck rim (y<1.46)": lambda c: c.y < 1.46,
        "jaw/chin (1.46-1.50)": lambda c: 1.46 <= c.y < 1.50,
        "mouth (1.50-1.56, z>0.12)": lambda c: 1.50 <= c.y < 1.56 and c.z > 0.12,
        "nose (1.56-1.60, z>0.14)": lambda c: 1.56 <= c.y < 1.60 and c.z > 0.14,
        "rest": lambda c: True,
    }
    for rname, fn in regions.items():
        cnt = 0
        span = []
        for ek in boundary:
            c = (verts[ek[0]].co + verts[ek[1]].co) * 0.5
            if fn(c):
                cnt += 1
                if len(span) < 5:
                    span.append((round(c.x, 3), round(c.y, 3), round(c.z, 3)))
        print(f"  {rname}: {cnt}  e.g. {span}")
    # mouth hole check: verts forming the mouth rim (y 1.52-1.56, z 0.13-0.17)
    rim = [v for v in verts if 1.52 <= v.co.y <= 1.56 and 0.13 <= v.co.z <= 0.17
           and abs(v.co.x) < 0.04]
    print(f"  mouth-region verts: {len(rim)}")
    if rim:
        xs = sorted({round(v.co.x, 3) for v in rim})
        ys = sorted({round(v.co.y, 3) for v in rim})
        print(f"    x range: {xs[0]}..{xs[-1]}  y range: {ys[0]}..{ys[-1]}")
print("DONE")
