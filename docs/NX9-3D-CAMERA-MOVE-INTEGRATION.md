# NX9 大师运镜库 → 3D 导演台机位运动（camera-move-motion）

> 在 3D 舞台上选一条运镜，**直接把相机运动生成出来**（相对当前机位的一串机位关键帧：
> 推 / 拉 / 摇 / 俯仰 / 横移 / 升降 / 环绕 / 变焦 / 手持 / 航拍 / 特殊），
> 而不只是往提示词里写一段文字。
> 本文只描述 NX9 自身能力与实现边界。

关联文档：`docs/NX9-CAMERA-MOVE-LIBRARY.md`（56 条运镜词库）、
`docs/NX9-CAMERA-MOVE-TIMELINE.md`（运镜时间轴编排）、
`docs/NX9-3D-DIRECTOR-DESK-DESIGN.md`（3D 导演台）。

---

## 1. 能力范围

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 运镜 → 机位运动映射（纯函数） | `packages/director3d/src/schema/cameraMoveMotion.ts` | 56 条运镜的 `family` → 可执行机位参数（球坐标 / 视线 / 平移 / 视野 / 滚转）+ 确定性手持抖动；生成 `Director3dCameraKey[]` / `DirectorCameraShot[]`；代理近似逐条标注 |
| 舞台面板 | `packages/director3d/src/ui/CameraMoveLibraryPanel.tsx` | 按家族分组 + 搜索 + 选中即预演；「套用为关键帧」「加入运镜时间轴」「写入镜头语言」三条落点 |
| 舞台入口 | `packages/director3d/src/ui/StageRail.tsx`（「运」按钮）、`ui/StageMobileDock.tsx`（移动端 sheet「运镜」） | 与既有抽屉同一开关机制（`activeDrawer` / `mobileSheet` 同名 `'move'`） |
| 会话状态与写入 | `packages/director3d/src/store/directorStore.ts` | `applyCameraMoveMotion` / `clearCameraMoveMotion` / `setCameraMoveLibraryId` + 会话字段 `cameraMoveLibraryId`（**不落盘**） |
| 提示词并入 | `cameraMoveMotion.ts#buildMotionCameraPrompt` + `store.addCapture` + `ui/StageDeckShell.tsx` | 复用既有 `withCameraMovePrompt` 写入同一 `camera movement:` 槽位，**不新增持久化字段名** |
| 关键帧持久化 | `packages/director3d/src/schema/directorProject.ts`（既有 `cameraKeys` / `activeCameraKeyId`） | `cammv-*` 机位进 `project.cameras` → 舞台 300ms 落盘写进镜头态 `cameraKeys`，跨会话保留 |

一句话流程：

```
运镜词库(56) ──选中──▶ buildMotionPreview（计划 + 机位序列 + 时间轴关键帧形状）
                       ├─▶ 即时预演：previewActiveCamera 打采样机位 / 写入既有 A→B 运镜轨
                       ├─▶ 套用为关键帧：project.cameras 里生成 cammv-* 机位 ─▶ 镜头态 cameraKeys（跨会话）
                       ├─▶ 加入运镜时间轴：交给既有「运镜时间轴」轨（套用 / 按秒 scrub / 播放）
                       └─▶ 写入镜头语言：cameraPrompt 的 camera movement 槽位（既有字段）
```

---

## 2. 映射规则（家族 → 可执行机位参数）

机位自由度**完全复用**既有 `cameraGeometry.ts`，不新增自由度：

| 口径 | 字段 | 方向约定 |
| --- | --- | --- |
| 环绕 | `az / el / dist` | `az`：相机绕**视线目标**的方位角，正 = 向右环绕；`el`：仰角，正 = 抬高机位；`dist`：到目标距离，正 = 远离。实现走 `getOrbit` / `setOrbit` / `applyOrbitToCamera`，取值被钳制到 `el ∈ [-85, 88]`、`dist ∈ [0.3, 30]` |
| 视线 | `yaw / pitch` | 机位不动，只把 `camera.target` 绕机位旋转（与既有 `lookAt(target)` 取景口径一致）：正 `yaw` = 视线向右转，正 `pitch` = 视线抬起 |
| 平移 | `side / up / forward` | 机位与视线目标**同步**平移：正 `side` = 相机向右移、正 `up` = 上升、正 `forward` = 沿视线前进。构图不变、背景流动（轨道移镜的正确表达） |
| 视野 | `fov` | 正 = 变广角（拉远），负 = 变长焦（推近）；钳制到 `[12, 100]` 度 |
| 滚转 | `roll` | 写进既有 `transform.rotation[2]`（荷兰角）。`rotation[0]/[1]` 机位台本来不维护，保持原值 |

家族默认（`FAMILY_MOTION`，词条级 `MOVE_MOTION` 覆盖方向与幅度，56 条全覆盖）：

| 家族 | 默认运动 | 帧数 | 词条示例 |
| --- | --- | --- | --- |
| static | 无位移（固定） | 2 | 固定锁机 / 静态群像 / 前景框定 |
| push | `dist -1.2` | 3 | 缓推 `-0.9`、快推 `-1.8`、推至特写 `-2.6`（4 帧） |
| pull | `dist +1.4` | 3 | 缓拉 `+1.1`、拉出揭示 `+1.9`、拉远孤立 `+2.8`（4 帧） |
| pan | `yaw +45` | 3 | 慢摇 `+42`、快摇 `+88`、跟摇 `+55` |
| tilt | `pitch +30` | 3 | 上摇 `+38`、下摇 `-38`、竖摇揭示 `+30` |
| track | `side +1.0` | 3 | 左横移 `-1.2`、右横移 `+1.2`、侧面平行跟移 `+1.6`（4 帧）、跟拍 / 边走边谈 `forward`（4 帧，代理） |
| crane | `el +30, dist +0.8` | 4 | 升镜 `+32/+1.0`、降镜 `-30/-0.5`、摇臂弧线 `az+28/el+18`（5 帧） |
| orbit | `az +150` | 5 | 四分之一 `+90`、半环绕 `+180`（7 帧）、全环绕 `+360`（9 帧）、弧线推进 `+60/-1.1`（6 帧）、螺旋上升 `+90/el+24`（6 帧） |
| zoom | `fov -16` | 3 | 变焦推近 `-14`、变焦拉远 `+14`、急推 `-20`、猛推 `-26`（4 帧 + 轻抖）、**滑动变焦**（见下） |
| handheld | `dist -0.3` + 抖动 | 6 | 手持跟拍（6 帧）、肩扛纪实（8 帧）、紧张手持（8 帧）、手持推近 `-0.9`（6 帧） |
| aerial | `el +18, dist +1.2` | 4 | 航拍拉远 `el+14/dist+2.6`（5 帧）、航拍前飞 `forward+2.4`、航拍环绕 `az+110/el+26`（7 帧）、俯冲下降 `el+52`、升起揭示 `el+28`（5 帧）、FPV 穿越 `forward+2.6`（5 帧） |
| special | `az+30, el+4, dist-0.3, fov-4, roll+6` | 3 | 甩镜 `yaw+150`、上下甩摇 `pitch+80`、跟焦转移（2 帧，代理）、视差滑动 `side+1.6`（4 帧）、滚转倾斜 `roll+20`、人体固定机位（代理）、时间切片 `az+85`（7 帧，代理）、撞击震机（强抖，5 帧） |

其它规则：

- **首帧 = 当前机位**：`buildMotionKeyframes` 的第 0 帧是基准机位的 `structuredClone`（逐字节相等），
  所以「套用运镜」不会让舞台取景瞬移；激活机位也保持不变（只追加机位，不切走）。
- **纯变焦 / 固定机位不动几何**：机位 / 视线 / 平移三个口径全为 0 的帧**不做**球坐标往返换算，
  纯 `zoom` 与 `static` 的位置、目标点逐字节不变。
- **幅度**：`amplitude ∈ [0.05, 4]`（面板滑杆 0.25×–3×）线性缩放全部通道；另有
  `scale.{angle,distance,fov}` 供宿主分别缩放。
- **时间曲线**：`easing` 决定「t → 空间进度」的映射（默认 `linear`）；预演/播放按
  `durationSec`（词库 `durationHintSec` 中点，可覆盖）推进。
- **手持抖动**：`motionJitterSample(moveId, index)` 是确定性伪随机（同 id + 同序号永远同值，
  可序列化、可复现），并乘 `sin(πt)` 窗口，**首尾归零**——不会污染起点机位，也不会让末帧残留抖动。
- **滑动变焦（dolly-zoom）**：`preserveSubjectSize` 打开时 `fov` 由距离反解
  （`dist × tan(fov/2)` 恒定），即「推轨前进 + 视野反向放宽」，主体画面尺寸保持不变；
  参数化 `fov` 通道在这种情况下被忽略（不会叠加）。

---

## 3. UI 入口与四条落点

入口：舞台左侧工具栏「运」按钮（`title="大师运镜库"`）；移动端用底栏 sheet「运镜」。
面板 = 搜索框 + 家族筛选 + 家族分组列表 + 选中项说明 + 幅度滑杆 + 动作区 + 提示词预览框。

| 落点 | 动作 | 结果 |
| --- | --- | --- |
| ① 即时预演 | 「预演 A→B 轨」 | 把起点 / 终点写进既有 `dollyA` / `dollyB` 槽位（`dollyT=0`），交给既有「运镜轨 A→B」scrub 检查推拉 |
| ① 即时预演 | 时间滑杆 / 「播放预演」/「回起点」 | `sampleCameraMoveTimeline` 采样 → `previewActiveCamera` 写当前机位预览位姿（**不入 undo 栈**）；「复位」恢复预演前取景并清空 A→B 轨 |
| ② 套用为关键帧 | 「套用为关键帧」/「按当前机位重套」 | `applyCameraMoveMotion`：整批替换 `project.cameras` 里的 `cammv-*` 机位（可 undo），并写入镜头语言 |
| ③ 加入运镜时间轴 | 「加入运镜时间轴」 | `pushTimeline` 把**单段**运镜时间轴交给既有「运镜时间轴」轨：可套用为 `movetl-*` 关键帧、按真实秒 scrub / 播放（适合和别的片段拼节奏） |
| ④ 镜头语言 | 「写入镜头语言」/「清除镜头语言」 | 只改运镜短语（不动机位），显示在同一提示词预览框，可复制 |

面板对每条运镜显示：中文名 / 英文名 / 家族 / 中文说明 / 建议景别 / 建议时长 / 难度 /
运动摘要（`describeMotionPlan().summaryZh`，逐通道中文短语 + 帧数 + 时长），
以及在 `representation === 'proxy'` 时**显式**打出的「代理近似」说明块。

---

## 4. 与「运镜时间轴」/ 关键帧持久化的关系

- **两套机位互不干扰**：运镜库生成 `cammv-*`，运镜时间轴生成 `movetl-*`；
  各自的「套用」只替换自己那一批，「移除关键帧」也只删自己那一批（用户手动机位始终保留）。
- **同一条落盘链路**：两者都只是 `project.cameras` → `syncShotStateWithProject` →
  镜头态 `cameraKeys`（既有 300ms 落盘）。因此运镜库生成的关键帧机位**随镜头保存、跨会话还原**，
  多机位预览轨也能直接 scrub；`activeCameraKeyId` 由 `activeCameraId` 决定，套用运镜不会把激活机位切走。
- **纯映射一致性**：`applyMotionToShotState(state, moveId)` 是「不进舞台、直接把运镜套进镜头态」的
  参考实现（把 `cameraKeys` + 首帧激活写进镜头态，不动 `camera` / 环境 / 物体）；
  单测断言它与「`project.cameras` → `cameraKeysFromProject`」这条 UI 路径产出**同一机位序列**。
- **提示词槽位**：`cameraPrompt` 是既有字段（`DirectorCameraCapture.cameraPrompt`，提交后落成
  `director3dGuide.cameraPrompt`）。套用运镜时：
  基础提示词**关掉** `movement` 细节（避免重复），再由既有 `withCameraMovePrompt` 写入
  同一行 `camera movement: …`。未套用时逐字符等同改动前输出（`fallbackMove = 既有 CameraMoveId`）。
  会话字段 `cameraMoveLibraryId` 不落盘、不新增持久化字段名。

时序（与既有舞台一致）：

```
面板操作 ──▶ directorStore.project ──(300ms debounce)──▶ syncShotStateWithProject ──▶ 镜头态 cameraKeys
                                            └─▶ options.onProjectChange / emitState（脏标记、提交载荷）
```

---

## 5. 代理近似边界（不假装等价）

以下 13 条运镜在舞台上会被明确标成 `representation: 'proxy'`，面板显示原因；
它们仍然生成可预演的机位轨迹，但**不还原**被标注的那部分语义（详见
`cameraMoveMotion.ts#PROXY_NOTES`）：

| 词条 | 为什么不能等价 |
| --- | --- |
| 前景框定 | 前景门框 / 窗沿遮挡属构图与场景内容，机位本身不动 |
| 推穿空间 | 需要穿过门缝 / 车窗等场景开口，舞台只生成前进轨迹 |
| 擦过前景推进 | 需要前景物体掠过形成遮挡节奏 |
| 后退穿越 | 需要连续穿过多层门框退出 |
| 升降揭示 | 需要越过前景遮挡物才成立 |
| 升起揭示（航拍） | 需要被遮挡目标随升起逐步露出 |
| FPV 穿越 | 需要穿越门窗 / 树林的折线路径 |
| 跟拍主体 | 需要被摄主体同步运动（舞台主体静止） |
| 边走边谈跟移 | 需要对话人物同步行走 |
| 跟摇 | 需要主体同步横移 |
| 跟焦转移 | 舞台机位没有对焦 / 焦平面自由度 |
| 时间切片 | 舞台无法表达升格 / 时间变速 |
| 人体固定机位 | 需要把机位刚绑在人物身上 |

其它明确不做的：景深 / 运动模糊 / 升格降格 / 焦点转移效果本身不在机位参数里，本模块
不生成、也不伪造；`durationHintSec` 只是词库的经验区间，用于预演时长兜底与展示，不是硬参数。

---

## 6. 验证口径

静态检查（推荐口径：整包 `tsc --noEmit`，`@nx9/shared` 解析到既有 `dist` 类型，
因此**不会**被源码 barrel 的既有缺陷污染）：

```bash
cd packages/director3d
pnpm exec tsc --noEmit
# 实测：exit 2，仅 5 条错误 —— 全部在 src/sculpt/{pack-mpfb-character-base,procedural-base-model,sculpt-contract}.ts，
# 是「dist 类型过期 → 隐式 any」的既有噪声；这 3 个文件与本次新增模块 +0 引用。
# 本次改动文件（cameraMoveMotion / CameraMoveLibraryPanel / directorStore / StageRail /
# StageMobileDock / StageDeckShell / index.ts）错误 0 条。
```

补充口径（隔离 tsconfig，只编译本批文件，`@nx9/shared` 指向**源码 barrel**）：

```bash
cd apps/web
pnpm exec tsc -p tsconfig.cammove-motion-check.json
# 实测：exit 2，46 条错误行 —— 全部是既有缺陷（41 条 packages/shared/*，5 条 director3d/sculpt/*
# 由 barrel 级联导致）；本次改动文件上的错误 0 条（按文件归类计数得到 MINE_ERRORS=0）。
```

单测（相对路径直取源码，不走 barrel）：

```bash
cd apps/web
pnpm exec vitest run src/engine/__tests__/director3d-camera-move-motion.test.ts
# → 39 passed（exit 0）

pnpm exec vitest run src/engine/__tests__/director3d-camera-move-library-panel.test.tsx
# → 14 passed（exit 0；面板真实 store 链路：套用 / 移除 / 时间轴 / 预演 / 复位 / 镜头语言）
```

回归（既有能力）：

```bash
pnpm exec vitest run src/engine/__tests__/director3d-move-timeline-keys.test.ts \
  src/engine/__tests__/director3d-multi-camera-persist.test.ts \
  src/engine/__tests__/camera-move-library.test.ts src/engine/__tests__/camera-move-timeline.test.ts \
  src/engine/__tests__/camera-move-parse.test.ts
# → 7 文件 / 221 tests passed（exit 0，含本批两个新文件）
```

覆盖的断言口径（`director3d-camera-move-motion.test.ts`）：

- 56 条运镜全部解析出参数，家族无遗漏；每个家族代表词条都有真实位移（static 除外）；
- 关键帧数量（含首尾）与家族 / 词条设定一致；帧数可覆盖并钳制到 2–12；
- 首帧逐字节等于当前机位（不瞬移取景）；每帧 `el / dist / fov` 都落在机位台允许区间；
- push 与 pull 距离变化方向相反；orbit 的方位角单调递增（`orbit-360` 环绕后回到起点方位）；
- zoom 只改 FOV，机位与目标点逐字节不动；dolly zoom 的 `dist ↓ / fov ↑` 且 `dist×tan(fov/2)` 恒定；
- handheld 抖动出现正负振荡、确定性可复现、首尾不残留；
- 13 条代理近似词条逐条标记 + 中文说明各不相同；可等价表达的词条一律 native 且无代理说明；
- 非法输入（`null` / 空串 / 未知 id / 垃圾基准机位）不抛异常，未命中词条只产出 1 帧；
- `applyMotionToShotState` 与 `project.cameras → cameraKeys` 两条路径产出同一机位序列。

**未验证（诚实声明）**：舞台内的实机交互（点按钮看 WebGL 画面里的真实运镜）需要在可运行 app +
WebGL 环境里点检，本批**未做**；同样未做浏览器端手工验证。因此「面板按钮的 DOM 交互与状态映射」
由 jsdom 组件测试覆盖，「机位数学」由纯函数单测覆盖，「真实渲染效果」未验证。

已知非阻塞噪声：组件测试会打印 React `act(...)` 警告（zustand 在 effect 链里更新状态所致），
测试本身全部通过；不影响运行时代码。

---

## 7. 契约与兼容

- `Director3dHostOptions` / `Director3dShotState`（`camera` 语义）/ `Director3dCommitPayload` /
  commit 流程 / F-045 WebGL 生命周期 / F-018 机位预设写回 `cameraPrompt`：均未改动语义。
- `packages/shared/src/data/camera-move-library.ts` 只读复用（`lookupCameraMove` / `searchCameraMoves` /
  `CAMERA_MOVE_FAMILY_*` / `withCameraMovePrompt`），**未修改**；`camera-move-timeline` 类型与工具只读复用
  （`applyMoveEasing` / `CAMERA_MOVE_TIMELINE_VERSION`）。
- 既有文件以**追加**为主；两处最小改动（有说明、有单测）：

  | 文件 | 改动 | 为什么必须 |
  | --- | --- | --- |
  | `store/directorStore.ts#addCapture` | 用 `buildMotionCameraPrompt` 取代 `buildCameraPrompt`，多传 `moveId / fallbackMove` | 运镜短语要真正进 `cameraPrompt`，这是唯一的生成点之一 |
  | `ui/StageDeckShell.tsx#handleCapture` | 同上（另一处提示词生成点） | 截帧候选的 `prompt` 与 `cameraPrompt` 同源，两处必须同口径 |
  | `store/directorStore.ts`（类型/常量） | `StageDrawer` / `StageMobileSheet` 联合类型加 `'move'`；`DRAWER_SHEETS` 加 `'move'` | 运镜面板复用既有抽屉 / 移动端 sheet 开关机制，不新建一套 |

  两处 `buildMotionCameraPrompt` 在 `cameraMoveLibraryId == null`（默认）时输出与改动前**逐字符一致**，
  单测 `提示词：套用后短语并入 camera movement 槽位…` 显式断言了这一点。
- 平台皮肤说明：`skinCameraPrompt` 的非 NX9 皮肤会**用自己的运镜句**替换运镜行（既有皮肤行为），
  此时大师运镜短语只体现在 NX9 / 通用皮肤与面板的提示词预览里；这是皮肤设计的既有取舍，本批未改。
- 不新增第三方依赖；`cameraMoveMotion.ts` 只用既有 `cameraGeometry` 与 shared 源码（相对路径），
  不引 `three`。

---

## 8. 本批改动清单（增量）

新增：

| 路径 | 作用 |
| --- | --- |
| `packages/director3d/src/schema/cameraMoveMotion.ts` | 运镜 → 机位运动纯函数模块（家族参数表 / 词条覆盖 / 关键帧生成 / 计划说明 / 代理近似标记 / 镜头态纯映射 / 提示词并入 / 时间轴桥接） |
| `packages/director3d/src/ui/CameraMoveLibraryPanel.tsx` | 大师运镜库面板（分组 + 搜索 + 预演 + 三条落点 + 提示词预览） |
| `apps/web/src/engine/__tests__/director3d-camera-move-motion.test.ts` | 机位运动数学 / 家族覆盖 / 边界 / 代理近似 / 落盘映射一致性（39 条） |
| `apps/web/src/engine/__tests__/director3d-camera-move-library-panel.test.tsx` | 面板交互 + 真实 store 链路（14 条） |
| `apps/web/tsconfig.cammove-motion-check.json` | 隔离验证配置（只编译本批文件） |
| `docs/NX9-3D-CAMERA-MOVE-INTEGRATION.md` | 本文 |

追加 / 最小改动（既有文件）：

| 路径 | 改动 |
| --- | --- |
| `packages/director3d/src/store/directorStore.ts` | 追加：`cameraMoveLibraryId` 会话字段、`applyCameraMoveMotion` / `clearCameraMoveMotion` / `setCameraMoveLibraryId`；`StageDrawer` / `StageMobileSheet` 加 `'move'`、`DRAWER_SHEETS` 加 `'move'`。最小改动 4 行：import 换 `buildMotionCameraPrompt` + 新增 `lookupCameraMove` 导入（+2/−1），`addCapture` 的提示词调用换 `buildMotionCameraPrompt` 并透传 `moveId/fallbackMove`（`get()` 解构、调用头、`move:` 三行替换） |
| `packages/director3d/src/ui/StageDeckShell.tsx` | 追加 `cameraMoveLibraryId` 读取；`handleCapture` 的提示词调用换 `buildMotionCameraPrompt`（同样 3 行替换） |
| `packages/director3d/src/ui/StageRail.tsx` | 追加「运」按钮 + `drawer === 'move'` 渲染面板（不动既有 `toggle` 的类型） |
| `packages/director3d/src/ui/StageMobileDock.tsx` | 追加 `{ id: 'move', label: '运镜' }` |
| `packages/director3d/src/styles/stage-deck.css` | 追加面板样式（`.nx9-stage-move-*`） |
| `packages/director3d/src/index.ts` | 追加本批导出（纯函数 + 类型 + 面板） |
| `apps/web/vitest.config.ts` | 追加 `src/engine/__tests__/**/*.test.tsx` 的 include |

注：`store/directorStore.ts`、`ui/StageDeckShell.tsx`、`ui/StageRail.tsx`、`ui/StageMobileDock.tsx`、
`src/index.ts`、`styles/stage-deck.css` 在工作树里**同时**包含更早批次的未提交改动（灯光面板、
内置模型、多机位关键帧等），因此 `git diff --numstat` 是「本批 + 早批」的合计，不能直接当作本批行数。
