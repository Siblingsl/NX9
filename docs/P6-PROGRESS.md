# NX9 P6 实现进度

> P6 分两条线：**体验增强** + **3D 导演台（Stage Deck）**。UI 已独立重设计，不再沿用 [storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk) 的双侧栏深色布局。

## 线 A：体验增强

| # | 功能 | 状态 | 累计 |
|---|------|------|------|
| A1 | 生产进度墙（顶栏 Backlot 进度） | ✅ 完成 | 100% |
| A2 | 角色一致性自动注入 picture-gen / clip-gen | ✅ 完成 | 100% |
| A3 | ComfyUI 超市模块（替换 GenericBlock） | ✅ 完成 | 100% |

## 线 B：Stage Deck（3D 导演台）

| 阶段 | 内容 | 状态 |
|------|------|------|
| B0 | 架构与性能护栏设计 | ✅ |
| B1 | `packages/director3d` 子包 + 懒加载壳 | ✅ |
| B2 | 视口、对象树、机位、截图、Gizmo | ✅ |
| B3 | 故事板联动、截图上传、镜头写入 | ✅ |
| B4 | mesh-import / mesh-viewer / panorama-sphere 实装 | ✅ |
| B4+ UI | **NX9 Stage Deck** 独立 UI 原型（非 storyai 风格） | ✅ |
| B5 | 撤销栈 · camera-prompt 联动 · 工程 IO · WebGL 检测 · 本地模型库 | ✅ |

**当前总进度：A 线 100% · B 线 ~95%**

---

## Stage Deck UI 设计（与 storyai 区分）

| storyai（避免） | NX9 Stage Deck |
|-----------------|----------------|
| 深色双固定侧栏（220px + 280px） | 浅色 NX9 chrome（`#fafaf8` / 品牌 `#a13d63`） |
| 底部悬浮玻璃工具条 | 顶栏：俯瞰/镜头 pill、画幅、**记录帧** CTA |
| 常驻对象树 + 右侧属性栏 | 52px **图标轨**（层 / + / 环）+ **滑出抽屉** |
| — | 视口左侧 **T/R/S 变换轨** |
| — | 底部 **胶片条** 截图历史 |
| — | 画幅引导 + 三分法叠加 |

**UI 源码：** `packages/director3d/src/ui/*`、`styles/stage-deck.css`

---

## 变更日志

| 时间 | 项 |
|------|-----|
| 2026-07-07 | A1 进度墙 · A2 角色注入 · B1 3D 壳 |
| 2026-07-07 | B2 编辑器核心 · B3 故事板截图联动 · A3 ComfyUI 模块 |
| 2026-07-07 | Stage Deck UI 重设计 · B4 空间模块 · 全景/模型导入运行时 |
| 2026-07-07 | B5 撤销栈 · camera-prompt 输出 · 工程 JSON IO · WebGL 降级 · localStorage 模型库 |

### B5 交付物

- **撤销**：Zustand undo 栈（40 步）+ 顶栏按钮 + `Ctrl+Z` / `Delete`
- **工作流连线**：`director-3d` 输出 `picture` + `prompt`；`gatherUpstream` 读取 `lastCameraPrompt` / `lastCaptureUrl`
- **camera-prompt**：可接收上游 Stage Deck 机位描述并合并预设
- **工程 IO**：环境抽屉导出/导入 JSON
- **本地模型库**：mesh 资源写入 `localStorage`，跨会话可用
- **WebGL 检测**：不可用时不加载 Three.js，显示降级提示

### B4 交付物

- `MeshImportBlock` — glb/gltf/obj/fbx 上传
- `MeshViewerBlock` — 上游模型 → Stage Deck 预览
- `PanoramaSphereBlock` — 360° 全景 → Stage Deck 背景
- 运行时：`StageActor`、`ImportedMesh`、`PanoramaBackground`
- 6 姿势预设 · 8 体型 · 群众阵列（max 20）

### B3 交付物

- 截图 → `/api/assets/upload` → `block.lastCaptureUrl`
- 关联镜头 → 故事板 `firstFrameAssetId`
- 故事板「3D 预演」按钮 → spawn `director-3d`

### A3 交付物

- `ComfyMarketBlock` + `POST /api/gateway/comfy`
- `COMFY_PRESETS` + 设置中 `comfyui` Provider 地址

---

## 可选后续

- [ ] storyai 8 FBX 角色 + 20 姿势资源（参考仓库 `public/models` 仅含 license，需自行准备资产）
- [ ] Gizmo 拖拽变换的撤销批次
- [ ] 画布连线后实时 upstream 预览（无需批量运行）
- [ ] WebGL 不可用 → iframe 独立静态页
- [ ] Stage Deck 开闭内存 smoke 测试

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `docs/3D-DIRECTOR-INTEGRATION.md` | 完整集成规划 |
| `docs/P6-PROGRESS.md` | 本文件 |
