r"""NX9 细致捏脸 Shape Key 生成器（阶段 A：Blender 侧位移计算）。

解决 Blender 5.2 glTF 导出器 shape key 归零 bug：
- 在 Blender 中创建高质量 shape key（使用 bmesh 区域选择 + 平滑衰减）
- 导出每顶点位移 JSON，由 TS 阶段（pack-mpfb-character-base.ts）施加到最终 GLB

每个 shape key 对应一个 face rig 参数（如 faceLength.pos / jawWidth.neg 等），
命名遵循 NX9 捏模契约：{paramId}.{pole}[.{side}]。

用法：
    $env:NX9_SRC_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-base.glb"
    $env:NX9_OUT_DIR = "F:\code\project\NX9\output\sculpt-morphs"
    & "F:\Blender\blender.exe" --background --python scripts/blender/generate-sculpt-morphs.py

输出：
    output/sculpt-morphs/
      morph-displacements.json   # 每参数每顶点 GLTF 世界系位移
      morph-report.json          # 诊断报告
"""

import json
import math
import os
import sys
import time
from collections import OrderedDict

import bpy
import bmesh
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_GLB = os.environ.get(
    "NX9_SRC_GLB",
    os.path.join(REPO, "apps", "web", "public", "director3d", "models", "nx9-character-base.glb"),
)
OUT_DIR = os.environ.get("NX9_OUT_DIR", os.path.join(REPO, "output", "sculpt-morphs"))

# 仅处理 HeadMesh（面部 morph）
TARGET_MESH = "HeadMesh"

# GLTF Y-up → Blender Z-up 旋转矩阵（绕 X 轴 +90°）
R_CONV = Matrix.Rotation(math.pi / 2.0, 4, "X")
R_CONV_INV = R_CONV.inverted()

# ---------------------------------------------------------------------------
# Shape Key 参数定义（与 @nx9/shared FACE_RIG_PARAMS 同步）
# 每个参数定义：id, 变形区域(center, radius, axis, falloff), 位移量
# ---------------------------------------------------------------------------
# 面部区域定义（GLTF Y-up 世界坐标系，单位：米）
# 这些坐标基于 MPFB v29 头部实测：
#   头 crown→chin: y≈1.41–1.78
#   眼中心: (±0.041, 1.577, 0.083)
#   鼻尖: (0, 1.527, 0.160)
#   嘴中心: (0, 1.505, 0.128)
#   下颌: y≈1.45–1.52, x≈±0.05–0.14
#   颧骨: y≈1.53–1.60, x≈±0.06–0.10

FACE_REGIONS = {
    # -- 脸型轮廓 --
    "faceLength": {
        "pos": {"center": (0, 1.78, 0.08), "radius": 0.08, "axis": "y", "amount": 0.012,
                "falloff": 0.06, "note": "拉长脸型（发际线上移+下巴下移）"},
        "neg": {"center": (0, 1.78, 0.08), "radius": 0.08, "axis": "y", "amount": -0.010,
                "falloff": 0.06, "note": "缩短脸型"},
    },
    "cheekboneWidth": {
        "pos": {"center": (0, 1.565, 0.08), "radius": 0.09, "axis": "x", "amount": 0.008,
                "falloff": 0.04, "note": "颧骨外扩"},
        "neg": {"center": (0, 1.565, 0.08), "radius": 0.09, "axis": "x", "amount": -0.006,
                "falloff": 0.04, "note": "颧骨内收"},
    },
    "jawWidth": {
        "pos": {"center": (0, 1.48, 0.10), "radius": 0.10, "axis": "x", "amount": 0.009,
                "falloff": 0.04, "note": "下颌加宽"},
        "neg": {"center": (0, 1.48, 0.10), "radius": 0.10, "axis": "x", "amount": -0.007,
                "falloff": 0.04, "note": "下颌收窄"},
    },
    "jawAngle": {
        "pos": {"center": (0, 1.47, 0.09), "radius": 0.08, "axis": "x", "amount": 0.007,
                "falloff": 0.03, "y_band": (1.45, 1.50), "note": "下颌角锐利"},
        "neg": {"center": (0, 1.47, 0.09), "radius": 0.08, "axis": "x", "amount": -0.005,
                "falloff": 0.03, "y_band": (1.45, 1.50), "note": "下颌角圆钝"},
    },
    "chinLength": {
        "pos": {"center": (0, 1.465, 0.11), "radius": 0.07, "axis": "y", "amount": -0.008,
                "falloff": 0.035, "note": "下巴加长"},
        "neg": {"center": (0, 1.465, 0.11), "radius": 0.07, "axis": "y", "amount": 0.006,
                "falloff": 0.035, "note": "下巴缩短"},
    },
    "chinProject": {
        "pos": {"center": (0, 1.465, 0.11), "radius": 0.07, "axis": "z", "amount": 0.007,
                "falloff": 0.035, "note": "下巴前突"},
        "neg": {"center": (0, 1.465, 0.11), "radius": 0.07, "axis": "z", "amount": -0.005,
                "falloff": 0.035, "note": "下巴后缩"},
    },
    "templeWidth": {
        "pos": {"center": (0, 1.65, 0.06), "radius": 0.08, "axis": "x", "amount": 0.006,
                "falloff": 0.04, "note": "太阳穴饱满"},
        "neg": {"center": (0, 1.65, 0.06), "radius": 0.08, "axis": "x", "amount": -0.005,
                "falloff": 0.04, "note": "太阳穴凹陷"},
    },
    "cheekFullness": {
        "pos": {"center": (0, 1.54, 0.11), "radius": 0.08, "axis": "z", "amount": 0.008,
                "falloff": 0.04, "note": "面颊饱满"},
        "neg": {"center": (0, 1.54, 0.11), "radius": 0.08, "axis": "z", "amount": -0.006,
                "falloff": 0.04, "note": "面颊凹陷"},
    },

    # -- 眼 --
    "eyeSize": {
        "pos": {"center": (0, 1.577, 0.09), "radius": 0.07, "axis": "y", "amount": 0.006,
                "falloff": 0.03, "eye_region": True, "note": "眼睛变大"},
        "neg": {"center": (0, 1.577, 0.09), "radius": 0.07, "axis": "y", "amount": -0.005,
                "falloff": 0.03, "eye_region": True, "note": "眼睛变小"},
    },
    "eyeSpacing": {
        "pos": {"center": (0, 1.577, 0.09), "radius": 0.08, "axis": "x", "amount": 0.007,
                "falloff": 0.04, "eye_region": True, "note": "眼距加宽"},
        "neg": {"center": (0, 1.577, 0.09), "radius": 0.08, "axis": "x", "amount": -0.006,
                "falloff": 0.04, "eye_region": True, "note": "眼距变窄"},
    },
    "eyeTilt": {
        "pos": {"center": (0, 1.577, 0.09), "radius": 0.08, "axis": "y", "amount": 0.005,
                "falloff": 0.04, "eye_region": True, "tilt": True, "note": "外眼角上扬"},
        "neg": {"center": (0, 1.577, 0.09), "radius": 0.08, "axis": "y", "amount": -0.004,
                "falloff": 0.04, "eye_region": True, "tilt": True, "note": "外眼角下垂"},
    },
    "eyelidFold": {
        "pos": {"center": (0, 1.585, 0.10), "radius": 0.06, "axis": "z", "amount": -0.004,
                "falloff": 0.02, "eye_lid": True, "note": "双眼皮加深"},
        "neg": {"center": (0, 1.585, 0.10), "radius": 0.06, "axis": "z", "amount": 0.003,
                "falloff": 0.02, "eye_lid": True, "note": "单眼皮"},
    },
    "orbitDepth": {
        "pos": {"center": (0, 1.575, 0.08), "radius": 0.07, "axis": "z", "amount": -0.007,
                "falloff": 0.03, "eye_socket": True, "note": "眼窝深陷"},
        "neg": {"center": (0, 1.575, 0.08), "radius": 0.07, "axis": "z", "amount": 0.005,
                "falloff": 0.03, "eye_socket": True, "note": "眼窝平浅"},
    },
    "underEyeFold": {
        "pos": {"center": (0, 1.565, 0.10), "radius": 0.06, "axis": "z", "amount": 0.004,
                "falloff": 0.02, "note": "卧蚕明显"},
        "neg": {"center": (0, 1.565, 0.10), "radius": 0.06, "axis": "z", "amount": -0.003,
                "falloff": 0.02, "note": "无卧蚕"},
    },
    "browEyeGap": {
        "pos": {"center": (0, 1.60, 0.10), "radius": 0.07, "axis": "y", "amount": 0.005,
                "falloff": 0.03, "note": "眉眼距离开阔"},
        "neg": {"center": (0, 1.60, 0.10), "radius": 0.07, "axis": "y", "amount": -0.004,
                "falloff": 0.03, "note": "眉眼紧凑"},
    },

    # -- 眉 --
    "browArch": {
        "pos": {"center": (0, 1.61, 0.12), "radius": 0.07, "axis": "y", "amount": 0.006,
                "falloff": 0.03, "brow_region": True, "note": "高眉峰"},
        "neg": {"center": (0, 1.61, 0.12), "radius": 0.07, "axis": "y", "amount": -0.004,
                "falloff": 0.03, "brow_region": True, "note": "平眉"},
    },
    "browAngle": {
        "pos": {"center": (0, 1.61, 0.12), "radius": 0.07, "axis": "y", "amount": 0.004,
                "falloff": 0.03, "brow_region": True, "tilt": True, "note": "眉尾上挑"},
        "neg": {"center": (0, 1.61, 0.12), "radius": 0.07, "axis": "y", "amount": -0.003,
                "falloff": 0.03, "brow_region": True, "tilt": True, "note": "眉尾下垂"},
    },
    "browLength": {
        "pos": {"center": (0, 1.61, 0.12), "radius": 0.08, "axis": "x", "amount": 0.006,
                "falloff": 0.04, "brow_region": True, "note": "眉长过眼尾"},
        "neg": {"center": (0, 1.61, 0.12), "radius": 0.08, "axis": "x", "amount": -0.005,
                "falloff": 0.04, "brow_region": True, "note": "眉短"},
    },

    # -- 鼻 --
    "noseBridgeHeight": {
        "pos": {"center": (0, 1.56, 0.16), "radius": 0.06, "axis": "z", "amount": 0.008,
                "falloff": 0.03, "nose_region": True, "note": "鼻梁高挺"},
        "neg": {"center": (0, 1.56, 0.16), "radius": 0.06, "axis": "z", "amount": -0.006,
                "falloff": 0.03, "nose_region": True, "note": "鼻梁低平"},
    },
    "noseBridgeWidth": {
        "pos": {"center": (0, 1.56, 0.16), "radius": 0.05, "axis": "x", "amount": 0.005,
                "falloff": 0.02, "nose_region": True, "note": "鼻梁宽"},
        "neg": {"center": (0, 1.56, 0.16), "radius": 0.05, "axis": "x", "amount": -0.004,
                "falloff": 0.02, "nose_region": True, "note": "鼻梁窄"},
    },
    "noseTipSize": {
        "pos": {"center": (0, 1.527, 0.165), "radius": 0.04, "axis": "uniform", "amount": 0.005,
                "falloff": 0.02, "nose_tip": True, "note": "鼻头饱满"},
        "neg": {"center": (0, 1.527, 0.165), "radius": 0.04, "axis": "uniform", "amount": -0.004,
                "falloff": 0.02, "nose_tip": True, "note": "鼻头小巧"},
    },
    "nostrilWidth": {
        "pos": {"center": (0, 1.515, 0.155), "radius": 0.05, "axis": "x", "amount": 0.005,
                "falloff": 0.02, "nostril": True, "note": "鼻翼外扩"},
        "neg": {"center": (0, 1.515, 0.155), "radius": 0.05, "axis": "x", "amount": -0.004,
                "falloff": 0.02, "nostril": True, "note": "鼻翼收窄"},
    },
    "noseTipAngle": {
        "pos": {"center": (0, 1.527, 0.165), "radius": 0.04, "axis": "y", "amount": 0.006,
                "falloff": 0.02, "nose_tip": True, "note": "鼻尖上翘"},
        "neg": {"center": (0, 1.527, 0.165), "radius": 0.04, "axis": "y", "amount": -0.005,
                "falloff": 0.02, "nose_tip": True, "note": "鼻尖下垂"},
    },
    "noseLength": {
        "pos": {"center": (0, 1.53, 0.16), "radius": 0.06, "axis": "y", "amount": -0.007,
                "falloff": 0.03, "nose_region": True, "note": "鼻子长"},
        "neg": {"center": (0, 1.53, 0.16), "radius": 0.06, "axis": "y", "amount": 0.005,
                "falloff": 0.03, "nose_region": True, "note": "鼻子短"},
    },

    # -- 嘴 --
    "upperLipThickness": {
        "pos": {"center": (0, 1.510, 0.132), "radius": 0.04, "axis": "z", "amount": 0.005,
                "falloff": 0.02, "upper_lip": True, "note": "上唇厚"},
        "neg": {"center": (0, 1.510, 0.132), "radius": 0.04, "axis": "z", "amount": -0.004,
                "falloff": 0.02, "upper_lip": True, "note": "上唇薄"},
    },
    "lowerLipThickness": {
        "pos": {"center": (0, 1.495, 0.128), "radius": 0.04, "axis": "z", "amount": 0.005,
                "falloff": 0.02, "lower_lip": True, "note": "下唇厚"},
        "neg": {"center": (0, 1.495, 0.128), "radius": 0.04, "axis": "z", "amount": -0.004,
                "falloff": 0.02, "lower_lip": True, "note": "下唇薄"},
    },
    "mouthWidth": {
        "pos": {"center": (0, 1.505, 0.128), "radius": 0.06, "axis": "x", "amount": 0.007,
                "falloff": 0.03, "mouth_corner": True, "note": "嘴宽"},
        "neg": {"center": (0, 1.505, 0.128), "radius": 0.06, "axis": "x", "amount": -0.005,
                "falloff": 0.03, "mouth_corner": True, "note": "嘴小"},
    },
    "lipPeak": {
        "pos": {"center": (0, 1.508, 0.135), "radius": 0.03, "axis": "z", "amount": 0.004,
                "falloff": 0.015, "lip_peak": True, "note": "唇珠明显"},
        "neg": {"center": (0, 1.508, 0.135), "radius": 0.03, "axis": "z", "amount": -0.003,
                "falloff": 0.015, "lip_peak": True, "note": "唇峰平缓"},
    },
    "mouthCorner": {
        "pos": {"center": (0, 1.50, 0.125), "radius": 0.06, "axis": "y", "amount": 0.004,
                "falloff": 0.03, "mouth_corner": True, "tilt": True, "note": "嘴角上扬"},
        "neg": {"center": (0, 1.50, 0.125), "radius": 0.06, "axis": "y", "amount": -0.003,
                "falloff": 0.03, "mouth_corner": True, "tilt": True, "note": "嘴角下垂"},
    },
    "philtrumLength": {
        "pos": {"center": (0, 1.52, 0.14), "radius": 0.03, "axis": "y", "amount": -0.005,
                "falloff": 0.02, "note": "人中长"},
        "neg": {"center": (0, 1.52, 0.14), "radius": 0.03, "axis": "y", "amount": 0.004,
                "falloff": 0.02, "note": "人中短"},
    },

    # -- 皮肤结构 --
    "facialFat": {
        "pos": {"center": (0, 1.55, 0.10), "radius": 0.12, "axis": "z", "amount": 0.006,
                "falloff": 0.06, "note": "面部丰润"},
        "neg": {"center": (0, 1.55, 0.10), "radius": 0.12, "axis": "z", "amount": -0.005,
                "falloff": 0.06, "note": "面部消瘦"},
    },
    "nasolabial": {
        "pos": {"center": (0, 1.525, 0.13), "radius": 0.06, "axis": "z", "amount": -0.003,
                "falloff": 0.02, "nasolabial": True, "note": "法令纹明显"},
        "neg": {"center": (0, 1.525, 0.13), "radius": 0.06, "axis": "z", "amount": 0.002,
                "falloff": 0.02, "nasolabial": True, "note": "无法令纹"},
    },
}

# 需要生成左右分离版本的参数（用于不对称捏脸）
BILATERAL_PARAMS = {"jawWidth", "eyeSpacing"}


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    print(f"[NX9-morph] {msg}", flush=True)


def _smoothstep(t: float) -> float:
    """Hermite smoothstep: 0→1 with zero derivative at ends."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def to_gltf_world(v: Vector) -> Vector:
    """Blender world → GLTF world (Y-up)."""
    return R_CONV_INV @ v


def to_blender_world(v: Vector) -> Vector:
    """GLTF world → Blender world (Z-up)."""
    return R_CONV @ v


def select_verts_by_region(bm, obj, region_def, world_center_gltf):
    """在 bmesh 中选择指定区域内的顶点。

    region_def 是 GLTF 世界系的参数（center, radius, falloff 等）。
    返回 (selected_vert_indices, per_vert_weights) 其中 weight ∈ [0, 1]。
    """
    center_gltf = Vector(region_def["center"])
    center_blender = to_blender_world(center_gltf)
    radius = region_def["radius"]
    falloff = region_def.get("falloff", radius * 0.5)
    inner = max(0.0, radius - falloff)

    selected = []
    weights = {}

    for v in bm.verts:
        w = obj.matrix_world @ v.co
        dist = (w - center_blender).length

        if dist > radius:
            continue

        if dist <= inner:
            weight = 1.0
        else:
            weight = 1.0 - _smoothstep((dist - inner) / max(falloff, 1e-6))

        # 可选：y 轴带通（如下颌角只影响特定高度范围）
        y_band = region_def.get("y_band")
        if y_band:
            y_gltf = to_gltf_world(w).y
            y_lo, y_hi = y_band
            if y_gltf < y_lo or y_gltf > y_hi:
                continue
            # 在 band 边缘衰减
            band_center = (y_lo + y_hi) / 2
            band_half = (y_hi - y_lo) / 2
            y_dist = abs(y_gltf - band_center) / max(band_half, 1e-6)
            if y_dist > 0.7:
                weight *= 1.0 - _smoothstep((y_dist - 0.7) / 0.3)

        if weight < 0.01:
            continue

        selected.append(v)
        weights[v.index] = weight

    return selected, weights


def apply_shape_key_displacement(obj, region_def, param_id, pole, side=None):
    """在目标网格上创建 shape key 并应用位移。

    直接修改 shape key 数据（sk.data[i].co），不动基础网格（Basis），
    这样每个 shape key 的位移 = shape key 位置 - basis 位置，语义正确。

    返回 (shape_key_name, num_moved_verts)
    """
    pole_sign = 1.0 if pole == "pos" else -1.0
    suffix = f".{side}" if side else ""
    sk_name = f"{param_id}.{pole}{suffix}"

    # 确保有 basis
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis")
    basis = obj.data.shape_keys.key_blocks["Basis"]

    # 检查是否已存在同名 shape key
    existing = obj.data.shape_keys.key_blocks.get(sk_name)
    if existing:
        # 已存在则跳过（幂等）
        return sk_name, 0

    # 创建 shape key。
    # 注意：Blender 新 shape key 数据会继承当前求值网格位置（前面 key 的叠加），
    # 必须先显式重置为 basis 位置，否则位移会被前面的 key 污染。
    sk = obj.shape_key_add(name=sk_name)
    for i in range(len(obj.data.vertices)):
        sk.data[i].co = basis.data[i].co
    # 修改 shape key 数据会激活该 key（value 可能被置 1），把 value 归零避免影响后续创建
    sk.value = 0.0
    obj.data.update()

    # 读取参数
    axis = region_def["axis"]
    amount = region_def["amount"] * pole_sign
    tilt = region_def.get("tilt", False)
    eye_region = region_def.get("eye_region", False)
    eye_lid = region_def.get("eye_lid", False)
    eye_socket = region_def.get("eye_socket", False)
    brow_region = region_def.get("brow_region", False)
    nose_region = region_def.get("nose_region", False)
    nose_tip = region_def.get("nose_tip", False)
    nostril = region_def.get("nostril", False)
    upper_lip = region_def.get("upper_lip", False)
    lower_lip = region_def.get("lower_lip", False)
    mouth_corner = region_def.get("mouth_corner", False)
    lip_peak = region_def.get("lip_peak", False)
    nasolabial = region_def.get("nasolabial", False)

    center_gltf = Vector(region_def["center"])
    center_blender = to_blender_world(center_gltf)
    radius = region_def["radius"]
    falloff = region_def.get("falloff", radius * 0.5)
    inner = max(0.0, radius - falloff)
    y_band = region_def.get("y_band")

    # 基于 basis 位置选择区域顶点并计算权重，同时直接修改 shape key 数据
    moved = 0
    for i in range(len(obj.data.vertices)):
        local = basis.data[i].co
        world_pos = obj.matrix_world @ local
        dist = (world_pos - center_blender).length

        if dist > radius:
            continue

        # 单侧掩码：L 只影响 x<0，R 只影响 x>0（GLTF 世界系 x 与 Blender 世界系 x 相同）
        # 中心线顶点（x≈0）两侧都不移动，保证对称性
        side_mask = region_def.get("side_mask")
        if side_mask:
            wx = to_gltf_world(world_pos).x
            if side_mask == "L" and wx >= 0:
                continue
            if side_mask == "R" and wx <= 0:
                continue

        if dist <= inner:
            w = 1.0
        else:
            w = 1.0 - _smoothstep((dist - inner) / max(falloff, 1e-6))

        # 可选：y 轴带通
        if y_band:
            y_gltf = to_gltf_world(world_pos).y
            y_lo, y_hi = y_band
            if y_gltf < y_lo or y_gltf > y_hi:
                continue
            band_center = (y_lo + y_hi) / 2
            band_half = (y_hi - y_lo) / 2
            y_dist = abs(y_gltf - band_center) / max(band_half, 1e-6)
            if y_dist > 0.7:
                w *= 1.0 - _smoothstep((y_dist - 0.7) / 0.3)

        if w < 0.01:
            continue

        # 计算新位置。
        # 所有 axis / sign 判断均在 GLTF 世界系语义下进行（Y-up：y=上下，z=前后），
        # 位移向量 delta_gltf 再经 R_CONV 转成 Blender 世界系位移（Z-up）。
        g_world = to_gltf_world(world_pos)
        g_center = Vector(region_def["center"])

        delta_gltf = None

        if tilt:
            x_offset = (g_world.x - g_center.x) / max(radius, 1e-6)
            tilt_amount = amount * x_offset * w
            if axis == "y":
                delta_gltf = Vector((0.0, tilt_amount, 0.0))
            elif axis == "z":
                delta_gltf = Vector((0.0, 0.0, tilt_amount))
        elif eye_region:
            if axis == "x":
                sign = 1.0 if g_world.x > g_center.x else -1.0
                delta_gltf = Vector((sign * abs(amount) * w, 0.0, 0.0))
            elif axis == "y":
                sign = 1.0 if g_world.y > g_center.y else -1.0
                delta_gltf = Vector((0.0, sign * abs(amount) * w, 0.0))
        elif eye_lid:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif eye_socket:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif brow_region:
            if tilt:
                x_offset = (g_world.x - g_center.x) / max(radius, 1e-6)
                delta_gltf = Vector((0.0, amount * x_offset * w, 0.0))
            elif axis == "x":
                sign = 1.0 if g_world.x > g_center.x else -1.0
                delta_gltf = Vector((sign * abs(amount) * w, 0.0, 0.0))
            else:
                delta_gltf = Vector((0.0, amount * w, 0.0))
        elif nose_region:
            if axis == "x":
                sign = 1.0 if g_world.x > g_center.x else -1.0
                delta_gltf = Vector((sign * abs(amount) * w, 0.0, 0.0))
            elif axis == "y":
                delta_gltf = Vector((0.0, amount * w, 0.0))
            else:
                delta_gltf = Vector((0.0, 0.0, amount * w))
        elif nose_tip:
            if axis == "uniform":
                # 沿 GLTF 世界系相对中心的径向方向
                rel_gltf = g_world - g_center
                if rel_gltf.length > 1e-6:
                    delta_gltf = rel_gltf.normalized() * amount * w
            else:
                delta_gltf = Vector((0.0, amount * w, 0.0))
        elif nostril:
            sign = 1.0 if g_world.x > g_center.x else -1.0
            delta_gltf = Vector((sign * abs(amount) * w, 0.0, 0.0))
        elif upper_lip:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif lower_lip:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif mouth_corner:
            if tilt:
                x_offset = (g_world.x - g_center.x) / max(radius, 1e-6)
                delta_gltf = Vector((0.0, amount * x_offset * w, 0.0))
            elif axis == "x":
                sign = 1.0 if g_world.x > g_center.x else -1.0
                delta_gltf = Vector((sign * abs(amount) * w, 0.0, 0.0))
        elif lip_peak:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif nasolabial:
            delta_gltf = Vector((0.0, 0.0, amount * w))
        elif axis == "uniform":
            rel_gltf = g_world - g_center
            if rel_gltf.length > 1e-6:
                delta_gltf = rel_gltf.normalized() * amount * w
        elif axis == "x":
            delta_gltf = Vector((amount * w, 0.0, 0.0))
        elif axis == "y":
            delta_gltf = Vector((0.0, amount * w, 0.0))
        elif axis == "z":
            delta_gltf = Vector((0.0, 0.0, amount * w))

        if delta_gltf is None:
            continue

        delta_blender = R_CONV @ delta_gltf
        new_pos = world_pos + delta_blender
        sk.data[i].co = obj.matrix_world.inverted() @ new_pos
        moved += 1

    obj.data.update()
    return sk_name, moved


def export_displacements(obj, out_path):
    """导出所有 shape key 的每顶点位移数据（GLTF 世界系）。

    输出格式：
    {
        "version": 1,
        "meshName": "HeadMesh",
        "basisVertices": [[x,y,z], ...],    # GLTF 世界系基础顶点
        "shapeKeys": {
            "faceLength.pos": [[dx,dy,dz], ...],  # GLTF 世界系位移
            ...
        }
    }
    """
    if obj.data.shape_keys is None:
        log("ERROR: 没有 shape keys")
        return

    key_blocks = obj.data.shape_keys.key_blocks
    basis = key_blocks.get("Basis")
    if basis is None:
        log("ERROR: 没有 Basis shape key")
        return

    num_verts = len(obj.data.vertices)

    # 直接读 shape key 顶点数据（不依赖 depsgraph 求值，规避后台模式缓存问题）。
    # basis_gltf[i] = GLTF 世界系基础顶点；sk_gltf[i] = shape key 绝对位置。
    # 位移 = sk_gltf[i] - basis_gltf[i]。相对 shape key 的数据存的是绝对位置。
    basis_local = [basis.data[i].co.copy() for i in range(num_verts)]

    # 收集基础顶点（GLTF 世界系）
    basis_verts = []
    for i, v in enumerate(obj.data.vertices):
        # 顶点 local 坐标应等于 basis shape key 数据（shape key 未启用时）
        local = v.co if len(basis_local) == 0 else basis_local[i]
        gw = to_gltf_world(obj.matrix_world @ local)
        basis_verts.append([round(gw.x, 6), round(gw.y, 6), round(gw.z, 6)])

    # 收集每个 shape key 的位移
    shape_keys_data = OrderedDict()
    for sk in key_blocks:
        if sk.name == "Basis":
            continue
        displacements = []
        moved_count = 0
        for i in range(num_verts):
            sk_local = sk.data[i].co
            b_local = basis_local[i]
            gw = to_gltf_world(obj.matrix_world @ sk_local)
            gb = to_gltf_world(obj.matrix_world @ b_local)
            dx = gw.x - gb.x
            dy = gw.y - gb.y
            dz = gw.z - gb.z
            if abs(dx) > 1e-7 or abs(dy) > 1e-7 or abs(dz) > 1e-7:
                moved_count += 1
            displacements.append([round(dx, 6), round(dy, 6), round(dz, 6)])

        shape_keys_data[sk.name] = displacements
        log(f"  导出 shape key: {sk.name} ({moved_count}/{num_verts} 顶点移动)")

    out = {
        "version": 1,
        "meshName": TARGET_MESH,
        "vertexCount": num_verts,
        "basisVertices": basis_verts,
        "shapeKeys": shape_keys_data,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    log(f"位移数据已导出: {out_path} ({len(shape_keys_data)} shape keys)")
    return out


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    log(f"源 GLB: {SRC_GLB}")
    log(f"输出目录: {OUT_DIR}")

    if not os.path.isfile(SRC_GLB):
        log(f"ERROR: 源 GLB 不存在: {SRC_GLB}")
        sys.exit(2)

    # 1) 清场并导入
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)

    # 2) 找到 HeadMesh
    head_mesh = None
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and (TARGET_MESH in o.name or o.name == TARGET_MESH):
            head_mesh = o
            break

    if head_mesh is None:
        # 尝试递归查找
        for o in bpy.context.scene.objects:
            if o.type == "MESH":
                log(f"  可用网格: {o.name} (顶点: {len(o.data.vertices)})")
        log("ERROR: 找不到 HeadMesh")
        sys.exit(3)

    log(f"找到 HeadMesh: {head_mesh.name} ({len(head_mesh.data.vertices)} 顶点)")

    # 确保它是 active 对象
    bpy.context.view_layer.objects.active = head_mesh
    head_mesh.select_set(True)

    # 3) 删除现有 shape keys（如果有）
    if head_mesh.data.shape_keys is not None:
        head_mesh.shape_key_clear()
        log("已清除旧 shape keys")

    # 4) 生成所有 shape keys
    report = {"src": SRC_GLB, "mesh": head_mesh.name,
              "vertexCount": len(head_mesh.data.vertices),
              "shapeKeys": []}

    total_moved = 0
    for param_id, poles in FACE_REGIONS.items():
        for pole in ("pos", "neg"):
            region_def = poles[pole]
            sk_name, moved = apply_shape_key_displacement(
                head_mesh, region_def, param_id, pole
            )
            if moved > 0:
                total_moved += moved
            report["shapeKeys"].append({
                "name": sk_name,
                "paramId": param_id,
                "pole": pole,
                "movedVerts": moved,
                "note": region_def.get("note", ""),
            })
            log(f"  {sk_name}: {moved} 顶点移动")

        # 为需要左右分离的参数生成 .L/.R 版本
        if param_id in BILATERAL_PARAMS:
            for side in ("L", "R"):
                for pole in ("pos", "neg"):
                    region_def = poles[pole].copy()
                    # 调整 center 偏向一侧并缩小半径；side_mask 限制只影响该侧
                    orig_center = list(region_def["center"])
                    side_sign = -1.0 if side == "L" else 1.0
                    region_def["center"] = (
                        orig_center[0] + side_sign * 0.03,
                        orig_center[1],
                        orig_center[2],
                    )
                    region_def["radius"] = region_def["radius"] * 0.7
                    region_def["side_mask"] = side  # L 只影响 x<0，R 只影响 x>0
                    sk_name, moved = apply_shape_key_displacement(
                        head_mesh, region_def, param_id, pole, side
                    )
                    if moved > 0:
                        total_moved += moved
                    report["shapeKeys"].append({
                        "name": sk_name,
                        "paramId": param_id,
                        "pole": pole,
                        "side": side,
                        "movedVerts": moved,
                        "note": region_def.get("note", "") + f" ({side})",
                    })
                    log(f"  {sk_name}: {moved} 顶点移动")

    # 5) 导出位移 JSON
    out_json = os.path.join(OUT_DIR, "morph-displacements.json")
    export_displacements(head_mesh, out_json)

    # 6) 写报告
    report["totalShapeKeys"] = len(report["shapeKeys"])
    report["totalMoved"] = total_moved
    report["elapsedSec"] = round(time.time() - t0, 1)

    out_report = os.path.join(OUT_DIR, "morph-report.json")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(f"报告: {out_report}")

    log(f"完成！共 {len(report['shapeKeys'])} 个 shape key，"
        f"总移动 {total_moved} 顶点次，耗时 {report['elapsedSec']}s")


if __name__ == "__main__":
    main()