# NX9 编剧台 · 第三轮深挖问题清单

> **日期**：2026-08-12  
> **输出目录**：`docs/8.12/`  
> **范围**：编剧台节点（`ScriptDeskBlock` + `script-desk/*` + `script-desk-runner` + pending/撤销/自动存/下游交接）  
> **方法**：在第二轮深挖与后续收口之后，**不再对旧台账重复开票**；按「数据一致性 / 状态机与竞态 / 持久化诚实性 / 联动边界」四切面重读**现行代码**找新问题  
> **状态符号**：❌ 缺陷（可复现）· ⚠ 断点/风险 · ▫ 体验债  
> **对照**：`NX9-SCRIPT-DESK-OPEN-LOOPS.md`、`NX9-SCRIPT-DESK-DEEP-AUDIT-2026-08-12.md`（其中已修项本文不重复）

---

## 0. 一句话结论

主链（写 / 确认 / 送分镜 / 键入 debounce / 流式 / 改名同步库）可用。本轮新发现的核心不是「缺按钮」，而是 **pending 成稿补丁的合并语义错误**、**关台/自动存读不到 debounce 本地草稿**、**批量重写用闭包旧 session 互相覆盖**——会在「看起来成功」的路径上静默丢字或丢待应用产出。

| 优先级 | 数量 | 代表项 |
|--------|------|--------|
| ❌ P0/P1 | 3 | pending 整表替换抹掉并发编辑；debounce 未进自动存/关台稿；批量重写冲掉先前 pending |
| ⚠ P1/P2 | 4 | 撤销不同步 session；重写无 pending 互锁；重试失败换 episode id；Ctrl+Z×本地草稿打架 |
| ▫ 工程/体验 | 若干 | 主文件仍 ~2.2k 行；Agent 技能轨未流式；选中集幽灵 id 等 |

---

## 1. 缺陷（代码可证，建议开票）

### 1.1 ❌ P0 · 应用「重写/生成」pending 时整表替换 episodes，抹掉并发编辑

- **现象**：对某一集点「重写」→ 产出 pending → 期间用户又改了**另一集**正文（或改了同集但未进 patch 快照的内容）→ 点「应用」后，并发编辑**消失**，回到重写发起时的快照。
- **原因**：`runRewriteEpisodeSkill` / `runAppendEpisodeSkill` 的 `patch.screenplay.episodes` 是**基于发起时 pkg 的完整集列表**（只改目标集或追加一集）。`applyPackagePatch` 对 episodes 是**整表覆盖**，不是按 `episode.id` 合并：

```1197:1201:packages/shared/src/types/screenplay-package.ts
  const nextScreenplay = p.screenplay
    ? {
        sourceType: p.screenplay.sourceType ?? pkg.screenplay.sourceType,
        episodes: p.screenplay.episodes ?? pkg.screenplay.episodes,
      }
    : pkg.screenplay;
```

```511:525:apps/web/src/engine/script-desk-runner.ts
  const episodes = pkg.screenplay.episodes.map((ep) =>
    ep.index === options.episodeIndex ? { ...ep, title: ..., bodyMd: replacement.bodyMd, ... } : ep,
  );
  return {
    ...
    patch: withSceneDraftsFromEpisodes(pkg, { screenplay: { ...pkg.screenplay, episodes } }),
  };
```

- **后果**：破坏「改得明」——用户以为 Apply 只写入本集 Diff，实际是时间旅行回滚其它集。批量重写多条 pending 时更严重：后应用的 patch 会覆盖先应用的重写结果（见 1.3）。
- **修复方向**（择一，推荐 a）：
  - **(a)** pending 只带「目标集增量」（`{ id, index, title, bodyMd }`），`applyPackagePatch` 按 id/index **upsert 单集**；
  - **(b)** Apply 前用当前 pkg 与 patch 做三路合并，冲突则弹确认；
  - **(c)** 存在未应用 pending 时锁定成稿编辑（体验重，不优先）。
- **验收**：改第 2 集 → 重写第 1 集并应用 → 第 2 集改动仍在；先后应用两集重写 pending → 两集新文都在。

---

### 1.2 ❌ P1 · debounce 本地草稿未进入自动存 / 关台工作草稿（丢稿窗口）

- **现象**：正文/剧名等经 `useDebouncedField` 本地 `draft`，300ms 后才 `onCommit` → `savePkg`。自动存 60s 与关台 upsert 读的是 `latestDraftRef.current.pkg` / 渲染期 `pkg`，**不包含**尚未 flush 的本地字。
- **加重**：自动存成功后执行 `dirtyRef.current = false`（`ScriptDeskBlock` 自动存 effect）。若用户一直在输入框聚焦键入，dirty 可能从未被置位（dirty 只在 `onCommit`/`patch*` 路径置 true）→ 关台**不弹**「保存到草稿？」→ upsert 一份**缺最后按键**的工作草稿 → 再从草稿打开丢字。

```1503:1516:apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
  // S-01: 自动工作草稿…
  const id = setInterval(() => {
    const cur = latestDraftRef.current;
    const { isNew } = upsertScriptDeskWorkingDraft({ package: cur.pkg, ... });
    ...
    dirtyRef.current = false;
  }, 60000);
```

```46:52:apps/web/src/blocks/nx9/script-desk/use-debounced-field.tsx
  useEffect(() => () => {
    // 卸载才 flush —— 关台先 upsert 再卸面板时，草稿已写成旧 pkg
    if (draftRef.current !== committedRef.current) {
      onCommitRef.current(draftRef.current);
    }
  }, []);
```

- **时序**：关台 upsert（旧 pkg）→ `setStudioOpen(false)` → 面板卸载 flush 进 **node data**（新正文在节点上）→ **工作草稿仍旧**。崩溃后若只恢复草稿箱，丢最近输入。
- **修复**：
  1. 关台 / 自动存前提供 `flushAllDebouncedFields()`（或对 Screenplay/Bible 面板暴露 imperative flush）；
  2. 键入开始即 `dirtyRef.current = true`（不必等 commit）；
  3. 自动存**不要**在「可能仍有本地 draft」时盲目清 dirty，或清 dirty 前先 flush。
- **验收**：正文连续输入中等自动存触发 → 打开「工作中」草稿含最后字符；输入后立刻关台选保存 → 草稿含最后字符。

---

### 1.3 ❌ P1 · 批量重写：闭包旧 `session` 覆盖，先前 pending 丢失；且与 1.1 叠加

- **现象**：勾选多集「重写所选」→ 依次 `await handleRewriteEpisode`。第一集 pending 写入 node 后，第二集仍用**创建回调时的旧 `session`** 做 `appendAgentMessage`，再 `updateNodeData({ agentSession: nextSession })`，把第一集的待应用消息**冲掉**。

```1075:1143:apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
  const handleRewriteEpisode = useCallback(async (episodeIndex: number) => {
    ...
    let nextSession = appendAgentMessage(session, { ... }); // session 来自闭包
    ...
    nextSession = appendAgentMessage(nextSession, { pendingPatch: result.patch, ... });
    updateNodeData(props.id, { agentSession: nextSession, status: 'success' });
  }, [..., session, ...]);

  const handleBatchRewrite = useCallback(async () => {
    ...
    for (const idx of indexes) {
      await handleRewriteEpisode(idx);
    }
  }, [..., handleRewriteEpisode, ...]);
```

- **另**：单集重写**不**检查「是否已有 pending」（对比 `handleAgentSend` 的 `hasPending` 互锁），批量更易堆出多条整表 patch，叠加 1.1 后 Apply 顺序决定谁活谁死。
- **修复**：
  - 批量重写改为**本地累加 `nextSession`**（与首次生成/续写循环同构），或每次从 `nodeData.agentSession` / ref 读最新；
  - 存在未应用 pending 时禁止再开重写，或批量改为「一集一应用」流水线；
  - 与 1.1 增量 patch 一并做。
- **验收**：批量重写 3 集 → 对话区可见 3 条待应用；全部应用后三集正文均为新稿且无互相覆盖。

---

## 2. 状态机 / 一致性风险

### 2.1 ⚠ P1 · Ctrl+Z 只回滚 package，不同步 `agentSession`

- **现状**：`undoStackRef` 仅存 `ScreenplayPackage[]`；`savePkg` 的 undo 不快照 `agentSession`。
- **场景**：应用重写 pending（成稿变新、消息标「已应用」、pending 已瘦身删掉）→ Ctrl+Z → **正文回到旧稿**，对话仍显示「已应用」、无 pending 可再应用 → 「改得明 / 可后悔」语义断裂。
- **修复**：undo 栈改为 `{ package, agentSession? }`；或 Apply 时禁止/提示「应用后撤销只回正文」；结构性 Apply 推栈时同时压 session 快照。
- **验收**：应用重写 → Ctrl+Z → 正文与消息态一致（同回或明确不可撤 Apply）。

### 2.2 ⚠ P2 · 输入框内结构性 Ctrl+Z 与 debounce 本地 draft 打架

- **现状**：焦点在 TEXTAREA 时，若 `lastUndoRef.mode !== 'typing'`，会 `preventDefault` 并弹出台级 package 撤销；本地 `draft` 仍显示撤销前敲的字，失焦/定时 `onCommit` 可能把旧键入写回**已撤销后的包**。
- **修复**：台级撤销前 `flush` 或丢弃聚焦字段的 local draft（重置为 committed）；或输入框内结构性撤销改为显式快捷键（如 Ctrl+Shift+Z）避免与原生撤销抢。
- **验收**：删集后焦点仍在其它集正文框 → Ctrl+Z 恢复该集，且输入框不把幽灵字符写回。

### 2.3 ⚠ P2 · 「重试失败集」删除后重生成会换掉 `episode.id`

- **现状**：`handleRetryFailed` 按 index **滤掉**旧集再 `runAppendEpisodeSkill`；append 使用新 id：``ep-${Date.now()}-${index}``。
- **后果**：若下游分镜/资产以 episode id 钉住，重试成功后变成「新集」→ 同步/增量拆镜可能整集当新增或丢绑定（取决于分镜侧是否只认 index）。
- **修复**：重试应保留原 `id`/`index`，只替换 `bodyMd`（走 rewrite 语义或 append 时传入 stable id）；滤集时不要静默改身份。
- **验收**：记下失败集 id → 重试成功 → id 不变，分镜侧仍认同一集。

### 2.4 ⚠ P2 · 确认成稿 / 送分镜不 flush debounce

- **现状**：`handleConfirm` / handoff checklist 读当前 `pkg`；若剧名/logline/某集正文仍在本地 draft，确认包与送出的 hash **偏旧**，随后 flush 又改包 → 立刻「确认失效」或分镜 hash 变 stale。
- **修复**：确认与送分镜前强制 flush（同 1.2）。
- **验收**：改 logline 后 100ms 内点确认 → 确认包含新 logline；送分镜 hash 与随后未再编辑时的同步态一致。

---

## 3. 联动 / 边界

### 3.1 ▫ P2 · 改名只同步**私有**素材库，公共库档案不改

- **现状**：`handleRenameCharacter` 只用 `workspaceCharacters` + `upsertCharacter`；公共库命中不会改名。跳转 `resolveLibraryItemId` 在公私合并列表上找，公共旧名仍可能「能打开但名不一致」。
- **修复**：产品定：公共库只读提示 / 或提供「另存私有并改名」。
- **验收**：仅私有档案改名前后跳转与设定就绪一致；公共命中有明确文案。

### 3.2 ▫ P2 · 未应用 pending 内仍是旧角色名

- **现状**：全局改名改当前 package；已生成未应用的 `pendingPatch` 全文仍是旧名。Apply 后可能把旧名写回（再叠加 1.1 整表替换）。
- **修复**：改名时遍历 session 未应用 patch 做同规则替换；或改名时禁止存在 pending。
- **验收**：重写 pending 未应用时改名 → Apply 后正文为新名。

### 3.3 ▫ 体验 · Agent 技能轨（选题/人物等）仍非 SSE

- **现状**：分集生成/续写/重写已 `scriptScreenplayStream`；`runScriptDeskSkill` → `api.scriptDeskChat` 仍整包返回，长技能等待黑盒。
- **修复**：后置；与 C-06 同类，勿与 1.x 混做。

---

## 4. 工程债（不阻断出片，但放大上述风险）

| # | 项 | 说明 |
|---|----|------|
| 4.1 | 主文件仍 ~2,188 行 | Header/Chat/Continue 已抽；controller 未抽 hook，HMR `lazy→undefined` 风险仍高于目标 &lt;1,200 |
| 4.2 | `clearSession` 死代码 | 清屏走内联 `updateNodeData`；`clearSession` 未使用 |
| 4.3 | `selectedEpIds` 不随删集清理 | 父级未在 episodes 变化时滤 id（`openEpIds` 有滤）；幽灵选中影响「已选 N」展示 |
| 4.4 | 受控 `<details onToggle preventDefault>` | 部分浏览器对 toggle+preventDefault 行为不一致；展开态偶发与 `openEpIds` 不同步（需真机回归） |
| 4.5 | 组件级测例不足 | 有 helpers/面板测；**无**「Apply pending 不抹其它集」「批量重写保留多 pending」「关台 flush」回归锁 |

---

## 5. 建议施工顺序

| 序 | 票 | 预估 | 理由 |
|----|----|------|------|
| 1 | **1.1** pending 按集增量合并 | 中 | 静默丢其它集编辑，信任崩坏 |
| 2 | **1.2** 关台/自动存前 flush + dirty 键入即亮 | 小-中 | 丢稿保护再次在「正在打字」时说谎 |
| 3 | **1.3** 批量重写累加 session + pending 互锁 | 小-中 | 新做的批量入口当前不可靠 |
| 4 | 2.4 确认/送分镜前 flush | 极小 | 与 1.2 同一次做 |
| 5 | 2.1 撤销栈带 session 或限制 Apply 撤销语义 | 中 | 「可后悔」与消息态对齐 |
| 6 | 2.3 重试保留 episode id | 小 | 避免下游钉 id 断裂 |
| 7 | 2.2 / 3.x / 4.x | 小-中 | 排空后扫 |

---

## 6. 与既有文档关系

| 文档 | 角色 |
|------|------|
| `docs/NX9-SCRIPT-DESK-OPEN-LOOPS.md` | 第一轮缺口与收口进度 |
| `docs/NX9-SCRIPT-DESK-DEEP-AUDIT-2026-08-12.md` | 第二轮：banner / 自动存 timer / 配音链路 / 撤销粒度 / debounce 引入 / 改名方案 a 等（**已修**） |
| **`docs/8.12/NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md`（本文）** | **第三轮：pending 合并语义、debounce×持久化、批量重写竞态、撤销×session** |

第二轮已宣称修复的「键入 debounce / pending 瘦身」仍然成立；本轮指出的是 **debounce 与自动存/关台的接缝**，以及 **pending 瘦身之前「整表 patch」本身的合并错误**——属新发现，不是旧票未勾。

---

## 7. 验收口诀（本轮）

1. 重写一集再应用，**别的集手改不能丢**。  
2. 打字打到一半触发自动存或关台，**草稿箱要有最后几个字**。  
3. 批量重写三集，**三条 pending 都在**，全应用后三集都是新稿。  
4. 应用后若允许 Ctrl+Z，**正文与对话态不能各说各话**。  
5. 重试失败集，**episode id 不换皮**。
