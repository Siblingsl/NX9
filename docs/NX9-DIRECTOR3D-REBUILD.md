# NX9 · 3D 导演台重建：缺口 · 开源对比 · 适配方案

> 日期：2026-09-11  
> 目标：现有 3D 舞台几乎不可用 → 推翻 UI/交互并重建为可日常摆镜的 Stage Composer；能力清单来自开源调研，实现为 NX9 自研（保留现有 `shotState` / commit / `director3dGuide` 契约）。

---

## 1. 项目内仍缺什么（相对「能做出一部有声短片」）

| 域 | 现状 | 仍缺 / 边界 |
|----|------|-------------|
| AI 短片主链 | SF-01～20 代码已收口 | SF-11 真机通道台账；SF-12 口型后置 |
| 素材库 | P0 道具/服装预检等已落地 | 协作体验与健康修复见素材库文档 |
| 成片渲染 | Remotion 多轨路径已接 | 本机零产物台账（通道/额度） |
| **3D 导演台** | 有壳、有 commit、有 WebGL 生命周期 | **摆镜/飞摄/机位语义/多视口弱到几乎不能用** ← 本轮主目标 |

---

## 2. 现有 3D 导演台为何「几乎不能用」（代码证据）

| 问题 | 证据 | 影响 |
|------|------|------|
| 导航只有 Orbit | `DirectorCanvas` + `OrbitControls` | 无法 WASD/右键飞摄，构图靠拖很挫 |
| 无球坐标机位台 | 无 azimuth/elevation/distance 滑条 | 不能精确摆「俯仰/景别」 |
| 机位文案过弱 | `buildCameraPrompt` 仅 FOV+坐标 | 批出 prompt 几乎无镜头语言 |
| 人偶不可交互摆姿 | `StageActor` 仅 preset 胶囊体 | 无法现场摆手势/朝向细调 |
| 无多视口 | 单透视 Canvas | 无法同时看顶视/侧视摆 blocking |
| 无运镜轨 | 无 dolly A→B | 无法描述推拉/轨道再写进 prompt |
| UI 信息过载 | `StageDeckShell` 多 pill + 抽屉堆叠 | 主任务（摆镜→截帧→提交）被淹没 |

契约必须保留：`Director3dHostOptions`、`Director3dShotState`、候选帧上传/提交、`CameraPresetBar` 写 `cameraPrompt`、F-045 WebGL 生命周期（`glRef` / visibility / dispose）。

---

## 3. 开源 3D 导演/预演台综合对比

| 项目 | 许可 | 栈 | 功能强度 | 好用度 | 可移植到 NX9 | 结论 |
|------|------|-----|----------|--------|--------------|------|
| **FramePilot** ([rahmanef63/framepilot](https://github.com/rahmanef63/framepilot)) | **MIT** | Three.js、多视口 scissor、机位数学、平台化 AI prompt | ★★★★ 机位/景别/镜头语言强 | ★★★★ 编辑器肌肉记忆清晰 | ★★★★★ 同 Three、可直接改编纯函数 | **主移植源** |
| **CozyClay** ([NomaDamas/CozyClay](https://github.com/NomaDamas/CozyClay)) | **AGPL-3.0** | R3F、时间线、dolly、角色路径、MCP | ★★★★★ 最完整 previs | ★★★★★ Unity 式操控 | ★★ 能力可学，**禁止拷源码**（AGPL 传染） | **能力天花板清单**（自研重写） |
| **AI Scene Composer** ([hendrywang/AISceneComposer](https://github.com/hendrywang/AISceneComposer)) | Apache-2.0 | R3F、代理角色、shot 系统 | ★★★ blocking + 截帧 | ★★★ 轻量 | ★★★★ 许可友好 | 辅助：shot 截帧/召回 |
| **Open Media Shot Composer** | MIT（依赖 Mannequin.js **GPL**） | R3F + 关节人偶 | ★★★ 摆姿强 | ★★★ | ★★ GPL 人偶不可直接链入 | 只学交互，**不用其库** |
| **CineBlock** | 未标清 + Marble API | R3F + Gaussian splat | ★★★ 环境强 | ★★ 依赖外部 API | ★ 不符本地优先 | 不采用 |
| **Shotblockr** | MIT | Babylon.js | ★★ 原型 | ★★ | ★ 栈不一致 | 不采用 |

### 选定策略

1. **主移植**：FramePilot 的机位球坐标、景别分类、焦段/FOV、多视口交互心智、镜头→AI 文案（MIT，保留版权声明）。  
2. **能力补齐（自研，不拷 AGPL）**：飞摄导航、dolly A→B、镜头关键帧时间线 scrub、顶视摆位、角色朝向/关节滑条。  
3. **不移植**：CozyClay MCP/ARDY 动捕、CineBlock Marble、GPL Mannequin.js。

---

## 4. NX9 适配方式

```text
packages/director3d
  schema/cameraGeometry.ts     ← 球坐标 + 景别/角度标签 + 强化 buildCameraPrompt
  store/directorStore.ts       ← interactionMode / viewportLayout / dollyKeys / roll
  canvas/DirectorCanvas.tsx    ← 单 Canvas + View 多视口 + 飞摄
  ui/StageDeckShell.tsx        ← 全新布局：镜列表 | 视口 | 机位台 | 提示词
  ui/CameraRigPanel.tsx        ← az/el/dist/fov/roll/lens
  ui/DollyTimeline.tsx         ← A/B 关键帧与插值预览
  （保留）CameraPresetBar / Filmstrip / commit 桥
apps/web  director3d-host-controller  ← 契约不变
```

验收：能在 2 分钟内完成「载入角色 → 球坐标摆镜 → 多视口确认 → 截帧 → 提交」，且 `cameraPrompt` 含景别/角度/焦段自然语言。

---

## 5. 功能移植清单（诚实状态 · 复审 2026-09-11 · 续作 P1/P2）

| ID | 能力 | 状态 | 说明 |
|----|------|------|------|
| D3-01 | 球坐标机位（az/el/dist） | ✅ | `CameraRigPanel` + `applyActiveOrbit` |
| D3-02 | 焦段 ↔ FOV、景别/角度标签 | ✅ | `cameraGeometry.ts` |
| D3-03 | 强化 `buildCameraPrompt` | ✅ | 截帧/预设/store 已走皮肤 + 细节开关 |
| D3-04 | 交互模式：导航 / 主体 / 相机 | ✅ | StageHeader |
| D3-05 | WASD + 飞摄 / F 框选 | ✅ | 单视口导航模式；非右键飞摄 |
| D3-06 | 四视口 | ✅ | 点选激活窗格 + 独立 controls；契约测覆盖 |
| D3-07 | Dolly A→B | ✅ | 插值预览有；非完整时间线剪辑 |
| D3-08 | 角色朝向 | ✅ | yaw + D3-16 关节滑条；**无视口拖拽摆姿** |
| D3-09 | Stage UI 壳 | ✅ | 紧凑 context + 移动端底栏 sheet；filmstrip/rail 保留为功能入口 |
| D3-10 | commit / WebGL / 预设条 | ✅ | F-045/F-018 绿 |
| D3-11 | 提示词 10 项细节开关 | ✅ | `PromptDetailFlags` + 机位台可折叠 |
| D3-12 | 多镜预览轨 scrub/播放 | ✅ | `ShotPreviewTimeline`（多机位或 ≥2 截帧） |
| D3-13 | 主体模式视口拖拽 | ✅ | 地面 XZ 拖移；主体模式关闭透视 orbit |
| D3-14 | 移动端底栏 | ✅ | `StageMobileDock` ≤900px |
| D3-15 | 持久 scissor/GL | ✅ | tab 隐藏：降 dpr + `frameloop=never`，**不** dispose / display:none |
| D3-16 | 角色关节微调滑条 | ✅ | 预设 + 相对欧拉偏移；检查器 8 轴；提交/摆位同步写回 `poseJoints` |
| D3-17 | 导航右键环顾 | ✅ | WASD 飞摄时 RMB 看向（非 AGPL 路径） |

### 相对 FramePilot / 产品边界仍缺

| 缺口 | 严重度 |
|------|--------|
| 浏览器真机人工点选四视口验收台账 | P2（工程人工，非缺代码） |
| 视口内关节拖拽摆姿 | 明确不做（AGPL 边界；改用 D3-16 滑条） |

### 相对 CozyClay 能力清单明确不做

AGPL 源码、ARDY 动捕、MCP 24 tools、角色 root path 时间线 —— 文档边界，不宣称已完成。

### 复审结论

> FramePilot 机位主链 + 提示词细节 + 多镜预览 + 主体拖拽 + 四视口激活 + 移动端底栏 + tab 持久 GL + 关节滑条微调 + 右键环顾已落地。剩余主要是真机人工验收台账；视口关节拖拽摆姿明确不做。

