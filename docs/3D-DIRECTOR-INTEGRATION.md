# 3D 导演台集成规划（storyai-3d-director-desk → NX9）

> 参考项目：[jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)（MIT · React + Vite + Three.js + R3F + Zustand）

## 1. 目标与边界

### 要完整迁入的能力（来自参考项目 README）

| 能力 | NX9 落点 |
|------|----------|
| 导演视角 / 机位视角切换 | `Director3dViewport` 核心 |
| 8 内置角色 + 20 姿势 | `editor/runtime` 移植，资源放 `public/director3d/models/` |
| 角色 / 群演 / 几何体 / 机位快速添加 | 左侧对象树面板 |
| FBX / OBJ 本地导入 + 模型库 | 对接 `mesh-import` + 服务端 `/media/uploads` |
| 群众阵列 | 群演模块，**硬上限**（见性能章） |
| 全景图背景 | 对接 `panorama-sphere` |
| 机位拍摄、截图、镜头列表 | 输出 `picture` → `preview-sink` / 故事板 `firstFrameAssetId` |
| 画幅比例框、九宫格、Gizmo 平移旋转缩放 | 视口工具条 |
| 场景 JSON 导入导出 | 工作区 `block.data.scene` + 可选工程级导出 |
| 宿主通信桥 | `postMessage` / Zustand command bus（NX9 ↔ 3D 子应用） |
| 撤销 / 复制粘贴 / 删除 | 3D 编辑器内部栈，**不进入**画布 Undo |

### 明确不做（首期）

- 把 Three.js **渲染进每个 React Flow 节点**（性能灾难）
- 与画布 Undo 栈合并（隔离为 3D 内部历史）
- 完整复制参考项目全部 Vitest（NX9 侧做冒烟 E2E 即可）

### 与现有 `director-desk` 的关系

| 模块 | 职责 |
|------|------|
| `director-desk`（现有） | **AI 首帧生成** + 故事板镜头关联 |
| `director-3d`（新增） | **3D 预演 / 摆位 / 截图 / 机位参数** |
| 联动 | 3D 截图 → `director-desk` 参考图；机位参数 → `camera-prompt` / `clip-gen` |

建议 catalog 新增 `director-3d`，保留原 `director-desk` 名称避免破坏已有工作区。

---

## 2. 架构（保证性能的第一原则）

```mermaid
flowchart TB
  subgraph nx9_main [NX9 主应用 - 无 Three.js 常驻]
    Flow[React Flow 画布]
    Block[Director3dBlock 缩略图+按钮]
    Panel[Director3dPanel 全屏懒加载]
    SB[StoryboardPanel]
  end

  subgraph chunk [独立 Chunk - 仅打开时加载]
    R3F[React Three Fiber Canvas]
    Store[director3d Zustand]
    Loaders[FBX/OBJ/全景 Loader]
  end

  Flow --> Block
  Block -->|点击「打开 3D 导演台」| Panel
  Panel -->|dynamic import| chunk
  Panel -->|关闭时 unmount + dispose| chunk
  Store -->|debounced save| WS[(workspace JSON)]
  Store -->|截图上传| API[/api/assets/upload]
  SB <-->|镜头关联 / 首帧回写| Store
```

### 2.1 三种入口（统一进同一个 Panel）

1. **顶栏按钮**「3D 导演台」（与故事板并列）
2. **画布模块** `director-3d`：只显示缩略图 + 状态，**不内嵌 WebGL**
3. **故事板镜头**：右键「在 3D 导演台中预演」

### 2.2 单例 WebGL 规则（硬约束）

```text
全局最多 1 个 WebGL Context
打开 Panel → 创建 Canvas
关闭 Panel → scene.dispose() + renderer.dispose() + 取消 rAF
切换工作区 → 先关闭 Panel 再加载新 scene JSON
intensive 画布模式 → 允许打开但默认 pixelRatio=1、shadows=off
```

### 2.3 包结构（建议）

```text
packages/director3d/          # 从 storyai 移植，MIT 保留 LICENSE
  src/
    schema/                   # 场景、机位、对象类型
    store/                    # Zustand + undo（独立）
    canvas/                   # R3F 视口、画幅框、截图
    panels/                   # 对象树、属性面板
    loaders/                  # FBX/OBJ/全景
    bridge/                   # NX9HostBridge 接口
    index.ts                  # 仅导出 mountDirector3d(root, opts)

apps/web/src/
  panels/Director3dPanel.tsx  # lazy(() => import('@nx9/director3d'))
  blocks/spatial/Director3dBlock.tsx
```

`apps/web/package.json` **不直接**依赖 `three`；仅 `@nx9/director3d` 依赖，Vite `manualChunks` 打出 `director3d-[hash].js`。

---

## 3. 数据模型

### 3.1 工作区 block 数据

```typescript
interface Director3dBlockData {
  sceneVersion: 1;
  scene: Director3dScene;      // 移植 storyai schema
  linkedShotId?: string;
  lastCaptureUrl?: string;   // 最近截图 /media/...
  lastCameraPrompt?: string; // 导出给 camera-prompt
  aspectRatio?: '16:9' | '9:16' | '1:1';
}
```

### 3.2 持久化策略

| 数据 | 存储 |
|------|------|
| 场景 JSON（<500KB） | `workspace.blocks[].data.scene` |
| 截图 PNG | `/api/assets/upload` → URL 写入 block + shot |
| 本地模型二进制 | `/media/uploads/*.fbx`（不进 JSON） |
| 内置角色/姿势 | 静态 `public/director3d/`（不进工作区） |

保存：**debounce 800ms**，与画布 `PERF.saveDebounceMs` 错开，避免双写风暴。

### 3.3 与故事板字段映射

| 3D 导演台 | StoryboardShot |
|-----------|----------------|
| 镜头条目 `shotId` | `id` |
| 截图 URL | `firstFrameAssetId` |
| 机位 FOV / 位置 / 目标点 | 写入 `promptEn` 后缀或 `meta.camera`（扩展字段） |
| 捕获后 | `status: 'review'`（manual 审阅模式） |

---

## 4. 功能分期

### Phase B1 — 壳 + 懒加载（1 周）

- [ ] `packages/director3d` 空壳 + `mountDirector3d(el, { scene, onChange, onCapture })`
- [ ] `Director3dPanel` 全屏 overlay，关闭即卸载
- [ ] Vite `manualChunks` + 首屏 bundle 不含 three
- [ ] 冒烟：打开/关闭 10 次无内存持续上涨（Chrome Performance）

### Phase B2 — 核心编辑（2–3 周，移植 storyai `src/editor`）

- [ ] 视口 + 导演/机位视角
- [ ] 对象树 + 变换 Gizmo
- [ ] 内置角色与姿势预设
- [ ] 截图 → upload → 回写 block
- [ ] 场景 JSON 导入/导出文件

### Phase B3 — NX9 联动（1–2 周）

- [ ] `director-3d` 画布模块（缩略图模式）
- [ ] 故事板「用 3D 预演此镜头」
- [ ] 输出连接 `camera-prompt` / `picture-gen`（上游 picture + prompt）
- [ ] 与现有 `director-desk` 文档区分 + 工作流模板

### Phase B4 — 空间模块补齐（1–2 周）

- [ ] `mesh-import`：上传 glb/obj/fbx
- [ ] `mesh-viewer`：轻量预览 + 快照（仍走 Panel 单例，节点内仅缩略图）
- [ ] `panorama-sphere`：全景背景接入 3D 场景

### Phase B5 — 打磨（可选）

- [ ] 群众阵列上限配置（设置页，默认 20）
- [ ] WebGL 不可用 → 降级 iframe 独立构建的 `director3d` 静态页
- [ ] Electron：本地模型路径通过 `runtime-bridge.openPath`

---

## 5. 性能护栏（必须实现）

| 规则 | 参数 |
|------|------|
| 同时 WebGL 实例 | **1** |
| 3D Panel 未打开时 | **零** Three.js 代码执行 |
| `pixelRatio` | `min(devicePixelRatio, intensive ? 1 : 1.5)` |
| 阴影 | intensive / 节点数≥80 时 **关闭** |
| 群演数量上限 | 默认 **20**，可配置 |
| 截图分辨率 | 最大边 **1920** |
| 模型多边形 | 单模型 **100k** 三角面警告，**500k** 拒绝 |
| rAF | Panel 隐藏 `visibility:hidden` 时 **暂停** |
| 内存 | 关闭时 `dispose` 几何体/材质/纹理 |

### 与 NX9 perf-controller 协作

```typescript
// Director3dPanel 打开前
const { intensive } = usePerfController(...);
if (intensive) showToast('画布节点较多，3D 导演台将使用性能模式');

// 传入 director3d
{ performanceMode: intensive ? 'low' : 'normal' }
```

React Flow 侧保持 `onlyRenderVisibleElements`；**禁止**在 `nodeTypes` 里注册带 Canvas 的组件。

---

## 6. 参考项目移植清单

从 [storyai-3d-director-desk/src](https://github.com/jiguang132/storyai-3d-director-desk/tree/main/src) 按目录移植：

| 源目录 | 动作 |
|--------|------|
| `editor/schema` | 原样迁入 `packages/director3d/src/schema` |
| `editor/store` | 迁入，Undo 保留在包内 |
| `editor/canvas` | 迁入，抽离 NX9 主题 CSS 变量 |
| `editor/panels` | 迁入，Tailwind 对齐 NX9 token |
| `editor/loaders` | 迁入，上传走 NX9 `api.uploadAsset` |
| `editor/io` | 改造 `bridge` 对接 NX9 |
| `editor/runtime` | 迁入角色/姿势 |
| `public/models` | 复制到 `apps/web/public/director3d/models` |

**许可证**：保留 MIT LICENSE 与版权声明；`NOTICE` 写入 NX9 `docs/third-party.md`。

**版本**：参考项目 React 18 / Vite 6 → NX9 为 React 19 / Vite 6，移植时跑 `npm run typecheck` 修 R3F 类型即可。

---

## 7. 与 P6 线 A 的并行顺序

```text
Week 1:  A1 进度墙 + A2 角色注入 + B1 3D 壳懒加载
Week 2:  A3 Comfy 模块 + B2 核心视口移植
Week 3:  B3 故事板联动 + B4 mesh/panorama
```

线 A 改动小、见效快；线 B 以 **B1 壳** 为先，避免过早移植全部 editor 导致主包膨胀。

---

## 8. 验收标准

1. 冷启动首屏：**不加载** `three` chunk（Network 无 three.js）
2. 打开 3D 导演台：**<2s** 可交互（本地）
3. 关闭后：Chrome Memory 无连续上升（5 次开关）
4. 截图写入故事板镜头 `firstFrameAssetId`，刷新后仍在
5. 画布 80+ 节点时仍可打开 3D（性能模式，≥24fps 或降级提示）
6. 工作区 JSON 不含 base64 模型（仅 URL 引用）
