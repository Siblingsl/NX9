# NX9 运镜时间轴编排（camera-move-timeline）

> 把运镜词库里的多条运镜按**时间**串成一条运动轨：可绑定镜头时长 / 按节拍对齐 /
> 拖动改时长 / 预览节奏 / 注入提示词 / 交接 3D 导演台。
> 本文只描述 NX9 自身能力与实现边界。

关联文档：`docs/NX9-CAMERA-MOVE-LIBRARY.md`（56 条运镜词库与选择器）、
`docs/NX9-3D-DIRECTOR-DESK-DESIGN.md`（3D 导演台）。

---

## 1. 能力范围

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 数据模型 + 纯函数 | `packages/shared/src/types/camera-move-timeline.ts`、`packages/shared/src/utils/camera-move-timeline.ts` | 归一化 / 校验 / 采样 / 组合提示词 / 注入 / 按时长铺开 / 节拍吸附 / 幅度曲线，全部纯函数、可序列化 |
| 编排 UI | `apps/web/.../generation/CameraMoveTimelineEditor.tsx` | 添加片段、拖动改时长、↑↓ 排序、删除、绑定镜头时长、节拍对齐、播放游标、曲线预览、注入、交接 |
| 3D 交接适配器 | `packages/director3d/src/schema/cameraMoveTimelineKeys.ts` | 时间轴 → 多段 A→B 关键帧机位 + 按时间采样（复用 `interpolateCamera` / `applyOrbitToCamera`） |
| 3D 交接中转 + 舞台轨 | `packages/director3d/src/store/moveTimelineStore.ts`、`packages/director3d/src/ui/CameraMoveTimelineRail.tsx` | 工作台推入时间轴 → 舞台「运镜时间轴」轨一键套用为关键帧机位并按时间 scrub |
| 关键帧持久化结构 | `packages/director3d/src/schema/directorProject.ts`（`cameraKeys` / `activeCameraKeyId` / `syncShotStateWithProject`） | 一镜多机位关键帧随镜头态落盘，联动镜模式跨会话还原（§5.4） |

一句话流程：

```
运镜词库(56) ──添加──▶ 时间轴片段(秒) ──┬─▶ buildComposedMovePrompt ─▶ 既有提示词同一行槽位
                                       ├─▶ 采样/曲线/播放 ─▶ 编辑器内预览
                                       └─▶ 交接中转 ─▶ 舞台轨 ─▶ 关键帧机位 ─┬─▶ 多镜预览轨 scrub
                                                                          └─▶ 镜头态 cameraKeys（跨会话）
```

---

## 2. 数据结构

```ts
export interface CameraMoveSegment {
  id: string;                 // 同一时间轴内唯一；缺失/重复会被重编为 seg-1..n
  moveId: string;             // 指向 CAMERA_MOVE_LIBRARY 的 id
  startT: number;             // 秒（相对镜头起点）
  endT: number;
  amplitude?: number;         // 相对幅度，默认 1，建议区间 0.05~4
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  speedRamp?: 'accelerate' | 'decelerate' | 'steady';
  noteZh?: string;            // 编排备注（不参与提示词）
}

export interface CameraMoveTimeline {
  version: number;            // 当前 1
  durationSec: number;
  segments: CameraMoveSegment[];
  beatAligned?: boolean;      // 仅标记编排意图，不改变采样数学
}
```

编辑器内部把「条目顺序 + 每段时长」连续铺满为 `startT/endT`（首段从 0、无空隙）；
而纯函数层同时支持任意碎片化输入（有空隙、乱序、越界），由 `normalizeMoveTimeline` 收敛。

### 纯函数口径（`utils/camera-move-timeline.ts`）

| 函数 | 行为（已写进单测） |
| --- | --- |
| `normalizeMoveTimeline(input, opts)` | 非有限时间 → **丢弃**；`endT-startT ≤ 1ms` → **丢弃**（拖到零长视为删除，不编造时长）；`amplitude` 非正 → 回落 1、超出 [0.05,4] → 钳制；非法 easing/speedRamp → 回落 linear/steady；裁剪进 `[0,durationSec]`；按 `startT` 升序；重叠时保留先出现者、把后者起点裁到前段终点（裁空则丢弃）；id 缺失或重复 → 重编 `seg-1..n`。`durationSec` 优先级：`opts.durationSec` → 输入值（有限且 >0）→ 片段最大 `endT` → 0。 |
| `validateMoveTimeline(tl)` | 返回 `{ ok, errors, warnings, issues }`，**不抛异常**。error：`invalid-duration` / `empty` / `invalid-time` / `negative-start` / `out-of-range` / `zero-duration` / `unknown-move` / `duplicate-id` / `overlap`；warning：`unsorted` / `invalid-amplitude`（超建议区间）/ `gap` / `uncovered`。每条含可直接展示的中文说明。 |
| `sampleMoveTimelineAt(tl, t)` | 钳制 `t∈[0,durationSec]`（`clamped` 标记）；命中片段 → 段内 `linearProgress` 与（缓动+速度曲线后的）`progress`；`t` 落在空隙 → `segment=null, inGap=true, amplitude=0`；`t===durationSec` 且末段覆盖到时长 → 命中末段且 `progress=1`；空轨 → 空采样。`composedZh/En` 形如 `缓推✓ → 【半环绕 50%】 → ·缓推`。 |
| `buildComposedMovePrompt(tl, opts)` | 按时间顺序输出中英组合描述；`includeTiming`（默认 true）带上每段 `起-止s` 与 `total Xs`，`beatAligned` 时追加 `beat-aligned`；`amplitude≠1` 与 `speedRamp≠steady` 会进提示词；**easing 不进提示词**（只用于采样与 3D 交接）；未知 `moveId` 短语回落为 id，**不丢弃**。返回 `{ zh, en, text, parts, segmentCount, durationSec, beatAligned }`，`text` 是**无前缀**片段。 |
| `moveTimelineToPromptPreset(tl, opts)` | 映射成既有 `PromptPreset` 形状（`id: 'camera-move-timeline'`、`group: '运镜时间轴'`）。 |
| `withMoveTimelinePrompt(existing, tl, opts)` | 注入既有提示词：与 `withCameraMovePrompt` **同一行槽位**（英文 `camera movement:` / 中文 `运镜：`），已有运镜行则替换；`tl` 为空时移除该行、其余内容原样保留。 |
| `moveTimelineFromShotDuration(shotDurationSec, moves, opts)` | 按时长自动铺开：权重优先级 = 显式 `weight` → 词库 `durationHintSec` 中值 → `defaultWeight(1)`；末段终点 == `shotDurationSec`；`beatCount` 给定时再走节拍吸附。时长非法 → 返回空时间轴（不编造）。 |
| `snapMoveTimelineToBeats(tl, beatCount\|opts)` | 边界吸附到节拍网格后重新归一化；吸附产生的零长段被丢弃；缺节拍信息 → 原样返回且 `beatAligned=false`（不假装对齐）。 |
| `moveTimelineTotalAmplitude(tl)` | 时间加权平均幅度 = `Σ(段时长×幅度)/总时长`，空隙按 0 计；全时段覆盖且幅度为 1 → 1。 |
| `moveTimelineAmplitudeCurve(tl, opts)` | 供 UI 画图的采样点（`{t, amplitude, progress}`，2~512 点）+ 节拍刻度 + 最大幅度。 |
| `applyMoveEasing` / `applyMoveSpeedRamp` / `moveSegmentProgress` | 缓动与速度曲线：`accelerate = x²`、`decelerate = 1-(1-x)²`、四类缓动端点固定且单调不减；非法/越界输入被钳制而非返回 NaN。 |

---

## 3. UI 入口

| 入口 | 文件 | 传参 |
| --- | --- | --- |
| 视频工作台 | `generation/video/VideoWorkspace.tsx`（工具栏，紧邻「大师运镜」） | `value=draft`、`onApply=applyText`、`shotDurationSec=当前镜 durationSec`、`handoffSourceLabel='视频工作台'` |
| 图片工作台 | `generation/picture/PictureWorkspace.tsx`（工具栏，紧邻「大师运镜」） | 同上（`shotDurationSec` 取 `linkedShotForPreview.durationSec`，来源标「图片工作台」） |
| 分镜镜编辑 | `blocks/craft/storyboard-desk/shot-edit-modal.tsx` | `variant='inline'`、`value=editDraft.videoPrompt`、`shotDurationSec=editDraft.durationSec`、来源标「分镜镜编辑」 |
| 3D 舞台 | `packages/director3d/src/ui/CameraMoveTimelineRail.tsx`（挂在 `StageDeckShell` 的左栏，`DollyTimeline` / `ShotPreviewTimeline` 之下） | 读取交接中转站；「套用为关键帧 / 移除关键帧 / 清除时间轴 / 播放 / scrub」 |

编辑器交互：

- **添加**：折叠面板内按家族分组 + 搜索（`searchCameraMoves`），点词条即按 `durationHintSec` 中值加入（缺省 1.5s）；
- **拖动改时长**：片段条右侧手柄横向拖动；也支持数字输入精确改；
- **排序 / 删除**：每行 ↑↓ 与删除按钮；列表自上而下即时间顺序；
- **绑定镜头时长**：勾选后用「镜头时长（缺省用默认时长）」等比铺开；拖动某段时**其余段按比例补偿**，总时长恒等于绑定值；「等比铺开」按钮复用 `moveTimelineFromShotDuration`；
- **节拍对齐**：开关 + 节拍数（1~32），走 `snapMoveTimelineToBeats`；吸附导致片段合并时明确提示「N 个过短片段被并入相邻节拍」；
- **预览**：片段条（幅度决定柱高、游标线）、幅度包络 + 进度折线 SVG、组合运动描述（含当前段进度）、播放（按真实秒 rAF 推进）、点击片段条任意位置可定位游标；
- **校验**：`validateMoveTimeline` 的 error 会禁用「写入提示词 / 交接」并显示首条中文说明，warning 单独提示；
- **注入**：中/英切换 +「写入提示词」/「清除运镜行」/「清空编排」；
- **交接**：`交接 3D 导演台` 把归一化时间轴推入中转站并回显「已交接 N 段」。

### 提示词槽位约定（重要）

「运镜时间轴」与「大师运镜多选」**共用同一行槽位**（英文 `camera movement:` / 中文 `运镜：`）。
两者互相覆盖而不是叠加，因此提示词里永远不会出现两条运镜行。单测里正反两个方向都做了断言。

---

## 4. 与既有 Dolly / ShotPreview 的关系

| 既有能力 | 关系 |
| --- | --- |
| `DollyTimeline`（A→B 两键 + `dollyT` 插值预览） | **不替换**。A→B 仍是「两个手工标记机位」；运镜时间轴是「按运镜语义自动铺开的 N 段 A→B」，两者可并存使用 |
| `ShotPreviewTimeline`（`buildTimelineKeys` / `sampleTimeline` 多镜 scrub） | **不替换**。套用关键帧后，生成的机位会追加进 `project.cameras`，因此既有多镜预览轨会把这些关键帧一并纳入 scrub —— 这正是「多段 A→B」在视口里的可见形式；点「移除关键帧」即可还原 |
| `directorStore.dollyA/dollyB/dollyT/timelineT/timelinePlaying` | **不改**。新增的是 `applyMoveTimelineKeys` / `clearMoveTimelineKeys` 两个动作（纯追加），scrub 预览复用既有 `previewActiveCamera`（不入 undo 栈） |
| `interpolateCamera` / `applyOrbitToCamera` / `CameraMoveId` | **不改**。适配器只调用它们 |

---

## 5. 3D 导演台交接

### 5.1 数据流

```
编辑器「交接 3D 导演台」
  └─▶ useMoveTimelineStore.pushTimeline(timeline, '视频工作台'|'图片工作台'|'分镜镜编辑')   （会话级中转站）
        └─▶ 舞台「运镜时间轴」轨
              ├─ 套用为关键帧：buildCameraMoveKeyframes + moveTimelineToDirectorCameras
              │     └─▶ directorStore.applyMoveTimelineKeys（追加 movetl-1..n 机位，可 undo）
              │           └─▶ 导演台 300ms 落盘：syncShotStateWithProject → 镜头态 cameraKeys
              │                 （联动镜模式跨会话保留；重开同镜还原多机位与激活机位）
              └─ scrub / 播放：sampleCameraMoveTimeline + previewActiveCamera（按真实秒 + easing）
```

机位是持久化产物，**时间轴不是**：`cameraKeys` 只存机位（含顺序归一化时间位 `t`），
不存秒数 / 缓动 / 速度曲线 —— 那部分留在会话级中转站（§5.4 边界说明）。

关键帧结构：可选 `t=0` 起始持稳帧 + 每段「起点帧（沿用上一段结束机位）+ 终点帧（施加本段机位增量）」。
上一段终点与本段起点重合时只保留一帧，该帧归属**从它开始的那一段**（因此相邻两帧区间的缓动天然正确）；
段间空隙不额外插帧（相邻两帧机位相同 → 表现为持稳）。

### 5.2 机位代理映射（**代理，不等价**）

导演台相机模型只有 球坐标 `az/el/dist` + `fov` + `roll`，所以运镜 → 机位是**代理映射**，
用于预览机位走向与节奏，**不等价于成片效果**：

| 家族 | 代理增量 | moveId 级修正示例 |
| --- | --- | --- |
| static | 不动 | — |
| push / pull | 距离 ∓ | `push-fast -1.6`、`pull-isolate +2.2` |
| pan / tilt | 方位 / 仰角 | `pan-left` 反向 |
| track | 方位 + 轻微距离 | `truck-left/right` 反向 |
| crane | 仰角 + 收距 | `crane-down` 反向、`jib-arc` 取家族值 |
| orbit | 方位大角度 | `orbit-90/180/360`、`orbit-arc-in`、`orbit-spiral-up` |
| zoom | `fov` | `dolly-zoom` = 距离 + 反向 fov |
| handheld | 小角度 + 微滚转 | `handheld-push-in` 收距 |
| aerial | 仰角 + 大收距 + fov | `drone-top-down` 大仰角 |
| special | 方位 + 滚转 | `dutch-roll` 纯滚转、`bullet-time` 方位代理、`impact-shake` 距离+滚转 |

明确说明：**跟焦转移（rack-focus）/ 时间切片（bullet-time）/ 人体固定机位（snorricam）/
撞击震机（impact-shake）** 在导演台相机模型里没有等价表达，这里只给最接近的机位代理；
`applyOrbitToCamera` 内部还会把 `el` 钳到 `[-85, 88]`、`dist` 钳到 `[0.3, 30]`，极端幅度会被截断。
`interpolateCamera` 自带 smoothstep，本模块把时间轴 easing 施加在其**之前**（复合曲线），
所以 `linear` 在 3D 里并非严格匀速。

### 5.3 持久化边界（诚实说明）

- **提示词**：注入结果写进既有提示词字段（视频/图片节点提示词、分镜 `videoPrompt`），会随节点保存。
- **时间轴本体**：中转站（`useMoveTimelineStore`）与编辑器编排状态是**会话级**的 —— 真实秒数、
  缓动、速度曲线、片段备注都只活在本会话，刷新即失。
- **关键帧机位（已解决）**：套用后的 `movetl-*` 机位进入 `project.cameras`，导演台 300ms 落盘
  把它们写进镜头态 `cameraKeys`（§5.4），因此**联动镜模式下也跨会话保留**：重新打开同一镜头
  会还原多机位与激活机位；独立场景（`standaloneProject`）整包保存 `project`，同样保留。
  落盘不含时间轴本体，因此**刷新后剩落盘机位、没有「按秒 scrub」**（见 §5.4 边界说明）。

### 5.4 镜头态的多机位关键帧结构（本次新增）

```ts
export interface Director3dCameraKey {
  id: string;            // 与 project.cameras[].id 对齐，还原多机位与激活机位靠它
  t: number;             // 机位序列内的归一化时间位 0..1（首帧 0、末帧 1、线性均分）
  camera: DirectorShotCamera;
  name?: string;         // 机位名（如运镜时间轴生成的「缓推」）
}

interface Director3dShotState {
  version: 2;            // 不升版：cameraKeys / activeCameraKeyId 是纯增量可选字段
  camera: DirectorShotCamera;              // 既有字段，语义不变 = 当前 / 激活机位
  cameraKeys?: Director3dCameraKey[];      // 缺省 / 空 = 单机位（老数据形状）
  activeCameraKeyId?: string | null;       // 激活机位对应的 key id
}
```

读写口径（对应 `packages/director3d/src/schema/directorProject.ts`）：

| 函数 | 行为 |
| --- | --- |
| `shotStateFromProject` | 单机位 → `cameraKeys: []`（与老数据同形状）；多机位 → 写全量序列，`activeCameraKeyId` = 激活机位 id |
| `syncShotStateWithProject` | 落盘前的唯一映射：环境 / 物体 / 当前机位 / `cameraKeys` 一起写入，`camera` 取**激活机位**而非 `cameras[0]`，保留 `candidates` 等字段 |
| `projectFromShotState` | `cameraKeys` 非空 → 按 keys 还原 `project.cameras` 多机位；激活机位判定 = `activeCameraKeyId` → 与 `camera` 姿态一致帧 → 首帧；**激活帧姿态一律以 `camera` 为准**（只改 `camera` 的写入方如 Agent 摆位不会与序列打架，也不会凭空多出机位）。为空 → 老单机位口径，行为与升级前一致 |
| `normalizeShotState` | 老 `version:2` 数据缺 `cameraKeys` → 补 `[]` / `activeCameraKeyId: null`，其余字段原样保留；非法 keys 只裁剪机位序列，绝不影响场景数据 |
| `coerceCameraKeys` | 非数组 → 按缺省；条目缺合法机位 → 丢弃；`t` 非有限按序补位、越界裁到 [0,1]；按 `t` 升序后重排为均分位（保证「`t` = 序列内索引」不变式）；`id` 缺失 / 重复 → 重编 |
| `restoreCommittedSnapshot` | 提交快照一并记录 `cameraKeys` / `activeCameraKeyId`，「恢复已提交版本」时环境 / 物体 / 机位一起回滚；老快照无该字段 → 按单机位恢复（与升级前一致） |
| `normalizeDirectorProject` | 多机位（含 `movetl-*`）原样保留；`activeCameraId` 失效 / 缺失 → 回落首个机位，导出 → 再导入幂等 |

**为何不升版**：`cameraKeys` 是可选增量字段，读取方按 `version === 2` 判定；升到 3 就必须新增
v2→v3 迁移分支，而该分支唯一的风险是「老数据被判非法而回落空白镜头态」——即丢掉用户已保存的场景。
保持 2 且字段可选，老数据、单机位数据、多机位数据走同一条读取路径，没有迁移窗口。

**模板不带机位**：`Director3dSceneTemplate` 只描述场地（环境 / 布光 / 资产 / 非角色道具），
机位是每个镜头自己的取景。模板带机位会在套模板时覆盖当前镜头的关键帧序列，因此**不加**
（`applySceneTemplateToShotState` 也显式保留 `camera` / `cameraKeys`）。

**边界（诚实）**：`t` 只表达序列顺序，不是物理秒数；缓动 / 速度曲线 / 片段归属都留在会话级时间轴。
因此「刷新后重新打开」能还原**多机位与激活机位**，但要恢复**按秒 scrub / 播放**，需要在工作台
重新「交接 3D 导演台」再重套 —— 界面上有明确提示，不伪造时间。另外 scrub 预览会把当前机位的
位姿改成预览位姿，并随落盘写成激活机位姿态（这是既有「`camera` = 当前机位」语义的延续），
其它关键帧机位不受影响。

---

## 6. 已实现 / 未实现边界

**已实现（可直接用）**

- 56 条词库 → 时间轴片段的添加 / 排序 / 拖拽改时长 / 数字改时长 / 删除 / 幅度 / 缓动 / 速度曲线；
- 总时长与镜头时长绑定（等比铺开 + 拖动时其余段比例补偿）、节拍网格吸附；
- 采样预览（游标 / 播放 / 幅度包络 + 进度折线 / 组合运动描述 / 校验提示）；
- 组合提示词注入（中/英，同一行槽位，幂等，可清除）；
- 3D 导演台交接（中转站 + 舞台轨套用/移除 + 按时间 scrub 预览）；
- **一镜多机位关键帧跨会话持久化**（镜头态 `cameraKeys` / `activeCameraKeyId`，见 §5.4）：
  联动镜模式下重新打开同一镜头会还原多机位与激活机位，舞台轨据此回显「已套用」并可直接移除。

**未实现（本次不做，避免留半截代码）**

- 时间轴本体（真实秒数 / 缓动 / 速度曲线 / 片段归属）的跨会话持久化 —— 只有套用生成的**机位**落盘，
  因此刷新后无法自动恢复「按秒 scrub」（需要重新交接）；
- 3D 舞台里直接编辑运镜时间轴（舞台轨只做套用/预览，编排仍回到工作台）；
- 真实模型侧的运镜还原（提示词只是文本约束，生成模型是否遵循不由本功能保证）；
- 音频波形/真实节拍检测对齐（节拍数是手填的等分网格，不是从音频分析得来）；
- 片段之间的「过渡/叠加」（同一时刻只有一段运镜生效，重叠输入会被归一化裁掉）。

---

## 7. 验证口径

```bash
# 1) 纯函数 + 适配器 + 编辑器组件（79 项，全部通过）
cd apps/web
node ./node_modules/vitest/vitest.mjs run \
  src/engine/__tests__/camera-move-timeline.test.ts \
  src/engine/__tests__/director3d-move-timeline-keys.test.ts \
  src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx
# → Test Files 3 passed (3) / Tests 79 passed (79) / exit 0

# 1b) 一镜多机位持久化结构（本次新增，23 项）
node ./node_modules/vitest/vitest.mjs run \
  src/engine/__tests__/director3d-multi-camera-persist.test.ts
# → Test Files 1 passed (1) / Tests 23 passed (23) / exit 0
#   覆盖：老 version:2 升级不丢场景、keys↔project 往返幂等、非法 keys 裁剪、
#   清除落盘 keys 生效、含 keys 的 commit 载荷、快照回滚、模板不干预机位序列、
#   舞台轨「已套用 / 可 scrub / 不跨镜 scrub」判定

# 1c) 引擎测试目录整体（回归对账：新增 1 个通过文件，失败集合与改动前完全一致）
node ./node_modules/vitest/vitest.mjs run src/engine/__tests__
# → 改动前 47 passed | 75 failed (122 files) / 329 tests passed
#   改动后 48 passed | 75 failed (123 files) / 348 tests passed（用例数 +19）
#   失败文件集合逐条 diff 一致（全部是既有的 barrel / shared 缺陷，与本功能无关）

# 2) 隔离类型检查（最小 tsconfig + 源码路径映射）
cd apps/web
node ./node_modules/typescript/bin/tsc -p tsconfig.movetl-check.json --pretty false
# → 新文件与 3 个接入点文件 0 error；输出里剩余的 53 条错误全部是既有缺陷
#   （packages/shared/src/index.ts 指向 9 个不存在的 data/* 模块及其级联 implicit-any）

node ./node_modules/typescript/bin/tsc -p tsconfig.director3d-multicam-check.json --pretty false
# → 本次新增/改动的 schema / store / rail / StageDeckShell / 新测试文件 0 error；
#   剩余 44 条错误全部落在 packages/shared/**（既有缺陷，同上）
```

说明与已知限制：

- `pnpm --filter @nx9/shared build` / `pnpm --filter @nx9/web typecheck` **当前跑不通**（既有缺陷：
  `packages/shared/src/index.ts` 引用了 9 个不存在的 `data/*` 模块；`apps/web` 的 `paths` 指向
  `packages/shared/dist`，而 dist 无法产出）。因此本功能的验证走**相对路径直取源码** +
  最小 tsconfig 隔离检查，**未**声称全量构建通过。
- 走 `@nx9/shared` barrel 的既有测试（例如 `StoryboardDeskBlock.test.tsx`、`director3d-state.test.ts`、
  `director3d-node.test.ts`）同样受该缺陷影响，在改动前后都是**导入期失败**（本次未触碰）。
  `director3d-state.test.ts` 的断言语义已由 `director3d-multi-camera-persist.test.ts` 用相对路径
  重述覆盖（老数据升级、模板、快照恢复、候选帧写回）。
- `apps/web/tsconfig.movetl-check.json` 与 `apps/web/tsconfig.director3d-multicam-check.json`
  都是最小 tsconfig，不改动既有 `tsconfig.json`，也不参与 `tsc -b`。
- 单测 import 全部使用相对路径（`packages/shared/src/...`），组件测试用 `vi.mock` 把 `@nx9/shared`
  指到**真实源码模块**（不是桩数据），`@nx9/director3d` 的 `useMoveTimelineStore` 用桩记录交接内容。
- 未做：`CameraMoveTimelineRail` 的渲染级组件测试（舞台 shell 需要 WebGL 环境）。该轨的判定逻辑
  已抽成纯函数 `resolveMoveTimelineRailState`（`ui/CameraMoveTimelineRail.tsx` 导出）并直接单测。

---

## 8. 本次发现的其它功能缺口（仅记录，未实现）

1. **镜头态多机位结构（已实现）**：原 `Director3dShotState.camera` 是单机位，导致「一镜多关键帧机位」无法随镜头持久化。
   本次已在镜头态补上 `cameraKeys` / `activeCameraKeyId`（§5.4），联动镜模式下跨会话保留多机位与激活机位。
   仍未做的是**时间轴本体**的持久化（秒数 / 缓动 / 速度曲线），见 §6「未实现」第 1 条。
2. **节拍来源只有手填**：缺少音频分析 / BGM 节拍导入，节拍对齐目前是纯几何等分。
3. **无时间轴片段过渡**：运镜切换只有硬切，没有「前段未走完时叠加后段」或衰减混合。
4. **提示词无结构化运镜表单**：注入是整行文本，生成侧无法回读结构化的时间段运镜（没有反向解析 `buildComposedMovePrompt` 输出的解析器）。
5. **图片工作台的运镜语义偏弱**：单张图没有时间维度，注入的时间轴描述只对图生视频/多帧场景有意义，当前 UI 未按模式区分提示。
6. **无关键帧导出**：时间轴不能导出为 A→B 关键帧的 JSON/CSV 交给外部工具，也没有从既有 A→B（`dollyA/dollyB`）反向生成时间轴的适配器。
