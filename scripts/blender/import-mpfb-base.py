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
   below the chin); cap the neck hole; subsurf level 2 on the head skin.
4. Neutral fine-detail strokes + proportion deforms (GLTF frame), then
   strict left-right symmetry (centre snap + mirror-average).
5. Skull-cap compression computed from measured landmarks (target head
   height 23 cm crown->chin, brow fixed) applied to the head skin only.
6. Anatomical measurement + mesh diagnostics (centreline profile, mirror
   seam duplicates, face orientation, sharp creases) -> report / console.
7. Materials: neutral gray Skin / Sclera / Iris (no skin tone, no makeup).
8. Eyes normalized (equal size, exactly mirrored), rotated to Blender
   Z-up (export round-trips to the GLTF frame), GLB exports, .blend save.

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
    """Create a filled disk with verts baked into world space (no leftover
    object transform). Callers can then translate mesh verts directly."""
    bpy.ops.mesh.primitive_circle_add(
        vertices=28, radius=radius, fill_type="NGON", location=(0.0, 0.0, 0.0)
    )
    disc = bpy.context.active_object
    disc.name = name
    # build orthonormal basis with +Z -> normal, bake into mesh
    n = normal.normalized()
    # pick a stable tangent
    helper = Vector((0.0, 0.0, 1.0)) if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    t = n.cross(helper).normalized()
    b = n.cross(t)
    for v in disc.data.vertices:
        local = v.co  # circle in XY, z≈0
        v.co = center + t * local.x + b * local.y + n * local.z
    disc.location = (0.0, 0.0, 0.0)
    disc.rotation_euler = (0.0, 0.0, 0.0)
    disc.scale = (1.0, 1.0, 1.0)
    disc.data.update()
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
# Neutral base-model set: gentle nasolabial, philtrum, lip corners,
# cheekbone, upper/lower lid definition. No socket deepening, no
# jaw/chinned tightening, no alar creases (spec: 中性基础结构).
# NOTE: the brow ridge lives in DEFORM_SPECS as a pure-z gaussian band --
# a radial sphere stroke there pushed the glabella DOWN and read as a
# vertical crease from glabella to the nose bridge (user report).
DEFAULT_STROKES = {
    "strokes": [
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
# Spec: 正常成年人中性母体 (neutral adult base, 174cm-class, 7.6头身).
#   head 23cm crown->chin, skull 14-15, zygomatic 14.2-14.8, jaw ~10.5-11,
#   mouth 4.5-5.2, nose ~4.5, neck 10-12, shoulder 40-42, chest ~27-28,
#   waist ~24-25, pelvis ~30-31 (层次: 肩>胸>腰, 骨盆重展).
# Each spec: type 'gauss' (anisotropic gaussian falloff about a centre) or
# 'ramp' (smoothstep ramp along +Y, masked by gauss in x/z) or 'jawwiden'
# (jaw SIDES only); 'factor' scales the given axes about the centre,
# 'amount' adds a constant offset along the axes. All values in metres.
# v18 整体比例重置 (user round):
#   - 肩带从 0.74 放宽到 0.88：水平 A-pose 手臂改为轻度 A-Pose 后由
#     repose_arms() 承担轮廓，肩带只轻微收三角肌/臂根。
#   - 颈从 1.22/1.10 瓶口改为 1.02/1.06 柔和沙漏；lengthen_neck() +1.5cm。
#   - 胸廓 1.15 紧球体改为 1.12 宽缓（factor 由实测动态补齐）；腰 0.98
#     微收；腋下 0.97 平滑过渡；骨盆 0.86 动态补齐；大腿根 0.98。
#   - 下颌：去掉 jawline 1.05，jawwiden 0.45->0.12，新增下颌厚度 z 0.97；
#     下巴 1.12/1.4mm/2.0mm -> 1.06/0.8mm/1.6mm（不方不尖）。
DEFORM_SPECS = [
    # -- face width (factor patched dynamically from measured zygomatic) --
    {"type": "gauss", "axis": "x", "factor": 1.05, "center": (0.0, 1.55, 0.12),
     "sigma": (0.30, 0.10, 0.065), "note": "face width (zygomatic target 14.5cm)"},
    # -- shoulders: neutral (v21: any squeeze here re-pinches axilla + waves arms) --
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.00, "center": (0.0, 1.33, 0.05),
     "sigma": (0.90, 0.080, 0.20), "note": "shoulder/arm-root band (neutral)"},
    # -- neck: keep volume; deltoid caps neutral (v21: no deltoid pinch) --
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.04, "center": (0.0, 1.450, 0.00),
     "sigma": (0.22, 0.028, 0.12), "note": "neck upper (under jaw, subtle)"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.02, "center": (0.0, 1.42, 0.00),
     "sigma": (0.28, 0.09, 0.14), "note": "neck tube (keep ~12-14cm)"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.00, "center": (0.15, 1.40, 0.06),
     "sigma": (0.12, 0.14, 0.10), "note": "deltoid cap R"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.00, "center": (-0.15, 1.40, 0.06),
     "sigma": (0.12, 0.14, 0.10), "note": "deltoid cap L"},
    {"type": "gauss", "axis": "z", "amount": 0.0007, "center": (0.0, 1.466, 0.095),
     "sigma": (0.022, 0.010, 0.035), "note": "under-jaw fill (subtle)"},
    # -- brow -> glabella -> nose bridge (smooth centre transition) --
    {"type": "gauss", "axis": "z", "amount": 0.0022, "center": (0.0, 1.601, 0.125),
     "sigma": (0.035, 0.013, 0.030), "note": "brow band (subtle; pure z, no radial pull)"},
    {"type": "gauss", "axis": "z", "amount": 0.0004, "center": (0.0, 1.547, 0.152),
     "sigma": (0.018, 0.024, 0.030), "note": "nose bridge soft (wide & low)"},
    # -- jaw: narrower, softer angle, thinner front-back, tapers downward --
    {"type": "gauss", "axis": "z", "factor": 0.97, "center": (0.0, 1.455, 0.100),
     "sigma": (0.11, 0.050, 0.060), "note": "jaw thickness (front-back)"},
    {"type": "jawwiden", "amount": 0.12, "center": (0.0, 1.472, 0.105),
     "sigma": (0.001, 0.028, 0.030), "x_band": (0.018, 0.036),
     "note": "jaw sides slight (gonion, chin untouched)"},
    # -- chin: moderate width, slight forward, rounded, not blocky --
    {"type": "gauss", "axis": "x", "factor": 1.06, "center": (0.0, 1.457, 0.124),
     "sigma": (0.022, 0.020, 0.030), "note": "chin width"},
    {"type": "gauss", "axis": "z", "amount": 0.0008, "center": (0.0, 1.457, 0.124),
     "sigma": (0.022, 0.020, 0.030), "note": "chin tip forward (rounded)"},
    {"type": "gauss", "axis": "y", "amount": 0.0016, "center": (0.0, 1.462, 0.128),
     "sigma": (0.020, 0.014, 0.025), "note": "chin slightly shorter"},
    # -- mouth (neutral) --
    {"type": "gauss", "axis": "z", "amount": 0.0018, "center": (0.0, 1.504, 0.135),
     "sigma": (0.028, 0.011, 0.020), "note": "lip thickness +1.8mm"},
    {"type": "gauss", "axis": "x", "factor": 1.04, "center": (0.0, 1.505, 0.128),
     "sigma": (0.045, 0.010, 0.020), "note": "mouth width +4%"},
    # -- nose (soft root, round tip) --
    {"type": "gauss", "axis": "x", "factor": 1.05, "center": (0.0, 1.527, 0.160),
     "sigma": (0.012, 0.011, 0.030), "note": "nose tip wider (not pointed)"},
    {"type": "gauss", "axis": "z", "amount": 0.0006, "center": (0.0, 1.527, 0.160),
     "sigma": (0.012, 0.011, 0.030), "note": "nose tip +0.6mm"},
    # -- torso: chest broad, NO axilla pinch (v20 fills axilla after repose),
    # pelvis softer, thigh root rounds the greater-trochanter shelf --
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.12, "center": (0.0, 1.21, 0.10),
     "sigma": (0.35, 0.13, 0.17), "note": "chest broad (factor patched dynamically)"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 0.99, "center": (0.0, 1.08, 0.06),
     "sigma": (0.30, 0.10, 0.13), "note": "waist gentle pinch"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 1.04, "center": (0.0, 1.28, 0.02),
     "sigma": (0.22, 0.045, 0.10), "note": "axilla fill (undo pinch)"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 0.92, "center": (0.0, 0.99, 0.05),
     "sigma": (0.55, 0.14, 0.12), "note": "pelvis neutral (factor patched dynamically)"},
    {"type": "gauss", "axis": ["x", "z"], "factor": 0.96, "center": (0.0, 0.90, 0.05),
     "sigma": (0.28, 0.055, 0.12), "note": "thigh root gentle"},
]


def _smoothstep01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def apply_deforms(obj, specs):
    """Apply the proportion specs to obj (GLTF frame). Returns op counts."""
    for spec in specs:
        axes = spec.get("axis")
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
        elif spec["type"] == "jawwiden":
            # widen the jaw SIDES only (gonion band), leaving the chin front
            # (|x| < x0) untouched: v.x *= 1 + amount*f_yz*smoothstep(|x|)
            c = Vector(spec["center"])
            sy, sz = spec["sigma"][1], spec["sigma"][2]
            x0, x1 = spec["x_band"]
            amt = spec["amount"]
            for v in obj.data.vertices:
                dy = (v.co.y - c.y) / sy
                dz = (v.co.z - c.z) / sz
                f = math.exp(-2.5 * (dy * dy + dz * dz))
                if f <= 0.01:
                    continue
                ax = abs(v.co.x)
                if ax <= x0:
                    continue
                xf = _smoothstep01((ax - x0) / (x1 - x0))
                v.co.x *= 1.0 + amt * f * xf
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


def _arm_region(co, side):
    """True if vertex belongs to the arm tube on the given side (+1 right).
    Works for the pre-repose wide A-pose AND the post-repose mild hang
    (hand near x 0.18-0.32, y 0.85-1.05)."""
    x = co.x if side > 0 else -co.x
    if co.y < 0.70 or x < 0.11:
        return False
    if co.y > 1.10:
        return x > 0.13
    if co.y > 0.98:
        return x > 0.16
    if co.y > 0.88:
        return x > 0.18
    return x > 0.22


def _rodrigues(v, axis, ang):
    """Rotate vector v about unit axis by ang (radians)."""
    c, s = math.cos(ang), math.sin(ang)
    return v * c + axis.cross(v) * s + axis * (axis.dot(v) * (1.0 - c))


def repose_arms(obj, target_angle_deg=18.0, elbow_bend_deg=22.0):
    """Mild A-pose via rigid transforms only (no positional hand morph).

    v19: the old step-2 offset remapping shredded the hand into spindles.
    New pipeline keeps every arm vertex in a rigid segment:

    1) XY two-segment rotation about the shoulder / elbow to target_angle_deg
    2) Sagittal tilt so the arm hangs at mid-body depth (not forward)
    3) Rigid elbow bend: forearm+hand rotate as one solid about the elbow
       toward a natural hang (slight outward), preserving finger topology

    Returns (theta_deg, upper_angle_before, joint)."""
    verts = obj.data.vertices
    right = [v for v in verts if _arm_region(v.co, 1)]
    if len(right) < 50:
        print("WARN: arm classification found too few verts, skipping repose")
        return 0.0, 0.0, None
    stop = [v for v in right if v.co.y > 1.30]
    S = sum((v.co for v in stop), Vector((0.0, 0.0, 0.0))) / len(stop)
    el = [v for v in right if 1.06 <= v.co.y <= 1.20 and v.co.x > 0.25]
    E = sum((v.co for v in el), Vector((0.0, 0.0, 0.0))) / len(el) if el else S
    axis_u = (E - S).normalized()
    lu = (E - S).length
    ang_u = math.atan2(axis_u.x, -axis_u.y)  # upper-arm angle from vertical
    theta = ang_u - math.radians(target_angle_deg)
    ca, sa = math.cos(theta), math.sin(theta)
    Ep = Vector((S.x + (E.x - S.x) * ca + (E.y - S.y) * sa,
                 S.y - (E.x - S.x) * sa + (E.y - S.y) * ca, E.z))
    moved = 0
    fore_idx = []  # vertex indices for forearm+hand (post step-1)
    for side in (1, -1):
        for v in verts:
            p = v.co
            if not _arm_region(p, side):
                continue
            rel = Vector(((p.x if side > 0 else -p.x) - S.x, p.y - S.y, 0.0))
            if rel.length < 1e-6:
                continue
            t = rel.dot(axis_u)
            if t > lu - 0.02:
                rel2 = rel - axis_u * lu
                nx = (Ep.x - S.x) + rel2.x * ca + rel2.y * sa
                ny = (Ep.y - S.y) - rel2.x * sa + rel2.y * ca
                v.co.x = (S.x + nx) if side > 0 else -(S.x + nx)
                v.co.y = S.y + ny
                fore_idx.append((v.index, side))
            else:
                w = _smoothstep01((t - 0.04) / 0.08)
                if w <= 0.01:
                    continue
                ang = -theta * w
                c2, s2 = math.cos(ang), math.sin(ang)
                nx = rel.x * c2 - rel.y * s2
                ny = rel.x * s2 + rel.y * c2
                v.co.x = (S.x + nx) if side > 0 else -(S.x + nx)
                v.co.y = S.y + ny
            moved += 1
    obj.data.update()

    # -- step 1.5: sagittal arm tilt (DISABLED by default) --
    # The MPFB base already has a mild forward hang. Forcing a 15-20deg
    # sagittal correction sheared the upper-arm cross-section into the
    # pinched "broken bicep" silhouette. Keep tilt=0 unless explicitly asked.
    tilt = 0.0
    if False and abs(S.y - Ep.y) > 1e-4:
        z_ang_now = math.atan2(Ep.z - S.z, S.y - Ep.y)
        z_ang_tgt = math.atan2(0.033, S.y - Ep.y)
        tilt = z_ang_now - z_ang_tgt
        ct, st = math.cos(tilt), math.sin(tilt)
        for side in (1, -1):
            for v in verts:
                p = v.co
                if not _arm_region(p, side):
                    continue
                rel = Vector(((p.x if side > 0 else -p.x) - S.x, p.y - S.y, p.z - S.z))
                t = rel.dot(axis_u)
                if t < 0.02:
                    continue
                w = _smoothstep01((t - 0.02) / 0.06)
                if w <= 0.01:
                    continue
                a = tilt * w
                c, s = math.cos(a), math.sin(a)
                v.co.y = S.y + rel.y * c - rel.z * s
                v.co.z = S.z + rel.y * s + rel.z * c
        obj.data.update()
        rel_e = Vector((Ep.x - S.x, Ep.y - S.y, Ep.z - S.z))
        Ep = Vector((S.x + rel_e.x,
                     S.y + rel_e.y * ct - rel_e.z * st,
                     S.z + rel_e.y * st + rel_e.z * ct))

    # -- step 2: RIGID elbow bend (forearm+hand as one solid) ----------------
    # Target forearm direction: mostly down, slight outward, slight forward.
    bend = math.radians(elbow_bend_deg)
    moved2 = 0
    for side in (1, -1):
        Es = Vector((side * Ep.x, Ep.y, Ep.z))
        # current forearm direction from elbow -> hand centroid
        hand = [verts[i].co for i, s in fore_idx if s == side]
        if len(hand) < 8:
            continue
        Hc = sum(hand, Vector((0.0, 0.0, 0.0))) / len(hand)
        cur = (Hc - Es)
        if cur.length < 1e-4:
            continue
        cur.normalize()
        # hang target in mirrored frame (x always positive locally)
        tgt_local = Vector((math.sin(math.radians(8.0)),
                            -math.cos(math.radians(8.0)) * math.cos(math.radians(10.0)),
                            math.cos(math.radians(8.0)) * math.sin(math.radians(10.0)))).normalized()
        tgt = Vector((side * tgt_local.x, tgt_local.y, tgt_local.z))
        # rotate cur -> tgt, clamped to elbow_bend_deg.
        # bend<=0 means NO elbow bend (do not fall through to full angle —
        # that shredded hands when callers passed 0.0 intending "skip").
        if bend <= 0.0:
            continue
        axis = cur.cross(tgt)
        if axis.length < 1e-6:
            continue
        axis.normalize()
        full = math.acos(max(-1.0, min(1.0, cur.dot(tgt))))
        ang = min(full, bend)
        # blend near elbow so the joint stays continuous
        for i, s in fore_idx:
            if s != side:
                continue
            v = verts[i]
            rel = v.co - Es
            # distance along current forearm
            t = rel.dot(cur)
            w = _smoothstep01((t - 0.01) / 0.05)
            if w <= 0.01:
                continue
            v.co = Es + _rodrigues(rel, axis, ang * w)
            moved2 += 1
    obj.data.update()
    print(f"arm rigid-bend: {moved2} verts, bend<={elbow_bend_deg}deg")
    print(f"arm repose: upper {math.degrees(ang_u):.1f}deg -> {target_angle_deg}deg, "
          f"theta={math.degrees(theta):.1f}deg, tilt={math.degrees(tilt):.1f}deg, "
          f"joint=({S.x:.3f},{S.y:.3f}), elbow'=({Ep.x:.3f},{Ep.y:.3f}), {moved} verts")
    return math.degrees(theta), math.degrees(ang_u), S


def flare_neck_root(obj, y0=1.455, y1=1.495, amount=0.018):
    """Soften the knife-edge neck/trapezius step (rmax drops ~15cm->7cm in 1cm).
    Pushes neck-root verts outward with a smooth falloff so the collar reads
    as a continuous taper, not a black ring."""
    moved = 0
    for v in obj.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        if not (y0 <= y <= y1):
            continue
        r = math.sqrt(x * x + z * z)
        if r < 0.04 or r > 0.16:
            continue
        # strongest at mid-band, fades to shoulders and jaw
        t = (y - y0) / max(1e-6, (y1 - y0))
        w = math.sin(math.pi * t)
        # prefer the outer silhouette (higher r) so we round the step, not inflate the throat
        outer = _smoothstep01((r - 0.055) / 0.04)
        w *= outer
        if w < 0.04:
            continue
        s = 1.0 + (amount / max(r, 1e-6)) * w
        v.co.x *= s
        v.co.z *= s
        moved += 1
    obj.data.update()
    print(f"neck root flare: amount={amount*1000:.1f}mm, {moved} verts")
    return moved


def fill_axilla(obj, amount=0.014):
    """Inflate the armpit hollow left by arm repose. Pushes verts in the
    medial arm-root bowl outward (+|x|) and a little forward (+z). Mirrored."""
    moved = 0
    for v in obj.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        ax = abs(x)
        if not (1.16 <= y <= 1.40 and 0.04 <= ax <= 0.26 and -0.08 <= z <= 0.14):
            continue
        fy = math.exp(-((y - 1.28) / 0.065) ** 2)
        fx = math.exp(-((ax - 0.12) / 0.065) ** 2)
        fz = math.exp(-((z - 0.02) / 0.08) ** 2)
        w = fy * fx * fz
        if w < 0.04:
            continue
        v.co.x += math.copysign(amount * w, x)
        v.co.z += amount * 0.35 * w
        v.co.y += amount * 0.12 * w
        moved += 1
    obj.data.update()
    print(f"axilla fill: amount={amount*1000:.1f}mm, {moved} verts")
    return moved


def smooth_arm_junction(obj, iters=5):
    """Laplacian-smooth upper-arm / axilla / deltoid to kill waves from stacked
    radius scales + repose blends. Exactly mirrored by operating on |x|."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    tagged = []
    for v in bm.verts:
        ax = abs(v.co.x)
        y, z = v.co.y, v.co.z
        if 1.02 <= y <= 1.42 and 0.07 <= ax <= 0.34 and -0.12 <= z <= 0.18:
            tagged.append(v)
    if len(tagged) < 20:
        bm.free()
        return 0
    for _ in range(iters):
        deltas = {}
        for v in tagged:
            if not v.link_edges:
                continue
            nbrs = [e.other_vert(v).co for e in v.link_edges]
            avg = sum(nbrs, Vector((0.0, 0.0, 0.0))) / len(nbrs)
            # strong on radius (x/z), mild on length (y) so the arm doesn't shorten
            deltas[v.index] = Vector(((avg.x - v.co.x) * 0.55,
                                      (avg.y - v.co.y) * 0.20,
                                      (avg.z - v.co.z) * 0.55))
        for v in tagged:
            d = deltas.get(v.index)
            if d is not None:
                v.co += d
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    print(f"arm junction smooth: {len(tagged)} verts x {iters} iters")
    return len(tagged)


def weld_sealed_body(head, torso, name="全身皮肤"):
    """Join head+torso and BRIDGE the two neck boundary loops into one
    continuous surface for viewport/preview. GLB exports keep the split pair.

    remove_doubles cannot seal this: head (subsurf) and torso have different
    rim vert counts at different angles, so verts never land within merge dist.
    """
    import bmesh
    from collections import defaultdict

    h = head.copy()
    h.data = head.data.copy()
    h.name = name + "_h"
    bpy.context.collection.objects.link(h)
    t = torso.copy()
    t.data = torso.data.copy()
    t.name = name + "_t"
    bpy.context.collection.objects.link(t)
    bpy.ops.object.select_all(action="DESELECT")
    h.select_set(True)
    t.select_set(True)
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.join()
    sealed = bpy.context.view_layer.objects.active
    sealed.name = name
    sealed.data.name = name

    bm = bmesh.new()
    bm.from_mesh(sealed.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    before = len(bm.verts)

    # Walk all boundary edge loops
    def boundary_loops():
        used = set()
        loops = []
        for e0 in bm.edges:
            if e0.index in used or len(e0.link_faces) != 1:
                continue
            loop_e = []
            e = e0
            v_prev = e.verts[0]
            guard = 0
            while e.index not in used and guard < 100000:
                used.add(e.index)
                loop_e.append(e)
                v_next = e.other_vert(v_prev)
                nxt = None
                for e2 in v_next.link_edges:
                    if e2.index in used or len(e2.link_faces) != 1:
                        continue
                    nxt = e2
                    break
                if nxt is None:
                    break
                v_prev = v_next
                e = nxt
                guard += 1
                if e.index == e0.index:
                    break
            if len(loop_e) >= 8:
                loops.append(loop_e)
        return loops

    loops = boundary_loops()
    # Score loops by how "neck-like" they are (Z band + radius)
    scored = []
    for loop_e in loops:
        vs = []
        for e in loop_e:
            vs.extend(e.verts)
        # unique
        uniq = list({v.index: v for v in vs}.values())
        zs = [v.co.z for v in uniq]
        rs = [math.sqrt(v.co.x ** 2 + v.co.y ** 2) for v in uniq]
        zmid = sum(zs) / len(zs)
        rmid = sum(rs) / len(rs)
        if 1.40 <= zmid <= 1.58 and 0.03 <= rmid <= 0.12:
            scored.append((abs(zmid - 1.49) + abs(rmid - 0.07), loop_e, zmid, rmid, len(loop_e)))
    scored.sort(key=lambda t: t[0])
    bridged = 0
    left = -1
    if len(scored) >= 2:
        # take the two best neck-like loops and bridge them
        e1 = scored[0][1]
        e2 = scored[1][1]
        # align both to a shared Z/radius first so the bridge is short
        z_ring = 0.5 * (scored[0][2] + scored[1][2])
        r_ring = 0.5 * (scored[0][3] + scored[1][3])
        for loop_e in (e1, e2):
            seen = set()
            for e in loop_e:
                for v in e.verts:
                    if v.index in seen:
                        continue
                    seen.add(v.index)
                    r = math.sqrt(v.co.x ** 2 + v.co.y ** 2)
                    if r > 1e-6:
                        s = r_ring / r
                        v.co.x *= s
                        v.co.y *= s
                    v.co.z = z_ring
        try:
            ret = bmesh.ops.bridge_loops(bm, edges=e1 + e2)
            bridged = len(ret.get("faces", [])) if isinstance(ret, dict) else 0
        except Exception as ex:  # noqa: BLE001
            print(f"WARN: bridge_loops failed: {ex}")
            # fallback: fill each loop (caps) — better than an open gap
            for loop_e in (e1, e2):
                try:
                    bmesh.ops.edgeloop_fill(bm, edges=loop_e)
                except Exception:
                    pass
    else:
        print(f"WARN: need 2 neck loops to bridge, found {len(scored)} "
              f"(total boundary loops {len(loops)})")

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(sealed.data)
    after = len(bm.verts)
    # recount neck boundary
    bm.edges.ensure_lookup_table()
    left = 0
    for e in bm.edges:
        if len(e.link_faces) != 1:
            continue
        for v in e.verts:
            r = math.sqrt(v.co.x ** 2 + v.co.y ** 2)
            if 1.44 <= v.co.z <= 1.54 and 0.04 <= r <= 0.10:
                left += 1
                break
    bm.free()
    sealed.data.update()
    shade_smooth(sealed)
    print(f"sealed body: bridged_faces={bridged}, verts {before}->{after}, "
          f"neck-loops-found={len(scored)}, neck-boundary-edges-left={left}")
    return sealed, bridged


def smooth_hip_shelf(obj, iters=5, band=(0.86, 1.10)):
    """Round the sharp greater-trochanter / outer-hip corners.
    Laplacian-smooth only the outer hip verts (|x| in the top quartile of
    each 2cm band), keeping the rest of the mesh untouched."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    y0, y1 = band
    # tag candidates once
    tagged = []
    for v in bm.verts:
        if not (y0 <= v.co.y <= y1 and 0.12 <= abs(v.co.x) <= 0.28 and -0.02 <= v.co.z <= 0.18):
            continue
        tagged.append(v)
    if len(tagged) < 20:
        bm.free()
        return 0
    # per-band outer threshold (p70 of |x|)
    thresholds = {}
    for yc in range(int(y0 * 100), int(y1 * 100) + 1, 2):
        y = yc / 100.0
        xs = sorted(abs(v.co.x) for v in tagged if abs(v.co.y - y) < 0.015)
        if len(xs) >= 8:
            thresholds[yc] = xs[int(len(xs) * 0.70)]
    outer = []
    for v in tagged:
        yc = int(round(v.co.y * 50) * 2)  # nearest even cm
        thr = thresholds.get(yc) or thresholds.get(yc - 2) or thresholds.get(yc + 2)
        if thr and abs(v.co.x) >= thr:
            outer.append(v)
    for _ in range(iters):
        deltas = {}
        for v in outer:
            if not v.link_edges:
                continue
            nbrs = [e.other_vert(v).co for e in v.link_edges]
            avg = sum(nbrs, Vector((0.0, 0.0, 0.0))) / len(nbrs)
            # only pull the outer spike inward on x; keep y/z mostly
            deltas[v.index] = Vector(((avg.x - v.co.x) * 0.55,
                                      (avg.y - v.co.y) * 0.25,
                                      (avg.z - v.co.z) * 0.35))
        for v in outer:
            d = deltas.get(v.index)
            if d is not None:
                v.co += d
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    print(f"hip shelf smooth: {len(outer)} verts x {iters} iters")
    return len(outer)


def close_neck_seam(head, torso, extras, overlap_m=0.010):
    """Seal head/torso neck by snapping BOTH boundary loops onto one shared
    ring (v21c). Overlap alone is not enough: if the torso rim sticks out
    past the head rim even 5mm, the open edge reads as a black jagged collar.
    """
    import bmesh

    def boundary_loop_verts(obj):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.edges.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        # collect boundary vert indices (1-face edges)
        bset = set()
        for e in bm.edges:
            if len(e.link_faces) == 1:
                bset.add(e.verts[0].index)
                bset.add(e.verts[1].index)
        coords = [(i, obj.data.vertices[i].co.copy()) for i in bset]
        bm.free()
        return coords

    def neck_rim(coords, prefer="low"):
        """Neck-hole boundary verts near the cut, including collapsed inward
        spikes (r can be << 3.5cm — those MUST be snapped out or they read
        as the jagged black collar)."""
        if not coords:
            return []
        # first isolate by y-extreme of all boundary verts with r < 12cm
        # (exclude ear/eye openings which are higher and smaller)
        loose = [(i, p, math.sqrt(p.x * p.x + p.z * p.z))
                 for i, p in coords
                 if math.sqrt(p.x * p.x + p.z * p.z) < 0.12]
        if len(loose) < 8:
            loose = [(i, p, math.sqrt(p.x * p.x + p.z * p.z)) for i, p in coords]
        ys = sorted(p.y for _, p, _ in loose)
        if prefer == "low":
            ycut = ys[max(0, int(len(ys) * 0.35))]
            band = [(i, p, r) for i, p, r in loose if p.y <= ycut + 0.012]
        else:
            ycut = ys[min(len(ys) - 1, int(len(ys) * 0.65))]
            band = [(i, p, r) for i, p, r in loose if p.y >= ycut - 0.012]
        # keep the largest connected-radius cluster (drop tiny eye-like loops)
        if not band:
            return band
        # prefer verts whose r is in the neck-ish majority; but NEVER drop
        # low-r verts that sit at the same y as the neck cut — those are spikes
        rs = sorted(r for _, _, r in band)
        r_med = rs[len(rs) // 2]
        out = []
        for i, p, r in band:
            if r < 0.12 and (r >= 0.025 or abs(r_med - r) < 0.055 or r_med < 0.05):
                out.append((i, p, r))
            elif r < 0.12 and prefer == "low" and p.y <= ys[0] + 0.02:
                out.append((i, p, r))  # floor spikes on head
            elif r < 0.12 and prefer == "high" and p.y >= ys[-1] - 0.02:
                out.append((i, p, r))
        return out if len(out) >= 8 else band

    h_all = boundary_loop_verts(head)
    t_all = boundary_loop_verts(torso)
    h_rim = neck_rim(h_all, prefer="low")
    t_rim = neck_rim(t_all, prefer="high")
    if len(h_rim) < 8 or len(t_rim) < 8:
        print(f"WARN: neck rim too small h={len(h_rim)} t={len(t_rim)}, fallback translate")
        hbot = min(v.co.y for v in head.data.vertices)
        ttop = max(v.co.y for v in torso.data.vertices)
        dy = -((hbot - ttop) + overlap_m)
        for obj in (head, *extras):
            for v in obj.data.vertices:
                v.co.y += dy
            obj.data.update()
        return {"gap_mm": round((hbot - ttop) * 1000, 2), "fallback": True}

    hbot = min(p.y for _, p, _ in h_rim)
    ttop = max(p.y for _, p, _ in t_rim)
    gap = hbot - ttop
    # shared ring plane in the middle of the target overlap
    y_ring = ttop - overlap_m * 0.35
    # shared radius = max of both means so the outer silhouette is continuous
    hr = sum(r for _, _, r in h_rim) / len(h_rim)
    tr = sum(r for _, _, r in t_rim) / len(t_rim)
    # use percentile high so collapsed spikes don't drag the ring inward
    h_rs = sorted(r for _, _, r in h_rim)
    t_rs = sorted(r for _, _, r in t_rim)
    hr_p70 = h_rs[int(len(h_rs) * 0.70)]
    tr_p70 = t_rs[int(len(t_rs) * 0.70)]
    r_ring = max(hr_p70, tr_p70, hr, tr) + 0.0015

    # 1) drop whole head so rims straddle y_ring
    dy = y_ring - (hbot + ttop) * 0.5
    # ensure at least overlap_m burial of head below torso top
    if (hbot + dy) > (ttop - overlap_m):
        dy = (ttop - overlap_m) - hbot
    for obj in (head, *extras):
        for v in obj.data.vertices:
            v.co.y += dy
        obj.data.update()

    # refresh rim positions after head shift
    h_rim = [(i, head.data.vertices[i].co.copy(),
              math.sqrt(head.data.vertices[i].co.x ** 2 + head.data.vertices[i].co.z ** 2))
             for i, _, _ in h_rim]

    def snap_rim(obj, rim, y_target, r_target, falloff=0.045):
        """Pull rim verts onto the shared circle; soft-blend neighbours by y."""
        rim_ids = {i for i, _, _ in rim}
        # direct snap for rim
        for i, p, r in rim:
            v = obj.data.vertices[i]
            if r < 1e-6:
                continue
            s = r_target / r
            v.co.x *= s
            v.co.z *= s
            v.co.y = y_target
        # soft blend nearby tube verts toward the ring radius
        moved = len(rim)
        for v in obj.data.vertices:
            if v.index in rim_ids:
                continue
            y = v.co.y
            if abs(y - y_target) > falloff:
                continue
            r = math.sqrt(v.co.x * v.co.x + v.co.z * v.co.z)
            if r < 0.030 or r > 0.100:
                continue
            w = 1.0 - _smoothstep01(abs(y - y_target) / falloff)
            if w < 0.02:
                continue
            s = 1.0 + (r_target / r - 1.0) * w * 0.85
            if abs(s - 1.0) > 0.30:
                s = 1.0 + math.copysign(0.30, s - 1.0)
            v.co.x *= s
            v.co.z *= s
            # ease y toward ring a little so the tube doesn't kink
            v.co.y += (y_target - y) * w * 0.35
            moved += 1
        obj.data.update()
        return moved

    mh = snap_rim(head, h_rim, y_ring - 0.002, r_ring + 0.0025, falloff=0.050)
    mt = snap_rim(torso, t_rim, y_ring + 0.002, r_ring, falloff=0.040)

    # post diagnostics on boundary
    h2 = neck_rim(boundary_loop_verts(head), prefer="low")
    t2 = neck_rim(boundary_loop_verts(torso), prefer="high")
    hbot2 = min((p.y for _, p, _ in h2), default=y_ring)
    ttop2 = max((p.y for _, p, _ in t2), default=y_ring)
    hr2 = sum(r for _, _, r in h2) / max(1, len(h2))
    tr2 = sum(r for _, _, r in t2) / max(1, len(t2))
    print(f"neck seam v21c: gap={gap*1000:.1f}mm -> y_delta={(hbot2-ttop2)*1000:.1f}mm, "
          f"dy={dy*1000:.1f}mm, r_ring={r_ring*100:.1f}cm, "
          f"r_h={hr*100:.1f}->{hr2*100:.1f} r_t={tr*100:.1f}->{tr2*100:.1f}, "
          f"snap h={mh} t={mt}")
    return {
        "gap_mm": round(gap * 1000, 2),
        "gap_post_mm": round((hbot2 - ttop2) * 1000, 2),
        "dy_mm": round(dy * 1000, 2),
        "r_ring_cm": round(r_ring * 100, 2),
        "r_head_cm": round(hr2 * 100, 2),
        "r_torso_cm": round(tr2 * 100, 2),
        "snap_h": mh,
        "snap_t": mt,
    }


def compact_hands(obj, factor=0.92):
    """Gentle finger fan-in toward palm (mirrored). factor close to 1.0 =
    almost no change; values <<0.85 pancake the hand (avoid)."""
    if factor >= 0.995:
        print("hand compact: skipped (factor≈1)")
        return 0
    verts = obj.data.vertices
    moved = 0
    for side in (1, -1):
        arm = [v for v in verts if _arm_region(v.co, side)]
        if len(arm) < 30:
            continue
        # palm ≈ verts near the hand's y-median of the distal third
        ys = sorted(v.co.y for v in arm)
        y_cut = ys[max(0, int(len(ys) * 0.28))]
        hand = [v for v in arm if v.co.y <= y_cut + 0.015]
        if len(hand) < 12:
            continue
        palm = sum((v.co for v in hand), Vector((0.0, 0.0, 0.0))) / len(hand)
        for v in hand:
            # only the most distal / outermost verts; keep wrist bulk
            dist_y = max(0.0, (y_cut - v.co.y) / 0.10)
            dist_x = max(0.0, (abs(v.co.x) - abs(palm.x)) / 0.07)
            w = _smoothstep01(max(dist_y, dist_x))
            if w <= 0.08:
                continue
            v.co = palm + (v.co - palm) * (1.0 - (1.0 - factor) * w)
            moved += 1
    obj.data.update()
    print(f"hand compact: factor={factor}, {moved} verts")
    return moved


def lengthen_neck(obj, dy=0.015, y0=1.34, y1=1.44):
    """Lengthen the neck by dy metres: stretch y in [y0,y1] smoothly, shift
    everything above y1 up rigidly (head, ears, eyes move together)."""
    for v in obj.data.vertices:
        y = v.co.y
        if y <= y0:
            continue
        if y >= y1:
            v.co.y += dy
        else:
            v.co.y += dy * _smoothstep01((y - y0) / (y1 - y0))
    obj.data.update()


def extend_legs(obj, dy=0.033, y0=0.80, y1=0.86):
    """Lengthen the legs by dy metres so the TOTAL height grows by dy:
    legs below y0 scale about the ground (feet stay planted), everything
    above y1 rises rigidly by dy (pelvis/torso/head), blended in between."""
    k = 1.0 + dy / y0
    bot = y0 * k
    top = y1 + dy
    for v in obj.data.vertices:
        y = v.co.y
        if y <= y0:
            v.co.y = y * k
        elif y >= y1:
            v.co.y = y + dy
        else:
            t = _smoothstep01((y - y0) / (y1 - y0))
            v.co.y = bot + (top - bot) * t
    obj.data.update()


def slim_arms(obj, factor=1.06):
    """Scale arm-tube radius about the shoulder->wrist axis.
    factor < 1 slims; factor > 1 thickens (v19 default 1.06 = +6%).
    Hand kept via distal blend; upper-arm root included so deltoid/bicep
    volume is not left as a stick. Exactly mirrored."""
    verts = obj.data.vertices
    right = [v for v in verts if _arm_region(v.co, 1)]
    if len(right) < 50:
        print("WARN: arm classification found too few verts, skipping slim")
        return 0.0
    stop = [v for v in right if v.co.y > 1.30]
    S = sum((v.co for v in stop), Vector((0.0, 0.0, 0.0))) / len(stop)
    # wrist = distal arm cluster (works for both A-pose and mild hang)
    ys = sorted(v.co.y for v in right)
    y_lo, y_hi = ys[max(0, int(len(ys) * 0.05))], ys[min(len(ys) - 1, int(len(ys) * 0.25))]
    wl = [v for v in right if y_lo - 0.02 <= v.co.y <= y_hi + 0.02 and v.co.x > 0.14]
    W = sum((v.co for v in wl), Vector((0.0, 0.0, 0.0))) / len(wl) if wl else S
    axis = (W - S).normalized()
    L = (W - S).length
    if L < 1e-4:
        print("WARN: arm axis degenerate, skipping slim")
        return 0.0
    moved = 0
    for side in (1, -1):
        sx = S.x
        for v in verts:
            p = v.co
            if not _arm_region(p, side):
                continue
            r = Vector(((p.x if side > 0 else -p.x) - sx, p.y - S.y, p.z - S.z))
            t = r.dot(axis)
            # include near-shoulder band (was t<0.04 skip -> stick upper arms)
            if t < 0.01 or t > L - 0.03:
                continue  # only skip joint origin + fingertips
            f = _smoothstep01((t - 0.01) / 0.05) * (1.0 - _smoothstep01((t - (L - 0.10)) / 0.07))
            if f <= 0.01:
                continue
            s = 1.0 - (1.0 - factor) * f
            perp = r - axis * t
            nr = axis * t + perp * s
            v.co.x = (S.x + nr.x) if side > 0 else -(S.x + nr.x)
            v.co.y = S.y + nr.y
            v.co.z = S.z + nr.z
            moved += 1
    obj.data.update()
    print(f"arm radius scale: factor={factor}, {moved} verts")
    return factor


def round_shoulder_caps(obj, amount=0.016):
    """Knock down the acromion / trapezius knife peak on the top silhouette.
    Peak lives near (|x|,y)≈(0.17, 1.465) after neck/leg lengthen — older
    targets at y=1.40 missed it entirely. Pull down + slightly inward with
    a soft falloff so the shoulder reads as a rounded cap, not a triangle."""
    moved = 0
    for v in obj.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        ax = abs(x)
        if not (1.40 <= y <= 1.50 and 0.10 <= ax <= 0.24 and -0.08 <= z <= 0.14):
            continue
        fy = math.exp(-((y - 1.462) / 0.028) ** 2)
        fx = math.exp(-((ax - 0.165) / 0.045) ** 2)
        fz = math.exp(-((z - 0.01) / 0.07) ** 2)
        w = fy * fx * fz
        if w < 0.04:
            continue
        # primarily drop the peak; slight medial pull softens the tip
        v.co.y -= amount * 1.10 * w
        v.co.x -= math.copysign(amount * 0.35 * w, x)
        v.co.z -= amount * 0.08 * w
        moved += 1
    obj.data.update()
    print(f"shoulder cap round: amount={amount*1000:.1f}mm, {moved} verts")
    return moved


def smooth_shoulder_ridge(obj, iters=5, band=(1.38, 1.50)):
    """Laplacian-round the top shoulder silhouette (same idea as hip shelf).
    Only the uppermost verts in each |x| band are smoothed so the deltoid
    volume below stays intact."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    y0, y1 = band
    tagged = []
    for v in bm.verts:
        ax = abs(v.co.x)
        if not (y0 <= v.co.y <= y1 and 0.10 <= ax <= 0.28 and -0.10 <= v.co.z <= 0.16):
            continue
        tagged.append(v)
    if len(tagged) < 20:
        bm.free()
        return 0
    # per |x| cm-bin: keep verts in the top quartile of y (the ridge)
    thresholds = {}
    for xc in range(10, 29, 1):
        x = xc / 100.0
        ys = sorted(v.co.y for v in tagged if abs(abs(v.co.x) - x) < 0.006)
        if len(ys) >= 6:
            thresholds[xc] = ys[int(len(ys) * 0.70)]
    ridge = []
    for v in tagged:
        xc = int(round(abs(v.co.x) * 100))
        thr = thresholds.get(xc) or thresholds.get(xc - 1) or thresholds.get(xc + 1)
        if thr and v.co.y >= thr:
            ridge.append(v)
    for _ in range(iters):
        deltas = {}
        for v in ridge:
            if not v.link_edges:
                continue
            nbrs = [e.other_vert(v).co for e in v.link_edges]
            avg = sum(nbrs, Vector((0.0, 0.0, 0.0))) / len(nbrs)
            # mainly flatten the y-spike; gentle x/z so we don't shear the arm
            deltas[v.index] = Vector(((avg.x - v.co.x) * 0.30,
                                      (avg.y - v.co.y) * 0.65,
                                      (avg.z - v.co.z) * 0.30))
        for v in ridge:
            d = deltas.get(v.index)
            if d is not None:
                v.co += d
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    print(f"shoulder ridge smooth: {len(ridge)} verts x {iters} iters")
    return len(ridge)


def smooth_ankle_malleolus(obj, iters=6, band=(0.04, 0.15)):
    """Pull in the lateral malleolus spikes left by leg morph.
    morph_legs can inflate outer ankle verts when the per-band half-width
    sample underestimates the true envelope; this rounds only the outer
    quartile back toward a smooth calf→ankle→foot taper."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    y0, y1 = band
    tagged = []
    for v in bm.verts:
        ax = abs(v.co.x)
        # stay on the lower leg / ankle; skip the wide forefoot (large +z)
        if not (y0 <= v.co.y <= y1 and 0.06 <= ax <= 0.20 and -0.06 <= v.co.z <= 0.08):
            continue
        tagged.append(v)
    if len(tagged) < 12:
        bm.free()
        return 0
    thresholds = {}
    for yc in range(int(y0 * 100), int(y1 * 100) + 1, 1):
        y = yc / 100.0
        xs = sorted(abs(v.co.x) for v in tagged if abs(v.co.y - y) < 0.008)
        if len(xs) >= 4:
            thresholds[yc] = xs[int(len(xs) * 0.55)]
    outer = []
    for v in tagged:
        yc = int(round(v.co.y * 100))
        thr = thresholds.get(yc) or thresholds.get(yc - 1) or thresholds.get(yc + 1)
        if thr and abs(v.co.x) >= thr:
            outer.append(v)
    for _ in range(iters):
        deltas = {}
        for v in outer:
            if not v.link_edges:
                continue
            nbrs = [e.other_vert(v).co for e in v.link_edges]
            avg = sum(nbrs, Vector((0.0, 0.0, 0.0))) / len(nbrs)
            # mainly pull lateral spike inward on x
            deltas[v.index] = Vector(((avg.x - v.co.x) * 0.70,
                                      (avg.y - v.co.y) * 0.20,
                                      (avg.z - v.co.z) * 0.25))
        for v in outer:
            d = deltas.get(v.index)
            if d is not None:
                v.co += d
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    print(f"ankle malleolus smooth: {len(outer)} verts x {iters} iters")
    return len(outer)


def morph_legs(obj, profile=None):
    """Neutral adult leg line + lower-leg shape (replaces the old shin
    translation).  The MPFB base stands with knees 30cm apart (thigh angled
    9.5deg out), then the shin hooks inward (calf at x 0.094 vs knee 0.15)
    and the ankle bulges out again -- a zigzag.  This morphs every leg
    vertex's x toward a natural target profile (hip -> knee -> calf -> ankle
    -> foot) measured per 1cm band, blended to zero at the hip joint
    (pelvis/torso untouched) and with the foot keeping its own width (it
    just translates with the ankle).

    profile: list of (y, center, half_width) in metres, from the hip down.
    Returns the final foot stance (outer |x|, cm)."""
    if profile is None:
        # Ankle half kept ~3.2cm (pristine malleolus); foot width preserved
        # separately below y=0.055 so toes don't pancake.
        profile = [
            (0.86, 0.090, 0.088), (0.78, 0.083, 0.079), (0.68, 0.078, 0.070),
            (0.58, 0.076, 0.060), (0.50, 0.075, 0.052), (0.42, 0.070, 0.051),
            (0.34, 0.065, 0.052), (0.28, 0.063, 0.050), (0.20, 0.064, 0.044),
            (0.14, 0.065, 0.036), (0.10, 0.065, 0.032), (0.07, 0.066, 0.031),
        ]
    verts = obj.data.vertices

    def sample(y0, y1):
        """Current per-side (center, half) of the leg cross-section in [y0,y1].
        Cap must cover the wide pre-morph stance (outer ~0.26) or cur_h is
        underestimated and outer malleolus verts get amplified into spikes."""
        out = {}
        for side in (1, -1):
            xs = [side * v.co.x for v in verts
                  if y0 <= v.co.y <= y1 and 0.015 <= side * v.co.x <= 0.32]
            if len(xs) >= 4:
                lo = min(xs)
                hi = max(xs)
                out[side] = ((lo + hi) * 0.5, (hi - lo) * 0.5)
        return out

    def interp(ys, vals, y):
        if len(ys) < 2:
            return vals[0]
        if ys[0] > ys[-1]:
            ys = list(reversed(ys))
            vals = list(reversed(vals))
        if y <= ys[0]:
            return vals[0]
        if y >= ys[-1]:
            return vals[-1]
        for i in range(len(ys) - 1):
            if ys[i] <= y <= ys[i + 1]:
                t = (y - ys[i]) / (ys[i + 1] - ys[i]) if ys[i + 1] > ys[i] else 0.0
                return vals[i] + (vals[i + 1] - vals[i]) * t
        return vals[-1]

    # smooth current center/half at every 1cm band (window +/-2cm)
    pys = [p[0] for p in profile]

    def bandmax(y0, y1):
        ws = [abs(v.co.x) for v in verts if y0 <= v.co.y <= y1 and abs(v.co.x) < 0.30]
        return round(max(ws) * 100.0, 1) if ws else 0.0

    print("MORPHDBG before:", [bandmax(y / 100.0, (y + 3) / 100.0) for y in (6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84)])
    for yc in (5, 10, 15, 20, 27, 33, 40, 50, 60, 70, 80):
        y = yc / 100.0
        s1 = sample(y - 0.02, y + 0.02)
        cur = s1.get(1) if s1 else None
        print(f"MORPHDBG y{yc}: cur={tuple(round(v * 100, 1) for v in cur) if cur else None} "
              f"tgt_c={interp(pys, [p[1] for p in profile], y) * 100:.1f} "
              f"tgt_h={interp(pys, [p[2] for p in profile], y) * 100:.1f}")
    cur_c = {}
    cur_h = {}
    for side in (1, -1):
        cs, hs, ys = [], [], []
        for yc in range(2, 90, 1):
            y = yc / 100.0
            s = sample(y - 0.02, y + 0.02)
            if side in s:
                cs.append(s[side][0])
                hs.append(s[side][1])
                ys.append(y)
        cur_c[side] = (ys, cs)
        cur_h[side] = (ys, hs)

    for side in (1, -1):
        (ys, cs), (ysh, hs) = cur_c[side], cur_h[side]
        moved = 0
        for v in verts:
            y = v.co.y
            if y < 0.0 or y > 0.90:
                continue
            sx = side * v.co.x
            # foot shell reaches x 0.27; legs/hands stay under 0.26
            cap = 0.30 if y < 0.08 else 0.26
            if sx < 0.015 or sx > cap:
                continue
            # hip blend: full below 0.84, zero at 0.90 (pelvis stays)
            w = 1.0 - _smoothstep01((y - 0.84) / 0.06)
            if w <= 0.01:
                continue
            cur_cv = interp(ys, cs, y)
            cur_hv = interp(ysh, hs, y)
            tgt_c = interp(pys, [p[1] for p in profile], y)
            tgt_h = interp(pys, [p[2] for p in profile], y)
            if y < 0.055:
                tgt_h = cur_hv  # foot keeps its width; it only translates
            if cur_hv < 1e-4:
                continue
            tgt_x = tgt_c + (sx - cur_cv) * (tgt_h / cur_hv)
            v.co.x = side * (sx + (tgt_x - sx) * w)
            moved += 1
        print(f"leg morph side {side}: {moved} verts")
    obj.data.update()
    print("MORPHDBG after: ", [bandmax(y / 100.0, (y + 3) / 100.0) for y in (6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84)])
    feet = [v for v in verts if v.co.y < 0.06]
    stance = round(max(abs(v.co.x) for v in feet) * 200.0, 1) if feet else 0.0
    print(f"foot stance after leg morph: {stance}cm across")
    return stance


def measure_body_profile(obj, label=""):
    """Full envelope per y band: widthAll (2*max|x|), widthTorso (x<0.30),
    depth (z extent, x<0.30). cm values (GLTF frame)."""
    rows = []
    for y in range(6, 152, 3):
        y0, y1 = y / 100.0, (y + 3) / 100.0
        ws = [v for v in obj.data.vertices if y0 <= v.co.y <= y1]
        if not ws:
            continue
        w_all = max(abs(v.co.x) for v in ws) * 2.0
        wt = max((abs(v.co.x) for v in ws if abs(v.co.x) < 0.30), default=0.0) * 2.0
        zs = [v.co.z for v in ws if abs(v.co.x) < 0.30]
        depth = (max(zs) - min(zs)) if zs else 0.0
        rows.append((y, w_all * 100.0, wt * 100.0, depth * 100.0))
    print(f"BODY PROFILE {label} (y_cm, widthAll, widthTorso, depth):")
    for y, a, t, d in rows:
        print(f"  {y:6.1f}  {a:6.2f}  {t:6.2f}  {d:6.2f}")
    return rows


def measure_limbs(obj):
    """Arm pose / segment geometry + leg segment widths (cm, deg)."""
    out = {}
    right = [v for v in obj.data.vertices if _arm_region(v.co, 1)]
    if right:
        top = [v for v in right if v.co.y > 1.30]
        S = sum((v.co for v in top), Vector((0.0, 0.0, 0.0))) / len(top)
        low = [v for v in right if 0.82 <= v.co.y <= 0.95 and v.co.x > 0.24]
        H = sum((v.co for v in low), Vector((0.0, 0.0, 0.0))) / len(low) if low else S
        elbow = [v for v in right if 1.00 <= v.co.y <= 1.16 and v.co.x > 0.22]
        E = sum((v.co for v in elbow), Vector((0.0, 0.0, 0.0))) / len(elbow) if elbow else H
        d = Vector((H.x - S.x, H.y - S.y, 0.0))
        d_e = Vector((E.x - S.x, E.y - S.y, 0.0))
        out["arm_angle"] = round(math.degrees(math.atan2(d.x, -d.y)), 1)
        out["upper_arm"] = round(d_e.length * 100.0, 1)
        out["forearm"] = round((H - E).length * 100.0, 1)
        # upper-arm max radius: perpendicular distance from the S->E axis
        axis = d_e.normalized() if d_e.length > 1e-6 else Vector((0.0, -1.0, 0.0))
        mid = d_e.length * 0.5
        rads = []
        for v in right:
            rv = Vector((v.co.x - S.x, v.co.y - S.y, 0.0))
            if abs(rv.length - mid) < 0.06:
                rads.append((rv - axis * rv.dot(axis)).length)
        out["upper_arm_radius"] = round(max(rads) * 100.0, 1) if rads else 0.0
    for label, y0, y1 in (("thigh", 0.52, 0.74), ("knee", 0.40, 0.50),
                          ("calf", 0.20, 0.38), ("ankle", 0.06, 0.12)):
        ws = [v for v in obj.data.vertices if y0 <= v.co.y <= y1 and abs(v.co.x) < 0.30]
        out[label] = round(max(abs(v.co.x) for v in ws) * 200.0, 1) if ws else 0.0
    feet = [v for v in obj.data.vertices if v.co.y < 0.06 and abs(v.co.x) < 0.20]
    if feet:
        out["foot_len"] = round((max(v.co.z for v in feet) - min(v.co.z for v in feet)) * 100.0, 1)
        out["foot_w"] = round(max(abs(v.co.x) for v in feet) * 200.0, 1)
    print("LIMBS " + json.dumps(out, ensure_ascii=False))
    return out


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


def open_eye_sockets(skin, eye_l, eye_r, aperture=0.68):
    """Cut clean circular lid openings with a cylinder boolean (GLTF frame).
    Face delete left sawtooth rims; a short cylinder through each orbit
    gives a round aperture the sclera can read through."""
    def fit(obj):
        vs = [v.co for v in obj.data.vertices]
        c = sum(vs, Vector((0.0, 0.0, 0.0))) / len(vs)
        r = sum((v - c).length for v in vs) / len(vs)
        return c, r

    total = 0
    for eye in (eye_l, eye_r):
        c, r = fit(eye)
        rad = r * aperture
        # Cylinder along face-forward (+Z), short, centered on the lid plane
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32, radius=rad, depth=r * 1.6,
            location=(c.x, c.y, c.z + r * 0.55),
            rotation=(0.0, 0.0, 0.0),
        )
        cutter = bpy.context.active_object
        cutter.name = "_EyeCutter"
        # Align cylinder axis to +Z (default); face is +Z already
        bpy.ops.object.select_all(action="DESELECT")
        skin.select_set(True)
        bpy.context.view_layer.objects.active = skin
        mod = skin.modifiers.new("eye_cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        try:
            mod.operand_type = "OBJECT"
        except (AttributeError, TypeError):
            pass
        mod.object = cutter
        try:
            bpy.ops.object.modifier_apply(modifier="eye_cut")
            total += 1
        except RuntimeError as exc:
            print(f"WARN: eye boolean failed: {exc}")
            skin.modifiers.remove(mod)
        bpy.data.objects.remove(cutter, do_unlink=True)
    print(f"eye sockets opened: {total} boolean cuts (aperture={aperture})")
    return total


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


def snap_eyes_to_sockets(skin, eye_l, eye_r):
    """Rigidly translate each eyeball so its centre sits in the orbital rim
    measured on the (already deformed) skin. Returns (|x|, y, z) target.
    Operates in the GLTF frame (+Y up, face +Z)."""
    def rim_center(sign):
        # forward-most third of the orbital band = lid rim
        cands = [v.co.copy() for v in skin.data.vertices
                 if 1.575 <= v.co.y <= 1.655
                 and 0.018 <= sign * v.co.x <= 0.055
                 and v.co.z > 0.08]
        if len(cands) < 12:
            return None
        cands.sort(key=lambda p: -p.z)  # GLTF +Z = face forward
        rim = cands[:max(12, len(cands) // 3)]
        c = sum(rim, Vector((0.0, 0.0, 0.0))) / len(rim)
        # Seat deeper so the sphere stays fully behind the sealed lid sheet
        # (front of eye ≈ lid_z - 4mm). Separate eyeballs are not visible
        # through opaque lids; they exist for export/composites only.
        return Vector((math.copysign(abs(c.x), sign), c.y, c.z - 0.020))

    targets = {1: rim_center(1), -1: rim_center(-1)}
    if targets[1] is None or targets[-1] is None:
        print("WARN: eye socket rim not found, skip snap")
        return None
    # enforce exact mirror
    cx = (abs(targets[1].x) + abs(targets[-1].x)) * 0.5
    cy = (targets[1].y + targets[-1].y) * 0.5
    cz = (targets[1].z + targets[-1].z) * 0.5
    targets[1] = Vector((cx, cy, cz))
    targets[-1] = Vector((-cx, cy, cz))

    def fit_c(obj):
        vs = [v.co for v in obj.data.vertices]
        return sum(vs, Vector((0.0, 0.0, 0.0))) / len(vs)

    for eye, sign in ((eye_l, 1), (eye_r, -1)):
        cur = fit_c(eye)
        delta = targets[sign] - cur
        for v in eye.data.vertices:
            v.co += delta
        eye.data.update()
        print(f"eye snap side={sign:+d}: delta=({delta.x*1000:.1f},{delta.y*1000:.1f},{delta.z*1000:.1f})mm")
    return cx, cy, cz


def inflate_upper_arms(obj, amount=0.010):
    """Add deltoid/bicep volume after repose (radial push from arm axis)."""
    verts = obj.data.vertices
    right = [v for v in verts if _arm_region(v.co, 1)]
    if len(right) < 50:
        return 0
    stop = [v for v in right if v.co.y > 1.30]
    S = sum((v.co for v in stop), Vector((0.0, 0.0, 0.0))) / len(stop)
    el = [v for v in right if 1.05 <= v.co.y <= 1.18 and v.co.x > 0.22]
    E = sum((v.co for v in el), Vector((0.0, 0.0, 0.0))) / len(el) if el else S
    axis = (E - S)
    if axis.length < 1e-4:
        return 0
    axis.normalize()
    L = (E - S).length
    moved = 0
    for side in (1, -1):
        for v in verts:
            p = v.co
            if not _arm_region(p, side):
                continue
            r = Vector(((p.x if side > 0 else -p.x) - S.x, p.y - S.y, p.z - S.z))
            t = r.dot(axis)
            if t < 0.02 or t > L + 0.02:
                continue
            # peak around mid upper-arm / deltoid
            along = math.exp(-((t - 0.10) / 0.09) ** 2)
            perp = r - axis * t
            pr = perp.length
            if pr < 1e-5:
                continue
            w = along * _smoothstep01((pr - 0.01) / 0.02)
            if w < 0.04:
                continue
            push = (perp / pr) * (amount * w)
            v.co.x += push.x if side > 0 else -push.x
            v.co.y += push.y
            v.co.z += push.z
            moved += 1
    obj.data.update()
    print(f"upper-arm inflate: amount={amount*1000:.1f}mm, {moved} verts")
    return moved


def band_width(obj, y0, y1, zmin, xcap=None, zmax=None):
    """Max |x| (metres) of verts in a y/z band; xcap/zmax optional."""
    best = 0.0
    for v in obj.data.vertices:
        c = v.co
        if y0 <= c.y <= y1 and c.z >= zmin and (zmax is None or c.z <= zmax) \
                and (xcap is None or abs(c.x) <= xcap):
            if abs(c.x) > best:
                best = abs(c.x)
    return best


def skull_cap_spec(head, head_target=0.230):
    """Ramp y-scale anchored at the brow: crown comes down to chin+target.
    Face (brow/eyes/nose/mouth) stays put -- only the skull cap compresses."""
    hv = head.data.vertices
    crown = max(v.co.y for v in hv)
    brow_z, brow_y = max((v.co.z, v.co.y) for v in hv
                         if abs(v.co.x) < 0.002 and 1.633 <= v.co.y <= 1.688)
    chin = chin_tip_y(hv, fallback=crown - 0.05)
    target = chin + head_target
    f_top = 1.0 + (target - crown) / (crown - brow_y)
    f_top = min(0.99, max(0.80, f_top))
    return {
        "type": "ramp", "axis": "y", "factor": round(f_top, 4),
        "y0": round(brow_y, 4), "y1": round(max(crown + 0.02, brow_y + 0.12), 4),
        "mask": {"sigma": (0.30, 0.30), "center": (0.0, 0.09)},
        "note": f"skull cap {crown*100:.1f}->{target*100:.1f}cm (brow fixed)",
    }


def chin_tip_y(verts, zmin=0.105, fallback=None):
    """Lowest centreline point of the chin: min y of |x|<0.002 verts whose
    z >= zmin (the neck front sits below z 0.09, the menton above z 0.115)."""
    best = None
    for v in verts:
        if abs(v.co.x) < 0.002 and v.co.z >= zmin:
            if best is None or v.co.y < best:
                best = v.co.y
    if best is None:
        for v in verts:
            if v.co.z > 0.100 and abs(v.co.x) < 0.03:
                if best is None or v.co.y < best:
                    best = v.co.y
    return best if best is not None else fallback


def measure_landmarks(head, body, eye_y):
    """Anatomical landmarks (GLTF frame, metres). Returns dict (cm values
    are meters*100 rounded; profile is [[y,z],...] of the centreline).
    NOTE: y-ranges assume the neck lengthen (+0.015) has been applied."""
    hv = head.data.vertices
    crown = max(v.co.y for v in hv)
    chin = chin_tip_y(hv, fallback=crown - 0.05)
    prof = {}
    for v in hv:
        if abs(v.co.x) < 0.002:
            y = round(v.co.y, 3)
            if v.co.z > prof.get(y, -9.0):
                prof[y] = v.co.z
    rows = sorted(prof.items())
    brow_z, brow_y = max((z, y) for y, z in rows if 1.633 <= y <= 1.688)
    glab_z, glab_y = min((z, y) for y, z in rows if brow_y - 0.016 <= y <= brow_y - 0.003)
    nas_z, nas_y = min((z, y) for y, z in rows if brow_y - 0.035 <= y <= brow_y - 0.012)
    tip_z, tip_y = max((z, y) for y, z in rows if 1.548 <= y <= 1.608)
    base_z, base_y = min((z, y) for y, z in rows if 1.553 <= y <= 1.588)
    mouth_z, mouth_y = max((z, y) for y, z in rows if 1.528 <= y <= 1.556)
    h = crown - chin

    def pct(y):
        return round((crown - y) / h * 100.0, 1)

    ear_ys = [v.co.y for v in hv if abs(v.co.x) > 0.076]
    mid = [v.co.z for v in hv if abs(v.co.x) < 0.06 and 1.583 <= v.co.y <= 1.653]
    head_depth = (max(mid) - min(mid)) if mid else 0.0
    nz = [v.co.z for v in body.data.vertices if 1.40 <= v.co.y <= 1.45
          and abs(v.co.x) < 0.13 and v.co.z < 0.085]
    neck_depth = (max(nz) - min(nz)) if nz else 0.0
    return {
        "crown": round(crown, 4), "chin": round(chin, 4),
        "head_height": round(h, 4),
        "brow_y": round(brow_y, 3), "brow_z": round(brow_z, 4),
        "glabella_y": round(glab_y, 3), "glabella_z": round(glab_z, 4),
        "nasion_y": round(nas_y, 3), "nasion_z": round(nas_z, 4),
        "nose_tip_y": round(tip_y, 3), "nose_tip_z": round(tip_z, 4),
        "nose_base_y": round(base_y, 3),
        "mouth_y": round(mouth_y, 3),
        "pct_brow": pct(brow_y), "pct_eye": pct(eye_y),
        "pct_nose_tip": pct(tip_y), "pct_nose_base": pct(base_y),
        "pct_mouth": pct(mouth_y),
        "skull_width": round(2 * band_width(head, 1.653, 1.768, 0.02), 4),
        "crown_top": round(2 * band_width(head, crown - 0.035, crown - 0.005, 0.02), 4),
        "head_depth": round(head_depth, 4),
        "zygomatic": round(2 * band_width(head, 1.548, 1.648, 0.080, 0.075), 4),
        "jaw": round(2 * band_width(head, 1.488, 1.553, 0.090, 0.075, 0.125), 4),
        "chin_width": round(2 * band_width(head, 1.485, 1.512, 0.120, 0.030), 4),
        "mouth_width": round(2 * band_width(head, 1.536, 1.562, 0.148, 0.030), 4),
        "nose_width": round(2 * band_width(head, 1.553, 1.568, 0.148, 0.024, 0.166), 4),
        "neck_width": round(2 * band_width(body, 1.42, 1.46, -0.10, 0.07, 0.085), 4),
        "neck_depth": round(neck_depth, 4),
        # A-pose arms hang beside the torso; x/z caps exclude the arm tube
        # (arm x 0.16-0.34, hand z ~0.27) from the torso-only readings.
        "shoulder": round(2 * band_width(body, 1.33, 1.37, 0.02, None, 0.20), 4),
        "chest": round(2 * band_width(body, 1.18, 1.22, 0.05, 0.18), 4),
        "pelvis": round(2 * band_width(body, 0.94, 1.06, 0.0, 0.24, 0.22), 4),
        "waist": round(2 * min(band_width(body, y, y + 0.03, 0.0, 0.20)
                               for y in [v / 100 for v in range(105, 122, 3)]), 4),
        "ear": {
            "min": round(min(ear_ys), 3) if ear_ys else 0.0,
            "max": round(max(ear_ys), 3) if ear_ys else 0.0,
            "height": round((max(ear_ys) - min(ear_ys)) if ear_ys else 0.0, 3),
            "xmax": round(max(abs(v.co.x) for v in hv if abs(v.co.x) > 0.076), 3)
            if ear_ys else 0.0,
        },
        "total_height": round(crown, 4),
        "profile": [[round(y, 3), round(z, 4)] for y, z in rows],
    }


def recalc_normals(obj):
    """Recalculate face winding so every face points outward (fixes folded
    180-degree seam faces left by the mirror weld)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def weld_centerline(obj, eps=1.5e-4, region=0.01):
    """Merge the double centreline column (mirror seam): the base mesh has
    two near-coincident vertex columns at x~+/-0.0015; enforce_symmetry snaps
    both to x=0 so they overlap exactly, which renders as a visible seam
    (z-fighting double surface) -- the reported 'vertical line' from the
    glabella to the nose bridge. Merges coincident verts near the centreline,
    then deletes degenerate faces. Returns (welded_pairs, removed_faces)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seam = [v for v in bm.verts if abs(v.co.x) < region]
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=seam, dist=eps)
    welded = before - len(bm.verts)
    dead = [f for f in bm.faces if len(f.verts) < 3 or f.calc_area() < 1e-10]
    for f in dead:
        bmesh.ops.delete(bm, geom=[f], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return welded, len(dead)


def mesh_diagnostics(obj):
    """Mirror-seam duplicates, face orientation, sharp creases (GLTF frame)."""
    verts = obj.data.vertices
    polys = obj.data.polygons
    from mathutils.kdtree import KDTree
    kd = KDTree(len(verts))
    for i, v in enumerate(verts):
        kd.insert(v.co, i)
    kd.balance()
    dup_pairs = 0
    worst = 0.0
    for i, v in enumerate(verts):
        if abs(v.co.x) > 0.01:
            continue
        res = kd.find_n(v.co, 2)
        if len(res) >= 2 and res[1][2] < 1e-5:
            dup_pairs += 1
            worst = max(worst, res[1][2])
    # face orientation: a centroid-based test misfires on concave features
    # (eye sockets, nostrils, ear bowls) -- count only near-180-degree
    # coplanar-opposite edge pairs, which indicate genuinely flipped faces.
    edge_faces = {}
    for fi, p in enumerate(polys):
        for ek in p.edge_keys:
            edge_faces.setdefault(ek, []).append(fi)
    boundary = sum(1 for fis in edge_faces.values() if len(fis) == 1)
    # where are the boundary edges? (y/z band histogram, 5cm buckets)
    by_bands = {}
    bz_bands = {}
    for ek, fis in edge_faces.items():
        if len(fis) != 1:
            continue
        mid = (verts[ek[0]].co + verts[ek[1]].co) * 0.5
        by_bands.setdefault(round(mid.y * 20) / 20.0, 0)
        by_bands[round(mid.y * 20) / 20.0] += 1
        bz_bands.setdefault(round(mid.z * 20) / 20.0, 0)
        bz_bands[round(mid.z * 20) / 20.0] += 1
    if boundary:
        print("BOUNDARY EDGES y-bands:", dict(sorted(by_bands.items())))
        print("BOUNDARY EDGES z-bands:", dict(sorted(bz_bands.items())))
    flipped = 0
    sharp = 0
    sharpest = 0.0
    seam_sharp = 0
    for ek, fis in edge_faces.items():
        if len(fis) != 2:
            continue
        ang = polys[fis[0]].normal.angle(polys[fis[1]].normal)
        if ang > math.radians(40):
            sharp += 1
            sharpest = max(sharpest, math.degrees(ang))
            if abs(verts[ek[0]].co.x) < 0.005 and abs(verts[ek[1]].co.x) < 0.005:
                seam_sharp += 1
            if ang > math.radians(179.5):
                flipped += 1
                if flipped <= 12:
                    c0 = polys[fis[0]].center
                    c1 = polys[fis[1]].center
                    a0 = polys[fis[0]].area
                    a1 = polys[fis[1]].area
                    print(f"FLIP180 face#{fis[0]} c=({c0.x:.4f},{c0.y:.4f},{c0.z:.4f}) "
                          f"area={a0:.2e} vs face#{fis[1]} c=({c1.x:.4f},{c1.y:.4f},{c1.z:.4f}) "
                          f"area={a1:.2e} edge=({verts[ek[0]].co.x:.4f},{verts[ek[0]].co.y:.4f})")
    return {"dup_center": dup_pairs, "worst_dup": round(worst, 8),
            "opposed_180": flipped, "boundary_edges": boundary,
            "sharp40": sharp, "sharpest_deg": round(sharpest, 1),
            "seam_sharp40": seam_sharp}


def print_measure(m):
    p = m["profile"]
    print("CENTERLINE PROFILE (y, z@x~0):")
    for i in range(0, len(p), 12):
        print("  " + " ".join(f"{y:.3f}:{z:.4f}" for y, z in p[i:i + 12]))

    def c(k):
        return f"{m[k]*100:.1f}"

    print("MEASURE " + " ".join([
        f"crown={c('crown')} chin={c('chin')} head={c('head_height')}cm",
        f"brow={m['pct_brow']}% eye={m['pct_eye']}% noseTip={m['pct_nose_tip']}% "
        f"noseBase={m['pct_nose_base']}% mouth={m['pct_mouth']}%",
        f"| skull={c('skull_width')} headD={c('head_depth')} zyg={c('zygomatic')} jaw={c('jaw')} chinW={c('chin_width')}",
        f"mouthW={c('mouth_width')} noseW={c('nose_width')} "
        f"earH={m['ear']['height']*100:.1f} earY={m['ear']['min']*100:.0f}-{m['ear']['max']*100:.0f}",
        f"| neck={c('neck_width')} neckD={c('neck_depth')} shldrSilh={c('shoulder')} "
        f"chest={c('chest')} pelvis={c('pelvis')} waist={c('waist')}",
        f"total={c('total_height')}",
    ]))


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

    # ---- head extras: subsurf L2, fine strokes (NO flat neck cap — the cap
    # disk reads as a black collar; close_neck_seam buries open rims instead) ----
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

    # ---- mode: NX9_MODE=pristine measures the cleaned base.obj only ----
    # (no deforms / repose / neck / legs / skull cap) for ground truth.
    # NX9_MODE=normal builds the clean "normal human": the MakeHuman base
    # anatomy kept as-is (no proportion deforms, no skull cap, no arm/leg
    # re-pose, no neck/leg lengthening) + the gentle neutral detail strokes,
    # with symmetry / centreline weld / eye normalization applied.
    mode = os.environ.get("NX9_MODE", "")
    pristine = mode == "pristine"
    normal = mode == "normal"
    report["mode"] = "pristine" if pristine else ("normal" if normal else "v29-shoulder-ankle")

    # ---- dynamic patches (pristine measurements -> spec factors) ----
    if not (pristine or normal):
        zyg_base = band_width(head_skin, 1.50, 1.60, 0.080, 0.075)
        face_spec = next(s for s in DEFORM_SPECS if "face width" in s["note"])
        # NOTE: zyg_base is the HALF width (m); target half 0.0725 (14.5cm).
        # The /0.85 compensates the gauss falloff at the cheek wall.
        if 0.055 < zyg_base < 0.085:
            face_spec["factor"] = round(
                min(1.15, max(0.92, 1.0 + (0.0725 / zyg_base - 1.0) / 0.85)), 4)
        print(f"zygomatic base={zyg_base*100:.2f}cm -> face factor={face_spec['factor']}")
        report["zygomatic_base"] = round(zyg_base, 4)

        # chest wall only: exclude the deltoid bottom (x 0.26-0.28 at y1.23-1.26)
        chest_base = band_width(skin, 1.16, 1.24, 0.06, 0.22)
        chest_spec = next(s for s in DEFORM_SPECS if "chest broad" in s["note"])
        if 0.10 < chest_base < 0.18:
            chest_spec["factor"] = round(
                min(1.22, max(0.96, 1.0 + (0.137 / chest_base - 1.0) / 0.70)), 4)
        print(f"chest base={chest_base*100:.2f}cm -> chest factor={chest_spec['factor']}")
        report["chest_base"] = round(chest_base, 4)

        pel_base = band_width(skin, 0.94, 1.06, 0.0, 0.30, 0.22)
        pel_spec = next(s for s in DEFORM_SPECS if "pelvis neutral" in s["note"])
        if 0.12 < pel_base < 0.20:
            pel_spec["factor"] = round(
                min(0.96, max(0.80, 1.0 + (0.150 / pel_base - 1.0) / 0.80)), 4)
        print(f"pelvis base={pel_base*100:.2f}cm -> pelvis factor={pel_spec['factor']}")
        report["pelvis_base"] = round(pel_base, 4)

    # ---- proportion / feature deforms (pass 1: static specs) ----
    # Eyes must NOT receive face/torso gauss specs — those squash the sclera
    # off-sphere and leave the iris looking offset inside the white.
    if not (pristine or normal):
        apply_deforms(head_skin, DEFORM_SPECS)
        apply_deforms(skin, DEFORM_SPECS)
    report["deform_specs"] = len(DEFORM_SPECS)
    print(f"proportion deforms applied: {len(DEFORM_SPECS)}")

    # ---- v26 body reset: preserve arm topology, seat eyes behind lids ----
    if not (pristine or normal):
        # Keep near-base A-pose (40deg). Large repose shears the deltoid/hand
        # no matter how careful the rigid math — user priority is intact limbs.
        theta, angle0, joint = repose_arms(skin, target_angle_deg=38.0, elbow_bend_deg=0.0)
        report["arm_repose"] = {"from_deg": round(angle0, 1), "theta_deg": round(theta, 1),
                                "joint": [round(v, 4) for v in joint] if joint else None}
        for obj in (skin, head_skin, eye_l, eye_r):
            lengthen_neck(obj, dy=0.015)
        for obj in (skin, head_skin, eye_l, eye_r):
            extend_legs(obj, dy=0.033)
        report["neck_flare"] = flare_neck_root(skin, amount=0.018)
        flare_neck_root(head_skin, amount=0.010)
        report["shoulder_round"] = round_shoulder_caps(skin, amount=0.016)
        report["shoulder_smooth"] = smooth_shoulder_ridge(skin, iters=6)
        slim_arms(skin, factor=1.18)          # mild thicken, no proximal over-inflate
        report["arm_inflate"] = 0
        report["hand_compact"] = 0            # leave MakeHuman fingers alone
        report["arm_smooth"] = smooth_arm_junction(skin, iters=1)
        report["axilla_fill"] = fill_axilla(skin, amount=0.018)
        report["hip_smooth"] = smooth_hip_shelf(skin, iters=6)
        stance = morph_legs(skin)
        report["foot_stance"] = stance
        report["ankle_smooth"] = smooth_ankle_malleolus(skin, iters=7)
        report["hip_smooth2"] = smooth_hip_shelf(skin, iters=4)
        # second pass: shoulder peak can reappear slightly after arm smooth
        report["shoulder_round2"] = round_shoulder_caps(skin, amount=0.010)
        report["shoulder_smooth2"] = smooth_shoulder_ridge(skin, iters=4)
        print("body reset v29: round shoulder caps + ankle malleolus smooth, "
              "near-base A-pose, mild +18% arm, sealed lids")

    # ---- pass 2: skull-cap compression (crown -> chin+23cm, brow fixed) ----
    skull = skull_cap_spec(head_skin, head_target=0.230)
    if not (pristine or normal):
        apply_deforms(head_skin, [skull])
    report["skull_cap"] = skull
    print(f"skull cap: {skull['note']}")

    # ---- strict left-right symmetry ----
    hs, hp = enforce_symmetry(head_skin)
    ss, sp = enforce_symmetry(skin)
    report["symmetry_head"] = {"snapped": hs, "paired": hp}
    report["symmetry_body"] = {"snapped": ss, "paired": sp}
    print(f"symmetry head: {hs} snapped, {hp} paired | body: {ss} snapped, {sp} paired")

    # ---- weld the double centreline column (mirror seam -> visible line) ----
    # The base mesh has two near-coincident centre columns; after the symmetry
    # snap they overlap exactly and render as a seam line down the face.
    wh, wf = weld_centerline(head_skin)
    report["weld_head"] = {"verts": wh, "faces": wf}
    print(f"weld head: {wh} verts merged, {wf} degenerate faces removed")

    # ---- headless torso (body GLB + measurements; split before any weld so
    # the raw_y index map stays valid) ----
    raw_y_skin = [raw_y[i] for i in sorted(body_idx)]
    torso_keep = {j for j, ry in enumerate(raw_y_skin) if ry < neck_y_raw}
    torso = split_keep(skin, torso_keep)
    torso.name = "躯干皮肤"
    # Do NOT flat-cap the neck hole: the cap faces read as a black collar in
    # the viewport even after the head overlaps the stump. Leave the hole;
    # close_neck_seam buries the rim inside the head collar.
    shade_smooth(torso)
    # debug: why does the torso weld often merge 0 verts? print the centreline
    # column x positions before welding (first 12 verts |x|<0.01)
    tv = torso.data.vertices
    seam_x = sorted({round(v.co.x, 6) for v in tv if abs(v.co.x) < 0.01})[:8]
    print(f"torso centreline x values: {seam_x}")
    wt, wft = weld_centerline(torso)
    if normal and wt == 0:
        # sparse torso columns are ~3mm apart -> the 0.15mm weld misses them;
        # widen the weld to bridge the mirror seam (torso is smooth, safe).
        wt, wft = weld_centerline(torso, eps=2.0e-3)
    report["weld_torso"] = {"verts": wt, "faces": wft}
    print(f"weld torso: {wt} verts merged, {wft} degenerate faces removed")

    # ---- close the head/torso neck collar gap (black ring in viewport) ----
    # Do NOT move eyes here. Preview uses uncut skin sockets; eyes already
    # share lengthen_neck/extend_legs with skin. Head GLB export temporarily
    # shifts eyes by neck dy after iris creation.
    if not pristine:
        report["neck_seam"] = close_neck_seam(
            head_skin, torso, extras=(), overlap_m=0.010)
        # iris disks are created later; eyes stay locked to uncut skin sockets

    # ---- normal mode: repair seam winding (folded 180deg faces) ----
    if normal:
        recalc_normals(head_skin)
        recalc_normals(torso)
        print("normal mode: face normals recalculated (seam repair)")

    # always recalc after neck seam / hip edits so shading is clean
    if not (pristine or normal):
        recalc_normals(head_skin)
        recalc_normals(torso)
        recalc_normals(skin)

    # ---- materials (neutral; no skin tone / makeup per spec) ----
    mat_skin = make_mat("MpfbSkin", (0.78, 0.78, 0.78), 0.65)
    mat_sclera = make_mat("MpfbSclera", (0.92, 0.92, 0.92), 0.40)
    mat_iris = make_mat("MpfbIris", (0.30, 0.30, 0.32), 0.30)
    mat_hair = make_mat("MpfbHair", (0.20, 0.20, 0.20), 0.85)
    for obj, mat in ((head_skin, mat_skin), (skin, mat_skin), (torso, mat_skin),
                     (eye_l, mat_sclera), (eye_r, mat_sclera), (hair, mat_hair)):
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    # ---- eye geometry: equal size + mirror, seat behind closed lids ----
    # MPFB body skin has sealed eyelids (no orbit holes). Opening them with
    # boolean/face-delete destroyed the mesh or left sawtooth rims. Keep lids
    # intact; eyeballs sit behind the lid depression for head-GLB compositing.
    cx, er, cy, cz = normalize_eyes(eye_l, eye_r)
    snapped = snap_eyes_to_sockets(skin, eye_l, eye_r)
    if snapped is not None:
        cx, cy, cz = snapped
    report["eye_sockets"] = 0
    report["eye_x"] = round(cx, 4)
    report["eye_y"] = round(cy, 4)
    report["eye_z"] = round(cz, 4)
    report["eye_radius"] = round(er, 4)
    print(f"eyes normalized+snapped: x=+/-{cx:.4f} y={cy:.4f} z={cz:.4f} r={er:.4f}")

    # ---- anatomical measurement + mesh diagnostics (GLTF frame) ----
    meas = measure_landmarks(head_skin, torso, cy)
    report["measure"] = {k: v for k, v in meas.items() if k != "profile"}
    diag = mesh_diagnostics(head_skin)
    report["diag"] = diag
    print_measure(meas)
    print("DIAG", json.dumps(diag, ensure_ascii=False))
    print("HEAD WIDTH PROFILE (y -> max|x| cm, [all | z>0.08 | z>0.11]):")
    for y in [v / 1000.0 for v in range(1490, 1790, 20)]:
        a = band_width(head_skin, y, y + 0.02, 0.02) * 100.0
        f = band_width(head_skin, y, y + 0.02, 0.080) * 100.0
        g = band_width(head_skin, y, y + 0.02, 0.110) * 100.0
        print(f"  {y*100:6.1f}  {a:6.2f}  {f:6.2f}  {g:6.2f}")
    print("BODY WIDTH PROFILE (torso, y -> max|x| cm):")
    for y in [v / 100.0 for v in range(90, 152, 3)]:
        a = band_width(torso, y, y + 0.03, 0.0) * 100.0
        print(f"  {y*100:6.1f}  {a:6.2f}")
    profile_rows = measure_body_profile(skin, "FULL SKIN")
    report["body_profile"] = [[y, round(a, 2), round(t, 2), round(d, 2)]
                              for y, a, t, d in profile_rows]
    limbs = measure_limbs(skin)
    report["limbs"] = limbs
    print("BODY DEBUG (widest verts per band, torso):")
    for label, y0, y1 in (("shoulder", 1.30, 1.40), ("chest", 1.15, 1.28),
                          ("hips", 0.95, 1.08)):
        rows = sorted(((abs(v.co.x), v.co.x, v.co.y, v.co.z) for v in torso.data.vertices
                       if y0 <= v.co.y <= y1 and v.co.z > 0.0), reverse=True)[:5]
        print(f"  {label}: " + " | ".join(
            f"x={r[1]:+.4f} y={r[2]:.3f} z={r[3]:+.3f}" for r in rows))
    print("  shoulder by z-decade: " + " ".join(
        f"[{z0:.2f}-{z0+0.05:.2f}]={band_width(torso, 1.30, 1.40, z0, None, z0+0.05)*100:.1f}"
        for z0 in (0.0, 0.05, 0.10, 0.15)))
    print("  chest band (torso, x<0.22): " + " | ".join(
        f"x={r[1]:+.4f} y={r[2]:.3f} z={r[3]:+.3f}" for r in sorted(
            ((abs(v.co.x), v.co.x, v.co.y, v.co.z) for v in torso.data.vertices
             if 1.16 <= v.co.y <= 1.24 and v.co.z > 0.0 and abs(v.co.x) < 0.22),
            reverse=True)[:5]))
    print("  hip band (torso, x<0.24, z<0.22): " + " | ".join(
        f"x={r[1]:+.4f} y={r[2]:.3f} z={r[3]:+.3f}" for r in sorted(
            ((abs(v.co.x), v.co.x, v.co.y, v.co.z) for v in torso.data.vertices
             if 0.94 <= v.co.y <= 1.06 and 0.0 < v.co.z < 0.22 and abs(v.co.x) < 0.24),
            reverse=True)[:5]))
    print("  jaw band (head): " + " | ".join(
        f"x={r[1]:+.4f} y={r[2]:.3f} z={r[3]:+.3f}" for r in sorted(
            ((abs(v.co.x), v.co.x, v.co.y, v.co.z) for v in head_skin.data.vertices
             if 1.455 <= v.co.y <= 1.50 and 0.09 <= v.co.z <= 0.125), reverse=True)[:5]))

    # ---- rotate everything to Blender Z-up (export round-trips back) ----
    def to_blender_zup(obj):
        for v in obj.data.vertices:
            x, y, z = v.co
            v.co = (x, -z, y)
        obj.data.update()

    for obj in (head_skin, skin, torso, eye_l, eye_r, hair):
        to_blender_zup(obj)

    # ---- iris disks (plain neutral, Blender frame: face -Y) ----
    # Iris inset on the sclera front (Blender -Y). Keep well inside the
    # visible white so it reads as a pupil, not a floating sticker.
    forward = Vector((0.0, -1.0, 0.0))
    iris_l = add_disk("MpfbIrisL", Vector((cx, -cz, cy)) + forward * (er * 0.82),
                      forward, er * 0.36, mat_iris)
    iris_r = add_disk("MpfbIrisR", Vector((-cx, -cz, cy)) + forward * (er * 0.82),
                      forward, er * 0.36, mat_iris)

    # ---- stats in gltf frame (pre-rotation coords were gltf) ----
    def aabb(obj):
        vs = [v.co for v in obj.data.vertices]
        return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]

    # ---- export body GLB (headless torso; hair cap removed per user) ----
    bpy.ops.object.select_all(action="DESELECT")
    torso.select_set(True)
    bpy.context.view_layer.objects.active = torso
    body_path = os.path.join(outdir, "mpfb-body.glb")
    bpy.ops.export_scene.gltf(filepath=body_path, export_format="GLB", use_selection=True)
    report["body_glb"] = os.path.basename(body_path)

    # ---- export head GLB (head skin + eyes + iris) ----
    # Head was dropped by close_neck_seam; eyes/iris still match uncut skin.
    # Temporarily shift them by the same dy so the head package is sealed.
    dy_m = float(report.get("neck_seam", {}).get("dy_mm", 0) or 0) / 1000.0
    if abs(dy_m) > 1e-6:
        for obj in (eye_l, eye_r, iris_l, iris_r):
            for v in obj.data.vertices:
                v.co.z += dy_m  # Blender Z-up == former GLTF Y
            obj.data.update()
        print(f"head-export eyes: applied neck dy={dy_m*1000:.1f}mm")
    bpy.ops.object.select_all(action="DESELECT")
    for o in (head_skin, eye_l, eye_r, iris_l, iris_r):
        o.select_set(True)
    bpy.context.view_layer.objects.active = head_skin
    head_path = os.path.join(outdir, "mpfb-head.glb")
    bpy.ops.export_scene.gltf(filepath=head_path, export_format="GLB", use_selection=True)
    report["head_glb"] = os.path.basename(head_path)
    # Restore eyes to uncut-skin sockets for viewport preview
    if abs(dy_m) > 1e-6:
        for obj in (eye_l, eye_r, iris_l, iris_r):
            for v in obj.data.vertices:
                v.co.z -= dy_m
            obj.data.update()
        print(f"preview eyes: restored (undid neck dy={dy_m*1000:.1f}mm)")

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
    # Organize collections, set Material viewport shading, frame the figure,
    # and save a .blend for the user to inspect. (The headless torso was
    # already built above for the body GLB.)
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

    # Viewport preview uses the UNCUT full-body mesh (身体皮肤). Head was only
    # copied out for the high-res head GLB — the source skin never had a neck
    # cut, so it cannot show a head/torso collar gap. Split 头/躯干 stay for
    # GLB re-export but are viewport-hidden.
    sealed = skin
    sealed.hide_set(False)
    report["neck_weld"] = 0
    report["preview"] = "uncut-skin"

    coll_body = bpy.data.collections.new("身体")
    coll_head = bpy.data.collections.new("头部")
    coll_export = bpy.data.collections.new("导出-分体")
    bpy.context.scene.collection.children.link(coll_body)
    bpy.context.scene.collection.children.link(coll_head)
    bpy.context.scene.collection.children.link(coll_export)
    for obj, coll in (
        (sealed, coll_body),
        (eye_l, coll_head), (eye_r, coll_head),
        (iris_l, coll_head), (iris_r, coll_head),
        (torso, coll_export), (head_skin, coll_export),
    ):
        coll.objects.link(obj)
        try:
            bpy.context.scene.collection.objects.unlink(obj)
        except RuntimeError:
            pass
    coll_export.hide_viewport = True
    coll_export.hide_render = True
    torso.hide_set(True)
    head_skin.hide_set(True)
    # Ensure the continuous body is the one render-preview picks up
    sealed.name = "全身皮肤"
    sealed.data.name = "全身皮肤"
    # Eyes sit behind sealed lids on 全身皮肤 — hide in viewport so they don't
    # read as floating spheres; still exported in head GLB.
    for obj in (eye_l, eye_r, iris_l, iris_r):
        obj.hide_set(True)
        obj.hide_render = True

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
