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

## 命令（Windows PowerShell）

```powershell
$env:NX9_SRC_GLB = "F:\code\project\NX9\apps\web\public\director3d\models\nx9-character-base.glb"
$env:NX9_OUT_GLB = "F:\code\project\NX9\output\refined\nx9-character-refined.glb"
$env:NX9_REPORT  = "F:\code\project\NX9\output\refined\refine-report.json"
$env:NX9_SUBSURF = "2"
$env:NX9_STROKES = '[{"name":"HeadMesh","type":"smooth","center":[0,1.74,0.02],"radius":0.10,"repeat":3}]'
& "C:\Program Files\Blender Foundation\Blender 4.x\blender.exe" --background --python scripts/blender/refine-base-model.py

# 契约门（apps/web 下）
$env:NX9_GLB_VALIDATE = "F:\code\project\NX9\output\refined\nx9-character-refined.glb"
pnpm vitest run src/engine/__tests__/sculpt-external-glb-validate.test.ts

# 预览（apps/web 下；ASCII 看轮廓，PNG 看效果）
$env:NX9_GLB_PREVIEW = "..\..\output\refined\nx9-character-refined.glb"
pnpm vitest run src/engine/__tests__/sculpt-preview-render.test.ts
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
