import bpy, json, math
from mathutils import Vector

def to_gltf(co):
    return Vector((co.x, co.z, -co.y))

head = bpy.data.objects["头部皮肤"]
torso = bpy.data.objects["躯干皮肤"]

def boundary_verts(obj):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    out = []
    for e in bm.edges:
        if len(e.link_faces) == 1:
            for v in e.verts:
                out.append(to_gltf(v.co))
    bm.free()
    # unique by rounded coord
    uniq = {}
    for p in out:
        uniq[(round(p.x,4), round(p.y,4), round(p.z,4))] = p
    return list(uniq.values())

hb = boundary_verts(head)
tb = boundary_verts(torso)
# neck-ish: near mid height
def neckish(pts):
    ys = sorted(p.y for p in pts)
    return [p for p in pts if abs(p.y - (ys[0]+ys[-1])*0.5) < 0.25 or p.y < ys[0]+0.08 or p.y > ys[-1]-0.08]

# head boundary lowest band; torso boundary highest band
h_bot = [p for p in hb if p.y <= sorted(p.y for p in hb)[max(0,int(len(hb)*0.15))]]
# simpler:
hymin = min(p.y for p in hb); tymax = max(p.y for p in tb)
h_rim = [p for p in hb if p.y < hymin + 0.025]
t_rim = [p for p in tb if p.y > tymax - 0.025]
def stats(name, pts):
    if not pts:
        return {name: None}
    rs = [math.sqrt(p.x*p.x+p.z*p.z) for p in pts]
    return {name: {"n": len(pts), "y": [round(min(p.y for p in pts)*1000,1), round(max(p.y for p in pts)*1000,1)],
                   "r_mm": [round(min(rs)*1000,1), round(sum(rs)/len(rs)*1000,1), round(max(rs)*1000,1)]}}
out = {}
out.update(stats("head_rim", h_rim))
out.update(stats("torso_rim", t_rim))
out["gap_mm"] = round((min(p.y for p in h_rim) - max(p.y for p in t_rim))*1000, 2) if h_rim and t_rim else None
# radial delta at matching angles
import collections
def bins(pts, n=24):
    b = [[] for _ in range(n)]
    for p in pts:
        ang = math.atan2(p.z, p.x)
        bi = int((ang+math.pi)/(2*math.pi)*n) % n
        b[bi].append(math.sqrt(p.x*p.x+p.z*p.z))
    return [sum(x)/len(x) if x else None for x in b]
hb2, tb2 = bins(h_rim), bins(t_rim)
deltas = []
for a,b in zip(hb2, tb2):
    if a is not None and b is not None:
        deltas.append((a-b)*1000)
out["r_delta_mm"] = {"min": round(min(deltas),1), "max": round(max(deltas),1), "mean": round(sum(deltas)/len(deltas),1)} if deltas else None
print("SEAL", json.dumps(out, ensure_ascii=False))
