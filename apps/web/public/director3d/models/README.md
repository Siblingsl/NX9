# 3D 模型资源

此目录存放 NX9 导演台内置 3D 角色/道具模型文件。

支持的格式：.glb, .gltf, .obj, .fbx

## 捏模身份基模（B2 契约）

正式身份基模放本目录：`nx9-character-base.glb` + `nx9-character-base.manifest.json` + `LICENSE-*.txt`。

manifest 最小结构：

```json
{ "version": 1, "meshContractVersion": 1, "modelPath": "nx9-character-base.glb", "license": "NX9 internal" }
```

运行时加载顺序：manifest 校验（version / meshContractVersion / modelPath）→ GLB 加载 → 捏模契约判定。
契约不合格（视口切片 6 项不可驱动、身份 morph < 12）或任何一步失败，捏模台强制回退代理粘土人，不宣称成品基模。
