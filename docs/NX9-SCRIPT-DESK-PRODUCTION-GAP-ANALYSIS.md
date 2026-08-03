# NX9 编剧台 · 生产级缺口、加强项与 DeepSeek 施工说明书

> 日期：2026-07-31（二修：补未列加强项 + 逐功能实现方案）  
> 范围：仅编剧台（`ScriptDeskBlock` + runner + Bible / 设定就绪 / 草稿 / 送分镜）  
> 读者：人类产品 + **DeepSeek-V4-Pro 等实现用大模型**  
> 权威源：本文 + 用户当次拍板；禁止对照任何外部产品仓库  

---

## DeepSeek 必读（开工前 30 秒）

1. **只改本文点名的文件**；禁止新建平行「第二套编剧台」。  
2. **禁止**打开/引用 `Reference_Projects/`；禁止「对齐某外部产品」。  
3. 每做完一个 **ID**（如 `S-01`），必须满足该 ID 的「验收」；不要一次改光所有 ID。  
4. UI 样式只扩 `script-desk.v2.css` 的 `sd2-*`；设定就绪面板**禁止**继续用 `text-ink/30` 这类在深色稿纸上不可见的类。  
5. 数据真相：`node.data.package`（`ScreenplayPackage`）+ `node.data.agentSession`；草稿在 `workspace.scriptDeskDrafts`。  
6. 续写/生成必须**追加**，禁止覆盖已有集（除非用户明确点「重写」且走 Diff 确认）。  
7. 改完 `packages/shared` 必须 `pnpm --filter @nx9/shared build` 再跑测试。  

**推荐实现顺序（Phase A）**：`S-01 → S-02 → Q-03/C-01/E-06 → F-03/C-02 → E-01 → E-04 → E-05 → B-05 → B-07/H-01 → F-01 → F-08 → B-06 → C-08 → Q-02`

---

## 0. 一句话结论

主链骨架已通，但生产级还缺：**不丢稿、可停止、可后悔、可运维长剧、交付有门禁、交接可预览**。  
本文相对上一版，新增 **§2.9 加强项**（交接半自动、导入预览、局部查找替换、角色批量改名、本地撤销栈、大纲视图、运行互锁等），并为每个 Phase A/B 功能写了 **线框 + 改哪些文件 + 步骤 + 验收**。

---

## 1. 现状能力地图（已有，禁止重复造）

| 能力 | 锚点 | 说明 |
|---|---|---|
| Agent 技能轨 | `SKILL_CHIPS` + `runScriptDeskSkill` | 可用；引导弱 |
| 上传/粘贴成稿 | `entryMode==='ingest'` | 写入前无解析预览 |
| 首次选集浮层 | `.sd2-gen-float` | 选项 1/3/5/10/全部（无 2） |
| 底部续写弹层 | `.sd2-continue-pop` | 选项 1/2/3/5/10/全部 |
| 单集重写 | `handleRewriteEpisode` | **直接覆盖**，无 Diff |
| 清屏 | 右键 `.sd2-ctx-menu` | `window.confirm`，不成稿 |
| 重置/草稿/回收站 | `saveScriptDeskDraft` 等 | 无定时自动存 |
| Bible 抽取 + 场头兜底 | `extractBibleFromPackage` + `enrichBibleScenesFromPackage` | Bible UI 只读 |
| 设定就绪 | `AssetReadinessPanel` | 未确认有门禁；解锁后 `text-ink` 债 |
| 诊断 | `runConsistencyCheck` | 多需手动点 |
| 确认 / 送分镜 | `handleConfirm` / `handleHandoffToStoryboard` | 送分镜**不自动拆镜**，只 tip 提示手动 |
| 导出 MD/JSON/ZIP | ⋯ 菜单 | 无单集导出 |
| `@` 提及 | `.sd2-at-dropdown` | 可用 |
| 左右分割 | `.sd2-split` | 写入 `studioSplitPct` |

---

## 2. 缺口总表（含原列 + 新增）

优先级：`P0` 不上线会丢稿/卡死/错交付；`P1` 效率与专业感；`P2` 打磨。

### 2.1 流程与信息架构

| ID | 缺口 | P |
|---|---|---|
| F-01 | 步骤条装饰、不随状态 | P0 |
| F-02 | 技能轨 8 chip 过平 | P0 |
| F-03 | 「应用」无变更摘要 | P0 |
| F-04 | 「生成分集」与底浮层双入口文案打架 | P1 |
| F-05 | 顶栏纯 icon 难发现 | P1 |
| F-06 | 已确认仍显示「确认成稿」ghost | P1 |
| F-07 **新增** | 空台冷启动只有技能文案，无「三选一」入口 | P1 |
| F-08 **新增** | 编辑已确认成稿时静默 `unconfirmIfEdited`，无顶栏 banner | P0 |

### 2.2 成稿运维

| ID | 缺口 | P |
|---|---|---|
| E-01 | 无删集 | P0 |
| E-02 | 无插空集 | P1 |
| E-03 | 无集号导航 | P1 |
| E-04 | 目标集数 UI 不可见/不可改 | P0 |
| E-05 | 重写直接覆盖 | P0 |
| E-06 | 多集续写不可停 | P0 |
| E-07 | 部分失败不可「只重试失败」 | P1 |
| E-08 | 无字数/场景数 | P2 |
| E-09 **新增** | 无拖拽重排集序 | P2 |
| E-10 **新增** | 无「大纲视图」 | P1 |
| E-11 **新增** | 无单集复制/导出 | P2 |
| E-12 **新增** | 首次浮层选项与续写不一致（缺「2」） | P2 |

### 2.3 对话 / Agent

| ID | 缺口 | P |
|---|---|---|
| C-01 | 无停止 | P0 |
| C-02 | pending 无丢弃 | P0 |
| C-03 | 多 pending 并存 | P1 |
| C-04 | 清屏用 `window.confirm` | P2 |
| C-05 | 对话无搜索/折叠 | P2 |
| C-06 | 无流式 | P1 |
| C-07 **新增** | 「清空会话」与右键「清屏」重复 | P2 |
| C-08 **新增** | 运行中可点草稿/重置导致竞态 | P0 |

### 2.4 Bible / 就绪

| ID | 缺口 | P |
|---|---|---|
| B-01 | Bible 只读 | P0 |
| B-02 | 不能删/合并 draft | P1 |
| B-03 | 卡片不能跳资产库 | P1 |
| B-04 | 世界观不可编 | P1 |
| B-05 | 确认前不提醒抽场景 | P0 |
| B-06 | 就绪面板 `text-ink` 不可见 | P0 |
| B-07 | 送分镜不校验就绪 | P0 |
| B-08 **新增** | 角色全局改名（成稿+Bible 同步） | P1 |

### 2.5 诊断

| ID | 缺口 | P |
|---|---|---|
| D-01 | 生成后不自动诊断 | P1 |
| D-02 | 诊断不能跳到集 | P1 |
| D-03 | 一键修边界不清 | P2 |
| D-04 | 无体例 format-linter | P1 |

### 2.6 草稿 / 持久化

| ID | 缺口 | P |
|---|---|---|
| S-01 | 无定时自动存 | P0 |
| S-02 | 无 beforeunload / 关台提示 | P0 |
| S-03 | 草稿不可重命名 | P1 |
| S-04 | 草稿无预览 | P2 |
| S-05 | 列表不显示来源 block | P2 |
| S-06 **新增** | 无「当前工作草稿」upsert（每次自动存 new id 会爆炸） | P0 |

### 2.7 交接

| ID | 缺口 | P |
|---|---|---|
| H-01 | 交接无预览 checklist | P1 |
| H-02 | 无回程状态 | P2 |
| H-03 | 画布卡信息弱 | P2 |
| H-04 **新增** | 送到分镜只 focus/spawn，用户须手动「从成稿拆镜」 | P1 |
| H-05 **新增** | handoff 不带集范围 | P2 |

### 2.8 工程

| ID | 缺口 | P |
|---|---|---|
| Q-01 | ScriptDeskBlock ~1600+ 行 | P0 工程 |
| Q-02 | 仅 render 冒烟 | P0 |
| Q-03 | runner 无 `AbortSignal` | P0 |
| Q-04 | 错误无结构化 code | P1 |

### 2.9 二修新增加强项（上一版未列细）

| ID | 加强项 | 价值 | P |
|---|---|---|---|
| X-01 | **导入解析预览**：写入前先列出将识别的集 | 防一键写坏 | P1 |
| X-02 | **成稿内查找替换** | 长剧改词 | P1 |
| X-03 | **本地撤销栈**（最近 20 次 package） | 误操作可救 | P1 |
| X-04 | **爆点轨可编辑** `brief.hooks[]` | Brief 闭环 | P2 |
| X-05 | **生成中骨架占位**（推荐 UI state，不写 package） | 过程感 | P1 |
| X-06 | 顶栏只读显示当前文字模型名 | 降低困惑 | P2 |
| X-07 | 单集字数目标注入续写提示 | 节奏 | P2 |
| X-08 | 批量选中重写 | 专业返工 | P2 |
| X-09 | **关闭 Modal 自动 upsert 工作草稿** | 防丢 | P0 |
| X-10 | 剪贴板含「第N集」时一键填入 ingest | 效率 | P2 |

---

## 3. 目标态主路径

```text
空台三选一 → Brief（应用）→ 生成分集（可停）→ 审稿（改/重写Diff/续写/删）
→ 抽取Bible → 确认（可先抽取）→ 设定就绪 → 送分镜checklist → 分镜台（高亮拆镜）
```

**默认产品决策（未另拍板则按此实现）**：送分镜可「仍要送出」；重写走 pending Diff；技能三段；定时+关台 upsert；本迭代做删集；步骤条状态机；送分镜后只高亮拆镜、不自动跑 LLM。

---

# 4. 施工说明书（DeepSeek 逐 ID）

> 每个 ID：**现状锚点 / UI 线框 / 改动文件 / 实现步骤 / 禁止 / 验收**。

---

## 4.1 S-01 + S-06 + X-09 · 自动工作草稿（P0）

### 现状锚点
- `saveScriptDeskDraft` 每次 `createScriptDeskFolderSnapshot` 都 **new id**。  
- `ScreenModal onClose={() => setStudioOpen(false)}` 无存盘。

### UI
无新大弹窗。tip：`已自动保存到草稿「工作中 · 《剧名》」`（复用 `showTimedTip`）。

### 改动文件
1. `packages/shared/src/utils/script-desk-archives.ts`  
2. `apps/web/src/stores/workspace-document.ts`  
3. `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`

### 实现步骤
1. `ScriptDeskFolderSnapshot` 增加：`kind?: 'manual' | 'autosave'`；`workingKey?: string`（=`sourceBlockId`）。  
2. 新增 `upsertScriptDeskWorkingDraft(input)`：按 `kind==='autosave' && workingKey===blockId` **原地更新**；没有则 create。  
3. `ScriptDeskBlock`：`hasDraftMemory && studioOpen` 时每 60s upsert；或对 pkg debounce 8s。  
4. `onClose`：先 upsert，再关。  
5. 草稿列表 autosave 显示标签「自动」。

### 禁止
- 每次自动存都 new 文件夹。

### 验收
- 关台或等 60s，草稿箱同一条「自动」更新；刷新可恢复；重置勾选的手动草稿仍是新文件夹。

---

## 4.2 S-02 · 离开提示（P0）

### UI
`beforeunload`；关 Modal 若 dirty → 项目确认框「关闭前保存到草稿？」是/否/取消。

### 改动文件
- `ScriptDeskBlock.tsx`（可抽 hook，同目录）

### 实现步骤
1. `dirty`：savePkg/session 变更置 true；upsert 成功置 false。  
2. 注册 `beforeunload`。  
3. 关 Modal：dirty 则确认；取消则保持打开。

### 验收
- 有内容刷新有提示；关台取消则 Modal 仍开。

---

## 4.3 Q-03 + C-01 + E-06 · Abort 停止（P0）

### 现状
runner / `api.agent.*` 无 `signal`；busy 时发送钮只转圈。

### UI
```text
[ textarea ] [ 停止 ]          ← busy
对话底固定条：续写中 第 2/5 集…  [停止续写]
```

### 改动文件
1. `apps/web/src/api/client.ts` — request 可选 `signal`  
2. `apps/web/src/engine/script-desk-runner.ts` — `runAppendEpisodeSkill` / `runRewriteEpisodeSkill` / `runScriptDeskSkill` 等传 signal  
3. `ScriptDeskBlock.tsx` — `abortRef`  
4. `script-desk.v2.css` — `.sd2-stop-bar`（可选）

### 实现步骤
1. 开跑前 `new AbortController()`，旧的先 abort。  
2. 循环每集检查 `signal.aborted`。  
3. `AbortError`：tip「已停止」；**保留已成功集**；写 system 消息。  
4. 发送钮 busy 时变「停止」。

### 禁止
- 停止后回滚已成功集。

### 验收
- 续写 5 集，第 2 集停止 → 已成功集仍在，可再续写。

---

## 4.4 F-03 + C-02 + C-03 · Apply 摘要 / 丢弃（P0）

### 现状
仅按钮「应用此步产出」；`applyPendingMessagePatch` 直接合并。

### UI
```text
┌ 将写入 ──────────────────┐
│ brief.title ← 「…」       │
│ episodes: 无变更          │
│ bible.characters: +2      │
└──────────────────────────┘
[应用] [丢弃] [展开 JSON]
```

### 改动文件
1. `packages/shared/src/types/screenplay-package.ts` — `summarizePackagePatch(pkg, patch): string[]`  
2. `ScriptDeskBlock.tsx` + `script-desk.v2.css`（`.sd2-msg__patch-sum`）

### 实现步骤
1. 气泡渲染摘要。  
2. 丢弃：清除该消息 `pendingPatch`（或 `discarded:true`，改类型则导出）。  
3. C-03：**推荐**存在未应用 pending 时禁止再发送并 tip。

### 验收
- 看得见改什么；丢弃 package 不变；有 pending 时不能连发（若按推荐）。

---

## 4.5 E-01 · 删集（P0）

### UI
```text
▸ 第3集 · 旧疤  [↻] [⋯]→ 删除本集
```

### 改动文件
- shared：`removeScreenplayEpisode(pkg, episodeId)`（删后重排 index 1..n）  
- `ScriptDeskBlock.tsx` + `.sd2-ep__menu`

### 实现步骤
1. `confirmDelete` 后删除；若曾确认则 `unconfirmIfEdited`。  
2. **不要**自动把 `brief.episodeCount` 降到当前长度（目标集数是规划）。

### 验收
- 3 集删第 2 → 剩 index 1、2；确认态失效。

---

## 4.6 E-04 · 目标集数（P0）

### UI
```text
| 剧名 | logline | 目标集数 [10] |
```
`.sd2-brief-row` 三列：`1fr / 1.4fr / 88px`。

### 实现
number `min=1 max=50` → `brief.episodeCount`；续写/首次「全部」预览显示将新增数。

### 验收
- 目标 8、当前 3，「全部」预览新增 5。

---

## 4.7 E-05 · 重写 pending Diff（P0）

### 现状
`handleRewriteEpisode` 成功直接 `savePkg`。

### 实现
1. 成功后 **只** `appendAgentMessage` + `pendingPatch`（替换该集）。  
2. 用户应用才写入；丢弃保留旧文。  
3. 走 Abort（4.3）。

### 验收
- 重写结束正文未变直到应用。

---

## 4.8 B-05 · 确认前 Bible 提醒（P0）

### 改 `handleConfirm`
1. 先 `enrichBibleScenesFromPackage`。  
2. 人物+场景都空 → 询问是否先 `extractBibleFromPackage`。  
3. 仅补到场景时 tip 告知补了 N 个。

### 验收
- 空 Bible 确认会询问。

---

## 4.9 B-07 + H-01 · 送分镜 checklist（P0/P1）

### UI
```text
┌ 送到分镜台 ───────────────┐
│ ✓ 已确认 · 8 集 · xx 字   │
│ ⚠ 就绪缺口：角色2/场景1   │
│ [取消] [仍要送出] [去就绪] │
│ 就绪时主按钮：[确认送出]   │
└───────────────────────────┘
```

### 改 `handleHandoffToStoryboard`
未确认只 tip；已确认开 `handoffOpen`；未就绪须「仍要送出」或先去设定就绪。

### 验收
- 不能静默一键送出带缺口稿（除非显式「仍要送出」）。

---

## 4.10 F-01 · 步骤条状态化（P0）

### 逻辑
```ts
hasBrief = isBriefReadyForFirstGen(pkg)
hasEps = episodes.length > 0
confirmed = status === 'confirmed'
// done/on 按序；点击跳输入框 / 成稿 Tab / tip 去确认
```
CSS 增 `.is-done`。

### 验收
- 有分集未确认 → 2 done、3 on。

---

## 4.11 F-08 · 确认失效 Banner（P0）

### UI
tabs 下：`⚠ 成稿已修改，确认已失效，送分镜前请重新确认`  
触发：prev confirmed → next 非 confirmed。再次确认后关闭。顶栏 CTA 回到「确认成稿」。

### 验收
- 确认后改字出现 banner。

---

## 4.12 B-06 · 就绪样式（P0）

`AssetReadinessPanel.tsx` 去掉 `text-ink/*`；改用 `sd2-ready-*`（与 `.sd2-readiness-gate` 同系）。

### 验收
- 深色下标签/按钮清晰。

---

## 4.13 C-08 · 运行互锁（P0）

`busy || continueBusy || rewritingEpIndex!=null` 时禁用：草稿打开、重置、切 ingest、删草稿等。

### 验收
- 续写中重置按钮 disabled。

---

## 4.14 B-01 · Bible 可编辑（P0，建议早做）

卡片展开编辑 identity/personality/appearance；场景 location/summary/era；保存写 package；可删。

### 验收
- 保存后持久。

---

## 4.15 F-02 · 技能三段（P0）

```text
Brief｜选题 世界观 人物 剧情
成稿｜节奏 对白 爆点
质检｜一致性
```
不删除 skill id，只改展示；生成仍在顶栏。

---

## 4.16 H-04 · 送分镜高亮拆镜（P1）

handoff 增 `autoOpenBreakdown: true` + `sourceScriptBlockId`。  
分镜台开台：切到拆镜 Mode 并 **高亮**「从成稿拆镜」；**默认不自动跑 LLM**。

### 验收
- 送过去能看见拆镜入口高亮，不自动烧钱。

---

## 4.17 X-01 · 导入预览（P1）

「写入成稿」前用 `episodesFromIngestText` 列出将识别集；确认后再 `ingestScreenplayText`。

---

## 4.18 X-02 + B-08 · 查找替换 / 角色改名（P1）

成稿工具「查找」弹层；Bible「全局改名」→ shared `renameCharacterInPackage` + 单测（整词优先）。

---

## 4.19 X-03 · 撤销栈（P1）

`historyRef` 最大 20；每次 savePkg push prev；`Ctrl+Z` pop（注意与输入框冲突时仅在非 textarea 或用 Ctrl+Shift+Z 策略，文档实现时选：**仅当焦点不在 textarea/input 时 Ctrl+Z**）。

---

## 4.20 E-02 / E-03 / E-10 · 插集 / 导航 / 大纲（P1）

- `insertEmptyEpisodeAfter` + 重排 index  
- `#sd2-ep-{id}` scrollIntoView chips  
- 大纲 toggle：标题+首行，点击展开

---

## 4.21 D-01 + D-04 · 自动诊断 + format-linter（P1）

`lintScreenplayFormat(pkg)`：`【场景`、引号对白、非末集`（完）` → warn；生成/续写成功后合并进 diagnostics。

---

## 4.22 X-05 · 骨架占位（P1）

**推荐** `skeletonIndexes: number[]` 本地 state，不写 package；稿纸渲染假集行 `is-skeleton`。

---

## 4.23 S-03 · 草稿重命名（P1）

`renameScriptDeskDraft(id, title)`；**推荐同步** `package.brief.title`。

---

## 4.24 F-07 · 空台三选一（P1）

空消息且无草稿记忆时：
```text
[ Agent 共创 ] [ 上传成稿 ] [ 打开草稿 ]
```
替换/增强现有 `sd2-empty-hero`。

---

## 4.25 F-04 / F-06 · CTA 文案收口（P1）

- 无分集：右侧主按钮文案「打开选集」（只 `openFirstGenFloat`）  
- 已确认：顶栏主按钮只留「送到分镜」；确认失效见 F-08

---

## 4.26 Q-01 · 拆分（工程 P0，建议 Phase C 先做行为）

```text
script-desk/
  ScriptDeskHeader.tsx
  ScriptDeskChatStage.tsx
  ScriptDeskDraftDrawer.tsx
  ScriptDeskDraftsModal.tsx
  ScriptDeskContinuePop.tsx
  ScriptDeskGenFloat.tsx
  use-script-desk-controller.ts
ScriptDeskBlock.tsx  # 组装 <800 行
```
禁止夹带行为变更。

---

## 4.27 Q-02 · 测试（P0）

| 用例 | 断言 |
|---|---|
| `removeScreenplayEpisode` | index 重排 |
| `summarizePackagePatch` | 含 title 行 |
| upsert working draft | 二次 id 不变 |
| `lintScreenplayFormat` | 捕获【场景 |
| 组件/集成 | 停止钮、checklist、步骤条状态（mock runner） |

---

# 5. 原型变更总图

### 顶栏
```text
[生成|上传] [稿纸][诊断][Bible][草稿][重置] [确认|送分镜] [⋯]
```

### 步骤条
真实 `is-done` / `is-on`。

### 成稿
```text
剧名 | logline | 目标集数
[大纲][查找]  1 2 3 … chips
集行：标题 + 字数 + 重写 + ⋯
底：续写/打开选集
```

### 对话
摘要 Apply/丢弃；停止；进度。

### 送分镜
checklist 弹层。

---

# 6. 分期

**Phase A**：S-01/S-06/X-09, S-02, Q-03/C-01/E-06, F-03/C-02, C-08, E-01, E-04, E-05, B-05, B-07/H-01, F-01, F-08, B-06, Q-02  

**Phase B**：F-02, F-07, F-04/F-06, B-01/B-02/B-04, E-02/E-03/E-10, X-01, X-02/B-08, X-03, D-01/D-04, H-04, C-06, S-03, X-05  

**Phase C**：Q-01, F-05, 其余 P2  

---

# 7. 明确不做

智能最优集数；台内分镜线稿；多人协同；Bible CMS；重做设计体系；默认自动跑拆镜 LLM。

---

# 8. DoD

关台可恢复；可停止且保留成功集；Apply/重写可预览可丢弃；可删集+目标集数；送分镜 checklist；步骤条真实；确认失效 banner；Phase A 测试通过。

---

# 9. 拍板项（括号内为默认）

1. 送分镜就绪：B 可强制（默认）  
2. 重写：B Diff（默认）  
3. 技能轨：B 三段（默认）  
4. 自动存：B 定时+关台（默认）  
5. 删集：A 本迭代（默认）  
6. 步骤条：B 状态机（默认）  
7. H-04：只高亮不自动跑 LLM（默认）  

---

# 附录 A · 文件白名单

```text
apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
apps/web/src/blocks/nx9/script-desk.v2.css
apps/web/src/blocks/nx9/script-desk/**
apps/web/src/blocks/nx9/__tests__/ScriptDeskBlock.test.tsx
apps/web/src/engine/script-desk-runner.ts
apps/web/src/engine/asset-readiness.ts
apps/web/src/components/asset/AssetReadinessPanel.tsx
apps/web/src/api/client.ts
apps/web/src/stores/workspace-document.ts
packages/shared/src/types/screenplay-package.ts
packages/shared/src/utils/script-desk-archives.ts
packages/shared/src/index.ts
apps/server/test/test-screenplay-package.test.ts
# 仅 H-04：
apps/web/src/blocks/nx9/StoryboardDeskBlock.tsx 或对等 hook
```

# 附录 B · DeepSeek 系统提示词（整段复制）

见同目录用法：把下面「完整提示词」整段贴给 DeepSeek；把 `{ID_LIST}` 换成本次要做的 ID（推荐先 Phase A）。完整正文以仓库内本附录下方代码块为准（与对话下发版同步）。

```text
【角色】
你是 NX9 仓库的实现工程师（不是产品经理、不是架构顾问）。唯一任务：按施工文档把指定功能 ID 做完、做对、可验收。

【唯一权威文档】
docs/NX9-SCRIPT-DESK-PRODUCTION-GAP-ANALYSIS.md
（辅读已拍板 UX：docs/NX9-REQ-SCRIPT-DESK-LAYOUT-CONTINUE-UX.md、docs/NX9-REQ-SCRIPT-DESK-RESET-DRAFTS.md）
冲突时以 PRODUCTION-GAP 文档 §4 对应 ID 的「实现步骤 / 禁止 / 验收」为准。
用户当次消息里的 ID 列表 > 文档推荐顺序。

【本次任务】
只实现这些 ID：{ID_LIST}
（若用户写 Phase A，则等于文档推荐顺序那一整条 Phase A 列表，仍须按 ID 逐个完成与自检。）

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

【开工前强制步骤（不做不许写业务代码）】
1. 通读文档：DeepSeek 必读、§1 已有能力、本次每个 ID 的 §4 小节小节、附录 A 白名单、§9 默认拍板。
2. 在代码里定位锚点（必须打开文件确认，禁止凭记忆）：
   - apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
   - apps/web/src/engine/script-desk-runner.ts
   - apps/web/src/blocks/nx9/script-desk.v2.css
   - packages/shared/src/types/screenplay-package.ts
   - packages/shared/src/utils/script-desk-archives.ts
3. 输出「施工计划」短表后再编码：ID | 改哪些文件 | 复用哪些函数 | 验收怎么测。
4. 若文档某 ID 与代码现状冲突：先写清冲突点并停下问用户；禁止擅自改语义。

【硬约束 · 数据与行为】
1. 数据真相：node.data.package（ScreenplayPackage）+ node.data.agentSession；草稿在 workspace.scriptDeskDrafts。
2. 续写/首次生成必须追加集，禁止覆盖已有集；覆盖仅允许 E-05 且用户点「应用」pending Diff 之后。
3. 自动草稿必须 upsert 同一 workingKey（S-01/S-06）；禁止每次自动存 new 一个文件夹。
4. 停止生成必须 AbortSignal（Q-03/C-01/E-06）；停止后保留已成功集，禁止回滚成功集。
5. 送分镜未就绪须 checklist；允许「仍要送出」（§9 默认 B）；H-04 只高亮拆镜，禁止默认自动跑拆镜 LLM。
6. 设定就绪 / 稿纸深色 UI 只用 sd2-* token；禁止 text-ink/30、text-ink/50 等看不见的类。
7. 确认框优先 askConfirmWithOption / confirmDelete / ConfirmHost；新功能禁止再用 window.confirm（清屏 C-04 可顺手改，非本次 ID 则不要扩 scope）。
8. 改 packages/shared 后必须执行：pnpm --filter @nx9/shared build，再跑相关测试。

【硬约束 · 文件白名单】
只许改附录 A 列出的路径。禁止：
- 新建第二套编剧台/平行路由/新 Desk kind
- 大重构无关模块、改分镜台/导演台（除非本次 ID 含 H-04 且最小改动）
- 「顺便」格式化大文件、改无关命名、删已有能力
- 把 ScriptDeskBlock 拆文件（Q-01）除非本次 ID 显式包含 Q-01

【硬约束 · 禁止偷懒】
1. 禁止只改文案/CSS 冒充功能完成。
2. 禁止 TODO/占位实现、假按钮、console 空函数。
3. 禁止写「剩余下次再做」却把 ID 标成完成；未做完的 ID 必须在交付清单里标「未完成」。
4. 禁止跳过该 ID 文档里的验收项。
5. 每个 ID 做完必须对照文档验收句逐条打勾（在最终回复里）。
6. 禁止引入新依赖，除非用户明示。

【实现风格】
- 复用：runAppendEpisodeSkill、runRewriteEpisodeSkill、applyPendingMessagePatch、enrichBibleScenesFromPackage、inspectBibleAssets、saveScriptDeskDraft 现有链路。
- UI：扩现有 sd2-*；线框以文档 §4 / §5 为准，不要自行发明第三套布局。
- 类型：优先 shared 纯函数 + 单测；不要把业务逻辑只堆在 JSX。
- 一次提交逻辑清晰；Phase A 若一次做多 ID，按文档顺序，每完成 2～3 个 ID 自检一次。

【默认拍板（§9，用户未改口则照做）】
送分镜可「仍要送出」；重写 pending Diff；技能三段（若做 F-02）；定时+关台 upsert；做删集；步骤条状态机；H-04 不高亮以外的自动跑 LLM。

【自测最低集】
每完成涉及逻辑的 ID，至少做文档验收；涉及 shared 的补 apps/server/test/test-screenplay-package.test.ts 或 web __tests__。
Phase A 结束前：工作草稿 upsert、停止续写、Apply 丢弃、删集、目标集数、checklist、步骤条、确认失效 banner，能口述手动点选路径。

【最终交付格式（必须严格遵守）】
1. 完成的 ID 列表（逐个）
2. 每个 ID：改动文件路径 + 关键函数/组件名
3. 每个 ID：文档验收项打勾结果
4. 未做 / 发现但未改的问题（单独列出）
5. 如何手动点选验证（逐步）
6. 执行过的命令与结果摘要（build/test）
禁止长篇空谈架构；禁止把未做的写成已做。

【开始】
先输出施工计划短表，再开始改代码。用户说「直接干」才可省略计划中的等待，但仍必须在心里完成锚点核对。
```

# 附录 C · 资源紧时 Top5

1. S-01/S-06/X-09 工作草稿 upsert  
2. Q-03/C-01/E-06 停止  
3. F-03/C-02 Apply 摘要+丢弃  
4. E-01 + E-04 删集+目标集数  
5. B-07/H-01 送分镜 checklist  
