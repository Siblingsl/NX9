r"""实验 B：导入后把所有 shape key 的 value 设为 1 再导出，验证零位移是否由 key value=0 引起。"""
import os

import bpy

SRC = os.environ["NX9_SRC_GLB"]
OUT = os.environ["NX9_OUT_GLB"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SRC)
n = 0
for o in [x for x in bpy.context.scene.objects if x.type == "MESH"]:
    if o.data.shape_keys is not None:
        for k in o.data.shape_keys.key_blocks:
            if k.name != "Basis":
                k.value = 1.0
                n += 1
print(f"[EXPB] set value=1 on {n} keys")
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
print(f"[EXPB] exported {OUT}")
