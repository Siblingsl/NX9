# NX9 智能剪辑台（clip-editor）· 现状诊断与目标规格

> 状态：**P0–P3 主闭环已落地**（见下方实现快照）；下文 §1–§2 保留诊断原文作对照，§3–§5 仍为验收基准
> 范围：`clip-editor` 节点全链（画布卡 → ScreenModal → 编排器 → 时间线数据 → 预览 → 渲染 → 交付打包），及「智能替换」能力域
> 依据：仓库现行代码（文中均给出文件路径）与 `docs/`
> 日期：2026-08-12（实现快照更新同日）

---

## 0. 实现快照（对照 §5 分期）

| 阶段 | 状态 | 关键落地 |
|------|------|---------|
| **P0** | 已完成 | 轨道 ID v3 迁移；`Nx9Episode` 按 kind；服务端 `render-remotion`；`probe-duration`；结构化 `TimelineOp` 建议 |
| **P1** | 已完成 | `EditDesk` 布局；多轨时间轴拖/裁/分割/删除；`@remotion/player`；撤销栈；素材箱 |
| **P2** | 主闭环已完成，细项见下 | 转场/音量关键帧/变速/字幕；`SmartReplacePanel` 帧编辑+重生成；蒙版笔刷；素材库 `@` 提及；替换采纳写回时间线 + 上游 `videoVersions` |
| **P3** | 基础已完成 | `POST /api/montage/video-edit` + Fal provider 注册；面板「直接替换」模式；**首帧自动跨帧追踪仍缺** |

仍开放（相对 §5 / §6）：

- P2：专用 `POST /api/picture/edit-masked`（现用 `proxyFal` / `proxyImage`）
- P3：首帧标注后的自动追踪
- §6：音频波形、overlay 位置/缩放编辑

---

## 0b. 一句话结论（诊断原文，历史对照）

**诊断时点**的智能剪辑是「编排向导 + 只读时间线报表」，不是剪辑器。
时间线只能看不能改：没有播放头、没有预览画面、不能拖动、不能裁剪、不能分割。用户对本节点的两条核心诉求——

1. **实质的视频时间轴**：多轨、可拖、可裁、可分割、帧精确预览、所见即所得；
2. **生成式智能替换**：对成片片段替换背景 / 人物 / 指定物体（含移除）；

诊断时点均为 **缺失**。支撑设施大半已在库内：`TimelinePayload`、`@remotion/player`、FFmpeg/Remotion/Hyperframes、抽帧/图像编辑/图生视频。**本规格的主张是升级而非重写**：把 clip-editor 升级为与导演台、分镜台同级的「剪辑台」Desk。

---

## 1. 现状盘点（代码事实）

### 1.1 节点形态

- 目录登记：`packages/shared/src/catalog/block-catalog.ts`（kind `clip-editor`，「智能编排时间线 · Remotion/HF/FFmpeg 成片」）；`attached-workspace.ts` 中 `workspaceType: 'none'`，自有 ScreenModal，画布保留摘要卡。
- 实现：`apps/web/src/blocks/core/ClipEditorBlock.tsx`（约 810 行）。ScreenModal 内三步管线：**① 编排 → ② 时间线 → ③ 预览/送交**。
- 「时间线」页 = 三个统计数字 + 每轨一条百分比色块 + 片段文件名列表（`se2-rail` / `se2-block` / `se2-clip-list`）。**没有任何编辑交互，没有 `<video>` 预览，没有播放头。** 画布摘要卡即用户截图所见的「尚未编排时间线 / 打开智能剪辑」占位形态。

### 1.2 数据模型：字段早已备好，UI 用不上

`packages/shared/src/types/timeline.ts` 的 `TimelineClip` 已定义 `trimInSec` / `trimOutSec` / `transitionOut`（cut/fade/wipe/shader）/ `text` / `style` / `takeId` / `shotId`——裁剪、转场、字幕、take 溯源的字段**全部存在**，但没有任何 UI 能写入它们。`TimelineTrack` 只有 `id/kind/clips`，缺轨道级 `label/muted/locked/volume`。

### 1.3 编排器：规则式 + 建议空壳

`apps/web/src/engine/smart-edit-orchestrator.ts`：

- 漫剧链 `orchestrateDramaTimeline`：镜头按 index 排序 → `buildTimelineFromShotsV2` 建轨 → 追加 A1 对白轨与 BGM 轨。镜头时长用 `durationSec ?? 4` 估算，**未调用已有的 `/api/montage/probe-duration` 校准真实时长**。
- 爆款链 `orchestrateViralTimeline`：上游 clips 顺序拼轨，每段固定 3s。
- 建议系统：`trim` / `transition` 建议的 `patch: {}` 是**空对象**——「采纳」后时间线毫无变化；采纳逻辑是顶层浅合并 `{ ...timeline, ...patch }`，既改不了单个 clip，patch 一旦含 `tracks` 还会整体覆盖。**建议系统目前是表演性质的。**

### 1.4 渲染链：四引擎两断一岔

| 引擎 | ClipEditorBlock 实际行为 | 问题 |
|------|------------------------|------|
| ffmpeg | `POST /api/montage/concat-clips` 顺序拼接 | 忽略 trim/转场/多轨，等于「顺序拼接」 |
| hyperframes | `POST /api/montage/render-hyperframes` 任务队列 | 可用，但预览≠成片 |
| remotion | 客户端 JSZip 打包 Studio bundle **下载 zip** | 服务端 `POST /api/montage/render-remotion`（`montage.controller.ts`）与 `api.renderRemotion`（`client.ts`）**都已存在却未被本节点调用** |
| auto(drama) | 回落 `concat-episode` | 同 ffmpeg，时间线编辑结果不生效 |

### 1.5 缺陷清单（升级前必须修）

| # | 缺陷 | 证据 |
|---|------|------|
| D1 | **轨道 ID 三套并存，Remotion 渲染丢轨**：漫剧链产 `video-1/audio-1/subtitle-1`（`timeline-export.ts`），编排器手工追加 `A1` / `track-bgm`，爆款链产 `V1`；而 Remotion 合成 `Nx9Episode.tsx` 只认 `video-1/video-2/audio-1/subtitle-1`。爆款时间线送 Remotion 渲染 = 黑屏，A1 对白与 BGM 轨被静默丢弃 | `packages/remotion-compositions/src/Nx9Episode.tsx` L15-18；`smart-edit-orchestrator.ts` L89-113、L198 |
| D2 | 建议 `patch` 空对象 + 顶层浅合并，采纳≈空操作 | `smart-edit-orchestrator.ts` L125-155；`ClipEditorBlock.tsx` L286-300 |
| D3 | remotion 引擎走客户端 zip 下载，服务端渲染路由闲置 | `ClipEditorBlock.tsx` L239-253 vs `montage.controller.ts` L208 |
| D4 | 片段时长全为估算，未经 `probe-duration` 校准，时间轴刻度失真 | `smart-edit-orchestrator.ts` L63 |
| D5 | `@remotion/player` 在 `apps/web/package.json` 依赖中，但全仓库零引用——帧精确预览的关键设施被闲置 | `apps/web/package.json` L17 |

### 1.6 智能替换相关的存量能力

| 能力 | 位置 | 状态 |
|------|------|------|
| 抽帧 | `POST /api/montage/extract-frames` | 在线 |
| 图像指令式编辑（参考图 + 文字指令） | `picture-gen` 链 / `inpaint-edit` 节点（`InpaintWorkspace.tsx`）/ `inpaint-repair.ts`，Gemini image 系列 `supportsReference` | 在线，**无 mask 笔刷**，纯 prompt 驱动 |
| 背景移除（图像） | `bg-remove` 节点，`fal-ai/birefnet/v2` | 在线，仅图像 |
| 图生视频（首帧驱动重生成） | `clip-gen`（Magic Hour / LTX / Veo / Grok / Seedance） | 在线 |
| 深度视频（控制信号） | `POST /api/montage/depth-video` | 在线 |
| 视频级分割 / 追踪 / 视频重绘 | — | **完全缺失**，模型注册表无此类 provider |
| 镜头 take 体系（重生成回写、可回滚） | 导演台 / 故事板 shots·takes | 在线，可复用 |

---

## 2. 差距判定

| 能力域 | 目标基准 | 现状 | 判定 |
|--------|---------|------|------|
| 多轨时间轴渲染 | 视频/音频/字幕/贴片轨分层显示，时间刻度 + 缩放 | 百分比色块条 | **缺失** |
| 播放头 + 帧精确预览 | 拖动播放头逐帧看画面，空格播放/暂停 | 无预览画面 | **缺失** |
| 片段编辑 | 拖移、边缘裁剪、播放头分割、删除、磁吸、波纹 | 无任何交互 | **缺失** |
| 撤销/重做 | 时间线操作全可撤销 | 无 | **缺失** |
| 转场/音量/变速/字幕编辑 | 片段级属性可视化编辑 | 字段在类型里，无 UI | **半成品** |
| 预览 = 成片 | 同一合成引擎驱动预览与渲染 | 预览缺失且渲染丢轨（D1） | **缺陷** |
| AI 编排 | 一键粗剪可用、建议可解释可生效 | 规则式且建议空壳（D2） | **缺陷伪装成完成** |
| 智能替换（背景/人物/物体） | 选片段 → 圈选目标 → 指令替换 → 替换回时间轴 | 无 | **缺失** |

---

## 3. 目标形态：智能剪辑台（Edit Desk）

### 3.1 定位与形态

- 与导演台、分镜台同级的 **ScreenModal 全屏 Desk**；画布保留摘要卡（缩略图 + 时长 + 轨道数 + 状态徽标），双击/按钮进台。注册表配置（`workspaceType: 'none'`，`attachToNode: false`）**不变**。
- 节点契约不变：只消费本节点连入的上游（镜头 / 视频 / 音频），时间线存于本节点 `data.timelineDraft`；出口仍是「确认时间线 → 同步 `export-pack` 交付打包」。编排/建议/渲染三步向导**收编为台内功能**，不再是全部界面。

### 3.2 台内布局

```
┌───────────────────────────────────────────────────────────────┐
│ 顶栏：标题 · 画幅/fps · 撤销/重做 · AI编排 · 确认并送交导出        │
├───────────┬───────────────────────────────┬───────────────────┤
│ 素材箱     │        预览播放器              │   检查器           │
│ 上游镜头   │   (@remotion/player 挂        │  选中片段属性：     │
│ 上游音频   │    Nx9Episode，帧精确)         │  裁剪/转场/音量/    │
│ 素材库引用 │   ▶ ⏸ ⏮ ⏭  00:12.4 / 01:30   │  变速/字幕/智能替换 │
├───────────┴───────────────────────────────┴───────────────────┤
│ 时间轴（多轨 · 可缩放 · 磁吸）                                    │
│  V2 贴片 ░░░░  ▐███▌                                           │
│  V1 视频 ▐████▌▐██████▌▐███▌▐█████▌   ← 播放头                  │
│  S1 字幕  ▐——▌  ▐————▌                                         │
│  A1 对白 ▐≈≈≈▌ ▐≈≈≈≈≈▌                                         │
│  A2 BGM  ▐≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈▌                              │
└───────────────────────────────────────────────────────────────┘
```

### 3.3 时间轴交互规格

**P0（没有这些就不叫时间轴）**

| 交互 | 规格 |
|------|------|
| 多轨渲染 | 按规范轨道 ID（§3.5）分层；轨头显示 label / mute / lock |
| 时间刻度 + 缩放 | 秒级刻度，Ctrl+滚轮缩放，缩放级别持久于节点 data |
| 播放头 | 点击/拖动刻度定位；与预览播放器双向同步；空格播放/暂停 |
| 选中 | 单击选中片段（检查器联动），Ctrl 多选 |
| 拖移 | 横向拖动改 `startSec`；磁吸到相邻片段边缘/播放头/整秒 |
| 裁剪 | 拖片段左右边缘写 `trimInSec/trimOutSec` 并联动 `durationSec` |
| 分割 | 播放头处 S 键/按钮切分为两个 clip（trim 派生，无需重新生成媒体） |
| 删除 | Delete 删除选中；提供「波纹删除」（后续片段自动前移补洞） |
| 撤销/重做 | 时间线操作栈（Ctrl+Z / Ctrl+Shift+Z），存内存即可，容量 ≥50 步 |
| 时长校准 | 素材入轨时调 `probe-duration` 回写真实时长（修 D4） |

**P1（成片质量所需）**

- 转场编辑：片段衔接处点击设置 `transitionOut`（cut/fade/wipe，时长可调）。
- 音频：片段级音量、淡入/淡出；轨道级静音；对白轨自动 ducking（把 D2 里的 ducking 建议做成真实现）。
- 变速：片段级 `speed`（0.25×–4×）。
- 字幕轨内联编辑：双击字幕片段改 `text/style`；与字幕台（caption-asr）产出互通。
- 素材箱拖入：上游素材、素材库视频/音频/图片直接拖到轨道上。

### 3.4 预览播放器（关键架构决策）

用已安装的 **`@remotion/player`** 挂载 `Nx9Episode` 合成做台内预览：

- **预览与服务端 Remotion 渲染共用同一份合成代码**（`packages/remotion-compositions`），从机制上保证「预览 = 成片」，这是自绘 canvas 播放器给不了的。
- 播放头帧号与时间轴双向绑定；时间线任何编辑即时反映在预览中（React props 驱动，无需重渲染任务）。
- 前提是修 D1：轨道 ID 规范化 + `Nx9Episode` 按 `kind`+ID 前缀遍历轨道，而不是硬编码四个 ID。
- 成片路径：预览确认后走服务端 `render-remotion` 任务队列（修 D3）；FFmpeg concat 降级为「快速拼接导出」显式选项；Hyperframes 保留为竖屏模板渲染通道。

### 3.5 数据模型扩展（`packages/shared/src/types/timeline.ts`）

```ts
interface TimelineTrack {
  id: string;            // 规范：V1..Vn / A1..An / S1..Sn（迁移函数兼容旧 ID）
  kind: 'video' | 'audio' | 'subtitle' | 'overlay';  // subtitle/overlay 从 video 中分出
  label?: string;        // 「对白」「BGM」「贴片」
  muted?: boolean;
  locked?: boolean;
}
interface TimelineClip {
  // 现有字段不动，新增：
  volume?: number;         // 0–2，默认 1
  fadeInSec?: number;
  fadeOutSec?: number;
  speed?: number;          // 0.25–4，默认 1
  sourceDurationSec?: number; // probe 回写的素材真实时长（trim 上限）
  replacedFrom?: string;   // 智能替换前的原 clip/take id，供回滚
}
```

同步项：`version` 升 3 + 加载迁移（旧轨道 ID 映射、`subtitle-1` kind 修正）；`Nx9Episode` 改为按 kind 遍历；`validateRemotionTimeline` 增加轨道 ID/kind 校验。

### 3.6 AI 助剪归位

- 「AI 编排」= 台内一键粗剪入口：空时间线时主推，已有时间线时生成**可对比的新草稿**（非直接覆盖）。
- 建议系统重做为**结构化 patch 操作**：`{ op: 'set-transition' | 'trim-clip' | 'set-ducking' | 'reorder', target: clipId/trackId, value }`，由统一 applyPatch 执行并进撤销栈——修 D2，让「采纳」真的改时间线。
- 建议在时间轴上定位显示（对应片段角标），而非脱离上下文的列表。

---

## 4. 智能替换（Smart Replace）

### 4.1 用户故事

1. 换背景：角色不动，把镜头背景从「教室」换成素材库场景「天台·黄昏」。
2. 换人物：把片段中某角色替换为素材库另一角色（保持动作与构图）。
3. 换/移除物体：把桌上的「手机」换成「怀表」；或直接移除穿帮物体。

### 4.2 路线 A（主路线，P1–P2）：帧编辑 + 重生成，全走存量链

NX9 的片段带 `shotId/takeId` 溯源，最稳的替换不是逐帧修补视频，而是**改首帧 → 重生成该镜 → 以新 take 无损换回**：

```
时间轴选中片段 → 「智能替换」
  → ① 取关键帧：clip.firstFrameAssetId 或 extract-frames 抽帧
  → ② 替换工作台（新组件，升级自 InpaintWorkspace）：
       · 笔刷/框选圈出目标区域（生成 mask PNG）
       · 替换指令输入，支持 @角色:名 / @场景:名（AssetRef 注入库内
         定妆图与锁定 Prompt，保证一致性）
  → ③ 图像编辑：Gemini image（参考图+指令，现链）；mask 严格模式
       接 FLUX inpaint 类模型（fal-models 注册表新增条目）
  → ④ 图生视频：编辑后首帧 + 原镜时长/运镜描述 → clip-gen 重生成
  → ⑤ 对比预览（原/新并排）→ 接受：新 take 回写镜头，时间轴 clip 换
       assetUrl，记录 replacedFrom；拒绝：无痕丢弃
```

- 复用率：①③④⑤ 全部是存量能力，仅 ②（mask 标注画布）与流程编排是新代码。
- 溯源：走镜头 take 体系，导演台可见替换历史，可回滚。
- 对纯上游视频（无 shot 溯源的爆款链素材）：同流程，只是产物存为节点级新素材而非 take。

### 4.3 路线 B（P3）：真·视频级替换

对「角色持续运动、背景整段替换」等首帧驱动不够稳的场景，需要视频分割追踪 + 视频重绘模型：

- `provider-registry` 新增 `video-edit` 能力位（输入：视频 + mask/目标描述 + 替换指令；输出：视频），如 SAM2 类分割追踪 + VACE/视频 inpaint 类生成端点，具体型号按接入时市场评估。
- 服务端新增 `POST /api/montage/video-edit` 任务队列（复用 tasks 体系与轮询协议）。
- UI 完全复用 4.2 的替换工作台，仅执行引擎切换（「重生成模式 / 直接替换模式」），mask 从单帧标注升级为「首帧标注 + 自动追踪」。

### 4.4 服务端接口草案

| 路由 | 用途 | 阶段 |
|------|------|------|
| `POST /api/montage/probe-duration`（已有） | 入轨时长校准 | P0 接入 |
| `POST /api/montage/render-remotion`（已有） | 成片渲染主通道 | P0 接入 |
| `POST /api/picture/edit-masked` | mask + 指令的图像局部编辑（严格模式） | P2 |
| `POST /api/montage/video-edit` | 视频级替换任务队列 | P3 |

---

## 5. 分期与验收

| 阶段 | 内容 | 验收标准 |
|------|------|---------|
| **P0 地基修复** | 修 D1–D5：轨道 ID 规范化 + 迁移；`Nx9Episode` 按 kind 遍历；接通服务端 render-remotion；probe-duration 校准；建议 patch 结构化（先做 transition/ducking 两类真实现） | 爆款/漫剧时间线送 Remotion 渲染不丢轨；采纳「fade 0.4s」建议后成片可见转场；时间轴时长与素材真实时长一致 |
| **P1 时间轴 MVP** | §3.2 布局 + §3.3 P0 交互全量 + `@remotion/player` 预览 + 撤销栈 + 数据模型 v3 | 用户可全程不出台完成：拖移排序 → 裁剪 → 分割 → 删除 → 播放头逐帧预览 → 确认送交导出，且导出成片与预览一致 |
| **P2 成片打磨 + 智能替换 A** | §3.3 P1 交互（转场/音量/变速/字幕/素材箱拖入）+ §4.2 替换工作台（mask 标注 + @素材库引用 + 首帧重生成 + take 回写） | 完成一次「选中片段 → 圈选背景 → @场景:天台 → 重生成 → 对比 → 接受」闭环，替换可回滚 |
| **P3 视频级替换** | §4.3 provider 接入 + video-edit 任务队列 + 自动追踪 | 运动镜头中人物整段替换，边缘无明显闪烁，任务可取消可轮询 |

实现约束：

1. **禁止另起新节点 kind**——在 `clip-editor` 上升级，历史工作区数据经 v3 迁移无损打开。
2. 时间轴组件放 `apps/web/src/blocks/core/clip-editor/`（或提为 `engine/edit-desk/`），拆分为 Timeline / Track / Clip / Playhead / Inspector 子组件，**不允许**再堆进单文件 Block。
3. 每阶段配套 vitest：迁移函数、applyPatch、trim/split 边界（如 trim 超出 sourceDuration、分割在片段边缘）。

---

## 6. 开放问题

1. **音频波形**：P1 是否要片段波形渲染（需服务端 peaks 抽取或 WebAudio 解码）？建议 P2 再做，P1 用纯色块。
2. **字幕轨与字幕台分工**：剪辑台内联编辑的字幕，是否回写字幕台/`subtitle-burn` 的数据源，还是时间线内自治？倾向时间线自治 + 导出时合流。
3. **多智能剪辑节点并存**：同工作区多个剪辑台是否需要「时间线片段跨节点复制」？暂不做。
4. **路线 B 模型选型**：视频分割 + 视频重绘的具体 provider 接入时再评估，本文只锁接口形状。
5. **贴片/overlay 轨**：P1 仅渲染支持（V2 轨已在合成里），编辑交互（位置/缩放）是否 P2 进——待用户反馈。
