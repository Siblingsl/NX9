# NX9 深度未闭环问题清单（第四轮代码深挖）

> **日期**：2026-08-12  
> **落点**：`docs/8.12/`（本文件）  
> **方法**：在第一～三批假成功 / 链隔离 / 体验收口之后，**重新读代码找现行断点**；不以旧台账「未复核」口号开票，也不把已销票项再写一遍当缺口。  
> **范围**：节点执行层、五大台、生成节点、渲染/网关、素材库工程债、捏模台、台账漂移  
> **判定**：❌ 断点 · ⚠ 半闭环 / 风险 · 🧟 死代码 · 🏗 工程债 · ⏸ 产品后置 · ✅ 本轮核实已闭环（勿再开票）  
> **原则**：以「生产可验收」为准——字段在 / 按钮在 / 文档写过 ≠ 闭环

---

## 0. 一句话结论

假成功主战场（BGM 黑片、HyperFrames 取消竞态、sound-gen 无视模式、剪辑台画布假成功、电商包空产物）**已在工作树收口**。  
当前真正还在的问题，集中在五类：

1. **遗留 kind 仍能「绿勾但不出片」**（`seedance-chain` / `variant-fork` / 部分旁路）  
2. **视频活跃路径之外仍有旁路与死卡漂移**（`motion-story`→`clip-chain-runner`、`ClipGenBlock.run`、孤儿 UI）  
3. **任务恢复 / 轮询通道诚实度不足**（provider 绑定、旧任务后到）  
4. **巨型单文件工程债**（素材库模态 **3522** 行已超过分镜台 **3264** 行）  
5. **产品能力半成品**（捏模台 P2/P3、编剧对话运维、浏览器回归未记档）

**没有新的「主链完全不可用」P0**；但有若干 **P1 级假绿与可维护性炸弹**，不修会在下一轮审计再次被当成功能缺口。

---

## 1. 已收口基线（本轮勿再开票）

下列均已在工作树或域文档销票，深挖时只作对照，不重复排期：

| 域 | 已收口代表项 |
|----|--------------|
| 假成功 P0 | SRV-01 BGM 未配置即拒；SRV-02/03 HyperFrames 黑片改 error + CAS 取消；SND-01 soundMode 分发；SE-01 共用 `renderClipEditorTimeline`；TOOL-01/02/03 |
| 链隔离 / 参数 | DD-R-01、SB-OL-02、TOOL-04/05/06、VG-02/04/10、SRV-04 任务落盘 |
| 体验 / 定性 | SE-02/03/04、NODE-02/03、PG-05/06/07 |
| 图像节点 R1–R3 | PG-01～PG-36（域文档均标 ✅） |
| 视频节点 R1 + R2 大半 | VG-01～VG-18、VG-20～VG-26（见 `NX9-VIDEO-GEN-NODE-OPEN-LOOPS*.md`） |
| 分镜台 SB-OL-01～23 | 功能票基本 ✅；工程债只剩继续拆文件 |
| 素材库功能 + UX | OPEN-LOOPS / UX-RESIDUAL 主路径 ✅ |
| 导演台 P0/P1 | 缺口文档 §12 已销票 |

---

## 2. 本轮新核实 / 仍开放明细

### 2.1 ❌ DEEP-01 · P1 · `seedance-chain` 只组链、标 success、零出片

**锚点**：`apps/web/src/engine/flow-runner.ts` ≈L1543–1573  

**现象**：把上游链镜表编成 `clipChain` 后直接：

```ts
status: 'success',
clipChain: chain,
clipCount: chain.items.length,
```

**没有任何** `proxyVideo` / 轮询。用户点运行看到成功，产物是提示词列表不是视频。

**背景**：`migrate-block-kinds` 会把 `seedance-chain` → `clip-gen`，但 **未迁移旧图 / 手工改 type** 仍可命中此分支。与 VG-31 同根，本轮代码仍在。

**收口**：运行时 throw「已弃用，请改用视频生成 + Seedance」；或强制迁移后从 RUNNABLE 删除该分支。

---

### 2.2 ❌ DEEP-02 · P1 · `motion-story` / `clip-chain-runner` 旁路组装器

**锚点**：  
- `flow-runner.ts` `kind === 'motion-story'` ≈L2200  
- `apps/web/src/engine/clip-chain-runner.ts`（全文 63 行）

**现象**：`runClipChain` 直接 `api.proxyVideo({ prompt, model: 'seedance', imageUrl: 上一镜 videoUrl })`：

- 不走 `buildClipGenVideoRequest`  
- 无 seed / negative / generateAudio / 玩法参考 / 取消信号  
- 把**上一镜视频 URL 当 imageUrl**（语义可疑）  
- 失败只标 item failed，节点仍可能整体 success（有任一 lastVideo）

迁移表虽有 `motion-story → clip-gen`，旁路实现仍活着（VG-19 仍 ❌）。

**收口**：删除旁路或改调组装器；未迁移图运行时阻断并提示迁移。

---

### 2.3 ⚠ DEEP-03 · P1 · `variant-fork` 空操作假成功

**锚点**：`flow-runner.ts` ≈L1915–1926  

只写 `meta.variant` / 透传上游媒体，然后 `status: 'success'`。无分叉计算、无下游隔离、无校验。画布 Run 等于「贴标签」。

若产品需要 A/B 变体：应真分叉节点数据或明确 `skipped` + 文案「仅标记，不产生变体」。当前是**静默假绿**。

---

### 2.4 ⚠ DEEP-04 · P2 · 分镜台画布 Run「等待成稿」也标 success

**锚点**：`flow-runner.ts` ≈L301–332  

无 confirmed package / 无需拆镜时：

```ts
status: 'success', content: '分镜台：等待编剧台 confirmed package 拆镜'
```

台内打开才是真工作面；画布级联里这会让下游以为「分镜已就绪」。更诚实的是 `idle` / `blocked` / `skipped`，而不是 success。

同类：导演台「队列为空」也标 success（≈L1052）——可接受为「空批完成」，但应在 meta 明示 `noop: true`，避免级联统计当产出。

---

### 2.5 🧟 DEEP-05 · P2 · `ClipGenBlock` 完整 `run()` 与活跃路径持续漂移（VG-29）

**锚点**：  
- `product-surface.ts`：`canvasFirst: true`  
- `stage-deck-node-types.tsx`：compact → `CanvasNodeShell`，**不挂载** `ClipGenBlock`  
- `blocks/core/ClipGenBlock.tsx`：仍含完整自有 `run()` / 参数面  

**风险**：审计/新人会把死卡能力当成已上线；改组装器不会同步到死卡。  
**收口**：卡面改为纯摘要或删除 `run`；注释强制指向 `buildClipGenVideoRequest` + VideoWorkspace。

---

### 2.6 🧟 DEEP-06 · P3 · 孤儿文件仍占仓库语义带宽

| 文件 | 证据 |
|------|------|
| `GenConfigPillBar.tsx` | 全仓无 import（VG-32）；仍含视频 ×N 旧语义 |
| `blocks/core/panels/VoiceCastPanel.tsx` | 零引用；内容实质是另一份 VoiceCast 卡（与 `VoiceCastBlock` / sound-gen cast 重复） |

**收口**：删除或改名为 `__archived` 并移出主树；禁止继续改这些文件「修功能」。

---

### 2.7 ⚠ DEEP-07 · P2 · `pollVideo` 用「当前」provider，不绑创建通道（VG-30）

**锚点**：`gateway.service.ts` `pollVideo` ≈L1077–1135  

非 Magic Hour taskId 时：`resolveVideoProvider(baseUrlOverride ?? {})` 读**此刻**设置。用户出片后改 Base URL / Key，「继续查询」可能打错上游。

`PendingVideoTask` 目前主要存 `taskId / prompt / model`，缺 `providerBaseUrl` / provider kind。

**收口**：提交成功写入通道快照；poll 强制带回。

---

### 2.8 ⚠ DEEP-08 · P2 · 恢复超时任务可能污染镜版本史（VG-34 残余）

**锚点**：`core-pipeline-runner.ts` `resumePendingVideoTasks` ≈L363+  

成功时 `appendStoryboardVideoVersion(..., status: 'candidate')`——已比「直接 adopt」诚实，但：

- 不检查该镜是否已有**更新的**成片 / 用户已重试成功  
- 旧 task 后到仍追加 candidate，审片列表变吵，误点 adopt 会回退质量  

**收口**：若镜上已有更新 `createdAt` 的版本，旧 task 只记日志并清 pending，或标 `superseded`。

---

### 2.9 ⏸ DEEP-09 · P3 · `episode-queue` / `audioUrl` 产品未定（VG-27/28）

- 工作台无「本集批出」芯片；有上游时隐式批量  
- `audioUrl` 音画对齐：网关无通道；死卡仍可能宣称  

**收口**：产品二选一——芯片化并只出缺视频镜，或删常量；audioUrl 未定 API 前禁止 UI 宣称。

---

### 2.10 ⚠ DEEP-10 · P3 · 并发 UI 1–4 vs 代码 1–8（VG-33）

**锚点**：`VideoWorkspace.tsx` concurrency select `[1,2,3,4]`；批量 runner clamp 1–8。  
能力被藏；不是断链。对齐上限即可。

---

### 2.11 🏗 DEEP-11 · P1 工程 · 巨型单文件排行（更新实测）

| 文件 | 行数（2026-08-12 实测） | 风险 |
|------|-------------------------|------|
| `AssetLibraryModal.tsx` | **3522** | 已超过分镜台；HMR 空 chunk / 改动冲突最高 |
| `use-storyboard-desk.tsx` | **3264** | SB-OL-11/11b 已拆一轮，仍过大；hook 实为组件 |
| `flow-runner.ts` | **2354** | 全 kind 上帝文件；旁路/遗留分支难清 |
| `ScriptDeskBlock.tsx` | **2086** | 已拆子目录，对话区/顶栏仍可再拆 |
| `gateway.service.ts` | **1722** | 视频/图/LLM 混杂 |
| `DirectorDeskBlock.tsx` | **1249** | 相对可控 |
| `PictureWorkspace.tsx` | **1234** | 参数面继续膨胀风险 |

**优先拆**：`AssetLibraryModal`（按 Tab/壳层/详情）与 `use-storyboard-desk`（按 breakdown / line-art / export handlers），**先拆再做新功能**。

---

### 2.12 🏗 DEEP-12 · P2 · 编剧台体验与工程残留

对照 `NX9-SCRIPT-DESK-OPEN-LOOPS.md` + 代码：

| 项 | 现状 |
|----|------|
| 流式输出 | ⚠ 已有 `onChunk` + `proxyLlmStream` / `scriptScreenplayStream`，但跨网关稳定性与 UI 折叠/搜索仍薄 |
| 模型名可见 | ◐ `llmModelLabel` 已接线，完整「对话搜索/折叠」未闭环 |
| 批量重写 | ◐ UI 有确认文案，深度能力与错误码未按 §3.9 结构化 |
| 单集字数目标注入 | ⏸ 未核实到执行注入 |
| runner 错误 code | ⏸ 仍缺结构化 code |
| 组件级交互测试 | ⚠ 有 storyboard-sync / panels 测，缺对话区交互 |

**不要**再把「完全无流式」写成现状——流式骨架已在。

---

### 2.13 ⏸ DEEP-13 · 捏模台产品半成品（非主链阻断）

**锚点**：`docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` + `packages/director3d/src/sculpt/*` + `FaceSculptModal.tsx`

| 阶段 | 状态 |
|------|------|
| P0 faceRig → Prompt | ✅ |
| P1 代理网格 + 6 项真变形 + 捏模台 | ✅（设计称已落地） |
| P2 控制点拖拽 / 对称解锁 | ❌ 未做 |
| P3 规范机位写入定妆 | ❌ 未做 |
| P4 正式 GLB | ❌ |

属身份编辑加深，不挡出片主闸；但若对外宣传「3D 捏脸」需按阶段诚实，避免把 P1 代理当成终局。

---

### 2.14 ⚠ DEEP-14 · 台账与代码漂移（元问题）

| 台账条目 | 问题 |
|----------|------|
| `NX9-REAL-COMPLETION-LEDGER` F-046/047/048/049/050 | 完成度仍写 45–75%，但第一～三批已修多项；**台账未滚动** → 误导排期 |
| `NX9-VIDEO-GEN-NODE-OPEN-LOOPS.md` 正文矩阵 | 仍有大量 ❌ 表行，与顶部「收口状态」表冲突——读者若只看 §2 矩阵会误判 |
| 全项目审计 §0 总论 | 仍描述「BGM 假成功 / HyperFrames 黑片」为现行——**文首总结过期** |

**收口**：每次销票同步三处：域 OPEN-LOOPS 顶部表、REAL-COMPLETION-LEDGER、全项目审计文首。否则「深挖」会反复开已修票。

---

### 2.15 ⚠ DEEP-15 · 浏览器级回归仍缺记档

单测覆盖大量契约，但以下仍缺**可引用的浏览器记档**（有 e2e 文件 ≠ 本轮已跑通记档）：

- 编剧 ↔ 分镜回程（H-02）  
- 分镜 SB-OL-05/08/09 行为在真实 UI  
- 图像 PG-04 工作台「停止」  
- HyperFrames 取消不得变成功（F-046）  
- 智能剪辑建议确认后门禁（F-050）  

路径参考：`apps/web/e2e/e2e-script-storyboard-director.spec.ts` 等——需补「最后通过日期 / 环境 / 结果」一小节。

---

### 2.16 ⚠ DEEP-16 · `beat-sync` 名实：BPM 算术切点，非听感打点

**锚点**：`flow-runner.ts` ≈L1896–1912  

用固定 BPM 等间隔生成 `cutPoints`，不分析音频 onset。对「按节拍剪」用户预期是半闭环。应改名「等间隔切点」或接真实 beat 检测，并在 UI 标明算法。

---

### 2.17 ⚠ DEEP-17 · `prompt-diff` 硬编码 `gpt-4o-mini`

**锚点**：`flow-runner.ts` ≈L1929–1937  

与已修的 continuity-check 同类：节点/设置无法覆盖模型。非假成功，但是参数不诚实。

---

### 2.18 ◐ DEEP-18 · 素材库「可加深」非断点

OPEN-LOOPS 已定性：

- 成片轨声音深编排  
- 3D 可拍闸联调回归  
- 镜头库 UI 后续阶段  

**不做**：情绪/爆点回库、团队库、LoRA、图文一致性 AI。

---

## 3. 按严重度汇总表

| ID | 级别 | 标题 | 类型 |
|----|------|------|------|
| DEEP-01 | P1 | seedance-chain 组链假成功 | ❌ |
| DEEP-02 | P1 | motion-story 旁路组装器 | ❌ |
| DEEP-03 | P1 | variant-fork 空操作假绿 | ⚠ |
| DEEP-11 | P1 工程 | AssetLibraryModal 3522 / 分镜台 3264 | 🏗 |
| DEEP-04 | P2 | 分镜台画布「等待」标 success | ⚠ |
| DEEP-05 | P2 | ClipGen 死卡 run 漂移 | 🧟 |
| DEEP-07 | P2 | pollVideo 通道不绑创建态 | ⚠ |
| DEEP-08 | P2 | 恢复任务污染版本史 | ⚠ |
| DEEP-12 | P2 | 编剧台运维/错误码/测试 | 🏗 |
| DEEP-14 | P2 | 台账文首与矩阵过期 | ⚠ |
| DEEP-15 | P2 | 浏览器回归未记档 | ⚠ |
| DEEP-16 | P2 | beat-sync 名实 | ⚠ |
| DEEP-06 | P3 | GenConfigPillBar / VoiceCastPanel 孤儿 | 🧟 |
| DEEP-09 | P3 | episode-queue / audioUrl | ⏸ |
| DEEP-10 | P3 | 并发 UI 上限 | ⚠ |
| DEEP-13 | P3 | 捏模 P2/P3 | ⏸ |
| DEEP-17 | P3 | prompt-diff 模型写死 | ⚠ |

---

## 4. 建议收口顺序（第五批起）

### 第五批 · 消灭残余假绿（小改动高收益）

1. **DEEP-01 / DEEP-03**：seedance-chain / variant-fork → throw 或 `skipped` + 明示文案  
2. **DEEP-02**：motion-story 阻断或迁组装器；评估删除 `clip-chain-runner` 旁路  
3. **DEEP-04**：分镜台无活时改 `skipped`/`blocked`，禁止 success  
4. **DEEP-06 / DEEP-05**：删孤儿；ClipGenBlock 去活 `run`  

### 第六批 · 视频恢复诚实 + 台账校准

5. **DEEP-07 / DEEP-08**：pending 绑 provider；恢复前校验镜版本  
6. **DEEP-14**：滚动 LEDGER F-046～050 与视频 OPEN-LOOPS 矩阵  
7. **DEEP-10 / DEEP-17**：并发上限对齐；prompt-diff 模型可配  

### 第七批 · 工程债（禁止夹带功能）

8. **拆 `AssetLibraryModal.tsx`**（优先于新库功能）  
9. **继续拆 `use-storyboard-desk.tsx`**（handlers → `desk-breakdown.ts` / `desk-line-art.ts` / `desk-export.ts`）  
10. ScriptDesk 对话区 / controller hook 第二阶段  

### 第八批 · 体验与回归记档

11. **DEEP-15** 浏览器清单跑通并写日期  
12. 捏模 P2/P3 按产品排期（可平行，不挡主链）  

---

## 5. 验收口诀（本轮追加）

1. **迁移表存在 ≠ 旧分支已死**：flow-runner 里仍挂着的 kind，旧图就能打到。  
2. **`status: 'success'` 必须对应可交付产物或显式 noop 元数据**；「等待上游」「仅贴标签」「只组链」不得绿勾。  
3. **canvasFirst 下未挂载的组件里的 `run()` 一律视为死代码**，不能当功能证据。  
4. **零 import 文件不得继续演进**——删或归档。  
5. **异步恢复必须绑创建时通道，且不得静默盖过更新成片**。  
6. **台账文首与矩阵必须跟工作树同日**；过期总结比没有文档更有害。  
7. **行数 >3000 的 UI 单文件禁止加功能，先拆。**

---

## 6. 证据索引（本轮）

| 结论 | 路径 |
|------|------|
| seedance-chain 假成功 | `flow-runner.ts` L1543–1573 |
| motion-story 旁路 | `flow-runner.ts` L2200+；`clip-chain-runner.ts` |
| variant-fork | `flow-runner.ts` L1915–1926 |
| 分镜等待 success | `flow-runner.ts` L331 |
| canvasFirst 紧凑壳 | `product-surface.ts`；`stage-deck-node-types.tsx` L39–41 |
| pollVideo 当前 provider | `gateway.service.ts` L1132–1135 |
| resume pending | `core-pipeline-runner.ts` L363+ |
| 并发 UI | `VideoWorkspace.tsx` concurrency select |
| 孤儿 PillBar | `GenConfigPillBar.tsx`（无引用） |
| 死 VoiceCastPanel | `blocks/core/panels/VoiceCastPanel.tsx`（无引用） |
| 行数实测 | AssetLibraryModal 3522 / use-storyboard-desk 3264 / flow-runner 2354 |
| 捏模阶段 | `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md`；`director3d/sculpt/*` |

---

## 7. 与既有文档关系

| 文档 | 关系 |
|------|------|
| `NX9-FULL-PROJECT-OPEN-LOOPS-AUDIT-2026-08-12.md` | 第一～三批收口台账；文首需按本文 DEEP-14 滚动 |
| `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R2.md` | VG-19/27–34 与本文 DEEP-02/05/07–10 对齐 |
| `NX9-SCRIPT-DESK-OPEN-LOOPS.md` / `DEEP-AUDIT` | 编剧残留以本文 DEEP-12 为准（流式勿再标「完全未做」） |
| `NX9-STORYBOARD-DESK-OPEN-LOOPS.md` | 功能票已闭；工程债并入 DEEP-11 |
| `NX9-ASSET-LIBRARY-*` | 功能/UX 已闭；模态行数升为 DEEP-11 首要工程债 |
| `NX9-REAL-COMPLETION-LEDGER.md` | F-046～050 需按第五/六批重评 |

---

**文档结论**：第四轮深挖后，主链假成功大体已清；**残余假绿集中在遗留 kind 与视频旁路**，**最大工程炸弹已从分镜台换成素材库模态（3522 行）**。下一刀应先做第五批假绿清除 + 台账校准，再拆大文件，最后补浏览器记档——不要在 3500 行文件上继续堆功能。
