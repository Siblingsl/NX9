r"""Import the MPFB CC0 base.obj and build production-grade preview GLBs.

Asset facts (verified empirically):
    base.obj is Y-UP with the character standing along +Y (crown at +Y,
    feet at -Y, 1 unit = 0.1 m -> 16.66 units = 1.666 m), facing +Z,
    relaxed A-pose. Helper parts live in separate vertex ranges:
        body           0..13379   (skin)
        helper-l-eye   14598..14669
        helper-r-eye   14670..14741
        helper-hair    18722..19149
    The basemesh_vertex_groups.json "joint-*" entries index the JointCubes
    helper in a DIFFERENT frame -- do not use them for anatomy.

Pipeline:
1. Import, scale 0.1, feet -> y=0 (GLTF meters frame).
2. Split by vertex range: skin / eyeL / eyeR / hair; shade-smooth all.
3. Neck cut on the skin (cross-section profile scan, narrowest x+z slice
   below the chin); cap the neck hole; subsurf level 1 on the head skin.
4. Materials: Skin / Sclera / Iris / Pupil / Hair (Principled BSDF base
   color + roughness -> glTF baseColorFactor).
5. Procedural iris+pupil disks on both eyeballs (eyeballs are plain white
   spheres in the CC0 asset).
6. Rotate everything to Blender Z-up (glTF exporter bakes R_CONV back, so
   the GLB lands exactly in the GLTF frame: height +Y, face +Z).
7. Export body GLB (skin+hair) and head GLB (head skin + eyes + iris).

Usage:
    blender --background --python import-mpfb-base.py
Env:
    NX9_ASSETS_DIR   dir with base.obj + basemesh_vertex_groups.json
    NX9_OUT_DIR      dir for GLBs + report (default output/mpfb-preview)
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCALE = 0.1  # MakeHuman units are 1/10 m


def load_vgroups(path):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    out = {}
    for name, ranges in data.items():
        idx = []
        for lo, hi in ranges:
            idx.extend(range(lo, hi + 1))
        out[name] = idx
    return out


def make_mat(name, color, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


def split_keep(src_obj, keep_set):
    """Return a new mesh object containing only the vertices in keep_set."""
    new = src_obj.copy()
    new.data = src_obj.data.copy()
    new.name = src_obj.name + "_split"
    bpy.context.collection.objects.link(new)
    sel = [i in keep_set for i in range(len(new.data.vertices))]
    new.data.vertices.foreach_set("select", sel)
    new.data.update()
    bpy.ops.object.select_all(action="DESELECT")
    new.select_set(True)
    bpy.context.view_layer.objects.active = new
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="INVERT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    return new


def shade_smooth(obj):
    polys = obj.data.polygons
    polys.foreach_set("use_smooth", [True] * len(polys))
    obj.data.update()


def add_disk(name, center, normal, radius, mat):
    bpy.ops.mesh.primitive_circle_add(
        vertices=28, radius=radius, fill_type="NGON", location=tuple(center)
    )
    disc = bpy.context.active_object
    disc.name = name
    rot = Vector((0.0, 0.0, 1.0)).rotation_difference(normal)
    disc.rotation_euler = rot.to_euler()
    disc.data.materials.clear()
    disc.data.materials.append(mat)
    return disc


def cap_hole(obj):
    """Fill the boundary loop(s) of obj with a single face each."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    try:
        bpy.ops.mesh.select_non_manifold(
            extend=False, use_boundary=True, use_multi_face=False,
            use_non_contiguous=False, use_vertices=False,
        )
    except TypeError:
        # 5.x may have changed the signature; fall back to vertex-based
        bpy.ops.mesh.select_non_manifold(extend=False)
    bpy.ops.mesh.edge_face_add()
    bpy.ops.object.mode_set(mode="OBJECT")


# ── fine-detail sculpt strokes (GLTF frame: +Y up, face +Z) ────────────────
# amount > 0 pushes the surface outward from the stroke center, < 0 pulls it
# inward (groove). Values are metres; all strokes are mm-scale.
# Neutral base-model set: brow ridge, gentle nasolabial, philtrum, lip
# corners, cheekbone, upper/lower lid definition. No socket deepening, no
# jaw/chinned tightening, no alar creases (spec: 中性基础结构).
DEFAULT_STROKES = {
    "strokes": [
        {"type": "sphere", "center": [0.0, 1.602, 0.120], "radius": 0.050, "amount": 0.0030},    # brow ridge (subtle)
        {"type": "sphere", "center": [-0.038, 1.525, 0.132], "radius": 0.016, "amount": -0.0012},  # nasolabial L
        {"type": "sphere", "center": [0.038, 1.525, 0.132], "radius": 0.016, "amount": -0.0012},   # nasolabial R
        {"type": "sphere", "center": [0.0, 1.505, 0.140], "radius": 0.009, "amount": -0.0010},     # philtrum
        {"type": "sphere", "center": [-0.021, 1.493, 0.127], "radius": 0.010, "amount": -0.0012},  # lip corner L
        {"type": "sphere", "center": [0.021, 1.493, 0.127], "radius": 0.010, "amount": -0.0012},   # lip corner R
        {"type": "sphere", "center": [-0.056, 1.545, 0.100], "radius": 0.020, "amount": 0.0015},   # cheekbone L
        {"type": "sphere", "center": [0.056, 1.545, 0.100], "radius": 0.020, "amount": 0.0015},    # cheekbone R
        {"type": "sphere", "center": [-0.024, 1.587, 0.118], "radius": 0.013, "amount": 0.0009},   # upper lid L
        {"type": "sphere", "center": [0.024, 1.587, 0.118], "radius": 0.013, "amount": 0.0009},    # upper lid R
        {"type": "sphere", "center": [-0.024, 1.560, 0.111], "radius": 0.013, "amount": 0.0006},   # lower lid L
        {"type": "sphere", "center": [0.024, 1.560, 0.111], "radius": 0.013, "amount": 0.0006},    # lower lid R
    ]
}


def apply_strokes(obj, strokes):
    """Displace vertices (GLTF frame) with radial falloff strokes."""
    if not strokes:
        return 0
    moved = 0
    for v in obj.data.vertices:
        p = v.co
        for s in strokes:
            if s.get("type") != "sphere":
                continue
            c = Vector(s["center"])
            d = (p - c).length
            r = s["radius"]
            if d >= r or d < 1e-9:
                continue
            f = (1.0 - (d / r) ** 2) ** 2  # smooth falloff
            p += (p - c) / d * s["amount"] * f
            moved += 1
    obj.data.update()
    return moved


# ── proportion / feature deforms (GLTF frame: +Y up, face +Z) ─────────────
# Spec: neutral base model -- head slightly larger, face wider, softer round
# jaw & chin, fuller lips, defined lids, slight brow ridge, stronger nose,
# thicker neck, narrower shoulders, natural crown.
# Each spec: type 'gauss' (anisotropic gaussian falloff about a center) or
# 'ramp' (smoothstep ramp along +Y, masked by gauss in x/z); 'factor' scales
# the given axes about the center, 'amount' adds a constant offset along the
# axes. All values in metres.
DEFORM_SPECS = [
    # -- overall proportions --
    {"type": "ramp",  "axis": ["x", "y", "z"], "factor": 1.06, "y0": 1.445, "y1": 1.68,
     "mask": {"sigma": (0.30, 0.30)}, "note": "head slightly larger (ramp from neck)"},
    {"type": "gauss", "axis": "x", "factor": 1.05, "center": (0.0, 1.55, 0.12),
     "sigma": (0.30, 0.10, 0.065), "note": "face width +5%"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 0.98, "center": (0.0, 1.38, 0.10),
     "sigma": (0.30, 0.032, 0.06), "note": "shoulders slightly narrower + shallower"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.08, "center": (0.0, 1.44, 0.05),
     "sigma": (0.25, 0.030, 0.25), "note": "neck thicker"},
    {"type": "gauss", "axis": "z", "amount": 0.0012, "center": (0.0, 1.466, 0.095),
     "sigma": (0.022, 0.010, 0.035), "note": "under-jaw fill (head-neck blend)"},
    # -- jaw & chin --
    {"type": "gauss", "axis": "x", "factor": 1.10, "center": (0.0, 1.457, 0.124),
     "sigma": (0.022, 0.020, 0.030), "note": "chin wider"},
    {"type": "gauss", "axis": "z", "amount": 0.0012, "center": (0.0, 1.457, 0.124),
     "sigma": (0.022, 0.020, 0.030), "note": "chin tip forward (rounder)"},
    {"type": "gauss", "axis": "x", "factor": 1.04, "center": (0.0, 1.472, 0.105),
     "sigma": (0.035, 0.013, 0.035), "note": "jawline band softened/widened"},
    # -- mouth --
    {"type": "gauss", "axis": "z", "amount": 0.0018, "center": (0.0, 1.504, 0.135),
     "sigma": (0.028, 0.011, 0.020), "note": "lip thickness +1.8mm"},
    {"type": "gauss", "axis": "x", "factor": 1.04, "center": (0.0, 1.505, 0.128),
     "sigma": (0.045, 0.010, 0.020), "note": "mouth width +4%"},
    # -- nose --
    {"type": "gauss", "axis": "z", "amount": 0.0008, "center": (0.0, 1.548, 0.150),
     "sigma": (0.009, 0.018, 0.030), "note": "nose bridge +0.8mm"},
    {"type": "gauss", "axis": "x", "factor": 1.05, "center": (0.0, 1.527, 0.160),
     "sigma": (0.012, 0.011, 0.030), "note": "nose tip wider (not pointed)"},
    {"type": "gauss", "axis": "z", "amount": 0.0006, "center": (0.0, 1.527, 0.160),
     "sigma": (0.012, 0.011, 0.030), "note": "nose tip +0.6mm"},
    # -- crown --
    {"type": "gauss", "axis": "y", "factor": 0.985, "center": (0.0, 1.675, 0.09),
     "sigma": (0.20, 0.020, 0.05), "note": "crown slightly less balloon-like"},
]


def _smoothstep01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def apply_deforms(obj, specs):
    """Apply the proportion specs to obj (GLTF frame). Returns op counts."""
    for spec in specs:
        axes = spec["axis"]
        if not isinstance(axes, (tuple, list)):
            axes = (axes,)
        factor = spec.get("factor")
        amount = spec.get("amount")
        if spec["type"] == "ramp":
            y0, y1 = spec["y0"], spec["y1"]
            mask = spec.get("mask", {})
            ms = mask.get("sigma", (0.30, 0.30))
            mc = mask.get("center", (0.0, 0.0))
            for v in obj.data.vertices:
                f = _smoothstep01((v.co.y - y0) / (y1 - y0))
                if f <= 0.01:
                    continue
                dx = (v.co.x - mc[0]) / ms[0]
                dz = (v.co.z - mc[1]) / ms[1]
                f *= math.exp(-2.5 * (dx * dx + dz * dz))
                if f <= 0.01:
                    continue
                for ax in axes:
                    if ax == "x":
                        v.co.x += (factor - 1.0) * v.co.x * f if factor else amount * f
                    elif ax == "y":
                        v.co.y += (factor - 1.0) * (v.co.y - y0) * f if factor else amount * f
                    elif ax == "z":
                        v.co.z += (factor - 1.0) * v.co.z * f if factor else amount * f
        else:  # gauss
            c = Vector(spec["center"])
            sx, sy, sz = spec["sigma"]
            for v in obj.data.vertices:
                dx = (v.co.x - c.x) / sx
                dy = (v.co.y - c.y) / sy
                dz = (v.co.z - c.z) / sz
                f = math.exp(-2.5 * (dx * dx + dy * dy + dz * dz))
                if f <= 0.01:
                    continue
                for ax in axes:
                    if ax == "x":
                        if factor is not None:
                            v.co.x = c.x + (v.co.x - c.x) * (1.0 + (factor - 1.0) * f)
                        else:
                            v.co.x += amount * f
                    elif ax == "y":
                        if factor is not None:
                            v.co.y = c.y + (v.co.y - c.y) * (1.0 + (factor - 1.0) * f)
                        else:
                            v.co.y += amount * f
                    elif ax == "z":
                        if factor is not None:
                            v.co.z = c.z + (v.co.z - c.z) * (1.0 + (factor - 1.0) * f)
                        else:
                            v.co.z += amount * f
    obj.data.update()


def enforce_symmetry(obj, plane_eps=0.002, pair_eps=0.004):
    """Strict left-right symmetry: snap centre verts to x=0, mirror-average
    off-centre verts via nearest-neighbour pairing on reflected coords."""
    from mathutils.kdtree import KDTree
    verts = obj.data.vertices
    kd = KDTree(len(verts))
    for i, v in enumerate(verts):
        kd.insert(v.co, i)
    kd.balance()
    done = set()
    snapped = paired = 0
    for i, v in enumerate(verts):
        if i in done:
            continue
        if abs(v.co.x) < plane_eps:
            v.co.x = 0.0
            done.add(i)
            snapped += 1
            continue
        if v.co.x <= 0.0:
            continue
        co, j, dist = kd.find((-v.co.x, v.co.y, v.co.z))
        if j is None or j in done or dist > pair_eps:
            continue
        # Averages A with the MIRROR of B (B's mirrored coords), then mirrors
        # the result back onto B -- plain averaging would flatten x to 0.
        avg = (v.co + Vector((-verts[j].co.x, verts[j].co.y, verts[j].co.z))) * 0.5
        v.co = avg.copy()
        verts[j].co = Vector((-avg.x, avg.y, avg.z))
        done.add(i)
        done.add(j)
        paired += 1
    obj.data.update()
    return snapped, paired


def normalize_eyes(eye_l, eye_r):
    """Eyes strictly identical: equal size, centres mirrored exactly.
    Returns (|x|, radius, y, z) of the normalized pair (GLTF frame)."""
    def fit(obj):
        vs = [v.co for v in obj.data.vertices]
        c = Vector((0.0, 0.0, 0.0))
        for v in vs:
            c += v
        c /= len(vs)
        r = sum((v - c).length for v in vs) / len(vs)
        return c, r

    cl, rl = fit(eye_l)
    cr, rr = fit(eye_r)
    cx = (abs(cl.x) + abs(cr.x)) * 0.5
    cy = (cl.y + cr.y) * 0.5
    cz = (cl.z + cr.z) * 0.5
    r = (rl + rr) * 0.5
    for v in eye_l.data.vertices:
        p = v.co
        v.co = Vector((cx, cy, cz)) + (Vector((p.x - cl.x, p.y - cl.y, p.z - cl.z)) * (r / rl))
    for v in eye_r.data.vertices:
        p = v.co
        v.co = Vector((-cx, cy, cz)) + (Vector((p.x - cr.x, p.y - cr.y, p.z - cr.z)) * (r / rr))
    eye_l.data.update()
    eye_r.data.update()
    return cx, r, cy, cz


def main() -> int:
    assets = os.environ.get("NX9_ASSETS_DIR", os.path.join(REPO, "output", "mpfb-assets"))
    outdir = os.environ.get("NX9_OUT_DIR", os.path.join(REPO, "output", "mpfb-preview"))
    os.makedirs(outdir, exist_ok=True)
    report = {}

    obj_path = os.path.join(assets, "base.obj")
    vg_path = os.path.join(assets, "basemesh_vertex_groups.json")

    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.wm.obj_import(
        filepath=obj_path,
        use_split_objects=False,
        use_split_groups=False,
        up_axis="Z",
        forward_axis="Y",
        validate_meshes=True,
    )
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.data.users == 1]
    if not meshes:
        print("ERROR: no mesh imported")
        return 2
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = "MpfbSrc"

    n_verts = len(body.data.vertices)
    report["verts"] = n_verts
    report["faces"] = len(body.data.polygons)

    vgroups = load_vgroups(vg_path)
    body_idx = set(vgroups["body"])
    eye_l_idx = set(vgroups["helper-l-eye"])
    eye_r_idx = set(vgroups["helper-r-eye"])
    hair_idx = set(vgroups["helper-hair"])
    print(f"body={len(body_idx)} eyeL={len(eye_l_idx)} eyeR={len(eye_r_idx)} hair={len(hair_idx)}")

    # ---- scale + translate (feet -> y=0), GLTF meters frame ----
    lo = [min(v.co[i] for v in body.data.vertices) for i in range(3)]
    trans_y = -lo[1] * SCALE
    for v in body.data.vertices:
        v.co.x *= SCALE
        v.co.y = v.co.y * SCALE + trans_y
        v.co.z *= SCALE
    body.data.update()
    raw_y = [v.co.y / SCALE - trans_y / SCALE for v in body.data.vertices]

    # ---- neck cut position via cross-section profile ----
    profile = []
    for probe in [y0 / 100.0 for y0 in range(450, 701, 5)]:
        sel = [i for i in range(n_verts) if abs(raw_y[i] - probe) <= 0.05]
        if len(sel) < 30:
            continue
        xs = [body.data.vertices[i].co.x for i in sel]
        zs = [body.data.vertices[i].co.z for i in sel]
        profile.append((probe, len(sel), max(xs) - min(xs), max(zs) - min(zs)))
    candidates = [(p, c, x, z) for p, c, x, z in profile if 5.2 <= p <= 6.5 and c >= 60]
    if not candidates:
        print("ERROR: neck detection failed")
        return 3
    neck_y_raw = min(candidates, key=lambda t: t[2] + t[3])[0]
    neck_y = neck_y_raw * SCALE + trans_y
    report["neck_y_raw"] = neck_y_raw
    report["neck_y_gltf"] = round(neck_y, 4)
    print(f"neck at raw y={neck_y_raw:.2f} -> gltf y={neck_y:.4f}")

    # ---- split parts ----
    head_keep = {i for i in body_idx if raw_y[i] > neck_y_raw}
    head_skin = split_keep(body, head_keep)
    head_skin.name = "MpfbHeadSkin"
    skin = split_keep(body, body_idx)
    skin.name = "MpfbSkin"
    eye_l = split_keep(body, eye_l_idx)
    eye_l.name = "MpfbEyeL"
    eye_r = split_keep(body, eye_r_idx)
    eye_r.name = "MpfbEyeR"
    hair = split_keep(body, hair_idx)
    hair.name = "MpfbHair"
    bpy.data.objects.remove(body, do_unlink=True)

    for obj in (head_skin, skin, eye_l, eye_r, hair):
        shade_smooth(obj)

    # ---- head extras: cap, subsurf L2, fine strokes, vertex colours ----
    cap_hole(head_skin)
    mod = head_skin.modifiers.new("smooth", "SUBSURF")
    mod.levels = 2
    bpy.context.view_layer.objects.active = head_skin
    bpy.ops.object.modifier_apply(modifier="smooth")

    report["head_skin_verts"] = len(head_skin.data.vertices)
    report["head_skin_tris"] = sum(1 for p in head_skin.data.polygons if len(p.vertices) == 3) + 2 * sum(
        1 for p in head_skin.data.polygons if len(p.vertices) == 4
    )
    polys = head_skin.data.polygons
    report["head_topology"] = {
        "quads": sum(1 for p in polys if len(p.vertices) == 4),
        "tris": sum(1 for p in polys if len(p.vertices) == 3),
        "ngons": sum(1 for p in polys if len(p.vertices) > 4),
    }

    # Eyeballs are 72-vert low-poly spheres -> subsurf L2 for smoothness.
    for eye in (eye_l, eye_r):
        m = eye.modifiers.new("smooth", "SUBSURF")
        m.levels = 2
        bpy.context.view_layer.objects.active = eye
        bpy.ops.object.modifier_apply(modifier="smooth")

    # Fine-detail sculpt strokes (NX9_STROKES env overrides defaults).
    strokes_file = os.environ.get("NX9_STROKES", "")
    if strokes_file and os.path.isfile(strokes_file):
        with open(strokes_file, "r", encoding="utf-8") as fh:
            strokes = json.load(fh).get("strokes", [])
    else:
        strokes = DEFAULT_STROKES["strokes"]
    moved = apply_strokes(head_skin, strokes)
    print(f"sculpt strokes applied: {len(strokes)} strokes, {moved} vertex moves")
    report["strokes"] = len(strokes)
    report["stroke_vertex_moves"] = moved

    # ---- proportion / feature deforms (spec: neutral mother base) ----
    apply_deforms(head_skin, DEFORM_SPECS)
    apply_deforms(skin, DEFORM_SPECS)
    apply_deforms(eye_l, DEFORM_SPECS)
    apply_deforms(eye_r, DEFORM_SPECS)
    report["deform_specs"] = len(DEFORM_SPECS)
    print(f"proportion deforms applied: {len(DEFORM_SPECS)}")

    # ---- strict left-right symmetry ----
    hs, hp = enforce_symmetry(head_skin)
    ss, sp = enforce_symmetry(skin)
    report["symmetry_head"] = {"snapped": hs, "paired": hp}
    report["symmetry_body"] = {"snapped": ss, "paired": sp}
    print(f"symmetry head: {hs} snapped, {hp} paired | body: {ss} snapped, {sp} paired")

    # ---- materials (neutral; no skin tone / makeup per spec) ----
    mat_skin = make_mat("MpfbSkin", (0.78, 0.78, 0.78), 0.65)
    mat_sclera = make_mat("MpfbSclera", (0.92, 0.92, 0.92), 0.40)
    mat_iris = make_mat("MpfbIris", (0.30, 0.30, 0.32), 0.30)
    mat_hair = make_mat("MpfbHair", (0.20, 0.20, 0.20), 0.85)
    for obj, mat in ((head_skin, mat_skin), (skin, mat_skin),
                     (eye_l, mat_sclera), (eye_r, mat_sclera), (hair, mat_hair)):
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    # ---- eye geometry: strictly equal size, exactly mirrored ----
    cx, er, cy, cz = normalize_eyes(eye_l, eye_r)
    report["eye_x"] = round(cx, 4)
    report["eye_y"] = round(cy, 4)
    report["eye_z"] = round(cz, 4)
    report["eye_radius"] = round(er, 4)
    print(f"eyes normalized: x=+/-{cx:.4f} y={cy:.4f} z={cz:.4f} r={er:.4f}")

    # ---- rotate everything to Blender Z-up (export round-trips back) ----
    def to_blender_zup(obj):
        for v in obj.data.vertices:
            x, y, z = v.co
            v.co = (x, -z, y)
        obj.data.update()

    for obj in (head_skin, skin, eye_l, eye_r, hair):
        to_blender_zup(obj)

    # ---- iris disks (plain neutral, Blender frame: face -Y) ----
    forward = Vector((0.0, -1.0, 0.0))
    iris_l = add_disk("MpfbIrisL", Vector((cx, -cz, cy)) + forward * (er * 0.94), forward, er * 0.42, mat_iris)
    iris_r = add_disk("MpfbIrisR", Vector((-cx, -cz, cy)) + forward * (er * 0.94), forward, er * 0.42, mat_iris)

    # ---- stats in gltf frame (pre-rotation coords were gltf) ----
    def aabb(obj):
        vs = [v.co for v in obj.data.vertices]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

    # ---- export body GLB (skin only; hair cap removed per user) ----
    bpy.ops.object.select_all(action="DESELECT")
    skin.select_set(True)
    bpy.context.view_layer.objects.active = skin
    body_path = os.path.join(outdir, "mpfb-body.glb")
    bpy.ops.export_scene.gltf(filepath=body_path, export_format="GLB", use_selection=True)
    report["body_glb"] = os.path.basename(body_path)

    # ---- export head GLB (head skin + eyes + iris) ----
    bpy.ops.object.select_all(action="DESELECT")
    for o in (head_skin, eye_l, eye_r, iris_l, iris_r):
        o.select_set(True)
    bpy.context.view_layer.objects.active = head_skin
    head_path = os.path.join(outdir, "mpfb-head.glb")
    bpy.ops.export_scene.gltf(filepath=head_path, export_format="GLB", use_selection=True)
    report["head_glb"] = os.path.basename(head_path)

    # gltf-frame stats for report (undo the Z-up rotation numerically)
    def aabb_gltf(obj):
        vs = [Vector((v.co.x, v.co.z, -v.co.y)) for v in obj.data.vertices]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

    for nm, obj in (("head", head_skin), ("skin", skin), ("hair", hair)):
        mn, mx = aabb_gltf(obj)
        report[f"{nm}_aabb"] = {
            "min": [round(v, 4) for v in mn], "max": [round(v, 4) for v in mx]
        }

    # ---- interactive viewing session ----
    # Trim the body skin to a headless torso (avoids z-fighting against the
    # subsurfed head skin), organize collections, set Material viewport
    # shading, frame the figure, and save a .blend for the user to inspect.
    raw_y_skin = [raw_y[i] for i in sorted(body_idx)]
    torso_keep = {j for j, ry in enumerate(raw_y_skin) if ry < neck_y_raw}
    torso = split_keep(skin, torso_keep)
    torso.name = "躯干皮肤"
    cap_hole(torso)
    shade_smooth(torso)
    torso.data.materials.clear()
    torso.data.materials.append(mat_skin)

    def rename(obj, cn):
        obj.name = cn
        obj.data.name = cn

    rename(skin, "身体皮肤")
    rename(head_skin, "头部皮肤")
    rename(eye_l, "左眼")
    rename(eye_r, "右眼")
    rename(iris_l, "左虹膜")
    rename(iris_r, "右虹膜")

    # Hair cap removed entirely (covers the whole head; user rejected it).
    bpy.data.objects.remove(hair, do_unlink=True)

    coll_body = bpy.data.collections.new("身体")
    coll_head = bpy.data.collections.new("头部")
    bpy.context.scene.collection.children.link(coll_body)
    bpy.context.scene.collection.children.link(coll_head)
    for obj, coll in (
        (torso, coll_body),
        (head_skin, coll_head), (eye_l, coll_head), (eye_r, coll_head),
        (iris_l, coll_head), (iris_r, coll_head),
    ):
        coll.objects.link(obj)
        bpy.context.scene.collection.objects.unlink(obj)

    # Set the viewport to Material shading (persists in the file; the actual
    # view rotation is window state and cannot be set from background mode).
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.type = "MATERIAL"

    # Add a framing camera (front view of the head; face points toward -Y in
    # the Blender frame). User can press Numpad 0 in the viewport.
    bpy.ops.object.camera_add(location=(0.0, -1.8, 1.56), rotation=(math.pi / 2, 0.0, 0.0))
    cam = bpy.context.active_object
    cam.name = "正面相机"
    cam.data.lens = 85
    cam.data.name = "正面相机"
    bpy.context.scene.camera = cam

    blend_path = os.path.join(outdir, "mpfb-preview.blend")
    bpy.ops.wm.save_mainfile(filepath=blend_path)
    report["blend"] = os.path.basename(blend_path)

    with open(os.path.join(outdir, "import-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print("REPORT:", json.dumps(report, ensure_ascii=False))
    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
