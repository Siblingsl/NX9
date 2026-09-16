# NX9 运镜提示词反向解析 + 两通道合流（camera-move-parse / camera-move-merge）

> 两件事：
> 1. **反向解析**——把写进提示词的运镜文本还原成结构化时间轴（与正向生成器往返一致）；
> 2. **通道合流**——把镜表 `videoPrompt` 的运镜与 3D 导演台 `director3dGuide.cameraPrompt`
>    的机位合成一条可读摘要 + 冲突提示（只呈现，不自动改写任何字段）。
>
> 本文只描述 NX9 自身能力与实现边界。

关联文档：`docs/NX9-CAMERA-MOVE-LIBRARY.md`（56 条运镜词库与选择器）、
`docs/NX9-CAMERA-MOVE-TIMELINE.md`（运镜时间轴编排 / 注入）、
`docs/NX9-3D-DIRECTOR-DESK-DESIGN.md`（3D 导演台与 `cameraPrompt`）。

---

## 1. 能力范围

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 反向解析纯函数 | `packages/shared/src/utils/camera-move-parse.ts` | `parseComposedMovePrompt` / `parseCameraMovePrompt` / `extractMoveTimelineFromPrompt` / `findMovePhrases` / `resolveMovePhrase` / `scanPromptPhrases`；只读、纯函数、不抛异常 |
| 通道合流纯函数 | `packages/shared/src/utils/camera-move-merge.ts` | `mergeCameraMoveChannels` / `mergeShotCameraMoveChannels` / `findDirector3dMovePhrases`；输出摘要 + 冲突 + 说明 |
| 合流展示（只读） | `apps/web/src/blocks/craft/storyboard-desk/shot-edit-modal.tsx` | 编辑分镜弹窗内「运镜合流（镜表 × 3D 导演台 · 只读）」区块：摘要 + 冲突清单 + 说明清单 |
| 3D 通道取值 | `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx` | 按本镜 id 从 chain 镜表（SSOT）取 `director3dGuide.cameraPrompt`，回落本节点分镜预览帧 |
| 单测 | `apps/web/src/engine/__tests__/camera-move-parse.test.ts` | 往返（中/英、含/不含 timing、单/多段、带/不带幅度与速度曲线）、200 组随机时间轴压力、非法输入不抛异常、前缀抽取、混合文本抽取、合流冲突识别 |

一句话流程：

```
buildComposedMovePrompt / buildCameraMovePrompt / with*Prompt
        │（既有正向生成器，输出格式未改动）
        ▼
  提示词里的运镜行 ──parse──▶ CameraMoveTimeline + parts（id/时间/幅度/速度曲线）
        │                                   │
        │                                   └─▶ 与 director3dGuide.cameraPrompt 的机位短语
        │                                        ──merge──▶ summaryZh/summaryEn + conflicts + notes
        ▼
  分镜编辑弹窗「运镜合流」只读区块（不回写任一通道字段）
```

**边界声明**：本能力**不产生任何新的持久化字段**，也**不改写**既有提示词与 3D guide；
解析结果只用于回显、对账与提示。

---

## 2. 往返契约（硬要求）

`parseComposedMovePrompt(buildComposedMovePrompt(tl).en / .zh)` 必须还原**等价时间轴**。

### 2.1 被编码进提示词的字段（可还原）

| 字段 | 提示词形态（英文 / 中文） | 还原口径 |
| --- | --- | --- |
| 段顺序 | `A → B → C` | `' → '` 切分；短语本身不含 `→`（单测不变量强制） |
| 起止时间 | `0-3s ` / `0–3 秒 ` | 2 位小数；**容差 ±0.005** |
| 总时长 | `(total 6s)` / `（共 6 秒）` | 末段未覆盖满时长时仍能还原 `durationSec` |
| 节拍对齐 | `, beat-aligned` / `，按节拍对齐` | 还原 `beatAligned` |
| 幅度 | `at 1.2x amplitude` / `幅度 1.2×` | 幅度恰为 1 时不写入，解析回落 1；**容差 ±0.005** |
| 速度曲线 | `gradually accelerating` / `逐渐加速` | `accelerating→accelerate`、`decelerating→decelerate`、未写→`steady` |
| 运镜身份 | 词库 `promptEn` / `promptZh` 原文 | 最长匹配短语扫描 → 词库 id |

### 2.2 不可还原 / 明确不在契约内的字段

| 字段 | 原因 | 解析结果 |
| --- | --- | --- |
| `easing` | **正向生成器刻意不写进提示词**（只用于采样与 3D 交接） | 恒为 `null`（不是解析失败）；要保留缓动必须另存时间轴对象 |
| `noteZh` | 编排备注不参与提示词 | 不还原 |
| `segment.id` | 提示词没有段 id 概念 | 按时间顺序重编 `seg-1..n`（等价性比对不含 id） |
| 精确时间/幅度 | `formatMoveSeconds` 只保留 2 位小数 | 四舍五入到 2 位小数，容差 ±0.005 |
| `includeTiming: false` 的产物 | 提示词里没有时间区间 | `timeline.segments = []`、`durationSec = 0`，**不臆造**时间；`parts` 仍给出 id/顺序/幅度/速度曲线，并带明确告警 |

### 2.3 失败与降级口径（不抛异常）

| 情况 | 行为 |
| --- | --- |
| 空/空白/非字符串/结构无关文本 | 返回 `null`（`parseComposedMovePrompt`）或空结果（其余函数） |
| 部分段无法切分（如只有时间区间没有短语） | 丢弃该段 + 告警，其余照常还原 |
| 短语未命中词库 | `moveId` 回落为**短语原文**（`resolved:false`）+ 告警；不丢弃、不猜测 |
| 短语是**唯一一条**词库短语的前缀（手改截断） | 模糊命中 + 告警（`via:'fuzzy'`） |
| 短语是**多条**词库短语的前缀 | `via:'ambiguous'`，不猜，回填原文 + 告警 |
| 时间轴自身可疑（空隙 / 未覆盖满 / 重叠 / 越界） | 交由 `validateMoveTimeline` 产出告警，前缀 `校验：`；**不修正数据** |
| 内部异常 | 捕获后返回带 `解析：解析内部异常…` 告警的结果（仍不抛） |

告警前缀用于区分层次：`解析：`（解析事实）／`校验：`（时间轴校验提示），两者都在 `warnings` 里。

---

## 3. 匹配算法（为什么不是「按分隔符切分」）

英文运镜短语内部自带 `, `（例：`locked-off static camera, tripod-fixed, action unfolds within a fixed frame, tableau composition`），
`buildCameraMovePrompt` 的多选分隔符也是 `, `——**按逗号切分必然切错**。

因此解析采用**短语扫描**：

1. 折叠连续空白（含换行）并转小写，保留「归一化下标 → 原始下标」映射；
2. 把 56 条运镜的 `promptEn` / `promptZh` 组成候选表，**长度降序**；
3. 逐字符扫描，命中即记录并跳过该短语长度（不重叠、最长匹配）；
4. 边界约束：英文短语两侧不得紧邻字母/数字；中文短语两侧不得紧邻其它汉字；
5. 只匹配**提示词短语**，不匹配 id / 可读名（自由文本里 `static`、`orbit` 这类短词极易误判）。

该算法的前提（已由单测强制为不变量，词库扩充时会立刻失败报警）：

- 任意两条提示词短语互不为子串；
- 短语不含解析保留字符 `→ × – — 、 /`；
- 短语不以幅度/速度曲线后缀结尾（否则剥离会吃掉正文）。

`findMovePhrases` 只做扫描；单段**整体**短语→id 的判定走 `resolveMovePhrase`
（精确 → id/名 → 唯一前缀模糊 → 歧义 → 原文回填）。

---

## 4. 两通道合流语义

### 4.1 两条通道是什么

| 通道 | 字段 | 由谁写入 | 词汇表 |
| --- | --- | --- | --- |
| 镜表 | `videoPrompt`（`StoryboardShot` 为 `videoPromptEn`） | 大师运镜库多选（`withCameraMovePrompt`）、运镜时间轴（`withMoveTimelinePrompt`） | 运镜库 `promptEn` / `promptZh` |
| 3D 导演台 | `director3dGuide.cameraPrompt` | 3D 舞台提交（`skinCameraPrompt(buildCameraPrompt(...))`） | 导演台机位短语（`slow dolly in` / `orbit around subject` / `camera movement: slowly dollies in` / `camera push in` / `[Push in]` …） |

两边的短语**不同名**，必须各自匹配后按既有映射（`cameraMoveFromDirectorMoveId`）合流；
合流模块不新增映射口径，只用 `packages/director3d` 里已存在的取值整理成短语表
（`DIRECTOR3D_CAMERA_MOVE_PHRASES`）。

### 4.2 输出结构

```ts
interface CameraMoveMergeResult {
  summaryZh: string;                 // 中文摘要（含各段区间与总时长）
  summaryEn: string;                 // 英文摘要
  conflicts: string[];               // 显式冲突（带 [类别] 前缀）
  source: 'video' | 'director3d' | 'both';  // 摘要采纳来源
  notes: string[];                   // 非冲突观察（带 [镜表]/[3D 导演台]/[缺失]/[时间轴] 前缀）
  video: CameraMoveChannelInfo;      // 镜表通道明细（ids / 未命中短语 / 运镜行数 / 时间轴）
  director3d: CameraMoveChannelInfo; // 3D 通道明细（含 vocab: library | director3d | none）
  videoField: string | null;         // 镜表文本实际取自哪个字段（对账用）
}
```

### 4.3 冲突判定（全部显式报出，不静默覆盖）

| 冲突 | 触发条件 |
| --- | --- |
| `[运镜不一致]` | 两通道都识别到运镜，但 id 集合不同 |
| `[顺序不一致]` | id 集合相同，但先后顺序不同（多段运镜的叙事顺序会变） |
| `[通道重复]` | 某通道内出现**多条**运镜行（无法判断哪条是该镜权威运镜） |
| `[时长不一致]` | 镜表通道能给出时间轴，且给了本镜时长，二者相差 > 0.05s（运动会被截断或留白） |

进 `notes` 而**不**算冲突的观察：某通道为空、某通道文本未命中任何词库/机位短语、
镜表运镜短语不在运镜行内、时间轴空隙/未覆盖、未命中词库的短语原文。

`source` 的口径：两通道都有运镜 → `both`；只有一边 → 该边；**两边都没有 → `video`**
（镜表是分镜自有通道，摘要在正文里明确写「两通道都没有可识别的运镜描述」，不假装有内容）。

### 4.4 UI 呈现（`shot-edit-modal.tsx`）

「运镜合流」区块展示：来源标签（含实际字段名）、中文摘要、英文摘要、冲突清单（琥珀色）、
说明清单、3D 机位原文。区块底部固定提示：**不会自动改写 `videoPrompt` 或
`director3dGuide.cameraPrompt`，冲突以哪条为准由用户决定**。

镜表取值为弹窗内的草稿 `editDraft.videoPrompt`（正在编辑的文本会即时反映），本镜时长取
`editDraft.durationSec`；3D 通道取值由 `useStoryboardDesk` 按本镜 id 解析后作为 prop 传入。

---

## 5. 已实现 / 未实现边界

**已实现**

- `parseComposedMovePrompt`：中/英/`both`、含/不含 timing、单/多段、带/不带幅度与速度曲线、
  带前缀整行、多行提示词自动挑行；
- `parseCameraMovePrompt`：前缀文本的单/多运镜（依赖短语扫描，不依赖分隔符）；
- `extractMoveTimelineFromPrompt`：识别「前缀行 / 行首时间区间标记行 / 纯短语行」，
  返回**逐字保留其余行**的剩余文本供就地替换；
- 合流摘要 + 四类冲突 + 说明清单 + 通道明细；
- 全链路**只读**：无新持久化字段、无回写。

**未实现 / 明确不做**

- ❌ 不改、也不试图改正向生成器的输出格式（解析器迁就格式，不反向要求格式迁就解析器）；
- ❌ 不还原 `easing` / `noteZh` / segment id（见 §2.2）；
- ❌ 不做「包含式」模糊匹配（`push-slow-custom` 这类自定义 id 含库内 id，包含匹配会静默改写语义）；
- ❌ 不自动裁决冲突（不选「以谁为准」、不合并、不覆盖）；
- ❌ 不把 3D 导演台 cameraPrompt 当结构化时间轴（它是整段场景描述，短语命中是启发式的；
  未命中即按「该通道无可识别运镜」处理并进 notes）；
- ❌ 多条带时间的运镜行不合并成一条时间轴（无法确认是否同一镜头，`timeline` 返回 `null`）；
- ❌ 不做提示词的自动「就地替换」写入（只提供 `remainingText`，写入由调用方决定）。

---

## 6. 验证口径

**单测**：`apps/web/src/engine/__tests__/camera-move-parse.test.ts`
（相对路径直取源码，见 §7）。

覆盖（`vitest run src/engine/__tests__/camera-move-parse.test.ts`）：

| 组 | 内容 |
| --- | --- |
| 词库不变量 | 短语互不为子串 / 不含保留字符 / 不以幅度·速度曲线后缀结尾 / id 唯一 |
| 往返一致性 | 中英 × 单段·多段 × 幅度·速度曲线 × 节拍 × 未知 id × 带前缀注入行 × `lang:both` |
| 往返压力 | 200 组随机时间轴（固定种子 LCG）× ｛en,zh｝× ｛裸片段, 带前缀注入｝= **800 例**，逐段比对 id/时间/幅度/速度曲线/总时长/beatAligned；另有 60 组 × 2 语言验证 `includeTiming:false` 的降级口径 |
| 非法输入 | 30+ 种畸形输入（`null`/数字/对象/Symbol/函数/半截括号/只有时间没有短语/超长重复）一律不抛异常 |
| 前缀与扫描 | 中英前缀、多运镜（含短语内部逗号）、`lang:both`、多条运镜行、词库外文本 |
| 混合文本抽取 | 前缀行 / 行中前缀 / 裸时间轴行 / 纯短语行 / 多时间轴行不合并 / 正文逐字保留 / 只读不改入参 |
| 合流 | 两通道一致 / 运镜不一致 / 顺序不一致 / 单通道 / 两通道皆空 / 时长不一致 / 通道重复 / 未命中短语 / 3D 平台皮肤（`camera push in`、`[Pull in]`）/ 字段取值顺序 |

**判定基准**：时间与幅度按 ±0.005（`formatMoveSeconds` 的 2 位小数精度）；
其余字段按严格相等。

**已知无法在本工作树执行的验证**（既有缺陷，非本次交付引入）：

- `pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/shared typecheck`、
  `pnpm --filter @nx9/web typecheck`：`packages/shared/src/index.ts` 仍引用 9 个不存在的
  `data/*` 模块（`emotion-presets`、`shot-move-families`、`creative-asset-presets`、
  `character-face-rig-presets`、`playbook-definitions`、`camera-presets`、
  `shot-library-seeds`、`shot-lexicon-taxonomy`、`provider-registry`），barrel 解析失败；
- 走 `@nx9/shared` 的测试同样解析失败（例如既有的 `asset-readiness-costume-prop.test.ts`
  在本工作树即失败，与本次改动无关）；
- 因此 UI 侧改用**隔离最小 tsconfig** 验证：临时生成「去掉那 9 段 re-export 的 barrel」
  作为 `@nx9/shared` 的映射，对 `shot-edit-modal.tsx` 与 `use-storyboard-desk.tsx` 做
  `tsc --noEmit`，**本次改动文件 0 error**（其余报错均来自上述缺失模块的下游文件）。

---

## 7. 工程约定

- 新文件只依赖**存在**的模块：`data/camera-move-library.ts`、`types/camera-move-timeline.ts`、
  `utils/camera-move-timeline.ts`；不新增第三方依赖；
- 既有文件只做**追加**：`packages/shared/src/index.ts` 末尾追加两组 export 与中文注释；
  `shot-edit-modal.tsx` 追加只读区块与可选 prop；`use-storyboard-desk.tsx` 追加一个 memo 与一个 prop；
  既有导出与行为未删改；
- 单测因 barrel 缺陷使用相对路径直取源码（与 `camera-move-timeline.test.ts` 同一约定）。
