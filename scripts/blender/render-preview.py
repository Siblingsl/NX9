r"""Render preview screenshots of a NX9 character in background Blender.

Two sources:
  - NX9_SRC=blend (default): opens the .blend created by import-mpfb-base.py,
    hides the full-body skin (its coarse head overlaps the subsurfed head
    skin), renders framed views of the figure / head to PNG + ASCII dumps.
  - NX9_SRC=glb: imports mpfb-body.glb + mpfb-head.glb into a fresh scene and
    renders the same views (body views = all meshes, head views = meshes
    whose top is above y~1.3).

Usage:
    blender --background <blend> --python scripts/blender/render-preview.py
Env:
    NX9_BLEND       blend file to open (default: output/mpfb-preview/mpfb-preview.blend)
    NX9_SRC         blend | glb (default blend)
    NX9_GLB_BODY    body GLB path (NX9_SRC=glb)
    NX9_GLB_HEAD    head GLB path (NX9_SRC=glb)
    NX9_RENDER_OUT  output dir (default: output/screenshots)
    NX9_TAG         file-name tag, e.g. "current" or "normal"
"""
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.environ.get("NX9_SRC", "blend")
blend = os.environ.get(
    "NX9_BLEND", os.path.join(REPO, "output", "mpfb-preview", "mpfb-preview.blend"))
outdir = os.environ.get("NX9_RENDER_OUT", os.path.join(REPO, "output", "screenshots"))
tag = os.environ.get("NX9_TAG", "current")
os.makedirs(outdir, exist_ok=True)

CHARS = " .+@#"  # 5 luminance levels (matches the project's ASCII style)

# Orthographic cameras: scale is exact (no FOV/sensor distortion). Window
# height = ortho_scale (m); width = ortho_scale * render_aspect.
VIEWS = [
    # name, view centre (blender frame), view direction, ortho_scale, ascii
    # Face points toward -Y in Blender Z-up. Front camera must look along +Y
    # (parked at negative Y); back camera looks along -Y.
    # NOTE: NX9_TILT=1 nudges the front views off the exact cardinal axis
    # (workbench renders nothing for exactly ±Y in some Blender builds).
    ("body-front",   ( 0.00,  0.00,  0.85), (0,  1, 0), 2.10, 72, 110, "body"),
    ("body-side",    ( 0.00,  0.00,  0.85), (1,  0, 0), 2.10, 72, 110, "body"),
    ("body-back",    ( 0.00,  0.00,  0.85), (0, -1, 0), 2.10, 72, 110, "body"),
    ("body-quarter", ( 0.00,  0.00,  0.85), (0.7071,  0.7071, 0), 2.10, 72, 110, "body"),
    ("head-front",   ( 0.00, -0.05,  1.60), (0,  1, 0), 0.42, 64,  76, "head"),
    ("head-side",    ( 0.00, -0.05,  1.60), (1,  0, 0), 0.42, 64,  76, "head"),
    ("head-quarter", ( 0.00, -0.05,  1.60), (0.7071,  0.7071, 0), 0.42, 64,  76, "head"),
    ("head-close",   ( 0.00, -0.15,  1.62), (0,  1, 0), 0.26, 60,  76, "head"),
]

def view_direction(d):
    if os.environ.get("NX9_TILT", "") == "1":
        return (d[0] + 0.01, d[1], d[2])
    return d


def find_objects():
    """Classify scene meshes by name (robust to the project's CN names)."""
    out = {"torso": [], "head": [], "body": [], "eyes": [], "iris": []}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        n = obj.name
        if "虹膜" in n:
            out["iris"].append(obj)
        elif "眼" in n:
            out["eyes"].append(obj)
        elif "全身" in n:
            # welded preview body (preferred over split 头/躯干)
            out["torso"].append(obj)
        elif "躯干" in n:
            out["torso"].append(obj)
        elif "头部" in n:
            out["head"].append(obj)
        elif "身体" in n:
            out["body"].append(obj)
        else:
            # fallback by English names used earlier in the pipeline
            if n.startswith("MpfbSkin"):
                out["body"].append(obj)
            elif n.startswith("MpfbHeadSkin"):
                out["head"].append(obj)
            elif n.startswith("MpfbEye"):
                out["eyes"].append(obj)
            elif n.startswith("MpfbIris"):
                out["iris"].append(obj)
            elif n.startswith("躯干") or n.startswith("Torso"):
                out["torso"].append(obj)
            elif SRC == "glb":
                # GLB imports: classify by world position (head parts sit high)
                zmax = max(v.co.z for v in obj.data.vertices) if obj.data.vertices else 0.0
                if zmax > 1.30:
                    out["head"].append(obj)
                else:
                    out["torso"].append(obj)
    return out


def load_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o.type == "MESH"]
    return imported


def setup_engine(scene):
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = name
            return name
        except TypeError:
            continue
    return scene.render.engine


def setup_world(scene):
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.055, 0.055, 0.062, 1.0)
        bg.inputs[1].default_value = 1.0
    scene.world = world


def add_lights(scene):
    """3-point studio lighting that frames a ~1.7m figure at the origin."""
    def add(name, loc, target, energy, size):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = Vector(loc)
        d = Vector(target) - Vector(loc)
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return obj

    add("KeyLight", ( 2.4, -2.6, 3.0), (0.0, 0.0, 0.95), 400, 2.0)
    add("FillLight", (-3.0,  1.0, 2.4), (0.0, 0.0, 0.90), 150, 3.0)
    add("RimLight",  (-1.8,  2.8, 2.8), (0.0, 0.0, 1.10), 220, 2.0)


def place_camera(scene, centre, direction, ortho_scale):
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    # portrait render + AUTO fit makes EEVEE map ortho_scale to the wrong
    # axis (aspect distortion); force VERTICAL so ortho_scale = window height.
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    # the view centre = the camera location projected along the view axis, and
    # geometry behind the camera is culled -> park the camera 10m behind the
    # desired view centre (the figure is then fully in front, centred).
    d = Vector(direction).normalized()
    cam_obj.location = Vector(centre) - d * 10.0
    cam_obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj
    return cam_obj


def apply_mask(objs, mask):
    """body -> sealed(or torso+head) + eyes + iris; head -> same but camera is close."""
    only = os.environ.get("NX9_ONLY", "")
    all_mesh = [o for lst in objs.values() for o in lst]
    show = []
    if only:
        names = [n.strip() for n in only.split(",") if n.strip()]
        show = [o for o in all_mesh if any(k in o.name for k in names)]
    else:
        sealed = [o for o in objs["torso"] if "全身" in o.name]
        if sealed:
            # Sealed MPFB skin has closed lids — separate eye/iris spheres sit
            # behind opaque skin and only confuse the preview if they poke.
            show = list(sealed)
        elif mask == "head":
            show = objs["head"] + objs["eyes"] + objs["iris"]
        else:
            show = objs["torso"] + objs["head"] + objs["eyes"] + objs["iris"]
    show_ids = set(id(o) for o in show)
    for o in all_mesh:
        o.hide_render = id(o) not in show_ids
        # also clear viewport hide so sealed mesh renders if it was parked
        if id(o) in show_ids and o.hide_get():
            o.hide_set(False)


def ascii_from_png(png, cols, rows):
    """Downsample a rendered PNG to ASCII (5 luminance levels)."""
    img = bpy.data.images.load(png)
    try:
        w, h = img.size
        px = list(img.pixels)
        if len(px) < w * h * 4 or w == 0 or h == 0:
            return f"bad image {w}x{h} px={len(px)}"
        lines = []
        for r in range(rows):
            line = []
            for c in range(cols):
                x = int((c + 0.5) * w / cols)
                y = int((r + 0.5) * h / rows)
                i = (y * w + x) * 4
                lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
                idx = min(4, int(lum * 5.0))
                line.append(CHARS[idx])
            lines.append("".join(line))
        return "\n".join(lines)
    finally:
        bpy.data.images.remove(img, do_unlink=True)


def main():
    scene = bpy.context.scene
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1080
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    engine = setup_engine(scene)
    print(f"render engine: {engine}")
    setup_world(scene)

    if SRC == "glb":
        for coll in list(bpy.data.collections):
            bpy.data.collections.remove(coll)
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        body_glb = os.environ.get("NX9_GLB_BODY", "")
        head_glb = os.environ.get("NX9_GLB_HEAD", "")
        if body_glb:
            load_glb(body_glb)
        if head_glb:
            load_glb(head_glb)

    # NX9_FLAT=1 -> workbench, flat material color, no lights/shadows:
    # isolates geometry from lighting for debugging.
    flat = os.environ.get("NX9_FLAT", "") == "1"

    objs = find_objects()
    print("objects: " + ", ".join(
        f"{k}={[o.name for o in v]}" for k, v in objs.items()))
    if flat:
        try:
            scene.render.engine = "BLENDER_WORKBENCH"
            scene.display.shading.color_type = "MATERIAL"
            scene.display.shading.light = "FLAT"
            scene.display.shading.show_shadows = False
            print("flat mode: workbench material color")
        except Exception as e:  # noqa: BLE001
            print(f"flat setup failed: {e}")
    else:
        add_lights(scene)

    for name, centre, direction, ortho_scale, cols, rows, mask in VIEWS:
        apply_mask(objs, mask)
        cam = place_camera(scene, centre, view_direction(direction), ortho_scale)
        png = os.path.join(outdir, f"{tag}-{name}.png")
        scene.render.filepath = png
        bpy.ops.render.render(write_still=True)
        art = ascii_from_png(png, cols, rows)
        txt = os.path.join(outdir, f"{tag}-{name}.txt")
        with open(txt, "w", encoding="utf-8") as fh:
            fh.write(f"=== {name} {cols}x{rows} (engine {engine}) ===\n{art}\n")
        print(f"rendered {png} + {txt}")
        cam_data = cam.data
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data, do_unlink=True)

    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
