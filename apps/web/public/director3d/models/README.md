# 3D 模型资源

此目录存放 NX9 导演台内置 3D 角色/道具模型文件。

支持的格式：.glb, .gltf, .obj, .fbx

## 捏模身份基模（B2 契约）

正式身份基模放本目录：`nx9-character-base.glb` + `nx9-character-base.manifest.json` + `LICENSE-*.txt`。

- **来源**：MPFB CC0 人体基础网格 + Blender 无头精修管线 + Blender 区域雕刻 morph（source: `blender-sculpt-morphs-v1`）
- **morph**：HeadMesh 72 个身份 morph（34 个 morph 参数 pos/neg，jawWidth/eyeSpacing 含 .L/.R 单侧扩展）；
  BodyMesh 4 个（bodyFat/muscleMass）
- **生成管线**：见 `scripts/blender/README.md`（generate-sculpt-morphs.py → apply-sculpt-morphs.mjs）
- 旧程序化 morph 基模备份：`nx9-character-base.glb.bak`

manifest 最小结构：

```json
{ "version": 1, "meshContractVersion": 1, "modelPath": "nx9-character-base.glb", "license": "NX9 internal" }
```

运行时加载顺序：manifest 校验（version / meshContractVersion / modelPath）→ GLB 加载 → 捏模契约判定。
契约不合格（视口切片 6 项不可驱动、身份 morph < 12）或任何一步失败，捏模台强制回退代理粘土人，不宣称成品基模。

## 捏脸入口

全身捏模台（`FaceSculptModal` + `CharacterSculptViewport`）加载正式基模，
支持 50+ 捏脸参数滑块 + 控制点拖拽 + 单侧不对称 + 定妆出图。
入口位于角色详情右栏「捏脸 · 体型」的「打开全身捏模台」。
