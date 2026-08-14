r"""NX9 捏脸基模 Blender 无头精修脚本·阶段1：位移计算（方案 B 管线）。

Blender 5.2 的 glTF 导出器会把相对 shape key 位移写成零（导出器 bug），
且 from_pydata 重建网格会破坏索引。因此本阶段**不导出几何**，只输出：

  - 每网格每顶点的【笔刷前世界坐标】与【笔刷位移】，JSON 形式。
  - 位移按空间位置匹配回原模型（不依赖顶点顺序），由 TS 阶段施加，
    morph 语义精确保持（位移加在基准上，morph 是基准的相对增量）。

用法（Windows PowerShell）：

    $env:NX9_SRC_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-base.glb"
    $env:NX9_OUT_DISP = "F:\code\project\NX9\output\refined\displacement.json"
    $env:NX9_REPORT  = "F:\code\project\NX9\output\refined\refine-report.json"   # 可选
    $env:NX9_STROKES = '[{"name":"HeadMesh","type":"smooth","center":[0,1.74,0.02],"radius":0.10,"repeat":3}]'
    blender --background --python scripts/blender/refine-base-model.py

笔刷（NX9_STROKES，坐标=世界坐标 Y-up，与 GLB 一致）：
  - smooth: Laplacian 平滑选中顶点（磨圆），参数 center/radius/repeat
  - sphere: 沿背离 center 的径向位移，参数 center/radius/amount（负=内凹，正=外鼓）
"""

import json
import os
import sys

import bpy
import mathutils


def log(msg: str) -> None:
    print(f"[NX9] {msg}", flush=True)


SRC = os.environ.get("NX9_SRC_GLB", "")
OUT_DISP = os.environ.get("NX9_OUT_DISP", "")
REPORT = os.environ.get("NX9_REPORT", "")
STROKES = json.loads(os.environ.get("NX9_STROKES", "[]") or "[]")

if not SRC or not OUT_DISP:
    log("ERROR: 需要环境变量 NX9_SRC_GLB 与 NX9_OUT_DISP")
    sys.exit(2)

report: dict = {"src": SRC, "steps": []}

# 1) 清场并导入
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
try:
    bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
except Exception:
    pass
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
log(f"导入 {len(meshes)} 个网格")
report["importedMeshes"] = sorted(o.name for o in meshes)

# glTF 是 Y-up，Blender 导入时把转换旋转放在 Armature/根节点上（Z-up）。
# 笔刷中心是世界坐标（GLTF Y-up 系），须经该旋转转到 Blender 系做半径选择；
# 同时把旋转矩阵写进位移 JSON，供 TS 阶段换算回 GLTF 系做空间匹配。
# glTF 是 Y-up；Blender 5.2 导入器把 Y-up→Z-up 转换烘焙进网格数据与节点平移的
# 坐标值（无旋转矩阵）。实证映射：Blender 世界 = R @ GLTF 世界，R = 绕 X 轴 +90°
# （(x,y,z)->(x,-z,y)）。笔刷中心定义在 GLTF 世界系（与 GLB/TS 一致），
# 位移也按 GLTF 世界系输出，TS 阶段零换算直接施加。
import math

R_CONV = mathutils.Matrix.Rotation(math.pi / 2.0, 4, "X")
R_CONV_INV = R_CONV.inverted()
ROOT_ROT = [[R_CONV[i][j] for j in range(3)] for i in range(3)]
ROOT_ROT_INV = [[R_CONV_INV[i][j] for j in range(3)] for i in range(3)]

# 2) 删除 shape keys（本阶段只关心基准几何；morph 由 TS 阶段从原模型带回）
for o in meshes:
    if o.data.shape_keys is not None:
        o.shape_key_clear()  # Blender 5.x：清空 shape keys（4.x 为 shape_keys_clear）
        log(f"已删除 shape keys: {o.name}")

# 3) 记录笔刷前 GLTF 世界坐标（顶点序 = mesh.vertices 序，仅作 src 参考，匹配按空间位置）
src_world: dict[str, list] = {}
for o in meshes:
    src_world[o.name] = [(R_CONV_INV @ (o.matrix_world @ v.co)).to_tuple() for v in o.data.vertices]
    report.setdefault("vertsBefore", {})[o.name] = len(o.data.vertices)

# 轴转换自校验：GLTF 世界系下头部应沿 Y 站立（|y| 主导，|z| 应很小）
if "HeadMesh" in src_world:
    ys = [p[1] for p in src_world["HeadMesh"]]
    zs = [p[2] for p in src_world["HeadMesh"]]
    maxy = max(abs(v) for v in ys)
    maxz = max(abs(v) for v in zs)
    if maxz > maxy * 0.5:
        log(f"ERROR: 轴转换校验失败 maxY={maxy:.3f} maxZ={maxz:.3f}，请检查 R_CONV")
        sys.exit(4)
    log(f"轴转换校验通过: HeadMesh maxY={maxy:.3f} maxZ={maxz:.3f}")

# 4) 确定性笔刷
for s in STROKES:
    name = s.get("name", "")
    objs = [o for o in meshes if o.name == name] or [o for o in meshes if name in o.name]
    if not objs:
        log(f"笔刷跳过: 找不到网格 {name}")
        continue
    center = mathutils.Vector(s["center"])
    center_blender = R_CONV @ center  # GLTF 世界系笔刷中心 → Blender 世界系
    radius = float(s["radius"])
    stroke_type = s.get("type", "smooth")
    for o in objs:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        import bmesh

        bm = bmesh.from_edit_mesh(o.data)
        sel = 0
        for v in bm.verts:
            w = o.matrix_world @ v.co
            hit = (w - center_blender).length <= radius
            v.select_set(hit)
            if hit:
                sel += 1
        bmesh.update_edit_mesh(o.data)
        bm.verts.ensure_lookup_table()
        sample = list((o.matrix_world @ bm.verts[0].co))[:3]
        log(f"  选择诊断: {o.name} 半径内顶点={sel} 采样世界坐标={[round(x, 3) for x in sample]}")
        if stroke_type == "smooth":
            # bpy.ops.mesh.vertices_smooth 在 5.2 无头模式下为空操作，自实现 Laplacian：
            # 每轮所有选中顶点同时向邻接顶点均值移动 factor 比例（同轮内不串行）。
            repeat = int(s.get("repeat", 1))
            factor = float(s.get("factor", 0.5))
            for _ in range(repeat):
                move: dict[int, mathutils.Vector] = {}
                for v in bm.verts:
                    if not v.select:
                        continue
                    nbs = [e.other_vert(v) for e in v.link_edges]
                    if not nbs:
                        continue
                    avg = mathutils.Vector((0.0, 0.0, 0.0))
                    for nb in nbs:
                        avg += nb.co
                    avg /= len(nbs)
                    move[v.index] = v.co + (avg - v.co) * factor
                for idx, co in move.items():
                    bm.verts[idx].co = co
            bmesh.update_edit_mesh(o.data)
        elif stroke_type == "sphere":
            amount = float(s.get("amount", 0.0))
            for v in bm.verts:
                if v.select:
                    w = o.matrix_world @ v.co
                    d = w - center_blender  # 必须在同一坐标系（Blender 世界系）
                    dist = d.length
                    if dist > 1e-6:
                        falloff = max(0.0, 1.0 - dist / max(radius, 1e-6))
                        v.co = o.matrix_world.inverted() @ (w + d.normalized() * (amount * falloff))
            bmesh.update_edit_mesh(o.data)
        else:
            log(f"未知笔刷类型: {stroke_type}")
        bpy.ops.object.mode_set(mode="OBJECT")
        o.select_set(False)
        log(f"笔刷完成: {o.name} {stroke_type} center={s['center']} r={radius}")
        report["steps"].append({"mesh": o.name, "type": stroke_type, "center": s["center"], "radius": radius})

# 5) 拓扑不变校验 + 导出位移 JSON（src/disp 均为 Blender 世界系，附根旋转供 TS 换算）
out_data: dict = {
    "version": 2,
    "rootRotation": ROOT_ROT,
    "rootRotationInv": ROOT_ROT_INV,
    "strokes": STROKES,
    "meshes": {},
}
ok = True
for o in meshes:
    src_list = src_world[o.name]
    if len(src_list) != len(o.data.vertices):
        log(f"警告: {o.name} 顶点数变化 {len(src_list)} -> {len(o.data.vertices)}，跳过")
        ok = False
        continue
    disp = []
    moved = 0
    for i, v in enumerate(o.data.vertices):
        gw_new = R_CONV_INV @ (o.matrix_world @ v.co)  # Blender 世界 → GLTF 世界
        d = gw_new - mathutils.Vector(src_list[i])  # GLTF 世界系位移
        if d.length > 1e-7:
            moved += 1
        disp.append([d.x, d.y, d.z])
    out_data["meshes"][o.name] = {"src": src_list, "disp": disp}
    log(f"位移采样: {o.name} 顶点={len(disp)} 移动={moved}")
    report.setdefault("movedVerts", {})[o.name] = moved

if not ok:
    log("ERROR: 存在拓扑变化，中断")
    sys.exit(3)

os.makedirs(os.path.dirname(os.path.abspath(OUT_DISP)), exist_ok=True)
with open(OUT_DISP, "w", encoding="utf-8") as f:
    json.dump(out_data, f, ensure_ascii=False)
log(f"已写出位移: {OUT_DISP}")

if REPORT:
    os.makedirs(os.path.dirname(os.path.abspath(REPORT)), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
log("完成。下一步: 跑 sculpt-blender-refine 测试（TS 阶段施加位移并导出 GLB）")
