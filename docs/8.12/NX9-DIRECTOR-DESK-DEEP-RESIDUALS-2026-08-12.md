# NX9 导演台深度残留问题（2026-08-12）

> 范围：在 P0/P1 主链与兼容尾巴（混装拆分 / Data URL 隔离 / 链 hygiene 写回 / clip-gen 链门禁）已落地之后，**继续往深处挖**仍存在的断点、半闭环与产品契约裂缝。  
> 原则：以当前仓库代码为准；不把已修断点重复写成「未修」；每条问题都给证据锚点与建议处置。  
> 目录：`docs/8.12/`

---

## 0. 一句话结论

**线稿 → 彩色关键帧 → 审阅 → 结构化批次 → 逐镜视频**这条导演台主链已经可跑；更深的断点已经转移到：

1. **视频写回之后的成片编排门禁**（状态字段被覆盖）
2. **3D 隔离/修复半闭环**（隔离了，但没有修回入口）
3. **产品文案与真实能力脱节**（开关已开，UI 仍写「暂未开放」）
4. **跨节点全局/节点级状态泄漏**（`previewUrl`、全局美术方向、FlowSurface 旧回退）
5. **长任务耐久性**（批次 `consuming` 中断不可增量恢复）
6. **真实供应商与浏览器级多集/多链证据仍缺**

这些不是「再修一个 runner 就完事」的表层 bug，而是**字段语义、阶段门禁、宿主一致性**层面的深度问题。

---

## 1. 已收口（本文不再当成缺口）

| 主题 | 状态 | 锚点 |
|------|------|------|
| 线稿不污染 `firstFrameAssetId`（高置信读时迁移 + 写回） | ✅ | `migrateLegacyLineArtShot` / `persistChainStoryboardHygiene` |
| handoff hash 只投影上游字段 | ✅ | `projectHandoffShot` / `chainStoryboardHash` |
| 画布 Run 与 UI 共用 `resolveDirectorRunContext` | ✅ | `director-desk-runner.ts` |
| `DirectorKeyframeBatch` 逐镜消费 | ✅ | `director-keyframe-batch-runner.ts` + `flow-runner` clip-gen 分支 |
| 独立 `director-3d` + Host 复用 | ✅ | `Director3dBlock` / `Director3dHostController` |
| 像素级彩色质检（疑似黑白强制审阅，禁止因此标 failed） | ✅ | `assessKeyframeColor` + provenance.colorCheck |
| 混装节点可拆分 UI | ✅ | `director3d-split.ts` + 导演台警告条 |
| chain / 3D candidate Data URL 隔离 | ✅ | `quarantineDirector3dDataUrls` / `quarantineDirector3dShotStates` |
| clip-gen 无批次门禁不读全局镜表 | ✅ | `flow-runner` + `dd-r01-keyframe-gate.test.ts` |
| 审片会话去掉全局回落 | ✅ | `review-gate-session.ts` |

---

## 2. 深度问题总表

| ID | 严重度 | 问题 | 闭环状态 |
|----|--------|------|----------|
| DD-D-01 | **P0** | 视频写回把 `status` 打成 `review`，剪辑台 `approvedOnly` 编排吃空 | 断环 |
| DD-D-02 | **P0** | 成片侧没有「视频审阅/批准」阶段，导演关键帧批准语义被覆盖 | 断环 |
| DD-D-03 | P1 | Data URL 隔离后无「重新拍/重新传」修复 UX；`pendingRepair` 只标记不消费 | 半闭环 |
| DD-D-04 | P1 | 隔离后 `captureUrl===''`，多处仍只认 `captureUrl` 判定「有 3D」 | 半闭环 |
| DD-D-05 | P1 | `DIRECTOR_3D_ENABLED===true`，UI 文案仍写「3D … 暂未开放」 | 产品契约裂缝 |
| DD-D-06 | P1 | 节点级 `previewUrl` 与当前镜错位；胶片/交付点击会写脏节点预览 | 半闭环 |
| DD-D-07 | P1 | 风格锁仍注入工作区 `globalArtDirection`，可污染集级风格 | 契约裂缝 |
| DD-D-08 | P1 | `FlowSurface` spawn 仍回退全局 `storyboard.shots` | 兼容泄漏 |
| DD-D-09 | P1 | 关键帧批次 `consuming` 中断后不可增量落盘；成功镜头可能 orphan | 耐久性缺口 |
| DD-D-10 | P1 | `partial` 批次缺少一等公民「只重试失败镜」UI / 回执驱动入口 | 半闭环 |
| DD-D-11 | P2 | 混装拆分仅手动；工作区加载不会自动拆 | 迁移体验 |
| DD-D-12 | P2 | `colorCheck=unknown` 在 auto 模式可直接批准 | 质检边界 |
| DD-D-13 | P2 | 3D 切镜无「未提交脏状态」显式确认（靠自动存草稿） | 语义模糊 |
| DD-D-14 | P2 | 双集 / 多 chain / 刷新持久化 / 真实供应商仍缺浏览器级证据 | 验收缺口 |

---

## 3. P0：成片编排断环（最深、最该先修）

### DD-D-01 · 视频写回覆盖 `status`，剪辑台编排吃空

**现象**

1. 导演台关键帧批准后，镜头 `status/keyframeStatus = approved`。
2. `clip-gen` 消费批次成功后写回：

```ts
// director-keyframe-batch-runner.ts / ClipGenBlock 非批次路径同类
videoAssetId: url,
videoStatus: 'review',
status: 'review',   // ← 覆盖了关键帧阶段的 approved
```

3. 剪辑台漫剧编排：

```ts
// ClipEditorBlock.tsx
approvedOnly: true,
// smart-edit-orchestrator.ts
.filter((s) => (opts.approvedOnly ? s.status === 'approved' : true))
```

**结果**：刚生成完视频的镜头全部被滤掉 → 智能编排得到空时间线或仅 BGM。媒体箱若按 `videoAssetId` 显示，用户会看到「有片」，一点编排却「没片」——典型假闭环。

**根因**：`status` 被当成「整镜总状态」复用，关键帧批准与视频待审挤在同一字段，后写覆盖前写。

**建议契约（推荐）**

| 字段 | 语义 |
|------|------|
| `keyframeStatus` | 仅关键帧阶段 |
| `videoStatus` | 仅视频阶段 |
| `status` | 弃用为派生字段，或定义为「当前阶段聚合」，**禁止视频写回覆盖关键帧批准** |

最小修复：视频写回**只改** `videoStatus` / `videoAssetId`，保留 `keyframeStatus`；剪辑台 `approvedOnly` 改为看 `videoStatus==='approved'` 或 `Boolean(videoAssetId) && videoStatus!=='failed'`（产品二选一，必须写死）。

**验收**

- 关键帧 approved → 视频生成 success → 剪辑台一键编排得到与视频镜数一致的 V 轨。
- 单测：`consumeDirectorKeyframeBatch` 后 `keyframeStatus` 仍为 `approved`；`orchestrateDramaTimeline({ approvedOnly: true })` 在 `videoStatus=review` 策略下行为符合新产品契约（要么纳入，要么明确要求视频批准）。

---

### DD-D-02 · 没有视频审阅闭环

**现象**

- 导演台有完整关键帧审阅（批准 / 打回 / 全部通过）。
- 视频写回后只有 `videoStatus: 'review'`，**没有**对等的视频批准 UI、门禁、推送到剪辑台的「视频已放行」信号。
- 剪辑台却假设存在 `status==='approved'` 的成片镜头。

**结论**：产品口头上是「关键帧门禁 → 视频 → 精剪」，代码里视频阶段是**开环**。

**建议**

1. 在导演台交付 Tab 或 clip-gen 增加「视频审阅」最小集：通过 / 打回 / 全部通过。
2. 或明确产品降级：「有 `videoAssetId` 即可进剪辑台」，并改掉 `approvedOnly: true`。
3. 二者必须选一个；现在是两个契约互相打架。

---

## 4. P1：3D 隔离后的半闭环

### DD-D-03 · `captureUrlPendingRepair` 只标记，不修复

**已做**：chain 中 Data URL 3D 截图会被清空并打 `captureUrlPendingRepair: true`；3D candidate 的 Data URL 会降级到 `localDataUrl` + failed。

**未做**：

- 导演台 / 3D 舞台没有「待修复 N 镜」列表。
- 没有一键「重新打开该镜并上传」导航。
- 胶片 `3donly`、Host `has3dGuide`、批出参考组装都**看不到** pendingRepair。

**证据**

```ts
has3dGuide: Boolean(shot.director3dGuide?.captureUrl)  // Host
filter === '3donly' → director3dGuide?.captureUrl      // 导演台胶片
const d3 = shot.director3dGuide?.captureUrl?.trim()    // buildShotPrompt
```

隔离成功后这些路径全部当「无 3D」。用户若开着 `prefer3dRef`，只会感觉「3D 参考莫名消失」，而不是「需要重新上传」。

**建议**

- 统一 `hasDirector3dGuide`（已有 shared helper）替换散落的 `captureUrl` 布尔判断。
- UI：pendingRepair 显示黄色标记 +「去 3D 重拍」；提交成功后清 flag。

---

### DD-D-04 · 「有 3D」判定与 quarantine 不同步

与 DD-D-03 同源，单独列出是因为会影响：

- 统计 `stats.with3d`
- 队列过滤 `3donly`
- `allowWithout3d === false` 硬失败路径
- 参考图优先级（`prefer3d && d3`）

这是**数据清洗引入的二次回归面**：清洗修了脏 URL，却让所有「有构图」信号变假。

---

## 5. P1：产品契约与宿主一致性

### DD-D-05 · 开关已开，文案仍写「暂未开放」

```ts
// director3d-feature.ts
export const DIRECTOR_3D_ENABLED = true;
```

但 `DirectorDeskBlock` / `director-main-panel` / `StoryboardPreviewWorkspace` 仍硬编码：

- 「3D 构图（暂未开放）」
- 「3D 舞台暂未开放」
- 「3D 机位暂未开放」

按钮在 `ENABLED=true` 时可点，文案却说未开放 → 验收与培训会被误导。

**建议**：文案完全由 `DIRECTOR_3D_ENABLED` 驱动；开启时写「3D 构图 / 打开 3D 舞台」。

---

### DD-D-06 · 节点级 `previewUrl` 与当前镜错位

导演台主预览已优先用 `currentShot.firstFrameAssetId`，但多处仍写节点 `previewUrl`：

- 批出结束：`previewUrl: summary.lastUrl`
- 胶片 / 交付点击：`updateNodeData(blockId, { previewUrl: shot.firstFrameAssetId })`
- `pushKeyframesToClipGen` 也会写 `previewUrl: first.firstFrameAssetId`

画布卡片、下游若读节点 `previewUrl`，会显示「最后点过的那一镜」，不是「当前交接集代表帧」。这是旧 DD-P1-02 的残留形态：UI 主路径修了，**节点契约没删干净**。

**建议**

- 节点 `previewUrl` 定义为「画布缩略图缓存」，禁止业务逻辑再当 SSOT。
- 或批出后写「本集代表帧」规则（例如首个 approved），并在文档写死。

---

### DD-D-07 · 风格锁仍吃工作区全局美术方向

`DirectorDeskBlock` 批出时传入：

```ts
globalArtDirection: storyboard.globalArtDirection,
episodeArtDirection, // 来自 chain episode
```

`buildShotPrompt` 在 `styleLock` 下把 `globalStyle + epStyle + custom` 拼进 prompt。  
集级 chain 已是 SSOT 时，全局 store 的 art direction 仍可渗入 → 多项目 / 多工作区切换后风格串味。

**建议**：默认只用 `episodeArtDirection` + 导演台 `stylePrompt`；全局项改为显式 opt-in，或删除。

---

### DD-D-08 · FlowSurface spawn 仍回退全局镜表

```ts
// FlowSurface.tsx spawn 路径
findChainShot(...) ?? useWorkspaceDocument.getState().storyboard.shots.find(...)
```

导演/审片主路径已禁全局回退，但画布「按镜 spawn 模块」仍可读到别的项目残留全局镜。属于**旁路泄漏**。

---

## 6. P1：长任务与批次耐久性

### DD-D-09 · `consuming` 中断不可增量恢复

`flow-runner` clip-gen 批次路径：

1. 先把 batch 标成 `consuming`
2. `await consumeDirectorKeyframeBatch(...)`（内部逐镜调 API，**内存**攒 patches）
3. 结束后一次性写回 chain + receipt

浏览器刷新 / tab 崩溃发生在步骤 2：

- 节点停留在 `consuming`
- 已成功的视频 URL 未写进 chain（可能已在供应商侧生成）
- 重跑会整批再请求（幂等依赖供应商，不依赖本地 receipt）

**建议**

- 每镜成功立即 patch chain + 更新 receipt（`partial` 递增）
- 或至少把成功 URL 追加到 `receipt.videoUrlsByShotId` 再继续下一镜
- 启动时若发现 `consuming`，自动按 receipt 续跑

---

### DD-D-10 · `partial` 缺少一等公民重试入口

消费层已支持「已成功镜跳过、只打失败镜」，但 clip-gen UI：

- 展示 batch 状态文案
- 没有「重试失败 N 镜」专用按钮把 `partial` 再次送进同一消费路径

用户只能再点一次总 Run；语义上能工作，但操作与回执不对齐，失败原因列表也未一等展示。

---

## 7. P2：迁移、质检边界、3D 语义

### DD-D-11 · 混装节点只警告不自动拆

`migrateBlockKinds` 对「已有关键帧生产的旧 3D 合并节点」打 `split-required`，导演台提供手动「立即拆分」。  
大型旧工程若用户不进导演台，混装状态会长期存在，嵌入 Host 与独立节点双源继续打架。

**建议**：工作区 hydrate 时对 `split-required` 提供非破坏性自动拆分（或强制弹窗一次）。

---

### DD-D-12 · `colorCheck=unknown` 可被 auto 批准

疑似黑白强制 `review`；`unknown`（读图失败）在 `reviewMode==='auto'` 时仍可直接 `approved`。  
这是有意的「不因质检基础设施失败阻断」，但与「彩色关键帧契约」之间存在空隙：网络抖一下就能自动放行未检帧。

**建议**：auto 模式下 `unknown` 也进 `review`，或累计 unknown 比例告警。

---

### DD-D-13 · 3D 切镜无显式脏确认

草稿自动写入 `sceneByShot`；「恢复已提交版本」依赖 `committedSnapshot`。  
切镜时直接 `setCurrentShotId`，没有「当前镜有未提交候选/未对齐 revision，是否离开」的确认。对长 GPU 会话，用户可能不知道草稿已自动存、提交尚未做。

---

### DD-D-14 · 真实证据层仍缺

已有：

- mock E2E
- opt-in `REAL-PROVIDER-VALIDATION.md` / smoke

仍缺：

- 真实图片供应商 → 真实视频供应商 → chain 字段断言的小样本
- 双集切换后 handoff / 批次 / 3D revision 浏览器级回归
- 刷新后 `consuming` / `partial` / `split-done` / `pendingRepair` 持久化目视清单

这些不阻断单元测试，但阻断「生产可签字」。

---

## 8. 问题因果链（便于排期）

```text
分镜线稿
  → 导演台彩色关键帧（已闭环 + colorCheck）
  → 关键帧审阅批准（已闭环）
  → DirectorKeyframeBatch → clip-gen 逐镜视频（已闭环）
  → video 写回 status=review（DD-D-01/02 断环）
  → 剪辑台 approvedOnly 编排（吃空）
  → 精剪 / 音量关键帧 / 导出（有能力，吃不到上游片）

并行：
  3D Data URL quarantine（已做）
    → pendingRepair 无修复 UX（DD-D-03/04）
    → 参考图优先级误判无 3D

并行：
  DIRECTOR_3D_ENABLED=true
    → UI 文案仍「暂未开放」（DD-D-05）
```

---

## 9. 建议施工顺序（只针对本文残留）

### Wave A — 成片断环（先做，否则主链签字无效）

1. **DD-D-01 / DD-D-02**：拆分 keyframe/video 状态语义；改视频写回；改剪辑台门禁或补视频批准。
2. 补测：batch 消费后编排非空；`keyframeStatus` 不被视频覆盖。

### Wave B — 3D 隔离闭环

3. **DD-D-03 / DD-D-04**：统一 `hasDirector3dGuide`；pendingRepair UI + 提交清 flag。
4. **DD-D-05**：清掉「暂未开放」死文案。

### Wave C — 宿主一致性

5. **DD-D-06**：收敛 `previewUrl` 语义。
6. **DD-D-07**：风格锁去全局默认。
7. **DD-D-08**：FlowSurface spawn 去全局回退。

### Wave D — 耐久与验收

8. **DD-D-09 / DD-D-10**：逐镜落盘 + partial 重试 UI。
9. **DD-D-11 ~ DD-D-14**：自动拆分策略、unknown 策略、切镜确认、真实小样本 E2E。

---

## 10. 验收清单（深度残留专用）

- [ ] 关键帧 approved 后生成视频，`keyframeStatus` 仍为 approved
- [ ] 剪辑台漫剧编排得到与成功视频数一致的片段（或明确要求视频批准且 UI 存在）
- [ ] quarantine 后胶片/统计/参考组装仍能识别「有 3D 机位（待修复）」
- [ ] 3D 重新上传成功后 `captureUrlPendingRepair` 清除
- [ ] 导演台 Tab 文案在 `DIRECTOR_3D_ENABLED=true` 时不再出现「暂未开放」
- [ ] 批次中断重开可续跑，不整批重打已成功镜
- [ ] spawn 模块不再读到未连接链的全局镜
- [ ] 真实供应商小样本：1 镜线稿 → 彩色关键帧 → 视频 URL 写回 chain（opt-in 文档签字）

---

## 11. 非问题（避免误修）

- 3D 截图不当最终彩色关键帧 —— 产品契约，不是缺陷。
- `suspect-monochrome` 不标 failed —— 有意设计，避免误杀。
- 真实供应商默认 skip —— 环境项，脚手架已在；缺的是账号侧签字，不是缺代码入口。
- 混装节点需确认后拆分 —— 手动入口已有；「是否自动拆」是产品选择（见 DD-D-11），不是功能缺失到零。

---

## 12. 相关文档

- `docs/NX9-DIRECTOR-DESK-CURRENT-GAPS-AND-3D-NODE-PLAN-2026-08-12.md`（P0/P1 主链收口记录）
- `docs/REAL-PROVIDER-VALIDATION.md`（真实供应商 opt-in）
- `docs/NX9-FULL-PROJECT-OPEN-LOOPS-AUDIT-2026-08-12.md`（全仓开环审计）

本文是上述文档的**加深续篇**：主链已通之后，把「通了但仍会在下一跳摔跤」的问题单独钉死。
