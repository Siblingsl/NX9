"""Export frozen MPFB preview meshes for NX9 sculpt desk packaging.

Splits 身体皮肤 at the neck into HeadMesh + BodyMesh (GLTF Y-up on export),
renames eyes/iris, assigns Skin/Iris materials. No shape keys (Blender 5.2
glTF exporter zeros them) — morphs are added in the TS pack step.

Usage:
  $env:NX9_BLEND = "F:\\code\\project\\NX9\\output\\mpfb-frozen\\v29-shoulder-ankle-20260814\\mpfb-v29-shoulder-ankle.blend"
  $env:NX9_OUT_GLB = "F:\\code\\project\\NX9\\output\\mpfb-frozen\\v29-shoulder-ankle-20260814\\mpfb-sculpt-raw.glb"
  & "F:\\Blender\\blender.exe" --background --python scripts/blender/export-mpfb-for-sculpt.py
"""
from __future__ import annotations

import bpy
import bmesh
import os
import json
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BLEND = os.environ.get(
    "NX9_BLEND",
    os.path.join(REPO, "output", "mpfb-frozen", "v29-shoulder-ankle-20260814", "mpfb-v29-shoulder-ankle.blend"),
)
OUT_GLB = os.environ.get(
    "NX9_OUT_GLB",
    os.path.join(REPO, "output", "mpfb-frozen", "v29-shoulder-ankle-20260814", "mpfb-sculpt-raw.glb"),
)
# Neck cut in Blender Z-up (== former GLTF Y). Match import-report neck_y_gltf.
NECK_Z = float(os.environ.get("NX9_NECK_Z", "1.44"))


def log(msg: str) -> None:
    print(msg, flush=True)


def ensure_mat(name: str, color=(0.78, 0.77, 0.745, 1.0)):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
    return mat


def rename(obj, name: str):
    obj.name = name
    if obj.data:
        obj.data.name = name


def split_skin_at_neck(skin, neck_z: float):
    """Duplicate skin; keep head (z>=neck) on one, body (z<neck) on other."""
    head = skin.copy()
    head.data = skin.data.copy()
    bpy.context.collection.objects.link(head)

    body = skin.copy()
    body.data = skin.data.copy()
    bpy.context.collection.objects.link(body)

    def keep(obj, predicate):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        doomed = [v for v in bm.verts if not predicate(v)]
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")
        bm.to_mesh(obj.data)
        obj.data.update()
        n = len(bm.verts)
        bm.free()
        return n

    nh = keep(head, lambda v: v.co.z >= neck_z - 0.01)
    nb = keep(body, lambda v: v.co.z <= neck_z + 0.02)
    log(f"split neck_z={neck_z}: HeadMesh verts={nh}, BodyMesh verts={nb}")
    return head, body


def main():
    log(f"open blend: {BLEND}")
    if not os.path.isfile(BLEND):
        raise SystemExit(f"missing blend: {BLEND}")

    bpy.ops.wm.open_mainfile(filepath=BLEND)

    skin = bpy.data.objects.get("身体皮肤") or bpy.data.objects.get("全身皮肤")
    if skin is None:
        raise SystemExit("missing 身体皮肤 / 全身皮肤")

    eye_l = bpy.data.objects.get("左眼")
    eye_r = bpy.data.objects.get("右眼")
    iris_l = bpy.data.objects.get("左虹膜")
    iris_r = bpy.data.objects.get("右虹膜")

    # Hide / remove everything we will not export
    keep_names = {skin.name}
    for o in (eye_l, eye_r, iris_l, iris_r):
        if o:
            keep_names.add(o.name)

    head, body = split_skin_at_neck(skin, NECK_Z)
    rename(head, "HeadMesh")
    rename(body, "BodyMesh")

    mat_skin = ensure_mat("Skin", (0.784, 0.769, 0.745, 1.0))
    mat_iris = ensure_mat("Iris", (0.29, 0.25, 0.22, 1.0))
    mat_sclera = ensure_mat("Sclera", (0.91, 0.90, 0.87, 1.0))

    for mesh_obj in (head, body):
        mesh_obj.data.materials.clear()
        mesh_obj.data.materials.append(mat_skin)
        mesh_obj.hide_set(False)
        mesh_obj.hide_render = False

    export_objs = [head, body]

    if eye_l and eye_r:
        rename(eye_l, "EyeSclera.L")
        rename(eye_r, "EyeSclera.R")
        for o in (eye_l, eye_r):
            o.data.materials.clear()
            o.data.materials.append(mat_sclera)
            o.hide_set(False)
            o.hide_render = False
            export_objs.append(o)
    if iris_l and iris_r:
        rename(iris_l, "EyeIris.L")
        rename(iris_r, "EyeIris.R")
        for o in (iris_l, iris_r):
            o.data.materials.clear()
            o.data.materials.append(mat_iris)
            o.hide_set(False)
            o.hide_render = False
            export_objs.append(o)

    # Remove other mesh objects from selection / scene export noise
    bpy.ops.object.select_all(action="DESELECT")
    for o in export_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = head

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    log(f"wrote {OUT_GLB}")

    report = {
        "blend": BLEND,
        "out": OUT_GLB,
        "neck_z": NECK_Z,
        "objects": [o.name for o in export_objs],
        "head_verts": len(head.data.vertices),
        "body_verts": len(body.data.vertices),
    }
    report_path = OUT_GLB.replace(".glb", ".json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    log(f"report {report_path}")
    log("DONE")


if __name__ == "__main__":
    main()
