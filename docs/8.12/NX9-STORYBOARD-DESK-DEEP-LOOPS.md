# NX9 分镜台 · 深度开环（第二轮）

> **日期**：2026-08-12  
> **目录**：`docs/8.12/`  
> **范围**：分镜台本台 + 与导演台交接 + 画布侧旁路写镜  
> **前提**：`docs/NX9-STORYBOARD-DESK-OPEN-LOOPS.md` 中 SB-OL-01～23 **已收口**，本文不再重复那些项  
> **方法**：在已修闭环之上，按「状态是否撒谎 / 多链是否串台 / 写路径是否原子 / 产物是否过期」四条线往深挖  
> **原则**：只记现码可复现的问题；有锚点、有验收、有建议修复，不写空泛体验抱怨

---

## 1. 一句话结论

表层断点（崩溃、摘确认、清线稿、队列跳过、草稿 v2 等）已收。  
当前风险集中在 **多链错推交接**、**复制镜假成图**、**故事板大图过期仍显示已生成**、**确认后不自动推 handoff**，以及若干写路径非原子 / 旁路全局双写。

这些不是「缺按钮」，而是 **交付态与画布拓扑下的诚实性问题**。

---

## 2. 已收口（勿回潮）

以下以 `NX9-STORYBOARD-DESK-OPEN-LOOPS.md` 为准，**不要重新开票**：

- 合镜崩溃 / 合镜清帧、嵌入预览摘确认、清除线稿清帧、spawn `lastHandoff`
- 切集闭包、队列跳过 abort、就绪条响应式、导入 stale 哨兵
- 宫格缺图范围 + signal、撤销扩快照、构图不认 `firstFrameAssetId`
- 会话草稿 v2、ContinuityCheck 多链定位、三台交接契约测

---

## 3. 深度问题明细

### 3.1 P0 · 多链错交付

#### SB-D-01 ❌ 「打开导演台」全画布 `find` 第一个导演台

```1465:1508:apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx
  const openDirectorDesk = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const desk = nodes.find((n) => (n.type ?? '') === 'director-desk');
    // ...
    if (desk && focusBlock) {
      updateNodeData(desk.id, { lastHandoff: { ...handoff }, lastHandoffStatus: 'ready' });
      focusBlock(desk.id);
```

**现象**：画布存在两套 `分镜台 → 导演台` 时，分镜台 B 点「打开导演台」可能把交接写进导演台 A，并 focus 错台。  
**对比**：编剧台送分镜、连贯性跳转已改成按边解析；此处仍是旧式全画布查找。  
**修复建议**：

1. 增加 `resolveDownstreamDirectorDeskId(sourceId, nodes, edges)`（出边优先，可含 `fromId` 匹配）。  
2. focus / 写 `lastHandoff` 只用该 id；找不到再 `requestSpawn`。  
3. 补多链测例：两套链并存时 B 只写 B 的下游。

**验收**：两套链 → 分镜 B 打开导演 → 仅导演 B 的 `lastHandoff.fromId === 分镜B`，导演 A 不变。

---

### 3.2 P1 · 状态撒谎 / 产物过期

#### SB-D-02 ⚠ 复制镜继承线稿 URL → 假「已出图」

```1854:1857:apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx
    const source = episode.shots[idx]!;
    const copyId = `${shotId}-copy-${Date.now()}`;
    const copy: typeof source = { ...source, id: copyId, sceneCode: '' };
```

浅拷贝保留了 `previewImageUrl` / `referenceImageUrl` / `sketchUrl`。  
`storyboardShotsFromScriptBreakdown` 会把 `previewImageUrl` 投影成 `lineArtUrl` → `isShotComposed` / 覆盖率 / 徽章全亮，但 **没有** 为 `copyId` 建独立 frame。

**后果**：

- 覆盖率虚高，确认门禁被绕过  
- 清原镜线稿后，副本仍显示同一 URL（共用资源，非独立资产）  
- 批量复制同理（`handleCopySelected`）

**修复建议**：复制时显式清空媒体字段：

```ts
previewImageUrl: null,
referenceImageUrl: null,
sketchUrl: null,
status: 'draft',
```

可选：提供「连线稿一起复制」高级选项（同时 clone frame 并改 `sourceShotId`）。默认应缺图。

**验收**：有线稿的镜复制后 → 新镜徽章「缺图」、覆盖率不升；原镜清线稿不影响（若未选连拷）。

---

#### SB-D-03 ⚠ 结构/线稿变更后故事板大图仍显示「已生成」

`contactSheetsByEpisode[episodeId]` 只在「合成故事板」时更新；删镜 / 合镜 / 清线稿 / 批量改图 **不会** 清掉旧 URL。

UI（构图 Tab / 交接 checklist）仍读 `getEpisodeContactSheet` → 旧大图 +「已生成」。  
签名比对只在再次点击合成时发生，用户不点就一直看着过期拼版。

**修复建议**：

1. 在删镜 / 合镜 / 清线稿 / `setShotFrameUrl` / 批量线稿成功路径调用 `invalidateEpisodeContactSheet(episodeId)`（删 map 项 + 清遗留 `contactSheetUrl`）。  
2. 或：展示层比较 `buildDeskContactSheetSignature(liveCells)` 与存盘 signature，不一致则显示「已过期 · 需重出」。

**验收**：出故事板 → 删 1 镜 → 交接区不再「已生成」或标「已过期」；重出后恢复。

---

#### SB-D-04 ⚠ 本集「确认」不推送已连接导演台的 `lastHandoff`

`confirmCurrentEpisode` 只写本台 `confirmedEpisodeIds` / chain 确认态；  
`lastHandoff` **仅**在 `openDirectorDesk` 时写入下游。

**后果**：确认 → 打开导演（推送）→ 回分镜改稿/撤确认/再确认 → 直接点画布导演台：  
导演台仍持旧 handoff。哈希校验通常会挡批出（`storyboardHash` 含确认位），但体验是「已再确认却仍 stale」，必须再点一次「打开导演台」。

**修复建议**（二选一或组合）：

1. `confirmCurrentEpisode` 结束时，若已有下游导演台，自动写入新 `lastHandoff`（静默同步）。  
2. 交接 Tab 显示「下游交接：已同步 / 需推送」，未推送时主按钮文案改为「确认并推送导演台」。

**验收**：再确认后不点「打开导演台」，仅 focus 已连导演台 → `validateDirectorHandoff` 通过且 `handoffVersion` 已递增。

---

### 3.3 P1 · 写路径可靠性

#### SB-D-05 ⚠ 复制/批删就地改 `shot.index`（共享对象变异）

```1857:1859:apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx
    const newShots = [...episode.shots];
    newShots.splice(idx + 1, 0, copy);
    newShots.forEach((s, i) => { s.index = i + 1; });
```

`[...episode.shots]` 是浅拷贝，`forEach` 改的是 **原 payload 里的同一批 shot 对象**。  
`handleDeleteSelected` / `handleCopySelected` 同类。

`pushUndo` 若在变异之后会脏；当前多数路径是先 `pushUndo` 再变异，undo 快照尚可，但：

- 同一 tick 内其它订阅仍读到被改坏的 live payload  
- 与 React 不可变约定冲突，难测、易在并发写时放大

**修复建议**：`clonePayload` 或 `episode.shots.map(s => ({...s}))` 后再改 index；最好抽到 runner 纯函数（与 `addShotToBreakdown` 一致）。

**验收**：变异前后 `payload.episodes[0].shots[0]` 引用不等；单测断言原 payload index 不变。

---

#### SB-D-06 ⚠ 画布宫格切分仍写全局 `workspace.storyboard`

```80:91:apps/web/src/engine/stage-deck/chrome/GridGeneratePanel.tsx
        updateShot(shot.id, buildLineArtShotPatch(url));
      } else {
        updateShot(shot.id, {
          firstFrameAssetId: url,
          ...
        });
      }
    ...
      addShots(newShots, 'append');
```

分镜台主链已 SSOT 到 `chainStoryboard`，但这条旁路仍写全局镜表。  
多台并存时，迁移/兜底逻辑可能把 A 台线稿读进 B 台。

**修复建议**：宫格切分改为解析当前选中/上游 desk，写 `patchUpstreamShot` / desk `updateNodeData`；禁止默认 `updateShot`。  
或：产品上禁用该旁路，只保留分镜台构图入口。

**验收**：两台 desk + 全局空镜表 → 宫格切分只改目标 desk chain，全局 `storyboard.shots` 长度不变（或仅显式迁移时变）。

---

#### SB-D-07 ⚠ `setShotFrameUrl` 双写非原子

先 `applyScriptBreakdownPayload`（整链重建），再 `updateNodeData` 写 frames + `stripEpisodeConfirmation`。  
两步之间：确认态可能仍「已确认」、frames 已变；批量并发时后者可能盖掉前者 chain。

**修复建议**：合并为单次 `updateNodeData` 函数式更新（breakdown + frames + strip + `buildLineArtShotPatch`），或统一走 `applyDeskBreakdown` + 同 tick 清/写帧。

**验收**：并发两镜写回后两镜 URL 都在；确认态在任意中间观察点不出现「已确认 + 新帧」假绿（可用单测模拟两次 updater）。

---

### 3.4 P2 · 打磨 / 工程

| ID | 项 | 说明 |
|----|----|------|
| SB-D-08 | 清除线稿不入撤销栈 | `handleClearLineArt` 无 `pushUndo`；批删确认文案写「不可撤销」但实际可撤销 → 文案撒谎 |
| SB-D-09 | 会话草稿无防抖 / 配额 | 每次确认态或帧签名变化整包 `JSON.stringify` 进 `sessionStorage`；多集多图易静默失败（`catch` 吞掉） |
| SB-D-10 | `review-gate-session` 仍 find 导演台 | `runtime.getNodes().find(director-desk)`，多链审阅门闸可能指错台 |
| SB-D-11 | 主 hook 仍 ~3200 行 | DevPack/pipeline/弹窗已拆；批量线稿 / 交接 / 拆镜队列仍堆在主文件，HMR 空 chunk 风险仍在 |
| SB-D-12 | 清线稿写 `previewImageUrl: ''` | 投影为 `lineArtUrl: ''`；`??` 不会回退旧值（侥幸正确），但语义应显式 `null`，避免哈希/序列化把 `''` 与 `null` 当成两种「无图」 |

---

## 4. 建议收口顺序

### Phase D1（交付正确性，优先）

1. **SB-D-01** 打开导演台按出边定位  
2. **SB-D-02** 复制镜清空媒体字段  
3. **SB-D-03** 结构变更作废本集故事板大图  
4. **SB-D-04** 确认后同步 / 明示推送下游 handoff  

### Phase D2（写路径）

5. **SB-D-05** 复制/批删不可变改写  
6. **SB-D-07** `setShotFrameUrl` 单次原子写  
7. **SB-D-06** 宫格切分离开全局镜表  

### Phase D3（打磨）

8. SB-D-08～12  

---

## 5. 验收口诀（本轮新增）

1. 两套分镜→导演链 → 分镜 B「打开导演台」→ 只有导演 B 收到 `lastHandoff`。  
2. 复制有线稿的镜 → 新镜缺图，覆盖率不变。  
3. 故事板大图已有 → 删镜或清线稿 → 不再显示「已生成」鲜绿（或明确「已过期」）。  
4. 确认并推送后改稿再确认 → 不点打开导演，下游校验与版本仍一致（若采用自动推送方案）。  
5. 批删前后原 `payload` 的 shot 对象 index 不被就地改写（单测）。  

---

## 6. 明确不做（避免回潮）

- 分镜台恢复试出 / 彩色批出 / 嵌入 3D 主入口  
- 用全局 `workspace.storyboard` 做主真相  
- 把导演关键帧重新计入分镜「已出图」  
- 对照任何外部产品仓库  

---

## 附：关键锚点

| 主题 | 路径 |
|------|------|
| 打开导演台 find | `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx` ≈ L1465 |
| 复制镜 | 同文件 `handleCopyShot` / `handleCopySelected` |
| 故事板大图读写 | 同文件 `generateStoryboardSheet` + `getEpisodeContactSheet` |
| 确认本集 | 同文件 `confirmCurrentEpisode` |
| strip / hash 含确认位 | `storyboard-desk-runner.stripEpisodeConfirmation` + `packages/shared/.../chainStoryboardHash` |
| 宫格旁路 | `apps/web/src/engine/stage-deck/chrome/GridGeneratePanel.tsx` |
| 上一轮已修清单 | `docs/NX9-STORYBOARD-DESK-OPEN-LOOPS.md` |

---

**文档结论**：第一轮开环已清；第二轮深度问题的核心是 **拓扑（多链）** 与 **产物生命周期（复制 / 大图 / handoff 推送）**。按 §4 Phase D1 收口后，分镜台才达到「多链下也不错交、不假绿」的生产判定。
