r"""Probe face winding / normal orientation of the head skin + torso."""
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
blend = os.environ.get(
    "NX9_BLEND", os.path.join(REPO, "output", "mpfb-preview", "mpfb-preview.blend"))
bpy.ops.wm.open_mainfile(filepath=blend)


def probe(obj, label, regions):
    polys = obj.data.polygons
    verts = obj.data.vertices
    for rname, filter_fn in regions:
        ns = []
        for p in polys:
            c = p.center
            if not filter_fn(c):
                continue
            ns.append(p.normal)
        if not ns:
            print(f"{label} {rname}: no faces")
            continue
        avg = sum(ns, Vector((0.0, 0.0, 0.0))) / len(ns)
        print(f"{label} {rname}: n_faces={len(ns)} avgNormal=({avg.x:.3f},{avg.y:.3f},{avg.z:.3f}) "
              f"|avg|={avg.length:.3f}")


for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    if obj.name == "头部皮肤":
        probe(obj, "head", [
            ("leftCheek", lambda c: c.x < -0.05 and 1.52 <= c.z <= 1.62 and c.y < -0.05),
            ("rightCheek", lambda c: c.x > 0.05 and 1.52 <= c.z <= 1.62 and c.y < -0.05),
            ("foreheadL", lambda c: c.x < -0.03 and 1.66 <= c.z <= 1.70 and c.y < -0.05),
            ("foreheadR", lambda c: c.x > 0.03 and 1.66 <= c.z <= 1.70 and c.y < -0.05),
            ("crown", lambda c: 1.70 <= c.z <= 1.74 and abs(c.y) < 0.05),
            ("backHead", lambda c: c.y > 0.03 and 1.55 <= c.z <= 1.65),
        ])
    elif obj.name == "躯干皮肤":
        probe(obj, "torso", [
            ("chestL", lambda c: c.x < -0.10 and 1.15 <= c.z <= 1.25 and c.y < -0.05),
            ("chestR", lambda c: c.x > 0.10 and 1.15 <= c.z <= 1.25 and c.y < -0.05),
            ("back", lambda c: c.y > 0.05 and 1.15 <= c.z <= 1.25),
            ("hipR", lambda c: c.x > 0.10 and 0.95 <= c.z <= 1.05),
        ])
print("DONE")
