r"""实验 A：GLB 原样导入→原样导出，验证 Blender 5.2 glTF 往返是否干净。"""
import os

import bpy

SRC = os.environ["NX9_SRC_GLB"]
OUT = os.environ["NX9_OUT_GLB"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SRC)
print(f"[EXPA] imported, meshes={len([o for o in bpy.context.scene.objects if o.type=='MESH'])}")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=False,
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_animations=False,
    export_skins=False,
    export_cameras=False,
    export_lights=False,
    export_all_influences=False,
)
print(f"[EXPA] exported {OUT}")
