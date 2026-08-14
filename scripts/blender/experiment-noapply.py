r"""实验 E：导入→导出（export_apply=False），验证索引/位移是否正常。"""
import os

import bpy

SRC = os.environ["NX9_SRC_GLB"]
OUT = os.environ["NX9_OUT_GLB"]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SRC)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=False,
    export_yup=True,
    export_apply=False,
    export_materials="EXPORT",
    export_animations=False,
    export_skins=False,
    export_cameras=False,
    export_lights=False,
    export_all_influences=False,
)
print(f"[EXPE] exported {OUT}")
