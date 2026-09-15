# 方案 B：Blender 无头精修管线（捏脸基模）

当需要把程序化 clay 基模进一步「雕圆」时，用 Blender 无头模式做确定性精修，
全程脚本驱动、可回归。

## 流程

```
nx9-character-base.glb
   │  blender --background --python refine-base-model.py（导入→细分→平滑/笔刷→导出）
   ▼
nx9-character-refined.glb
   │  NX9_GLB_VALIDATE=<路径> vitest（契约门：morph 数/骨骼/Handle/面数）
   │  NX9_GLB_PREVIEW=<路径> vitest（软渲染 ASCII + PNG 给人工查看）
   ▼
通过 → 替换 apps/web/public/director3d/models/nx9-character-base.glb 并重新生成 manifest
```

## 细致捏脸 Morph 生成管线（generate-sculpt-morphs.py）

Blender 5.2 glTF 导出器会把 shape key 位移写成零（导出器 bug），因此
morph 位移数据以 JSON 导出，由 TS 侧施加到 GLB：

```
nx9-character-base.glb（基模，无 morph）
   │  blender --background --python generate-sculpt-morphs.py
   │    - 在 HeadMesh 上创建 72 个 shape key（34 个 morph 参数 pos/neg +
   │      jawWidth/eyeSpacing 的 .L/.R 单侧扩展）
   │    - 每个 shape key：区域顶点选择（中心/半径/平滑衰减 + y 带通 +
   │      单侧掩码），GLTF 语义轴位移（y=上下, z=前后），再转 Blender 系
   │    - 导出每顶点位移 JSON（GLTF 世界系）
   ▼
output/refined/morph-displacements.json
   │  node scripts/apply-sculpt-morphs.mjs（把位移写入 GLB morph targets，
   │    替换 HeadMesh 原有 morph；BodyMesh 的 bodyFat/muscleMass 不动）
   ▼
nx9-character-sculpt.glb
   │  node scripts/validate-sculpt-glb.mjs（契约校验）
   │  node scripts/verify-sculpt-glb-morphs.mjs（three.js morph 数据校验）
   │  blender --background --python render-morph-preview.py（EEVEE 渲染对比）
   ▼
通过 → 替换 apps/web/public/director3d/models/nx9-character-base.glb
```

关键实现点（踩坑记录）：

1. **shape key 继承污染**：Blender 新建 shape key 时数据会继承当前求值的
   网格位置（前面 key 的叠加）。必须创建后显式重置为 Basis 位置：
   `sk.data[i].co = basis.data[i].co`。
2. **轴语义**：参数定义用 GLTF 系（Y-up：y=上下、z=前后），但 Blender 是
   Z-up。位移向量须先构造 GLTF 位移再经 `R_CONV`（绕 X +90°）转 Blender 系，
   否则 y/z 轴 morph 方向错误。
3. **渲染验证**：workbench 渲染不显示 shape key 变形，对比预览须用 EEVEE。

## 命令（Windows PowerShell）

```powershell
$env:NX9_SRC_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-base.glb"
$env:NX9_OUT_DIR = "F:\code\project\NX9\output\refined"
& "F:\Blender\blender.exe" --background --python scripts/blender/generate-sculpt-morphs.py

# TS 侧施加（输出到正式目录）
$env:NX9_OUT_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-base.glb"
node scripts/apply-sculpt-morphs.mjs

# 校验
node scripts/validate-sculpt-glb.mjs
node scripts/verify-sculpt-glb-morphs.mjs

# 渲染对比（EEVEE）
$env:NX9_RENDER_OUT = "F:\code\project\NX9\output\sculpt-morph-preview"
& "F:\Blender\blender.exe" --background --python scripts/blender/render-morph-preview.py
node scripts/compare-morph-pngs.mjs
```

## 笔刷（NX9_STROKES JSON 数组）

| type | 说明 | 参数 |
|---|---|---|
| `smooth` | Laplacian 平滑选中顶点（磨圆） | center/radius/repeat |
| `sphere` | 沿背离 center 的径向位移 | center/radius/amount（负=内凹，正=外鼓） |

坐标为世界坐标（Y 向上，与 GLB 一致）。center/radius 参考 AABB 输出：
头 y≈1.41–1.78、x±0.137；眼 (±0.041,1.577,0.083)；下颌 y≈1.45–1.52。

## 注意事项

- 细分 Apply 若被 shape keys 阻止，脚本自动回退并写入报告（refine-report.json）。
- 导出物必须过契约门（morph 名、20 骨、9 Handle、材质通道、<10 万三角）才能替换正式资产。
- 替换正式资产后跑全套捏模测试回归（generate-character-base-model 等）。
- 正式基模 morph 由 Blender 生成（source: blender-sculpt-morphs-v1），
  旧程序化 morph 备份在 nx9-character-base.glb.bak。
