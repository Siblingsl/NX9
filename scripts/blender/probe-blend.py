r"""Probe object transforms + AABBs of a NX9 preview blend (Blender frame)."""
import os
import sys

import bpy

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
blend = os.environ.get(
    "NX9_BLEND", os.path.join(REPO, "output", "mpfb-preview", "mpfb-preview.blend"))
bpy.ops.wm.open_mainfile(filepath=blend)

for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    if obj.type != "MESH":
        continue
    vs = obj.data.vertices
    lo = [min(v.co[i] for v in vs) for i in range(3)]
    hi = [max(v.co[i] for v in vs) for i in range(3)]
    print(f"{obj.name}: loc={tuple(round(x, 4) for x in obj.location)} "
          f"scale={tuple(round(x, 4) for x in obj.scale)} "
          f"dims(world)={tuple(round(x, 3) for x in obj.dimensions)} "
          f"meshAABB=({tuple(round(x, 3) for x in lo)}..{tuple(round(x, 3) for x in hi)}) "
          f"verts={len(vs)}")
print("scene.render.resolution:", bpy.context.scene.render.resolution_x,
      "x", bpy.context.scene.render.resolution_y,
      "pct:", bpy.context.scene.render.resolution_percentage)
print("DONE")
