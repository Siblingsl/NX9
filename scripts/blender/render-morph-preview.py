r"""渲染 NX9 sculpt GLB 各 morph 状态的正面头像对比预览。

导入 nx9-character-sculpt.glb，对每个关键 morph 参数应用 shape key，
渲染正面头像 PNG，直观检查变形效果。

用法：
    $env:NX9_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-sculpt.glb"
    $env:NX9_RENDER_OUT = "F:\code\project\NX9\output\sculpt-morph-preview"
    & "F:\Blender\blender.exe" --background --python scripts/blender/render-morph-preview.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB = os.environ.get(
    "NX9_GLB",
    os.path.join(REPO, "apps", "web", "public", "director3d", "models", "nx9-character-sculpt.glb"),
)
OUTDIR = os.environ.get("NX9_RENDER_OUT", os.path.join(REPO, "output", "sculpt-morph-preview"))

# 要渲染的 morph 状态：(标签, [(morph名, value)])
MORPH_STATES = [
    ("neutral", []),
    ("jawWidth.pos", [("jawWidth.pos", 1.0)]),
    ("jawWidth.neg", [("jawWidth.neg", 1.0)]),
    ("faceLength.pos", [("faceLength.pos", 1.0)]),
    ("faceLength.neg", [("faceLength.neg", 1.0)]),
    ("cheekboneWidth.pos", [("cheekboneWidth.pos", 1.0)]),
    ("eyeSize.pos", [("eyeSize.pos", 1.0)]),
    ("eyeSize.neg", [("eyeSize.neg", 1.0)]),
    ("eyeSpacing.pos", [("eyeSpacing.pos", 1.0)]),
    ("noseBridgeHeight.pos", [("noseBridgeHeight.pos", 1.0)]),
    ("noseBridgeHeight.neg", [("noseBridgeHeight.neg", 1.0)]),
    ("noseTipSize.pos", [("noseTipSize.pos", 1.0)]),
    ("mouthWidth.pos", [("mouthWidth.pos", 1.0)]),
    ("mouthWidth.neg", [("mouthWidth.neg", 1.0)]),
    ("upperLipThickness.pos", [("upperLipThickness.pos", 1.0)]),
    ("chinLength.pos", [("chinLength.pos", 1.0)]),
    ("chinProject.pos", [("chinProject.pos", 1.0)]),
    ("browArch.pos", [("browArch.pos", 1.0)]),
    ("eyeTilt.pos", [("eyeTilt.pos", 1.0)]),
    ("jawWidth.pos.L", [("jawWidth.pos.L", 1.0)]),  # 单侧
]


def setup(scene):
    scene.render.resolution_x = 512
    scene.render.resolution_y = 640
    scene.render.image_settings.file_format = "PNG"
    # EEVEE 渲染以正确显示 shape key 变形
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = name
            break
        except TypeError:
            continue
    print(f"render engine: {scene.render.engine}")
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.09, 0.09, 0.10, 1.0)
    scene.world = world


def place_camera(scene):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 0.34
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    # 正面：Blender Z-up 中面部朝 -Y，相机停在 +Y
    d = Vector((0, 1, 0))
    centre = Vector((0, -0.02, 1.62))
    cam.location = centre - d * 10.0
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def main():
    if not os.path.isfile(GLB):
        print(f"ERROR: GLB not found: {GLB}")
        return 1
    os.makedirs(OUTDIR, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    setup(scene)

    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass
    bpy.ops.import_scene.gltf(filepath=GLB)

    # 找到 HeadMesh
    head = None
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and "HeadMesh" in o.name:
            head = o
            break
    if head is None:
        print("ERROR: HeadMesh not found")
        return 1

    # 隐藏非头部网格（保留眼睛）
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        if "HeadMesh" in o.name:
            o.hide_render = False
        elif "Eye" in o.name or "Iris" in o.name:
            o.hide_render = True  # 只显示头模 clay
        else:
            o.hide_render = True

    head.data.materials.clear()
    mat = bpy.data.materials.new("Clay")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.78, 0.77, 0.745, 1.0)
    head.data.materials.append(mat)

    # 加一个主光（EEVEE 需要光源）
    light_data = bpy.data.lights.new("Key", type="AREA")
    light_data.energy = 60
    light_data.size = 2.0
    light = bpy.data.objects.new("Key", light_data)
    scene.collection.objects.link(light)
    light.location = Vector((1.2, -1.5, 2.6))
    d = Vector((0, 0, 1.62)) - light.location
    light.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    light2_data = bpy.data.lights.new("Fill", type="AREA")
    light2_data.energy = 25
    light2_data.size = 3.0
    light2 = bpy.data.objects.new("Fill", light2_data)
    scene.collection.objects.link(light2)
    light2.location = Vector((-1.6, 0.8, 1.8))
    d2 = Vector((0, 0, 1.62)) - light2.location
    light2.rotation_euler = d2.to_track_quat("-Z", "Y").to_euler()

    cam = place_camera(scene)

    # 隐藏 handle 空物体（渲染不影响，但保险起见）
    for o in bpy.context.scene.objects:
        if o.type == "EMPTY":
            o.hide_render = True

    for label, states in MORPH_STATES:
        # 清空所有 shape key
        if head.data.shape_keys:
            for kb in head.data.shape_keys.key_blocks:
                if kb.name != "Basis":
                    kb.value = 0.0
        # 应用 morph
        for name, val in states:
            kb = head.data.shape_keys.key_blocks.get(name)
            if kb:
                kb.value = val
            else:
                print(f"  WARN: shape key {name} 不存在")
        head.data.update()
        head.update_tag()
        bpy.context.view_layer.update()

        png = os.path.join(OUTDIR, f"{label}.png")
        scene.render.filepath = png
        bpy.ops.render.render(write_still=True)
        print(f"rendered {label} -> {png}")

    bpy.data.objects.remove(cam, do_unlink=True)
    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())