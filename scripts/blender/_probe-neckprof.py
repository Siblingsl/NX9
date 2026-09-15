import bpy, json, math
from mathutils import Vector
obj = bpy.data.objects.get("全身皮肤")
assert obj
# Blender Z-up: height=z
rows = []
for zc in range(140, 165):
    z0 = zc/100.0
    pts = [v.co for v in obj.data.vertices if abs(v.co.z - z0) < 0.008]
    if len(pts) < 8:
        continue
    # outer silhouette radius in XY
    rs = sorted(math.sqrt(p.x*p.x+p.y*p.y) for p in pts)
    rmax = rs[-1]; rmed = rs[len(rs)//2]
    rows.append({"z_cm": zc, "n": len(pts), "rmax_cm": round(rmax*100,2), "rmed_cm": round(rmed*100,2)})
print("NECKPROF", json.dumps(rows, ensure_ascii=False))
# count separate objects visible
vis = [(o.name, o.hide_get(), o.hide_render) for o in bpy.data.objects if o.type=="MESH"]
print("VIS", json.dumps(vis, ensure_ascii=False))
