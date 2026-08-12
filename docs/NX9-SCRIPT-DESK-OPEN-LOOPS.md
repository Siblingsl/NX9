# NX9 编剧台 · 未闭环功能清单

> **日期**：2026-08-12  
> **范围**：编剧台节点（`ScriptDeskBlock` + `script-desk-runner` + 草稿 / Bible / 设定就绪 / 送分镜交接）  
> **依据**：仓库现行代码逐项核验（对照 `NX9-SCRIPT-DESK-PRODUCTION-GAP-ANALYSIS.md` 2026-07-31 ID 台账）  
> **原则**：以「生产闭环可验收」为准，不以「字段/按钮已存在」为准

---

## 实施进度（2026-08-12 收口）

| 项 | 状态 |
|----|------|
| §3.1 查找替换绕过确认失效（P0 缺陷） | ✅ 已修：替换走 `unconfirmIfEdited`；无匹配不落盘；`findScope` 死代码删除；测试回归锁 |
| §3.2 角色全局改名 UI（B-08） | ✅ 已落地：人物卡「改名」入口 → 确认弹层（含影响处数）→ `renameCharacterInPackage` → 确认失效；同名冲突拦截提示走合并 |
| §3.3 交接回程状态（H-02） | ✅ 已落地（薄）：`script-desk/storyboard-sync.ts` 比对分镜 `breakdownJob.sourcePackageHash`；画布卡 meta + 送分镜 checklist 显示「分镜已同步 / 落后 / 未拆」 |
| §3.8 Q-01 拆分 | ✅ 第二阶段：抽出 `DeskHeader` / `ChatStage` / `ContinuePop`；主文件约 2,188 行（controller 仍在主文件，后续可再抽 hook） |
| §3.8 Q-02 测试 | ✅ 增补 helpers/错误码/改名同步/pending 瘦身测例；面板测例含展开状态受控 |
| §3.4～§3.7 / §3.9 | ✅ 流式 SSE、对话搜索/折叠、顶栏模型名、批量重写、单集字数目标、剪贴板导入、runner 错误码均已落地 |
| 第二轮深挖（状态机/联动/性能） | ✅ 见 `NX9-SCRIPT-DESK-DEEP-AUDIT-2026-08-12.md`；本轮补：展开状态抬父组件、改名同步素材库（方案 a）、输入框内结构性 Ctrl+Z、pendingPatch 瘦身 |

---

## 0. 怎么读本文

### 0.1 「闭环」判定（四问）

任一能力只有同时满足才算闭环：

| # | 问句 | 失败即未闭环 |
|---|------|--------------|
| 1 | **写得进** | 能生成/上传/编辑成稿，且不丢稿、可停止、可后悔 |
| 2 | **改得明** | 任何改动可预览（Diff/摘要）、可撤销，确认态随改动如实失效 |
| 3 | **检得真** | 诊断/就绪/步骤条与真实状态一致，无假绿 |
| 4 | **交得出** | 下游（分镜/素材库）拿到的是已确认真身，且双方知道对方是否同步 |

### 0.2 状态符号

| 符号 | 含义 |
|------|------|
| ✅ 已闭环 | 主路径可验收 |
| ⚠ 半闭环 | 有函数/字段/入口，但链路断一截 |
| ❌ 断点 | 缺能力，或行为与承诺不符（含 bug） |
| ⏸ 后置 | 明确可延后，不阻断出片 |
| 🚫 不做 | 产品已否决，勿排期回潮 |

### 0.3 与既有文档关系

| 文档 | 角色 |
|------|------|
| `NX9-SCRIPT-DESK-PRODUCTION-GAP-ANALYSIS.md` | 上一轮缺口全表 + 施工说明书（ID 定义权威源） |
| `NX9-REQ-SCRIPT-DESK-LAYOUT-CONTINUE-UX.md` / `NX9-REQ-SCRIPT-DESK-RESET-DRAFTS.md` | 已拍板 UX 细节 |
| `NX9-ASSET-LIBRARY-OPEN-LOOPS.md` | 素材库侧闭环（编剧台↔库同步以它为准） |
| **本文** | **2026-08-12 复核后的真清单** |

---

## 1. 一句话结论

编剧台 **Phase A / Phase B 主路径已基本闭环**：自动草稿 upsert、离开提示、可停止（AbortSignal）、Apply 摘要 + 丢弃、重写 pending Diff、删集/插集/重排/导航/大纲、目标集数、查找替换、只重试失败集、Bible 可编辑/合并/删除/跳素材库、确认前抽取提醒、确认失效 banner、送分镜 checklist、拆镜高亮、格式 linter + 自动诊断 + 诊断跳转、撤销栈、骨架占位、导入预览、爆点轨编辑、单集复制、草稿改名/预览/来源，均已落地。

**仍未闭环的集中在四类**：

1. **新发现缺陷 2 个**（查找替换绕过确认失效、全局改名有函数无 UI）——破坏「改得明」；
2. **交接回程状态（H-02）**——编剧台看不到分镜台是否已同步，「交得出」单向；
3. **对话体验层**（流式、搜索/折叠、模型名可见）；
4. **工程债**（单文件 ~2800 行未拆、组件级交互测试缺失、runner 错误无结构化 code）。

---

## 2. 已闭环总表（对照旧 ID，勿再开票）

### 2.1 草稿 / 持久化

| ID | 项 | 状态 | 锚点 |
|----|----|:----:|------|
| S-01/S-06/X-09 | 工作草稿 60s 定时 + 关台 upsert（同 workingKey 不炸新文件夹） | ✅ | `ScriptDeskBlock` 自动存 effect + `upsertScriptDeskWorkingDraft`（含单测） |
| S-02 | `beforeunload` + dirty 提示 | ✅ | `dirtyRef` + beforeunload effect |
| S-03 | 草稿重命名 | ✅ | `renameScriptDeskDraft`（双击改名） |
| S-04/S-05 | 草稿预览 + 来源 block 标签 | ✅ | `.sd2-draft-folder__preview` / `__tag` |

### 2.2 生成 / 对话

| ID | 项 | 状态 | 锚点 |
|----|----|:----:|------|
| Q-03/C-01/E-06 | AbortController 全链停止，保留已成功集 | ✅ | runner 各技能 `signal` 检查；块内多处 `abortRef` |
| F-03/C-02 | Apply 变更摘要 + 丢弃（`discarded` 标记） | ✅ | `summarizePackagePatch`（含单测） |
| C-03 | 有 pending 时禁止连发 | ✅ | `hasPending` 拦截 |
| C-04/C-07 | 清屏不再用 `window.confirm` | ✅ | 全文件已无 `window.confirm` |
| C-08 | 运行互锁（busy 时禁草稿/重置/切 ingest） | ✅ | `busy \|\| continueBusy \|\| rewritingEpIndex != null` disabled |
| E-07 | 只重试失败集 | ✅ | `handleRetryFailed` + 失败条 |
| X-05 | 生成骨架占位（本地 state，不写 package） | ✅ | `skeletonIndexes` |
| E-12 | 首次选集浮层补「2」，与续写一致 | ✅ | 两处均 `[1,2,3,5,10]` |

### 2.3 成稿运维

| ID | 项 | 状态 | 锚点 |
|----|----|:----:|------|
| E-01 | 删集 + 重排 index | ✅ | `removeScreenplayEpisode`（含单测） |
| E-02 | 插空集 | ✅ | `insertEmptyEpisodeAfter`（含单测） |
| E-03 | 集号导航 chips + scrollIntoView | ✅ | `.sd2-jump__chip` |
| E-04 | 目标集数可见可改 | ✅ | Brief 行「目标集数」input |
| E-05 | 重写走 pending Diff，应用才写入 | ✅ | 重写成功仅 append pendingPatch |
| E-08 | 每集字数/场景数 | ✅ | `.sd2-ep__stats` |
| E-09 | 拖拽重排集序（重排后 unconfirm） | ✅ | `handleEpisodeReorder` |
| E-10 | 大纲视图 | ✅ | `outlineView` toggle |
| E-11 | 单集复制 | ✅ | 「复制本集」→ clipboard |
| X-01 | 导入解析预览（写入前列出识别集） | ✅ | `episodesFromIngestText` + `ingestPreviewEps` |
| X-03 | 本地撤销栈（max 20，Ctrl+Z，避开输入框） | ✅ | `undoStackRef` / `pushUndo` |
| X-04 | 爆点轨 `brief.hooks[]` 可增删改 | ✅ | Brief 区 hooks 编辑 |

### 2.4 Bible / 就绪 / 诊断

| ID | 项 | 状态 | 锚点 |
|----|----|:----:|------|
| B-01 | 人物/场景卡片可编辑（身份/性格/外貌，location/summary/era） | ✅ | `patchBibleCharacter` / `patchBibleScene` |
| B-02 | 人物/场景可删、可两两合并 | ✅ | `removeBibleCharacter` / `handleBibleMerge` |
| B-03 | 卡片跳素材库 | ✅ | `openAssetAt({ tab, itemId })` |
| B-04 | 世界观（era/location/worldview）可编辑 | ✅ | `patchBibleWorld` |
| B-05 | 确认前空 Bible 询问「先抽取」 | ✅ | `handleConfirm` → `askConfirmWithOption` |
| B-06 | 就绪面板深色样式（去 `text-ink/*`） | ✅ | `AssetReadinessPanel`（随素材库收口翻新） |
| B-07/H-01 | 送分镜 checklist（缺口须「仍要送出」或「去就绪」） | ✅ | `handoffOpen` 弹层 |
| D-01/D-04 | 生成后自动诊断 + 格式 linter | ✅ | `runAutoLint` + `lintScreenplayFormat`（含单测） |
| D-02 | 诊断点击跳集/跳 Bible 卡 | ✅ | `handleDiagClick` + `.sd2-diag--clickable` |
| D-03 | 一键修复缺失字段（带明细） | ✅ | `handleAutoFix` |

### 2.5 流程 / 交接

| ID | 项 | 状态 | 锚点 |
|----|----|:----:|------|
| F-01 | 步骤条状态机（is-done / is-on） | ✅ | 共创/成稿/确认三步真实判定 |
| F-02 | 技能三段（大纲/成稿/质检） | ✅ | `segment` 分组 |
| F-08 | 确认失效 banner | ✅ | `showUnconfirmBanner` |
| H-04 | 送分镜 `autoOpenBreakdown` + 拆镜高亮，不自动跑 LLM | ✅ | 分镜台 `handoffHighlight` |
| H-05 | handoff 带集范围/hash/字数 | ✅ | `episodeRange` + `packageSourceHash`（消费见 §4.3） |
| — | 分镜台可反向唤起编剧台（openStudioRequest） | ✅ | 块内 effect + 状态 tip |
| — | 分镜侧成稿过期检测（成稿已更新 / 只拆新增） | ✅ | `packageStale` + `missingUpstreamEpisodeCount` |
| — | 一键运行链路：有成稿→抽 Bible，空台报错不静默 | ✅ | `flow-runner` script-desk 分支 |
| X-02 | 成稿查找替换 | ⚠ 见 §3.1 缺陷 |
| B-08/X-02 | 角色全局改名 | ❌ 见 §3.2 |

---

## 3. 未闭环明细（本次要开的票）

### 3.1 ❌ P0 · 查找替换绕过「确认失效」（新发现缺陷）

- **现状**：查找替换的「替换」按钮直接 `savePkg(touchScreenplayPackage(...))`，**没有走 `unconfirmIfEdited`**（对照：手动改正文 `patchEpisodeBody`、删集、重排均有）。
- **后果**：已确认成稿可以被批量改词后**仍显示「已确认」**，banner 不出现，可原样送分镜 → 假绿，破坏 F-08 的全部意义。
- **附带**：`findScope` 有 `'current' | 'all'` state，但 UI 无切换入口；且 `'current'` 分支判定写的是 `ep.index !== episodes[0]?.index`（等于「只替换第 1 集」），语义错误的死代码。
- **修复**：替换成功后若 `status === 'confirmed'` 走 `unconfirmIfEdited`；`findScope` 要么补 UI + 正确的「当前视口集」判定，要么删掉死分支。
- **验收**：确认后替换 1 处 → badge 回「草稿」+ banner 出现；替换 0 处不失效。

### 3.2 ❌ P1 · 角色全局改名有函数无 UI（B-08 半成品）

- **现状**：`renameCharacterInPackage`（整词替换正文 + Bible，单测 2 条）已在 shared 落地并被 `ScriptDeskBlock` **import，但全文件无一处调用**；人物卡片可编辑身份/性格/外貌，**唯独名字不可改**。
- **后果**：长剧改角色名只能靠查找替换硬替（还会撞上 §3.1 的 bug），Bible 名与正文名可能分叉。
- **修复**：人物卡编辑态加「改名」入口 → 确认弹层（提示影响 N 处）→ 调 `renameCharacterInPackage` → `unconfirmIfEdited` → 提示替换处数。
- **验收**：改名后正文、Bible、诊断三处同名；素材库跳转（按名索引 `openAssetAt({ itemId: c.name })`）不指向旧名。

### 3.3 ❌ P1 · 交接回程状态（H-02，旧账）

- **现状**：编剧台 → 分镜台单向：分镜台能检测「成稿已更新/只拆新增」，也能唤起编剧台；但**编剧台侧（画布卡 + 台内）完全看不到分镜是否已同步**。画布卡只有「已连出图」，无「分镜已拆 N 集 / 分镜落后于成稿」。
- **后果**：编剧改完稿不知道下游是否消费过，只能靠 tip 里的口头提示「回分镜台点同步」。
- **修复（薄）**：编剧台读取相连分镜台的 `breakdownJob.sourcePackageHash`，与 `packageSourceHash(pkg)` 比对，在画布卡 meta 和送分镜 checklist 显示「分镜已同步 / 分镜落后（成稿已更新）/ 未拆镜」。只读展示，不加回写。
- **验收**：拆镜后编剧台卡显示已同步；改一字确认后显示落后。

### 3.4 ⚠ P1 · 对话无流式输出（C-06，旧账）

- **现状**：生成/续写/重写全部一次性返回；长集只有 busy 转圈 + 骨架，无 token 流。
- **后果**：单集 1-2 分钟黑盒等待，「可停止」体验打折（停了也看不到已生成的半截）。
- **依赖**：`api.agent.*` 与网关需要 SSE/chunk 通道，是跨层改造，**建议单独立项**，不与 UI 票混做。

### 3.5 ⚠ P2 · 对话运维（C-05）与模型可见性（X-06）

- 对话无搜索、无折叠、无「跳到最新 pending」；长会话翻找靠滚动。
- 顶栏不显示当前文字模型名，用户无法确认这稿是谁写的（尤其 dev prompt override 开启时）。
- 两项都是纯 UI 增量，可合一票做。

### 3.6 ⚠ P2 · 批量选中重写（X-08）与剪贴板快捷导入（X-10）

- 重写仍是单集入口，多集返工要逐集点。
- 剪贴板含「第N集」时无一键填入 ingest 的提示。
- 均未做，维持 P2，不阻断。

### 3.7 ⚠ P2 · 续写字数目标注入（X-07）

- runner 系统提示只有「每集有开场钩子与集末钩子」，**无单集字数目标**；`brief.episodeCount` 已消费但每集体量不受控。
- 修复：Brief 增可选「单集字数」→ 注入生成/续写/重写 prompt。

### 3.8 ❌ P0（工程） · 单文件与测试债（Q-01 / Q-02）

- **Q-01 未做**：`ScriptDeskBlock.tsx` 现约 **2,800 行**（含 JSX 近 3,000），比上一轮审计（~1,600 行）**更大**；`script-desk/` 子目录拆分从未发生。每次加功能都在恶化 HMR / Vite 空 chunk 风险（见仓库 `lazy → undefined` 排障规则，巨型 Desk 是最易中招者）。
- **Q-02 半做**：shared 纯函数测试扎实（`test-screenplay-package.test.ts` 30+ 用例：删集/插集/摘要/upsert/lint/查找替换/改名/抽取合并）；但组件层仅 1 条 render 冒烟，**停止钮、checklist、步骤条、banner、互锁全部无测试**。
- **建议**：先按旧文档 §4.26 结构拆文件（纯搬运禁夹带行为），拆完补 3-5 条关键交互测试（mock runner）。

### 3.9 ⚠ P2（工程） · runner 错误无结构化 code（Q-04）

- 诊断（diagnostics）有 code 体系；但 runner 异常仍是裸 `throw new Error('中文消息')`，UI 只能整串展示、无法按类型分流（限流/超时/内容审核/格式失败）。
- 修复：定义 `ScriptDeskRunnerError { code, message }`，UI 按 code 给动作建议（重试/换模型/缩规模）。

### 3.10 可加深（非阻断，不开票也行）

| 项 | 说明 |
|----|------|
| 撤销栈无重做（redo） | X-03 规格本就只要求 undo；撤销也不含 agentSession |
| `agentSession` 无修剪 | 每条 pendingPatch 内嵌整集正文，长会话让 node.data 持续膨胀（工作区文档体积风险），可做「已应用消息瘦身/上限截断」 |
| handoff `episodeRange` 下游未按范围过滤 | 负载已带，分镜台按全量+增量逻辑消费，当前够用 |
| 撤销提示语不一致 | 删集/清空确认框写「不可就地撤销」，实际 Ctrl+Z 可撤（文案债） |

---

## 4. 优先级排序（建议施工顺序）

| 序 | 票 | 类型 | 理由 |
|----|----|------|------|
| 1 | §3.1 查找替换失效确认 | P0 缺陷 | 假绿直接污染交付闸门，改动极小 |
| 2 | §3.2 全局改名 UI | P1 半成品 | 函数+单测已备，只差入口，顺手修掉死 import |
| 3 | §3.3 回程状态薄展示 | P1 | 只读比对 hash，收掉最后一个单向交接 |
| 4 | §3.8 拆文件 + 关键交互测试 | P0 工程 | 越晚越贵；先拆再做任何新功能 |
| 5 | §3.5 对话运维 + 模型名 | P2 | 纯 UI 一票 |
| 6 | §3.7 字数目标注入 | P2 | prompt 层小改 |
| 7 | §3.4 流式 | P1 单独立项 | 跨 api/网关，勿与 UI 混做 |
| 8 | §3.9 错误 code / §3.6 批量重写、剪贴板 | P2 | 排空了再说 |

---

## 5. 明确不做（继承旧文档 §7，禁止回潮）

| 项 | 理由 |
|----|------|
| 智能最优集数推荐 | 产品否决 |
| 编剧台内嵌分镜线稿 | 归分镜台 |
| 多人协同编辑 | 无需求闭环 |
| Bible 独立 CMS | 素材库已是 SSOT 通道 |
| 送分镜默认自动跑拆镜 LLM | 成本闸门，保持只高亮 |
| 重做设计体系 | 只扩 `sd2-*` |

---

## 6. 验收口诀

1. 确认后的稿，**任何**改动路径（含替换、改名）都必须掉回草稿并弹 banner。  
2. 角色改名一处生效三处（正文/Bible/诊断），素材库跳转不断链。  
3. 编剧台画布卡能一眼看出：草稿/已确认 × 分镜已同步/落后/未拆。  
4. 巨型单文件不再增长——新功能先问「拆了没」。  
5. 停止、checklist、banner 有组件测试兜底，改坏会红。  
6. 不做清单零回潮。

---

## 附：关键代码锚点

| 主题 | 路径 |
|------|------|
| 编剧台主块（~2,800 行，待拆） | `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx` |
| 技能 runner（Abort/抽取/续写/重写） | `apps/web/src/engine/script-desk-runner.ts` |
| package 纯函数（删/插/摘要/lint/改名/查找替换） | `packages/shared/src/types/screenplay-package.ts` |
| 草稿归档（upsert 工作草稿） | `packages/shared/src/utils/script-desk-archives.ts` |
| shared 单测 | `apps/server/test/test-screenplay-package.test.ts` |
| 组件冒烟测试（待扩） | `apps/web/src/blocks/nx9/__tests__/ScriptDeskBlock.test.tsx` |
| 设定就绪面板 | `apps/web/src/components/asset/AssetReadinessPanel.tsx` |
| Bible ↔ 素材库双向同步 | `apps/web/src/engine/bible-library-sync.ts` |
| 分镜侧 handoff 消费 / 过期检测 | `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx` / `breakdown-panel.tsx` |
| 一键运行编剧台分支 | `apps/web/src/engine/flow-runner.ts` |

---

**文档结论**：编剧台上一轮 Phase A/B 排期已基本兑现；当前真正未闭环的是 **1 个 P0 缺陷（替换绕过确认失效）、1 个半成品（全局改名）、1 个单向交接（回程状态）与工程债（拆分/测试/错误码）**。建议按 §4 顺序收口，先修缺陷、再补入口、后还工程债。
