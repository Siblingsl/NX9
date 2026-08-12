# NX9 编剧台 · 第二轮深挖问题清单

> **日期**：2026-08-12（第一轮四项收口之后）  
> **范围**：编剧台节点（`ScriptDeskBlock` + `script-desk/` 子模块 + runner + 草稿/交接/配音下游）  
> **方法**：不再对旧台账对账（见 `NX9-SCRIPT-DESK-OPEN-LOOPS.md`），而是按「状态机一致性 / 数据联动 / 性能 / 体验」四个切面重新读代码找**新**问题；每项给证据锚点  
> **状态符号**：❌ 缺陷（可复现）· ⚠ 断点/风险 · ▫ 体验债 · ✅ 已修  
> **施工**：2026-08-12 已按 §5 顺序修复 1.1 / 1.2 / 2.1 / 1.3 / 3.1 / 2.2(a 同步库) / 4.x；3.2 拆分第二阶段（Header/Chat/Continue）与 3.3 错误码已补；旧账流式/批量/字数/对话运维一并落地

---

## 0. 一句话结论

第一轮收口后主链健康；本轮新发现 **3 个状态机/持久化缺陷、2 个联动断点、1 个性能风险**。最值得优先修的是：**确认失效 banner 误报**、**自动草稿定时器被键入重置（长会话崩溃丢稿窗口）**、**配音对白链路断**。

---

## 1. 缺陷（代码可证，建议开票）

### 1.1 ✅ P1 · 确认失效 banner 误报（跨稿状态泄漏）

- **现象**：只要本节点**曾经**出现过 confirmed 包，之后重置编剧台或打开另一份从未确认过的草稿，只要它有分集，顶部就会错误显示「成稿已修改，确认已失效，送分镜前请重新确认」。
- **原因**：`prevConfirmedRef` 只在 `pkg.status === 'confirmed'` 时置 `true`，**从不复位**：

```243:246:apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
  useEffect(() => {
    if (pkg.status === 'confirmed') prevConfirmedRef.current = true;
  }, [pkg.status]);
  const showUnconfirmBanner = pkg.status !== 'confirmed' && prevConfirmedRef.current && epCount > 0;
```

  而 `applyDeskSnapshot`（打开草稿）与 `resetDeskToEmpty`（重置）都不碰这个 ref。
- **修复**：在 `applyDeskSnapshot` 里 `prevConfirmedRef.current = folder.package.status === 'confirmed'`；在 `resetDeskToEmpty` 里置 `false`。
- **验收**：确认稿 A → 打开未确认草稿 B（有分集）→ 无 banner；B 内确认后改字 → banner 正常出现。

### 1.2 ✅ P1 · 自动草稿 60s 定时器被每次编辑重置

- **现象**：连续写作/连续对话时自动存**永远不触发**——真正兜底只剩「关台时 upsert」。浏览器崩溃、断电、进程被杀时，一整段活跃会话（可能几十分钟）全部丢失，S-01 的丢稿保护在最需要它的场景失效。
- **原因**：interval 所在 effect 依赖 `pkg`、`session`，任何一次键入/消息都会 `clearInterval` 重建，60 秒从头计：

```1331:1348:apps/web/src/blocks/nx9/ScriptDeskBlock.tsx
  useEffect(() => {
    if (!studioOpen || !hasDraftMemory) return;
    const id = setInterval(() => {
      const { isNew } = upsertScriptDeskWorkingDraft({
        package: pkg,
        // ...
      });
      // ...
    }, 60000);
    // ...
  }, [studioOpen, hasDraftMemory, pkg, session, entryMode, props.id, upsertScriptDeskWorkingDraft, showTimedTip]);
```

- **修复**：interval 只依赖 `studioOpen`/`hasDraftMemory`；用 `useRef` 持有最新 `pkg/session/entryMode`（或 `latestRef.current = {...}` 每渲染更新），定时器内部读 ref。
- **验收**：打开台后持续每 5 秒敲一个字，60 秒时草稿箱「工作中」条目的 savedAt 仍会更新。

### 1.3 ✅ P2 · 撤销栈按键级 push，Ctrl+Z 实际救不了大操作

- **现象**：`savePkg` 每次调用都 push 一份快照（上限 20），而正文 textarea、logline、爆点输入**每敲一个字都走一次 savePkg** → 栈里全是相邻键入快照。误删一集后，20 步撤销往往只能回退最近 ~20 个字符，救不回删集。
- **锚点**：`pushUndo` 在 `savePkg` 内无差别调用（`ScriptDeskBlock` ~262-271 行）；「修复历史脏数据」effect 的 `savePkg` 也会污染栈。
- **修复**：二选一——(a) 键入类保存合并快照（同一 episodeId 连续 body 变更 2 秒内只留一份）；(b) 只在结构性操作（删/插/重排/替换/改名/应用 patch/重写应用）push。
- **验收**：输入一句话后删除第 2 集 → 一次 Ctrl+Z 恢复该集。

---

## 2. 联动断点

### 2.1 ✅ P1 · 编剧台对白到配音台的链路是断的

- **现状**：`voice-cast` 只消费**自己节点**上的 `data.lines`：

```1509:1511:apps/web/src/engine/flow-runner.ts
  if (kind === 'voice-cast') {
    const lines = (d.lines as { speaker: string; text: string; emotion?: string }[]) ?? [];
    const profileMap = (d.profileMap as Record<string, string>) ?? {};
```

  而 `lines` 在全仓的唯一生产点是拆镜时写到 **storyboard 节点自己** 的 data（`script-breakdown-runner.ts` ~183 行 `lines: flat.flatMap((shot) => shot.dialogue)`）。`gatherUpstream`（`packages/shared/src/engine/flow-graph.ts`）不收集 lines，也没有任何 handoff 把对白拷到 voice-cast 节点。
- **后果**：把配音台连在编剧台/分镜台后面，一键运行时配音节点拿到空 lines，空转成功（或 UI 提示「无可解析的对白」）——编剧台写好的对白**到不了**配音。
- **修复（薄）**：`gatherUpstream` 增加收集上游 `lines`（storyboard 节点）/ 或 voice-cast 分支 fallback：`d.lines` 为空时从 `upstream.screenplayPackages[0]` / 上游 storyboard `lines` 抽取；顺带在 VoiceCastBlock UI 显示对白来源。
- **验收**：编剧台 → 分镜台（已拆镜）→ 配音台连线，一键运行后配音台列出对白并逐条出音频。

### 2.2 ✅ P2 · 人物全局改名联动素材库（方案 a）

- **已修**：改名时 `findLibraryCharacterForRename` 匹配私有库档案 → 冲突拦截 → `renameLibraryCharacterProfile`（旧名写入 aliases）+ `upsertCharacter`；跳转优先 `libraryCharacterId`，并经 `resolveLibraryItemId` 解析。
- **验收**：改名后素材库跳转不落空；档案名同步，旧名可作别名兜底。

---

## 3. 性能 / 工程风险

### 3.1 ✅ P1（工程） · 逐键全量落盘 + 全树重渲染

- **已修**：正文/剧名/logline/爆点/设定卡 debounce 300ms；撤销 typing 2s 合并；`compactAgentSession` / `discardPendingMessagePatch` 去掉已应用/已丢弃的 pendingPatch 全文。
- **验收**：长剧键入不卡；会话推进中 node data 不因 pending 正文单调暴涨。

### 3.2 ✅ P2 · 拆分第二阶段（部分）

- **已修**：抽出 `DeskHeader` / `ChatStage` / `ContinuePop`；主文件约 **2,188** 行（controller 仍在主文件，未抽 `use-script-desk-controller`，目标 <1,200 仍可继续）。
- HMR 风险下降但仍高于目标体积。

### 3.3 ✅ P2 · runner 错误结构化 code（Q-04）

- **已修**：`ScriptDeskErrorCode` + `classifyScriptDeskError` / `formatScriptDeskError`；UI catch 统一带 hint（限流/超时/审核/空输出等）。

---

## 4. 体验债（小，攒一票顺手修）✅ 已修

| # | 项 | 锚点/说明 |
|---|----|-----------|
| 4.1 | 打开另一份草稿时，当前内容用 `saveScriptDeskDraft`（每次**新建**文件夹）而非 upsert 工作草稿 —— 频繁切换草稿会堆出一排「自动存」文件夹 | `handleOpenDraftFolder`（~1445 行）；建议改 `upsertScriptDeskWorkingDraft` |
| 4.2 | ✅ 集列表展开状态抬到 `ScriptDeskBlock`（`openEpIds`），切 tab 不丢；`scrollToEpisode` 会自动展开 | `ScriptDeskBlock` + `ScreenplayPanel` |
| 4.3 | `beforeunload` 常驻注册（与 studioOpen 无关）；dirty 只在台内置位，影响小但可收进 studioOpen 生命周期 | S-02 effect |
| 4.4 | 改名确认框统计的「影响处数」只算正文+集标题，实际还会改设定卡字段（identity/relationships 等），提示口径略小于实际 | `handleRenameCharacter` hitCount |
| 4.5 | 诊断点击高亮按 name 匹配（`highlightedBibleId === c.name`），场景另兼容 code；人物无 code 兼容 | `handleDiagClick` + `BiblePanel` 高亮判定 |

---

## 5. 建议施工顺序

| 序 | 票 | 预估 | 理由 |
|----|----|------|------|
| 1 | 1.1 banner 误报 | 极小（2 行复位） | 状态机假警报，直接动摇 F-08 可信度 |
| 2 | 1.2 自动存定时器 | 小（ref 化依赖） | 丢稿保护在最需要时失效 |
| 3 | 2.1 配音对白链路 | 中 | 编剧台下游交付断点，出片主链的一段 |
| 4 | 1.3 撤销栈粒度 | 小-中 | 「可后悔」承诺兑现 |
| 5 | 3.1 逐键落盘 debounce | 中 | 长剧可用性 |
| 6 | 2.2 改名联动库（需拍板） | 中 | 先做 b（提示），a 等产品定 |
| 7 | 4.x 体验债一票 + 3.2 拆分第二阶段 | 中 | 排空后做 |

---

## 6. 与既有文档关系

| 文档 | 角色 |
|------|------|
| `NX9-SCRIPT-DESK-PRODUCTION-GAP-ANALYSIS.md` | 第一轮缺口 ID 台账（已基本兑现） |
| `NX9-SCRIPT-DESK-OPEN-LOOPS.md` | 第一轮复核 + 四项收口进度（查找替换失效/改名/回程状态/拆分测试） |
| **本文** | **第二轮深挖：状态机/持久化/联动/性能的新问题** |

前一轮已列且未动的项（流式 C-06、对话搜索 C-05、模型名 X-06、批量重写 X-08、字数目标 X-07、错误码 Q-04）**不在本文重复开票**，状态以 `NX9-SCRIPT-DESK-OPEN-LOOPS.md` 为准。

---

## 7. 验收口诀

1. 换稿/重置后 banner 不说谎。  
2. 连续写一小时，拔电源最多丢 60 秒。  
3. 配音台接在编剧台链上就能拿到对白。  
4. 删一集，一步 Ctrl+Z 救回来。  
5. 十集长剧打字不卡手。  
6. 改名之后，素材库那头有说法（跳转不落空，或有明确指引）。
