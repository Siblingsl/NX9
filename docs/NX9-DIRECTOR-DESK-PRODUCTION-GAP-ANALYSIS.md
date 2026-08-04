# NX9 导演台 · 生产级缺口、加强项与 DeepSeek 施工说明书

> 日期：2026-08-04（二修：补未列加强项 + 逐 ID 实现方案 + DeepSeek 提示词；**3D 整块另案**）  
> 范围：仅导演台非 3D 主链（`DirectorDeskBlock` + `director-desk/*` 中非 3D 文件 + `director-desk-runner`）  
> 读者：人类产品 + **DeepSeek-V4-Pro 等实现用大模型**  
> 权威源：本文 + `docs/NX9-REQ-SCRIPT-STORYBOARD-DESK-UX.md`（职责边界）+ `docs/NX9-PROJECT-DEFECT-ANALYSIS.md`（F-003/F-026）+ 当前代码  
> 禁止：对照任何外部产品仓库；禁止打开 `Reference_Projects/`  
> 姊妹文档：`docs/NX9-STORYBOARD-DESK-PRODUCTION-GAP-ANALYSIS.md`（分镜台）  
> **3D 另案**：`stage3d` Tab、`Director3dStageEmbed`、`prefer3dRef` 深度改动、机位预设 UX、沉浸模式等 **本迭代一律不改**；仅允许「不破坏现有 3D 字段读写」的兼容。

---

## DeepSeek 必读（开工前 30 秒）

1. **只改本文附录 A 白名单文件**；禁止新建平行「第二套导演台」。  
2. **禁止**打开/引用 `Reference_Projects/`；禁止「对齐某外部产品」。  
3. 每做完一个 **ID**，必须满足该 ID 的「验收」；不要一次糊完所有 ID 却跳验收。  
4. UI 样式只扩 `director-desk.v2.css` 的 `dd2-*`；禁止另起第三套 class 前缀。  
5. 数据真相：上游 `storyboard-desk` 的 **链镜表**（`chainStoryboard`，必要时从同节点 `scriptBreakdown` 派生只读视图）+ 本节点 `lastHandoff`；**禁止**再以全局 `workspace.storyboard.shots` 作为批出/批准主读写路径。  
6. **彩色关键帧唯一主入口在导演台**；禁止把彩图批出搬回分镜台。  
7. **本迭代禁止改 3D**：不碰 `director-3d-stage-embed.tsx`、不重做 `stage3d` Tab、不改 `@nx9/director3d`、不扩机位 UX。`prefer3dRef` 开关可保留现状；线稿参考与 3D 参考并存时按 §5 默认优先级。  
8. 改 `packages/shared` 后必须 `pnpm --filter @nx9/shared build` 再跑测试。

**推荐实现顺序（Phase A）**：  
`D-01/D-02 → D-03/R-01/X-48 → B-01/X-40 → H-03 → S-01 → D-04/X-42 → D-06/X-35 → Q-02`

---

## 0. 一句话结论

导演台**批出 / 停止 / 审阅 / 推视频**骨架已通，职责已收口为「彩色关键帧唯一主入口」。  
要到**可生产级**，最大断层不是缺按钮，而是：

1. **镜表仍吃全局 `workspace.storyboard`，未真正吃上游分镜台链镜表**；  
2. **分镜交接的线稿帧写进 `lastHandoff` 后无人消费**；  
3. **多选逻辑已写、胶片条无勾选 UI**；  
4. **按集心智、确认门禁、关台拦截、审阅可悔、线稿对比、出图参数可见**仍偏原型。

**3D** 能力可能单独抽成节点重做 → **本文所有 T-\* 与 3D UI 优化冻结**，另开规划文档。

---

## 1. 产品定位（生产级应对齐的职责）

```text
编剧台（成稿确认）
    → 分镜台（拆镜 · 线稿构图 · 确认本集）
        → 导演台（彩色关键帧批出 · 审阅 · 推视频）
            → 视频生成 / 智能剪辑 / 导出
```

| 导演台该做 | 导演台不该做 |
|---|---|
| 吃**已确认构图**的本集镜头 | 再拆镜 / 再改剧本主文 |
| 批出**彩色关键帧**（唯一主入口） | 代替分镜出台内线稿主路径 |
| 台内批审 → 门禁放行 → 推 `clip-gen` | 视频成片批准（属视频工作区） |
| 风格锁 / 角色场景参考 / 线稿构图参考 | 资产入库；**本迭代也不重做 3D 舞台** |

硬约束：**分镜只线稿，彩图只导演台。**

---

## 2. 现状能力地图（已有，禁止重复造）

| 能力 | 锚点 | 成熟度 |
|---|---|---|
| 三步 Tab | `produce` / `stage3d` / `deliver` | ✅ 可切换；❌ 无完成态；**stage3d 本迭代冻结** |
| 胶片条 + 筛选 | `DirectorFilmstrip` | ⚠️ 「已选」无勾选 UI；无筛选计数 |
| 主预览 | 关键帧 / 3D 参考 / 对比 | ⚠️ 对比只有关键帧↔3D，**无线稿**（本迭代只加线稿相关，不改 3D 舞台） |
| 批出 | `runDirectorDeskBatch`：并发、重试、跳过 | ✅ 写回走全局 `updateShot` ❌ |
| 停止 | `abortRef` | ⚠️ 文案「当前镜完成后」；并发池仍可能多跑 |
| 批出设置抽屉 | skip / 参考锁 / 并发 / seed / 自动审阅 | ✅ 缺 `preferLineArtRef` |
| 设定就绪门禁 | 锁参考 + 未就绪 → 硬阻断 | ✅ |
| 审阅送出 | 批准 / 打回 / 全部通过 / 宫格外审 | ✅ 无撤回批准；强制推送无确认 |
| 推送视频 | `pushKeyframesToClipGen` | ⚠️ 强制无确认；`sendToVideo` 死代码 |
| 风格写回 | `syncStyleToPictureGen` | ✅ |
| 分镜交接 | `lastHandoff.lineArtFrames` | ❌ 导演台**零读取** |
| 测试 | `DirectorDeskBlock.test.tsx` | ❌ 仅 render 冒烟 |

代码体量：`DirectorDeskBlock.tsx` ≈798 行；`director-desk-runner.ts` ≈997 行。

---

## 3. 缺口总表（原列 + 二修加强；3D 冻结）

优先级：`P0` = 错交付 / 空跑 / 串链 / 贵任务失控；`P1` = 生产效率；`P2` = 打磨。

### 3.1 数据与主链（D）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| D-01 | **镜头源仍是全局 storyboard** | **P0** | `DirectorDeskBlock` ≈L89：`activeEpisodeShots(storyboard)` |
| D-02 | **写回不走 `patchUpstreamShot` / chain** | **P0** | 批出/批准/打回均 `doc.updateShot` |
| D-03 | **交接线稿无人消费** | **P0** | `lastHandoff.lineArtFrames` 写出后 `buildShotPrompt` 无 line-art 槽 |
| D-04 | **未校验「本集已确认」** | P1 | 可不经分镜确认直接批出 |
| D-05 | **切集依赖全局 `activeEpisodeId`** | P1 | 台内无「当前集」；应吃 handoff / 上游 chain 的 activeEpisode |
| D-06 | **`findDirectorPictureGenNode` 可回落任意 picture-gen** | P1 | L153 `nodes.find(picture-gen)` 画布级回落 |

### 3.2 流程与信息架构（F）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| F-01 | 步骤条无完成态 | P1 | 有关键帧 / 门禁放行时不着色 |
| F-02 | 步骤文案把 3D 排成硬步骤 2 | P1 | **本迭代只改文案**：标「可选 / 另案」；**不改 3D 实现** |
| F-03 | 冷启动空态弱 | P1 | 缺：是否已连分镜、是否已确认、聚焦上游 CTA |
| F-04 | 底栏偏工程摘要 | P2 | 缺人话阻断原因 |
| F-05 | 卡面「已完成」= 有图即可 | P1 | 应区分「已出齐」vs「可交视频」 |

### 3.3 选镜与批出交互（B）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| B-01 | **多选逻辑未接线** | **P0** | `toggleSelect` 等已有，胶片无 checkbox / 全选 |
| B-02 | **`sendToVideo` 死代码** | P1 | 与 `handlePushClipGen` 双轨 |
| B-03 | 停止不够硬 | P1 | 并发>1 停止后仍可能再完成数镜 |
| B-04 | 单镜「重出」入口弱 | P1 | 缺「出此镜」显式按钮 |
| B-05 | 出图参数不在台内可见可改 | P1 | 模型/画幅只在下游 picture-gen |
| B-06 | 批出范围文案可误解 | P2 | 主按钮未明示 skip 状态 |
| B-07 | 缺图列表不可点跳 | P1 | 审阅 hint 不能筛到缺图并定位 |

### 3.4 线稿 / 参考 / 质量（R）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| R-01 | **线稿不进参考链** | **P0** | 同 D-03 |
| R-02 | 对比模式无线稿 | P1 | 默认「线稿 vs 关键帧」 |
| R-03 | 胶片条不显示线稿缩略 | P1 | 缺关键帧时用线稿占位 |
| R-04 | 无「按线稿贴合度」审阅辅助 | P2 | 并排即可，不必 AI 打分 |
| R-05 | 参考缺失只进 log | P1 | 应内联列出缺角色/场景/线稿的镜号 |

### 3.5 3D 舞台（T）— **本迭代全部冻结**

| ID | 缺口 | P | 处置 |
|---|---|---|---|
| T-01～T-05 | 写回全局 / 切镜心智 / 缺 3D 提示 / Agent 摆位 / 沉浸选镜 | — | **另案规划**；DeepSeek **禁止修改**相关文件 |

### 3.6 审阅与送出（H）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| H-01 | 自动批准路径不醒目 | P1 | `reviewMode !== 'manual'` 生成即 approved |
| H-02 | 无「撤回批准」 | P1 | 误点全部通过难回退 |
| H-03 | 强制推送无二次确认 | **P0** | 易错交付 |
| H-04 | 打回原因不可结构化 | P2 | 纯文本 |
| H-05 | 宫格外审与台内双轨困惑 | P1 | 默认主路径=台内批审 |
| H-06 | 无推送后状态回读 | P1 | 不知 clip-gen 是否已消费 |

### 3.7 安全、持久化与工程（S / Q）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| S-01 | 批出中关台/刷新无拦截 | **P0** | 对称分镜台 S-02 |
| S-02 | 无关键帧版本历史 | P1 | 重出直接覆盖 |
| S-03 | 无导出本集关键帧包 | P2 | |
| Q-01 | runner 近千行 + 全局耦合 | P1 | Phase C 再拆；本迭代只抽写适配器 |
| Q-02 | 测试仅冒烟 | **P0** | |
| Q-03 | 死代码未清理 | P2 | |

### 3.8 二修新增加强项（上一版未写细 / 未列够）

| ID | 加强项 | 价值 | P | 依据 |
|---|---|---|---|---|
| X-26 | **顶栏集上下文条**（上游台名 · 集 · 确认态 · 线稿覆盖 · 关键帧覆盖） | 按集心智 | **P0** | 无顶栏；用户不知批哪集 |
| X-27 | **撤回批准**（单镜 + 可选撤销全部通过） | 可悔 | P1 | = H-02 |
| X-28 | **审阅模式角标** + 台内可切 `manual`/`auto`（写节点 data） | 防静默自动过 | P1 | = H-01；现读全局 `doc.storyboard.reviewMode` |
| X-29 | **缺图/待审 hint 可点击** → `filter=missing` + scroll 首镜 | 可行动 | P1 | = B-07 |
| X-30 | **胶片「出此镜」按钮** | 单镜返工 | P1 | = B-04 |
| X-31 | **紧凑出图参数条**（模型/尺寸，写回已连接 picture-gen） | 对称分镜构图条 | P1 | = B-05 |
| X-32 | **预览增加「线稿」模式；对比默认线稿\|关键帧** | 构图验收 | P1 | = R-02；**不改 3D 舞台** |
| X-33 | **胶片缩略：无关键帧则显示线稿** | 构图心智 | P1 | = R-03 |
| X-34 | **批出前参考缺失内联面板** | 不靠 activity log | P1 | = R-05 |
| X-35 | **picture-gen 禁止画布级回落** | 防串节点 | **P0** | = D-06 硬化 |
| X-36 | **卡面文案：已出齐 / 可交视频** | 口径一致 | P1 | = F-05 |
| X-37 | **批出结束摘要条**（成功/失败镜号可点） | 可定位返工 | P1 | `batchSummary`/`lastResults` 已写节点但 UI 弱 |
| X-38 | **打回重出时把原因注入 prompt** | 返工有效 | P1 | `rejectDirectorKeyframe` 重出未带 comment |
| X-39 | **筛选下拉带计数** | 效率 | P2 | |
| X-40 | **独立「批出选中」按钮**（不依赖切到「已选」筛选） | 多选可用 | **P0** | 与 B-01 配套 |
| X-41 | **消费 `lastHandoff.episodeId` 作为台内当前集** | 与分镜同步 | P1 | = D-05 |
| X-42 | **未确认本集 → 批出二次确认** | 契约 | P1 | = D-04 |
| X-43 | **键盘：←/→ 切镜；A 批准；Shift+Enter 出此镜** | 效率 | P2 | |
| X-44 | **更硬停止**：不再领取新任务；并发槽位边界检查 | 省成本 | P1 | = B-03 |
| X-45 | **步骤条 is-done 着色**（生产有帧；交付门禁过） | 进度可见 | P1 | = F-01；3D 步仅文案「另案」不强制完成态 |
| X-46 | **空态：未连分镜 / 链空 / 引导打开分镜** | 冷启动 | P1 | = F-03 |
| X-47 | **合并或删除 `sendToVideo` 死代码** | 防误导 | P2 | = B-02/Q-03 |
| X-48 | **设置项 `preferLineArtRef`（默认 true）** | 线稿可关 | **P0** | 与 D-03 配套 |
| X-49 | 导出本集关键帧联系表/ZIP 入口 | 外发 | P2 | = S-03 |
| X-50 | 关键帧上一版可回滚（每镜保留 lastUrl） | 可悔 | P1 | = S-02 简化版：只留 1 档 previous |
| X-51 | 打回原因快捷标签 | 统计预备 | P2 | = H-04 |
| X-52 | 推送后在交付页显示「已写入 clip-gen · N 镜」时间戳 | 闭环感知 | P1 | = H-06 简化 |

---

## 4. 目标态主路径（本迭代，无 3D 深改）

```text
分镜台确认本集（含线稿）
  → 打开导演台（连边 · lastHandoff）
  → 导演台读上游链镜表 + 线稿帧（按集）
  → 选镜 / 多选 / 缺帧优先批出（参考=线稿+角色+场景；3D 字段若已有则按开关可选，但不改 3D UI）
  → 审阅：批准 / 打回(可带原因重出) / 撤回批准
  → 门禁放行 → 确认后推送 clip-gen
```

---

## 5. 默认产品决策（未另拍板则按此实现）

| 议题 | 默认 |
|---|---|
| 镜头 SSOT | 上游 `storyboard-desk` 的 `chainStoryboard`；若 chain 空但同节点有 `scriptBreakdown`，用已有转换得到**只读镜表**并提示「链未同步」；**禁止**静默用无关全局镜表批出 |
| 写回 | 一律 `patchUpstreamShot`（或等价写上游 desk `chainStoryboard` + 必要时同步 breakdown 预览字段）；禁止新的 `doc.updateShot` 主路径 |
| 线稿参考 | `preferLineArtRef` 默认 **true**；优先级：若 `prefer3dRef && 有3D截图` → 3D > 线稿 > 角色 > 场景；否则 → **线稿 > 角色 > 场景**（3D 有则仍可附带，但不强制） |
| 线稿来源 | 优先 `lastHandoff.lineArtFrames`；否则读上游 `storyboardPreview.frames` 按当前集 `sourceShotId` 过滤 |
| 未确认本集 | 可预览；主按钮批出前 `askConfirm`「本集尚未在分镜台确认」 |
| 批出默认范围 | 当前集 · 缺帧优先（含失败） |
| 停止 | 不再领取新任务；循环/`Promise` 槽位边界检查 `shouldAbort` |
| 审阅模式 | 台内明示；节点 `data.reviewMode` 优先于全局；生产默认倾向 `manual` |
| 强制推送 | `askConfirm` + 列出未过镜号 |
| 卡面文案 | 「已出齐」= 本集皆有 `firstFrameAssetId`；「可交视频」= 门禁放行 |
| 破坏性弹窗 | `askConfirm` / `confirmDelete`；**禁止**新 `window.confirm` |
| 3D | **冻结**；不删现有 Tab，文案标「可选 · 另案重构」 |

---

## 6. 建议分期

### Phase A · 生产阻断（不做则不建议宣称可用）

`D-01`+`D-02` → `D-03`/`R-01`/`X-48` → `B-01`/`X-40` → `H-03` → `S-01` → `D-04`/`X-42` → `X-35`/`D-06` → `X-26`/`X-41` → `Q-02`

### Phase B · 主路径体验（仍不含 3D 重做）

`X-32`/`X-33` → `X-30` → `X-31` → `X-29` → `X-27`/`X-28` → `X-34` → `X-37`/`X-38` → `X-44` → `X-45`/`F-02文案` → `X-46` → `X-36` → `X-50` → `X-52`

### Phase C · 打磨

`X-39` · `X-43` · `X-47` · `X-49` · `X-51` · `F-04` · `Q-01` 抽纯函数 · **3D 另案**

---

# 7. 施工说明书（DeepSeek 逐 ID）

> 每个 ID：**现状锚点 / UI 线框 / 改动文件 / 实现步骤 / 禁止 / 验收**。  
> Phase A 写全；Phase B 同粒度；Phase C 可略但必须有验收句。  
> **凡标注「3D 冻结」的 ID：跳过，不得改文件冒充完成。**

---

## 7.1 D-01 + D-02 · 链镜表读写（P0）

### 现状锚点
- 读：`DirectorDeskBlock.tsx` ≈L46–89：`useWorkspaceDocument.storyboard` + `activeEpisodeShots(storyboard)`。  
- 写：`director-desk-runner.ts` 内多处 `doc.updateShot(...)`（生成成功/失败、approve、reject、push 相关）。  
- 已有工具：`apps/web/src/engine/chain-storyboard-utils.ts` 的 `readUpstreamChainStoryboard`、`resolveUpstreamChainDesk`、`patchUpstreamShot`、`activeChainEpisodeShots`（shared）。

### UI 线框
顶栏（见 X-26）显示数据源：

```text
+------------------------------------------------------------------+
| 来源：分镜台「第2集」 · 链镜表 24 镜 · 已确认 ✓                     |
| （若无上游）⚠ 未连接分镜台 · [聚焦画布找分镜] 或空态引导             |
+------------------------------------------------------------------+
```

无上游或链与 breakdown 皆空：**禁用批出主按钮**，空态文案，**禁止**回落全局镜表偷偷批出。

### 改动文件
1. `apps/web/src/blocks/core/DirectorDeskBlock.tsx` — 镜头列表来源  
2. `apps/web/src/engine/director-desk-runner.ts` — 写适配  
3. `apps/web/src/engine/chain-storyboard-utils.ts` — 若缺「从 breakdown 派生只读 shots」helper 则补  
4. （可选）`packages/shared` — 仅当缺 `activeChainEpisodeShots` 用法需导出时

### 实现步骤
1. 在 `DirectorDeskBlock` 用 `nodes/edges` 调 `readUpstreamChainStoryboard(props.id, nodes, edges)`。  
2. 当前集：优先 `data.lastHandoff?.episodeId`，否则 chain.`activeEpisodeId`，再否则上游 desk data 的当前集字段；**不要**再依赖全局 `storyboard.activeEpisodeId` 作为主路径。  
3. `activeShots = activeChainEpisodeShots(chain)`（按上一步 episode 过滤；若 shared helper 只认 chain.activeEpisodeId，则先 patch 本地派生或扩展 helper 接受 `episodeId` 参数——**查档求证**后再改，禁止臆造 API）。  
4. Fallback（只读）：chain 空且上游有 `scriptBreakdown` → 用仓库**已有** breakdown→shots 转换（搜 `script-breakdown` / `toStoryboard` 类函数）；UI 提示「链未同步，只读派生」。此路径**允许预览**；批出写回必须先确保写入 `chainStoryboard`（写时创建/更新 chain）。  
5. Runner：给 `DirectorDeskBatchOptions` 增加：

```ts
patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void;
resolveShots?: () => StoryboardShot[]; // 或由调用方传入 shots 快照
```

6. 所有原 `doc.updateShot` 的导演台路径改为调用 `opts.patchShot`；Block 侧实现为：

```ts
(shotId, patch) => {
  const ok = patchUpstreamShot(updateNodeData, props.id, nodes, edges, shotId, patch);
  if (!ok) appendLog('导演台：无法写回上游链镜表（未连接分镜台？）');
}
```

7. `approveDirectorKeyframe` / `rejectDirectorKeyframe` / `approveAll*` / `pushKeyframesToClipGen` 同样改为接收 desk 上下文 + `patchShot`，**禁止**继续默认写全局。  
8. 迁移期：可读全局仅用于「无上游时的空态诊断文案」，**禁止批出**。

### 禁止
- 继续 `activeEpisodeShots(workspace.storyboard)` 作为批出队列。  
- 批出成功只写全局不写 chain。  
- 改 3D embed 写回（T 冻结）；若发现 3D 仍写全局，**本 ID 只在注释/文档记下**，不改 3D 文件。

### 验收
- 仅连接分镜台 A 时，导演台镜头 = A 本集链（或派生）镜表。  
- 断开上游 → 镜头空 + 不能批出；画布上其他项目的全局残留镜**不会**出现。  
- 批准一镜后刷新/重开，上游 desk `chainStoryboard.shots[].keyframeStatus==='approved'`（或约定字段）仍在。

---

## 7.2 D-03 + R-01 + X-48 · 线稿进参考链（P0）

### 现状锚点
- 分镜写出：`use-storyboard-desk.tsx` `openDirectorDesk` ≈L1253–1304：`lastHandoff.lineArtFrames: {shotId, imageUrl}[]`。  
- 消费：`buildShotPrompt` ≈L574–600：优先级 3D→角色→场景→upstream，**无 line-art**。

### UI 线框
批出设置抽屉「参考锁」区增加：

```text
[✓] 线稿构图参考（preferLineArtRef）
```

主预览模式增加「线稿」（见 X-32）。

### 改动文件
1. `director-desk-runner.ts` — `buildShotPrompt` + options  
2. `director-batch-opts.ts` — 传入 lineArt map / preferLineArtRef  
3. `director-settings-drawer.tsx` — 开关  
4. `DirectorDeskBlock.tsx` — 从 `lastHandoff` 或上游 preview 建 `Record<shotId, url>`  
5. `director-desk.v2.css` — 如需

### 实现步骤
1. 节点 data 默认：`preferLineArtRef: true`（读时 `?? true`）。  
2. Block 计算：

```ts
lineArtByShotId: Record<string, string>
// 1) lastHandoff.lineArtFrames
// 2) else upstream storyboardPreview.frames filtered by episode shot ids
```

3. 传入 batch opts：`lineArtByShotId`、`preferLineArtRef`。  
4. `buildShotPrompt`：

```text
取 line = lineArtByShotId[shot.id]
若 preferLineArtRef && line：
  插入 referenceImageUrls（按 §5 优先级相对 3D）
  usedRefs.push('line-art')
  prompt 追加 pack 内 lineArtHint 或默认：
  '[Match the line-art composition and camera framing; colorize consistently]'
```

5. 设置抽屉绑定 `updateNodeData(blockId, { preferLineArtRef })`。  
6. `lastResults[].usedRefs` 已存在 → 确保成功镜能看到 `line-art`。

### 禁止
- 把线稿当最终成图展示为「已出关键帧」。  
- 改分镜台生成逻辑。  
- 为线稿重做 3D 对比以外的 3D 模块（对比里加线稿面板可以，见 X-32）。

### 验收
- 分镜交接后批出一镜，该镜 `usedRefs` 含 `line-art`（有线稿 URL 时）。  
- 关闭 `preferLineArtRef` 后同镜不再带 line-art。  
- 无线稿的镜不因缺线稿而硬失败（除非未来另加强制开关；**本迭代不加强制**）。

---

## 7.3 B-01 + X-40 · 多选 UI + 批出选中（P0）

### 现状锚点
- `toggleSelect` / `selectAllVisible` / `clearSelect` 在 `DirectorDeskBlock` 已实现。  
- `DirectorFilmstrip`：**无** checkbox，点击只 `focusShot`；`selectedIds` 仅用于 `is-on` 样式与当前镜混淆。

### UI 线框

```text
胶片头：
[全选可见] [清除] · 已选 3
筛选：缺帧(8) | 失败(1) | 已选(3) | 全部(24)   ← 计数可 Phase B/X-39，Phase A 可先无计数

每格：
+--------+
| [✓] #03|   ← 左上 checkbox，点击 stopPropagation
|  thumb |
| 出此镜 |   ← X-30 可同做或 Phase B
+--------+
```

主 dock 增加独立按钮（即使 filter≠selected 也能用）：

```text
[批出设置] [重试失败] [批出选中 (3)] [批出未完成]
```

### 改动文件
1. `director-filmstrip.tsx`  
2. `DirectorDeskBlock.tsx` — 传入 callbacks  
3. `director-main-panel.tsx` — 「批出选中」按钮  
4. `director-desk.v2.css` — `.dd2-frame__check` 等

### 实现步骤
1. Filmstrip props 增加：`toggleSelect`、`selectAllVisible`、`clearSelect`、`selectedCount`。  
2. 每格：checkbox；`onChange` → `toggleSelect(shot.id)`；点击 checkbox **不要**只 focus。  
3. 单击缩略图仍 `focusShot`；**Ctrl/Meta+单击**可切换选中（可选加分）。  
4. `is-on`：当前聚焦镜用 `is-focus`；选中用 `is-selected`——**两种 class 分开**，避免混淆。  
5. MainPanel：`批出选中` → `runBatch('selected')`；disabled 当 `selectedIds.size===0 || running`。  
6. 筛选「已选」继续可用。

### 禁止
- 只改 CSS 高亮却不能真正多选。  
- 用 `window.prompt` 之类。

### 验收
- 勾 3 镜 → 点「批出选中」只跑这 3 镜。  
- 「已选」筛选只显示勾中的镜。  
- 全选可见 / 清除可用。

---

## 7.4 H-03 · 强制推送二次确认（P0）

### 现状锚点
- `handlePushClipGen(force)` 在 `DirectorDeskBlock`；`DirectorDeliverTab` 有强制推送入口（读 deliver-tab 后半）。  
- 无 `askConfirm`。

### UI
点击「强制推送」→ 统一确认框：

```text
标题：强制推送到视频生成？
描述：门禁未放行。未批准镜号：#2 #5 #8（最多列 12 个，超出加「等 N 镜」）
[取消] [仍要推送]
```

### 改动文件
1. `DirectorDeskBlock.tsx` 或 `director-deliver-tab.tsx`  
2. 复用 `askConfirm` from `stores/confirm-dialog.ts`

### 实现步骤
1. `force===true` 时先 `summarizePendingKeyframeGate()` 取未过镜号。  
2. `await askConfirm({ title, description, confirmLabel:'仍要推送', tone:'danger' })`。  
3. 用户取消则 return；确认后再 `pushKeyframesToClipGen(..., bypassKeyframeGate:true)`。

### 禁止
- `window.confirm`。  
- 无列表的模糊确认。

### 验收
- 门禁未过点强制 → 弹窗列镜号 → 取消不推送；确认才推送。

---

## 7.5 S-01 · 批出中关台 / 刷新拦截（P0）

### 现状锚点
- 分镜台已有范式：`use-storyboard-desk.tsx` ≈L287–295 `beforeunload`；关台 `askConfirm`。  
- 导演台 `closeStudio` 直接 `setStudioOpen(false)`，无拦截。

### UI
关 Modal / 点遮罩关闭时：

```text
批出仍在进行，确定关闭导演台？
关闭不会自动停止已请求的出图；建议先点「停止」。
[继续批出] [仍要关闭]
```

### 改动文件
1. `DirectorDeskBlock.tsx`  
2. 若 `ScreenModal` 支持 `onRequestClose`，走该回调；否则包一层 close handler

### 实现步骤
1. `running===true` 时 `beforeunload` 注册（对称分镜）。  
2. `closeStudio` 改为 async：若 running → askConfirm → 确认再关；可选同时 `abortRef.current=true`。  
3. 未 running 直接关。

### 禁止
- 静默丢任务无提示。

### 验收
- 批出中刷新浏览器有原生离开提示。  
- 批出中关台出确认；取消则保持打开。

---

## 7.6 D-04 + X-42 · 未确认本集二次确认（P1，Phase A 建议顺带）

### 现状锚点
- `lastHandoff.confirmed` / `confirmedEpisodeIds` 已由分镜写入。  
- 批出无校验。

### UI
批出主按钮点击时若当前集未确认：

```text
本集尚未在分镜台确认。仍要批出彩色关键帧？
[取消] [仍要批出]
```

### 实现步骤
1. `episodeConfirmed = lastHandoff.confirmed === true || confirmedEpisodeIds.includes(episodeId)`；若能读上游 desk 的 `confirmedEpisodeIds` **以上游为准**（handoff 可能过期）。  
2. `runBatch` 开头 askConfirm。  
3. 顶栏 X-26 显示确认态红/绿。

### 验收
- 上游未确认时批出必弹确认；确认后才开跑。

---

## 7.7 D-06 + X-35 · picture-gen 禁止画布回落（P0）

### 现状锚点
- `findDirectorPictureGenNode` 末尾：`return nodes.find((n) => n.type === 'picture-gen')`。

### 实现步骤
1. **删除**画布级回落；找不到连线（含经分镜间接）则 `undefined`。  
2. UI：无 picture-gen 时主按钮 disabled + 内联「请连接图像生成节点」。  
3. 单测：孤立 picture-gen 不被命中。

### 禁止
- 改 clip-gen 查找逻辑以外的视频链行为（clip 已是只认连线，保持）。

### 验收
- 画布上有无关 picture-gen、导演未连线 → 不批出、不误写其 data。

---

## 7.8 X-26 + X-41 · 顶栏集上下文（P0）

### UI 线框（插在步骤条上方）

```text
+------------------------------------------------------------------+
| 第2集 · 来自「分镜台」 · 已确认 · 线稿 20/24 · 关键帧 12/24          |
| [与分镜同步集]（handoff.episodeId 与本地不一致时显示）              |
+------------------------------------------------------------------+
```

### 实现步骤
1. 解析上游 desk 标题/集名、确认态、线稿覆盖（有 lineArt url 的镜数/总镜数）、关键帧覆盖。  
2. `linkedEpisodeId` 存节点 data；打开台或收到 handoff 时写入。  
3. 镜头列表严格按该 episodeId 过滤。

### 验收
- 顶栏集与批出队列一致；handoff 换集后队列换集。

---

## 7.9 Q-02 · 关键测例（P0）

### 最低测例（`apps/web/src/engine/__tests__/director-desk-*.test.ts` 或现有测试目录惯例）
1. `buildShotPrompt`：有 lineArt → `usedRefs` 含 `line-art`。  
2. 队列过滤：missing/selected/failed。  
3. 门禁：缺批准不通过；全批准通过。  
4. `findDirectorPictureGenNode`：无边不回落。  
5. `patchUpstreamShot` 被批出路径调用（可 mock updateNodeData）。  

保留 Block render 冒烟。

### 验收
- `pnpm --filter <web包名> test`（以仓库现有脚本为准）相关测例通过。

---

## 7.10 X-32 + X-33 · 线稿预览与胶片占位（P1）

### UI
- `previewMode`: `'keyframe' | 'lineart' | 'guide3d' | 'compare'`  
- 对比默认双栏：**线稿 | 关键帧**（可下拉再切「关键帧 | 3D」——**只改预览面板，不改 stage3d 嵌入**）  
- 胶片：`firstFrameAssetId || lineArtUrl || #index`

### 改动文件
`director-main-panel.tsx`、`director-filmstrip.tsx`、`DirectorDeskBlock.tsx`、`director-desk.v2.css`

### 禁止
- 修改 `director-3d-stage-embed.tsx`。

### 验收
- 无线稿有关键帧：线稿模式空态「无上游线稿」。  
- 无关键帧有线稿：胶片显示线稿图。

---

## 7.11 X-30 · 出此镜（P1）

### UI
胶片格悬停或底部小按钮「出此镜」→ `runBatch('one', shot.id)`。

### 验收
- 只跑一镜；不受 skipExisting 阻碍（现有 `mode==='one'` 已 skipExisting=false）。

---

## 7.12 X-31 · 紧凑出图参数条（P1）

### UI（生产 Tab 预览工具条下方）

```text
模型 [select]  尺寸 [select]  · 来自已连接图像生成
```

### 实现步骤
1. 复用分镜台/项目内已有 `useConnectedPictureModels` 或等价（**搜现有 hook，禁止新造 API 客户端**）。  
2. 变更写回 **已连接** picture-gen 的 `updateNodeData`，不是全局。  
3. 无连接时条显示禁用 + 提示。

### 验收
- 改模型后批出使用新模型（与 picture-gen 节点 data 一致）。

---

## 7.13 X-29 · 可点缺图 hint（P1）

### 实现
`DirectorDeliverTab` 缺图文案改为 button：`setStudioTab('produce')` + `updateNodeData({ queueFilter:'missing' })` + 聚焦第一缺图镜。

### 验收
- 一点 hint 回到生产 Tab 且胶片为缺帧筛选。

---

## 7.14 X-27 · 撤回批准（P1）

### 实现
1. runner 新增 `unapproveDirectorKeyframe(shotId, patchShot)`：`keyframeStatus:'review'`，清 decision 或记 `revoked`。  
2. 审阅格对已批准镜显示「撤回」。  
3. 「撤销全部通过」：仅当全部 approved 时显示，askConfirm 后批量撤回。

### 验收
- 撤回后门禁变为未放行；可再批准。

---

## 7.15 X-28 · 审阅模式角标（P1）

### UI
交付 intro 旁：`审阅：手动 | 生成即通过` 切换，写入 `data.reviewMode`。  
生成路径读：`opts.reviewMode ?? blockData.reviewMode ?? 'manual'`，**不要只读** `doc.storyboard.reviewMode`。

### 验收
- 手动模式下新出图为 `review` 非 `approved`。

---

## 7.16 X-34 · 参考缺失内联面板（P1）

### UI
批出前或设置打开时，对将入队的镜跑 dry-run `buildShotPrompt`，收集 `missingForced`，列表展示镜号+原因。硬锁开启且缺失 → 禁用批出（已有设定就绪门禁则并列显示）。

### 验收
- 缺角色图时面板可见镜号，不只有 activity log。

---

## 7.17 X-37 · 批出结束摘要条（P1）

### UI
批出结束后在 dock 上方：

```text
完成：成功 10 · 失败 2 · 跳过 5   失败镜 #4 #9 [只重试失败]
```

### 验收
- 点失败镜号 focus 该镜。

---

## 7.18 X-38 · 打回原因注入重出（P1）

### 实现
`rejectDirectorKeyframe` 在 `regenerate===true` 时把 `comment` 写入 shot 临时字段或传入下次 `buildShotPrompt`：  
`prompt += \n[Revision note from director: ${comment}]`。

### 验收
- 打回并重出后，该次生成 prompt 含原因文本（可在 lastResults 或 dev 日志见）。

---

## 7.19 X-44 · 更硬停止（P1）

### 实现
1. 并发池：领取下一镜前检查 `shouldAbort()`。  
2. 文案改为「尽快停止：不再开新镜」。  
3. 若出图 API 支持 AbortSignal，传入 signal（**查现有 generate API**；不支持则不要假封装）。

### 验收
- concurrency=3 时点停止，随后成功数增量 ≤ 已在飞任务数。

---

## 7.20 X-45 + F-02 文案 · 步骤条（P1）

### UI
```text
1 选镜批出 (is-done 若 withFrame>0)
2 3D 机位（可选·另案）  ← 不实现完成态逻辑依赖
3 审阅送出 (is-done 若 gatePassed)
```

### 禁止
- 重做 stage3d 内容。

---

## 7.21 X-46 · 冷启动空态（P1）

### UI
无上游 / 无镜头：

```text
还没有可批的镜头
· 从分镜台确认本集后「打开导演台」
· 或在画布连接 storyboard-desk → director-desk
[打开上游分镜台]（resolveUpstreamChainDesk + fitView/focus）
```

---

## 7.22 X-36 · 卡面文案（P1）

### 实现
`BlockShell` 卡片进度区：`progressPct>=100` 显示「已出齐」；仅 `keyframeGatePassed` 显示「可交视频」。

---

## 7.23 X-50 · 上一版关键帧可回滚（P1）

### 实现
写新 `firstFrameAssetId` 前，把旧值写入 `shot.keyframePreviousUrl`（或 `directorKeyframePrevious`）；审阅格「恢复上一版」按钮。  
**不做**完整历史栈。

### 验收
- 重出后可恢复到重出前 URL。

---

## 7.24 X-52 · 推送回执（P1）

### 实现
`pushKeyframesToClipGen` 成功后 `updateNodeData(deskId, { lastPushToClipGen: { at, shotCount, clipGenId } })`；交付页展示一行。

---

## 7.25 Phase C 简项

| ID | 要点 | 验收 |
|---|---|---|
| X-39 | filter option 文本带 `(n)` | 数字随数据变 |
| X-43 | 台打开时 keydown ←/→/A/Shift+Enter | 输入框聚焦时不抢键 |
| X-47 | 删除或让 `sendToVideo` 走 `handlePushClipGen` | 无死代码 |
| X-49 | 导出本集关键帧 URL 列表/简单打包（复用现有 export 工具） | 有入口且不报错 |
| X-51 | 打回快捷标签 chips 填入 textarea | 可点选 |
| F-04 | 底栏人话阻断 | 设定未就绪时中文原因 |

---

## 8. 验收清单（生产级最低线 · 本迭代）

- [ ] 仅连分镜台 A 时镜头 = A 本集链镜表；断开不批全局残留  
- [ ] 关键帧/批准/打回写回 A 的 chain，刷新仍在  
- [ ] 交接后批出 `usedRefs` 含 `line-art`（有线稿时）  
- [ ] 胶片可多选、全选；「批出选中」不依赖先切筛选  
- [ ] 强制推送有二次确认；批出中关台/刷新有拦截  
- [ ] 未确认本集批出有确认  
- [ ] 无连线时不命中无关 picture-gen  
- [ ] 对比或预览能看到线稿与关键帧  
- [ ] 关键测例覆盖队列/门禁/线稿/chain/picture 查找  
- [ ] **未改** `director-3d-stage-embed.tsx` / `@nx9/director3d` 业务行为  

---

## 9. 与分镜台缺口的耦合

| 分镜台项 | 对导演台影响 |
|---|---|
| 确认失效不诚实 | 导演可能基于假确认批彩图 → 依赖 X-42 + 分镜 Phase A |
| frames 按集隔离 | 线稿参考必须按同一 episodeId |
| openDirectorDesk handoff | 导演消费 = D-03 |
| 线稿质量 | 直接影响关键帧构图 |

建议：与分镜台 Phase A **联调**一条：确认 → 交接 → 导演吃链+线稿 → 批出一镜 → 批准 → 推送。

---

## 10. 资源紧时 Top 5（非 3D）

1. **D-01/D-02** 链镜表读写  
2. **D-03/R-01/X-48** 线稿进参考  
3. **B-01/X-40** 多选 + 批出选中  
4. **H-03 + S-01** 强制确认 + 关台拦截  
5. **X-35 + Q-02** 禁止 picture 回落 + 测例  

---

## 11. 附录 · 当前 vs 目标数据流

### 当前（风险）

```text
分镜台 scriptBreakdown / storyboardPreview / chainStoryboard
        │ lastHandoff（写出，导演未读）
        ✕
全局 workspace.storyboard.shots  ←── 导演读/写/批出/审阅
        ▼
clip-gen
```

### 目标（本迭代）

```text
分镜台 chainStoryboard（+ preview.frames 线稿）
        │ edge + lastHandoff（索引/缓存）
        ▼
导演台 readUpstream + lineArtByShotId
        │ patchUpstreamShot 写关键帧/审阅态
        ▼
门禁 → askConfirm(强制) → pushKeyframesToClipGen
```

### 3D（另案）

```text
未来：独立 3D 节点或新舞台 → 产出 guide 图 → 导演台只消费 URL
本迭代：不改嵌入舞台；若 shot 上已有 director3dGuide.captureUrl，buildShotPrompt 可继续按 prefer3dRef 使用
```

---

# 附录 A · 文件白名单

```text
允许修改：
apps/web/src/blocks/core/DirectorDeskBlock.tsx
apps/web/src/blocks/core/director-desk/director-filmstrip.tsx
apps/web/src/blocks/core/director-desk/director-main-panel.tsx
apps/web/src/blocks/core/director-desk/director-deliver-tab.tsx
apps/web/src/blocks/core/director-desk/director-settings-drawer.tsx
apps/web/src/blocks/core/director-desk/director-batch-opts.ts
apps/web/src/blocks/core/director-desk/status-badge.tsx
apps/web/src/blocks/core/director-desk.v2.css
apps/web/src/blocks/core/director-desk.css          # 仅必要时极少补丁
apps/web/src/engine/director-desk-runner.ts
apps/web/src/engine/chain-storyboard-utils.ts
apps/web/src/engine/chain-storyboard-aggregate.ts   # 仅当已有聚合逻辑需接
apps/web/src/blocks/core/__tests__/DirectorDeskBlock.test.tsx
apps/web/src/engine/__tests__/**                    # 新增 runner 测例
packages/shared/src/utils/chain-storyboard.ts      # 仅当缺 episode 过滤 API
packages/shared/src/types/storyboard.ts            # 仅当加 previousUrl 等小字段
packages/shared/src/index.ts                       # 导出

允许只读调用、原则上不改实现：
apps/web/src/stores/confirm-dialog.ts
apps/web/src/stores/workspace-document.ts          # 禁止扩大写；迁移期只读诊断
apps/web/src/components/ui/ScreenModal.tsx         # 除非缺 onRequestClose 才最小改

本迭代禁止修改：
apps/web/src/blocks/core/director-desk/director-3d-stage-embed.tsx
apps/web/src/blocks/core/director-desk/agent-pose-input.tsx
packages/director3d/** 或 @nx9/director3d 包内文件
分镜台/编剧台业务文件（除非联调发现 handoff 字段名不一致——先停下来问用户）
Reference_Projects/**
```

---

# 附录 B · DeepSeek 系统提示词（整段复制）

> 用法：把下面代码块**整段**贴给 DeepSeek-V4-Pro；把 `{ID_LIST}` 换成本次要做的 ID（推荐先 Phase A）。  
> 用户当次消息里的 ID 列表优先于文档推荐顺序。

```text
【角色】
你是 NX9 仓库的实现工程师（不是产品经理、不是架构顾问）。唯一任务：按施工文档把指定功能 ID 做完、做对、可验收。

【唯一权威文档】
docs/NX9-DIRECTOR-DESK-PRODUCTION-GAP-ANALYSIS.md
（辅读：docs/NX9-REQ-SCRIPT-STORYBOARD-DESK-UX.md 职责边界；docs/NX9-PROJECT-DEFECT-ANALYSIS.md 仅 F-003/F-026 相关段落）
冲突时以 PRODUCTION-GAP 文档 §7 对应 ID 的「实现步骤 / 禁止 / 验收」为准。
用户当次消息里的 ID 列表 > 文档推荐顺序。

【本次任务】
只实现这些 ID：{ID_LIST}
（若用户写 Phase A，则等于文档 §6 Phase A 整条列表，仍须按 ID 逐个完成与自检。）

推荐 Phase A：
D-01, D-02, D-03, R-01, X-48, B-01, X-40, H-03, S-01, D-04, X-42, D-06, X-35, X-26, X-41, Q-02

【八荣八耻（强制）】
以臆猜接口为耻，以查档求证为荣；
以模糊开工为耻，以对齐文档 ID 为荣；
以脑补业务为耻，以请示缺项为荣；
以新增冗余为耻，以复用存量为荣；
以省略校验为耻，以完备测例为荣；
以乱改架构为耻，以恪守白名单为荣；
以不懂装懂为耻，以坦诚存疑为荣；
以批量乱改为耻，以分步迭代为荣。

【产品身份】
NX9 是独立自研产品。禁止打开、阅读、引用 Reference_Projects/；禁止「对齐/模仿/参考某外部产品」；禁止把外部 UI/目录抄进本仓库。
导演台职责：彩色关键帧批出 + 审阅 + 推视频；禁止把彩图批出搬回分镜台。

【3D 冻结（违反即失败）】
1. 禁止修改 director-3d-stage-embed.tsx、agent-pose-input.tsx、@nx9/director3d 包。
2. 禁止重做 stage3d Tab、沉浸模式、机位预设 UX、Agent 摆位。
3. 允许：预览区增加「线稿」模式/对比（X-32）；buildShotPrompt 继续可读已有 director3dGuide.captureUrl。
4. 文档中 T-01～T-05 全部跳过，不得标成完成。

【开工前强制步骤（不做不许写业务代码）】
1. 通读文档：DeepSeek 必读、§2 已有能力、本次每个 ID 的 §7、附录 A 白名单、§5 默认拍板。
2. 在代码里定位锚点（必须打开文件确认，禁止凭记忆）：
   - apps/web/src/blocks/core/DirectorDeskBlock.tsx
   - apps/web/src/engine/director-desk-runner.ts
   - apps/web/src/engine/chain-storyboard-utils.ts
   - apps/web/src/blocks/core/director-desk/director-filmstrip.tsx
   - apps/web/src/blocks/core/director-desk/director-main-panel.tsx
   - apps/web/src/blocks/core/director-desk/director-deliver-tab.tsx
   - apps/web/src/blocks/core/director-desk/director-settings-drawer.tsx
   - apps/web/src/stores/confirm-dialog.ts（askConfirm）
   - 分镜交接写出点：use-storyboard-desk.tsx 内 openDirectorDesk（只读理解字段名）
3. 输出「施工计划」短表后再编码：ID | 改哪些文件 | 复用哪些函数 | 验收怎么测。
4. 若文档某 ID 与代码现状冲突：先写清冲突点并停下问用户；禁止擅自改语义。

【硬约束 · 数据与行为】
1. 镜头主源：上游 storyboard-desk 的 chainStoryboard（+ 必要时 scriptBreakdown 只读派生）；禁止用全局 workspace.storyboard.shots 批出。
2. 写回：patchUpstreamShot / 写上游 chain；禁止新增 doc.updateShot 主路径。
3. 线稿：消费 lastHandoff.lineArtFrames 或上游 storyboardPreview.frames；usedRefs 含 line-art；preferLineArtRef 默认 true。
4. 多选：胶片 checkbox + 独立「批出选中」；禁止逻辑有 UI 无。
5. 强制推送、未确认批出、关台：一律 askConfirm；禁止 window.confirm。
6. findDirectorPictureGenNode 删除画布级回落。
7. 破坏性/贵操作可停可确认；停止后不再领取新镜。
8. 改 packages/shared 后必须：pnpm --filter @nx9/shared build，再跑相关测试。

【硬约束 · 文件白名单】
只许改附录 A 列出的路径。禁止：
- 新建第二套导演台/平行路由/新 Desk kind
- 大重构无关模块、改编剧台/分镜台（handoff 字段不一致先问用户）
- 「顺便」格式化大文件、改无关命名、删已有能力
- 把 runner 大拆文件（Q-01）除非本次 ID 显式包含
- 修改任何 3D 冻结文件

【硬约束 · 禁止偷懒】
1. 禁止只改文案/CSS 冒充功能完成。
2. 禁止 TODO/占位实现、假按钮、console 空函数。
3. 禁止写「剩余下次再做」却把 ID 标成完成；未做完的 ID 必须在交付清单里标「未完成」。
4. 禁止跳过该 ID 文档里的验收项。
5. 每个 ID 做完必须对照文档验收句逐条打勾（在最终回复里）。
6. 禁止引入新依赖，除非用户明示。
7. 禁止用「重构一下更优雅」扩 scope；先让行为正确。
8. 禁止把 3D 另案内容塞进本次 PR。

【实现风格】
- 复用：readUpstreamChainStoryboard、patchUpstreamShot、runDirectorDeskBatch、buildBatchOpts、askConfirm、pushKeyframesToClipGen、已有 statusBadge。
- 新增纯函数优先放 director-desk-runner.ts 或 chain-storyboard-utils.ts，便于 Q-02 单测。
- UI：扩现有 dd2-*；线框以文档 §7 为准，不要自行发明第三套布局。
- 一次按 ID 顺序推进；每完成 2～3 个 ID 自检一次。

【默认拍板（§5，用户未改口则照做）】
SSOT=上游链；线稿默认开；未确认可预览但批出要确认；强制推送要确认；审阅默认 manual；卡面区分已出齐/可交视频；3D 冻结。

【自测最低集】
每完成涉及逻辑的 ID，至少做文档验收；涉及 runner/shared 的补测例。
Phase A 结束前能口述手动点选：无上游不批全局、线稿进 usedRefs、多选批出、强制推送弹窗、关台拦截、未确认弹窗、未连 picture-gen 不误用。

【最终交付格式（必须严格遵守）】
1. 完成的 ID 列表（逐个）
2. 每个 ID：改动文件路径 + 关键函数/组件名
3. 每个 ID：文档验收项打勾结果
4. 未做 / 发现但未改的问题（单独列出；含任何 3D 相关发现）
5. 如何手动点选验证（逐步）
6. 执行过的命令与结果摘要（build/test）
禁止长篇空谈架构；禁止把未做的写成已做。

【开始】
先输出施工计划短表，再开始改代码。用户说「直接干」才可省略计划中的等待，但仍必须在心里完成锚点核对。
```

---

# 附录 C · 给人类的一句话怎么用 DeepSeek

1. 把 **附录 B** 整段粘贴为系统/首条提示。  
2. `{ID_LIST}` 换成例如：  
   `D-01, D-02, D-03, R-01, X-48, B-01, X-40, H-03, S-01, D-04, X-42, D-06, X-35, X-26, X-41, Q-02`  
3. 附一句：「仓库根目录是 NX9；先读文档再打开白名单文件；每完成一个 ID 对照 §7 验收；3D 文件不许动。」  
4. 做完 Phase A 再开新会话做 Phase B，避免上下文漂。  
5. 3D 抽节点另开文档与会话，不要和本提示词混做。

---

**今日最大风险（非 3D）**：导演台在「看起来能批图」的同时，**可能批错数据源、丢掉分镜线稿约束、假装支持多选**。先收 Phase A，3D 舞台整包另案。
