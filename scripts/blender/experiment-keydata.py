r"""实验 D：导入后直接读 shape key 数据（不导出），确认数据是否在导入器侧已归零。"""
import os

import bpy

SRC = os.environ["NX9_SRC_GLB"]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in [x for x in bpy.context.scene.objects if x.type == "MESH"]:
    if o.data.shape_keys is None:
        continue
    for k in o.data.shape_keys.key_blocks:
        if k.name == "Basis":
            continue
        mx = max(abs(v.co[0]) + abs(v.co[1]) + abs(v.co[2]) for v in k.data)
        print(f"[EXPD] {o.name} key={k.name} value={k.value} maxAbsDelta={mx:.6f}")
