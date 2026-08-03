# NX9 分镜台 · 生产级缺口、加强项与 DeepSeek 施工说明书

> 日期：2026-08-03（二修：补未列加强项 + 逐 ID 实现方案 + DeepSeek 提示词）  
> 范围：仅分镜台（`StoryboardDeskBlock` → `use-storyboard-desk` + `shot-story-cell` + helpers + `storyboard-desk-runner` + 嵌入预览）  
> 读者：人类产品 + **DeepSeek-V4-Pro 等实现用大模型**  
> 权威源：本文 + `docs/NX9-REQ-SCRIPT-STORYBOARD-DESK-UX.md` 已拍板项 + 用户当次指示  
> 禁止：对照任何外部产品仓库；禁止打开 `Reference_Projects/`

---

## DeepSeek 必读（开工前 30 秒）

1. **只改本文附录 A 白名单文件**；禁止新建平行「第二套分镜台」。  
2. **禁止**打开/引用 `Reference_Projects/`；禁止「对齐某外部产品」。  
3. 每做完一个 **ID**（如 `X-01`），必须满足该 ID 的「验收」；不要一次糊完所有 ID 却跳验收。  
4. UI 样式只扩 `storyboard-desk.v2.css` 的 `sg3-*` / `sg-story-*`；嵌入预览可改 `keyframe-preview.css` 的 embedded 分支。  
5. 数据真相：`node.data.scriptBreakdown` + `node.data.storyboardPreview` + `node.data.confirmedEpisodeIds`；勿写回全局 `workspace.storyboard` 作为主真相（可读兜底可暂留，禁止扩大写）。  
6. **分镜台只出线稿**；禁止恢复试出/彩色批出/底栏四按钮/预览 3D 主入口。  
7. 改完 `packages/shared` 必须 `pnpm --filter @nx9/shared build` 再跑测试。  

**推荐实现顺序（Phase A）**：  
`X-01 → X-02 → X-03/X-16 → G-01/X-05 → C-01/C-02/X-04 → X-15 → S-02 → H-01/X-20 → Q-02`

---

## 0. 一句话结论

分镜台**主链骨架已通**（拆镜 → 镜表 → 线稿构图 → 确认交接），职责收口大半已落地。  
要到**可生产级**，仍缺：**可后悔（删镜/撤销）、可停止（批量线稿）、确认状态不撒谎、成稿变更强提醒、按集隔离产物、交接真正打通导演台、巨型 hook 可维护与测例**。  
本文相对上一版，新增 **§3.9 二修加强项**，并为 Phase A/B 每个 ID 写了 **线框 + 改哪些文件 + 步骤 + 禁止 + 验收**；附录 B 为整段可复制的 DeepSeek 提示词。

---

## 1. 现状能力地图（已有，禁止重复造）

| 能力 | 锚点 | 说明 |
|---|---|---|
| 四步流程 Tab | `studioTab`: `breakdown` / `grid` / `compose` / `handoff` | 可点切换；**无完成态着色** |
| 从成稿拆镜 | `breakdownFromPackage` | 要求上游 `ScreenplayPackage.status==='confirmed'` |
| 多集拆镜队列 | `runQueueForEpisodes` + `EpisodeQueueBar` | 可暂停 / 继续 / 跳过 / 取消 |
| 增量补拆 | 粘贴文本 → `mergeIncrementalBreakdown` | **写入前无解析预览** |
| 导入旧镜表 | `importLegacyBreakdown` | 用 `window.confirm` |
| 成稿变更检测 | `packageStale` + `packageSourceHash` | 仅文案，**无强 Banner** |
| 镜表宫格 | `ShotStoryCell` | 上传 / **线稿** / **编辑**（无试出 ✔） |
| 增镜 / 拆镜 / 合镜 | `addShotToBreakdown` / `split` / `merge` | **无删镜**；且调用时常不摘确认 |
| 镜头导航筛选 | `all` / `uncomposed` / `unbound` | 无数量角标；点导航**不滚到卡片** |
| 构图工具条 | 批量线稿 / 宫格线稿 / 故事板大图 + `ComposerModelSelect` | 模型在 Tab 外 ✔ |
| 构图子 Tab | 「线稿预览」/「本集故事板大图」 | 嵌入 `StoryboardPreviewWorkspace`（embedded 藏 3D ✔；仍残留评分/批审） |
| 单镜编辑弹窗 | 第二层 `ScreenModal` | 保存只 `gridConfirmed:false`，**不摘 `confirmedEpisodeIds`** |
| 交接 checklist | 镜数 / 覆盖率软阈 / 绑定 / 故事板 / 确认态 | 「打开导演台」**只 focus，不 spawn** |
| 底栏 | 本集摘要 +「确认本集」 | 无批量四按钮 ✔ |
| 就绪条 | 软/硬预检 + 构图强约束开关 | 文案偏工程化 |
| 导出 | `exportPack` | 偏开发向 JSON，非审片交付包 |

代码体量：`use-storyboard-desk.tsx` **≈2780 行**。测试：`StoryboardDeskBlock.test.tsx` 仅 render 冒烟。

---

## 2. 与已拍板 PRD 的对照（收口项）

| 已拍板项 | 代码现状 | 判定 |
|---|---|---|
| 镜表删「试出」，留线稿+编辑 | `ShotStoryCell` 仅两按钮 | ✅ |
| 底栏删四按钮；能力在构图条；开导演只在交接 | `sg3-foot` 仅确认；交接有「打开导演台」 | ✅（开导演能力弱，见 H/X-09） |
| 预览无 3D 入口 | embedded 时不渲染 3D 按钮 | ✅ |
| 关键帧预览 → 线稿预览；模型在 Tab 外 | Tab 文案 + 工具条模型 | ✅ |
| 分镜只出线稿 | Desk 内 `stylePreset: 'line-art'` | ⚠️ 嵌入预览仍带评分/重生低分/批审语感 |

---

## 3. 缺口总表（含原列 + 二修新增）

优先级：`P0` 会丢工作成果 / 状态撒谎 / 任务卡死 / 错交付；`P1` 效率与专业感；`P2` 打磨。

### 3.1 流程与信息架构（F）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| F-01 | 步骤条无完成态 | P1 | 有镜表/有线稿/已确认时不显示 `is-done` |
| F-02 | 冷启动引导偏「工程页」 | P1 | 缺「三步你会得到什么」 |
| F-03 | 就绪条文案工程化 | P2 | 应人话 + 明确阻断原因 |
| F-04 | 镜表 / 构图双入口出线稿 | P1 | 用户不知以谁为准 |
| F-05 | 嵌入预览残留关键帧语汇 | P1 | 评分/重生低分/提交批审 |
| F-06 | 顶栏切集后故事板大图可能串集 | **P0** | `contactSheetUrl` 全局一份 |
| F-07 | 选中导航不滚到镜卡片 | P2 | 长集难定位 |
| F-08 | 筛选无计数 | P2 | 「未构图 (12)」 |

### 3.2 拆镜（B）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| B-01 | 成稿 stale 仅弱文案 | **P0** | 无顶栏阻断条 + 重拆 CTA（= X-01） |
| B-02 | 破坏性确认用 `window.confirm` | P1 | 应用 `askConfirm` / `confirmDelete` |
| B-03 | 增量补拆无预览 | P1 | = X-11 |
| B-04 | 重拆策略粗糙 | P1 | 缺本集/全部/仅未确认选项 |
| B-05 | 拆镜失败无「只重试失败」 | P1 | 队列有失败计数，缺入口 |
| B-06 | 拆镜中可切 Tab / 关台 | P1 | 归入 X-15 |

### 3.3 镜表运维（G）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| G-01 | **无删镜** | **P0** | runner 无 `removeShotFromBreakdown` |
| G-02 | 无拖拽重排镜序 | P1 | = X-07 |
| G-03 | 无复制镜 / 批量选中 | P1 | 长集返工效率低 |
| G-04 | 线稿与编辑同用 Pencil 图标 | P2 | 辨识差 |
| G-05 | 删图/换图无确认 | P2 | 点击媒体即上传覆盖 |
| G-06 | 合镜规则不直观 | P1 | 失败只 appendLog |
| G-07 | 无本地撤销栈 | **P0** | = X-06 |

### 3.4 构图 / 线稿（C）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| C-01 | **批量线稿不可停止** | **P0** | `for` 无 AbortSignal |
| C-02 | 宫格线稿同样不可停 | **P0** | 同上 |
| C-03 | 部分失败不可「只重试失败/缺图」 | P1 | |
| C-04 | 单镜线稿进行时批量体验弱 | P1 | |
| C-05 | 线稿成功不使本集确认失效 | **P0** | 归入 X-02 |
| C-06 | 故事板大图 URL 全局一份 | **P0** | = X-03 |
| C-07 | 「仅缺图」范围 UI 未暴露 | P1 | |
| C-08 | 无模型/连接失败内联空态 | P1 | 多依赖 activity log |

### 3.5 确认与交接（H）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| H-01 | 确认门槛过低 | **P0** | 硬门槛≈镜数≥1 |
| H-02 | 确认后编辑只清 `gridConfirmed` | **P0** | 不摘 `confirmedEpisodeIds` |
| H-03 | 「打开导演台」不自动 create/连边 | P1 | = X-09 |
| H-04 | 交接不主动推确认+线稿给导演台 | P1 | |
| H-05 | 多集进度不可见 | P1 | 缺「3/12 集已确认」 |
| H-06 | 取消确认入口缺失 | P1 | |

### 3.6 持久化 / 安全（S）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| S-01 | 无分镜草稿 / 自动存 | P1 | |
| S-02 | 批量进行中关 Modal / 刷新无拦截 | **P0** | |
| S-03 | 无「重置本台」回收策略 | P2 | |

### 3.7 工程健康（Q）

| ID | 缺口 | P | 说明 |
|---|---|---|---|
| Q-01 | `use-storyboard-desk.tsx` ≈2780 行 | **P0** 工程 | Phase C 再拆 |
| Q-02 | 测试仅 render 冒烟 | **P0** | |
| Q-03 | `compositionTemplateId` 等类型债 | P1 | |
| Q-04 | 仍回退读全局 `workspace.storyboard.shots` | P1 | |
| Q-05 | 错误无结构化 code | P2 | |

### 3.8 上一轮已列加强项（X-01～X-15）

| ID | 加强项 | 价值 | P |
|---|---|---|---|
| X-01 | 顶栏 Stale Banner | 防错交付 | P0 |
| X-02 | 确认失效规则统一 | 状态诚实 | P0 |
| X-03 | 按集 `contactSheets` | 多集不串图 | P0 |
| X-04 | 批量线稿 AbortController +「停止」 | 可控成本 | P0 |
| X-05 | 删镜 + 确认框 | 运维闭环 | P0 |
| X-06 | 本地撤销栈 | 误操作可救 | P0 |
| X-07 | 镜表拖拽排序 | 专业基本功 | P1 |
| X-08 | 嵌入预览线稿精简模式 | 职责纯度 | P1 |
| X-09 | 交接 spawn 导演台 + 连边 | 主链闭环 | P1 |
| X-10 | 确认门禁可选硬阈值 | 质量闸 | P1 |
| X-11 | 增量补拆 Diff 预览 | 防糊镜表 | P1 |
| X-12 | 键盘快捷键 | 效率 | P2 |
| X-13 | 导出审片包 | 对外协作 | P2 |
| X-14 | 本集总时长 / 平均镜长 | 节奏感 | P2 |
| X-15 | 拆镜/批量运行互锁 | 竞态 | P0 |

### 3.9 二修新增加强项（上一版未列细）

| ID | 加强项 | 价值 | P | 依据（代码锚点） |
|---|---|---|---|---|
| X-16 | **线稿 frames 按当前集过滤展示** | 切集后嵌入预览不混他集帧 | **P0** | `storyboardPreview.frames` 全局数组；切集只换 `visibleShots`，预览仍可能混显 |
| X-17 | **清除本镜线稿**（⋯ 菜单） | 换构图前可清空 | P1 | 媒体区只有上传覆盖，无 clear |
| X-18 | **诊断项点击 → 选中并滚到镜卡片** | 修镜可定位 | P1 | `diagnostics` 只列表，无 click |
| X-19 | **未连图像节点时工具条内联空态** | 不靠 activity log | P1 | `resolveConnectedPictureGenId` 失败只 `appendLog` |
| X-20 | **确认前列出缺图镜号** | 门禁可行动 | **P0** | 覆盖率不足时无「缺哪些镜」 |
| X-21 | **显式「撤回本集确认」** | 对称 H-06 | P1 | 底栏只有确认，无撤回 |
| X-22 | **批量范围 UI：缺图优先 / 全部覆盖** | 暴露 C-07 | P1 | `generateBatchLineArt(scope)` 参数未上 UI |
| X-23 | **结构变更（增/拆/合）必须走统一失效** | 堵住 H-02 漏洞 | **P0** | 现 `applyDeskBreakdown(...)` 常不传 `confirmedEpisodeIds` 摘除 |
| X-24 | **合镜失败 inline tip** | 可感知 | P1 | 首镜合镜只 appendLog |
| X-25 | **顶栏集进度条**「已确认 a/b · 本集覆盖率」 | 多集心智 | P1 | 下拉有 done 点，无总览 |

---

## 4. 目标态主路径（生产级）

```text
编剧台确认成稿并送分镜
  → 分镜台高亮「拆镜」（可带 autoOpenBreakdown）
  → 拆本集或队列拆多集（可停 / 失败可重试）
  → 镜表：增/删/拆/合/排序 + 单镜线稿/上传/清除
  → 构图：缺图优先批量线稿（可停）→ 故事板大图（按集）
  → 交接：硬/软门禁 + 缺图列表 → 确认本集（状态诚实）
  → 打开导演台（无则 spawn 并连边）→ 彩色关键帧批出
```

任一时刻：上游成稿 hash 变化 → **顶栏 Stale Banner**，禁止静默当「已同步」。  
任一结构/线稿变更 → **摘本集确认** + 失效 Banner。

---

## 5. 默认产品决策（未另拍板则按此实现）

| 议题 | 默认 |
|---|---|
| 确认硬门槛 | 镜数≥1 **且** 构图覆盖≥60%；不足时弹二次确认「仍要确认」列出缺图镜；硬模式开关仍可抬高设定就绪 |
| 确认失效触发 | 增删拆合排序、改镜头字段保存、单镜/批量线稿成功写回、清除线稿、重拆/导入覆盖、成稿 stale 后重拆 |
| 故事板大图 | **按集** `contactSheetsByEpisode[episodeId]={url,signature}`；切集显示该集；兼容读旧全局字段一次迁移 |
| 线稿 frames 展示 | 嵌入预览 / 覆盖率只统计 **当前集 shotId**；写回仍可进全局 frames（用 sourceShotId 关联） |
| 批量线稿默认范围 | 「当前集 · 缺图优先」；可选「当前集全部覆盖」 |
| 打开导演台 | 有则 focus；无则 `requestSpawn('director-desk')` + edge + focus（对称编剧→分镜） |
| 删镜 | `confirmDelete`；确认后重排 index；摘确认 |
| 撤销 | 本地栈 20 步，仅本节点 `scriptBreakdown` 快照（不含进行中网络任务） |
| 嵌入预览 | `embedded`：只保留线稿网格/补缺图/同步；**隐藏**评分、重生低分、提交批审、底部批审条 |
| 破坏性弹窗 | 一律 `askConfirm` / `confirmDelete`；禁止新 `window.confirm` |

---

## 6. 建议分期

### Phase A · 生产阻断（先做完再谈体验）

`X-01` → `X-02`+`X-23` → `X-03`+`X-16` → `G-01`/`X-05` → `C-01`/`C-02`/`X-04` → `X-15` → `S-02` → `H-01`/`X-20` → `Q-02`（关键测例）

### Phase B · 效率与主链闭环

`X-06` → `X-07` → `X-08`/`F-05` → `X-09` → `X-22`/`C-03`/`C-07` → `X-11`/`B-03` → `F-01` → `B-02` → `X-17` → `X-18` → `X-19` → `X-21` → `X-24` → `X-25` → `H-05`

### Phase C · 打磨

`X-12` · `X-13` · `X-14` · `F-02`/`F-03`/`F-07`/`F-08` · `G-03`/`G-04`/`G-05` · `Q-01` 拆文件 · `S-01`/`S-03`

---

# 7. 施工说明书（DeepSeek 逐 ID）

> 每个 ID：**现状锚点 / UI 线框 / 改动文件 / 实现步骤 / 禁止 / 验收**。  
> Phase A 写全；Phase B 同样可执行粒度；Phase C 可略简但必须有验收句。

---

## 7.1 X-01 · 顶栏 Stale Banner（P0）

### 现状锚点
- `packageStale` 已在 `use-storyboard-desk.tsx` 计算（约 L212）。  
- UI 仅在拆镜卡片旁拼「成稿已更新」文案（约 L1778），无固定顶栏。

### UI 线框（原型位置）
插在 **就绪条下方、步骤条上方**（`sg3-readiness-bar` 与 `sg3-pipeline` 之间）：

```text
+------------------------------------------------------------------+
| ⚠ 上游成稿已更新（与当前镜表不同步）                                |
| [查看差异摘要]  [重拆本集]  [重拆全部]  [稍后]                       |
+------------------------------------------------------------------+
```

- 「稍后」：本会话 `sessionStorage` 或组件 state 隐藏；**不**清除 stale 真相。  
- 「查看差异摘要」：简单弹层，展示上游集数/标题/hash 前 8 位 vs 本地 `packageSourceHash`（不必做全文 diff）。

### 改动文件
1. `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx`  
2. `apps/web/src/blocks/craft/storyboard-desk.v2.css` — `.sg3-stale-banner`

### 实现步骤
1. 当 `packageStale && payload` 且未「稍后」→ 渲染 banner。  
2. 「重拆本集」调用现有单集拆镜；「重拆全部」走队列（复用 `runQueueForEpisodes`）。  
3. 重拆成功后更新本地 hash，banner 消失。  
4. CSS：警告色条，勿用 emoji 堆砌以外的新图标体系（可用现有 warn token）。

### 禁止
- 用 `window.alert`；静默自动重拆。

### 验收
- 改编剧台成稿并确认后回到分镜台 → 顶栏 banner 必现。  
- 点「稍后」本会话可藏；刷新或重新计算仍 stale 时可再显（或刷新再显，二选一写在 tip，推荐刷新再显）。

---

## 7.2 X-02 + X-23 · 确认失效规则统一（P0）

### 现状锚点
- `saveShotEdit`：`applyDeskBreakdown(..., { gridConfirmed: false })`，**不改** `confirmedEpisodeIds`（约 L710）。  
- `generateShotLineArt` 成功写回：只改 `storyboardPreview.confirmed: false`，**不摘** `confirmedEpisodeIds`（约 L1047）。  
- 增/拆/合镜：`applyDeskBreakdown(props.id, next, updateNodeData)` **无任何确认清理**（约 L1892–1924）。  
- UI：`currentEpisodeConfirmed = confirmedEpisodeIds.includes(currentEpisodeId)`。

### UI 线框
步骤条下（或底栏上方）固定条，仅当「本集刚从确认被摘掉」或「本集曾确认且当前不在列表」且用户未重新确认：

```text
| 本集镜表/线稿已变更，确认状态已撤销 · [重新确认] |
```

「重新确认」→ `setStudioTab('handoff')` 或直接滚到底栏确认。

### 改动文件
1. `apps/web/src/engine/storyboard-desk-runner.ts` — 新增纯函数  
2. `use-storyboard-desk.tsx` — 所有写镜表/写线稿路径调用  
3. `storyboard-desk.v2.css` — `.sg3-unconfirm-banner`

### 实现步骤
1. 在 runner 新增：

```ts
export function stripEpisodeConfirmation(
  data: Record<string, unknown>,
  episodeId: string | null,
): { gridConfirmed: false; confirmedEpisodeIds: string[] } {
  const ids = Array.isArray(data.confirmedEpisodeIds)
    ? (data.confirmedEpisodeIds as string[]).filter((id) => id !== episodeId)
    : [];
  return {
    gridConfirmed: false,
    confirmedEpisodeIds: ids,
  };
}
```

2. 封装 `applyBreakdownAndInvalidate(nextPayload, episodeId)`：  
   `applyDeskBreakdown(id, next, updateNodeData, stripEpisodeConfirmation(...))`。  
3. **必须改到的调用点**：增镜、拆镜、合镜、删镜、排序、saveShotEdit、单镜线稿成功、批量线稿任一成功写回、清除线稿、导入覆盖、重拆写入。  
4. 可选 state：`unconfirmBannerEpisodeId`，在摘除时 set，重新确认时 clear。

### 禁止
- 只改 `gridConfirmed` 却保留 `confirmedEpisodeIds`。  
- 清空**全部**集的确认（除非整表覆盖重拆/导入——那时可 `confirmedEpisodeIds: []`）。

### 验收
- 本集已确认 → 改标题保存 → 顶栏/底栏不再显示「已确认」；`confirmedEpisodeIds` 不含该集。  
- 本集已确认 → 出一张线稿 → 同上。  
- 本集已确认 → 增镜 → 同上。  
- 其他已确认集不受影响。

---

## 7.3 X-03 + X-16 · 按集故事板 + frames 按集展示（P0）

### 现状锚点
- `StoryboardPreviewPayload.contactSheetUrl` / `contactSheetSignature` 全局（`packages/shared/src/types/storyboard-preview.ts`）。  
- `generateStoryboardSheet` 写入全局 URL（约 L1515）。  
- 切集后 `contactSheetUrl` 仍显示上一集图。  
- `frames` 全局；嵌入预览可能混多集。

### UI
- 构图「本集故事板大图」：无本集图 → 空态「本集尚未生成故事板」。  
- 有本集图 → 显示该集；标题带集名。

### 改动文件
1. `packages/shared/src/types/storyboard-preview.ts`  
2. `packages/shared/src/index.ts`（若需导出 helper）  
3. `use-storyboard-desk.tsx` — 读写/展示  
4. 交接 checklist 里「故事板」判定改按当前集

### 实现步骤
1. 类型增加（保持旧字段兼容）：

```ts
contactSheetsByEpisode?: Record<string, {
  url: string;
  signature: string;
  updatedAt?: string;
}>;
```

2. 写入：`contactSheetsByEpisode[currentEpisodeId] = { url, signature }`；可同时写旧 `contactSheetUrl` 作为「最近一次」缓存，但**读展示必须以当前集 map 为准**。  
3. 读取 helper：`getEpisodeContactSheet(preview, episodeId)`：先 map，若无且旧 signature 匹配当前集可见镜则可回退旧字段一次。  
4. **X-16**：传给嵌入预览的 frames = `preview.frames.filter(f => currentEpisodeShotIds.has(f.sourceShotId))`；或给 Workspace 新 prop `frameShotIdFilter`。覆盖率/缺图统计同口径。  
5. `pnpm --filter @nx9/shared build`。

### 禁止
- 删掉旧字段导致旧工作区崩（允许读兼容）。  
- 把彩色关键帧逻辑搬回分镜台。

### 验收
- 集 A 生成故事板 → 切集 B → B 为空态或 B 自己的图，绝不显示 A。  
- 嵌入预览在集 B 不显示仅属于集 A 的帧。

---

## 7.4 G-01 / X-05 · 删镜（P0）

### 现状锚点
- runner 有 `addShotToBreakdown` / `mergeShotsInBreakdown` / `splitShotInBreakdown`，**无 remove**。  
- `ShotStoryCell` 仅线稿+编辑。

### UI 线框
```text
卡片底栏： [线稿] [编辑] [⋯]
⋯ 菜单：
  · 删镜
  · 复制镜（Phase B/G-03 可先做菜单占位，但本 ID 必须做删镜）
  · 在此后增镜（可复用现有 add）
```

与编剧台集行「⋯」同一交互语言（`sg-story-cell__menu`）。

### 改动文件
1. `apps/web/src/engine/storyboard-desk-runner.ts` — `removeShotFromBreakdown`  
2. `shot-story-cell.tsx` — ⋯ 菜单  
3. `use-storyboard-desk.tsx` — handler + 失效确认  
4. `storyboard-desk.v2.css`  
5. 单测（见 Q-02）

### 实现步骤
1. `removeShotFromBreakdown(payload, shotId)`：  
   - clone → 找到集内 index → splice → **重排** `index` 为 1..n  
   - 同步清理该 shot 在 `storyboardPreview.frames` 中对应帧（在 desk 层做亦可）  
   - 至少保留 1 镜：若删后该集 0 镜，`askConfirm` 警告或禁止删最后一镜（默认：**禁止删最后一镜**，tip 说明）。  
2. UI：`confirmDelete({ title: '删除本镜？', description: '…' })`。  
3. 成功后 `applyBreakdownAndInvalidate`。  
4. 线稿按钮图标可顺手改为 `PenLine`/`Sparkles` 与编辑区分（G-04，可选同 PR）。

### 禁止
- `window.confirm`。  
- 不重排 index 导致 sceneCode 错乱。

### 验收
- 5 镜删第 2 → 剩 4，index 连续；确认态失效；对应 frame 消失或不再计入本集。

---

## 7.5 C-01 / C-02 / X-04 · 批量线稿可停止（P0）

### 现状锚点
- `generateBatchLineArt` / 宫格批量：`for` 循环，仅 `batchMode` + `batchProgress` 文案，无 Abort。  
- 拆镜队列反而可停（可对照 `EpisodeQueueBar` 模式，但线稿用 AbortController 即可）。

### UI 线框
```text
构图工具条
[ 线稿 3/24 … ] [ 停止 ]     模型 ▾
```

停止后 tip：`已停止 · 成功 3 · 失败/跳过 …`；已成功保留。

### 改动文件
1. `use-storyboard-desk.tsx` — `lineArtAbortRef`  
2. 若 `generateStoryboardFrameImage` 支持 fetch：把 `signal` 往下传（查 `api` / 图像生成调用链，**有则传，无则循环边界检查 aborted**）  
3. `storyboard-desk.v2.css` — 停止按钮样式复用 `sg3-btn`

### 实现步骤
1. 开批前 `lineArtAbortRef.current = new AbortController()`；旧的先 abort。  
2. 每镜迭代前：`if (signal.aborted) break`。  
3. UI：`batchRunning` 时主按钮旁显示「停止」，点击 `abort()`。  
4. `finally`：清 `batchMode`；**不要**回滚已写入的线稿。  
5. 宫格线稿同一套 abort。  
6. 与 X-02：任一成功写回即 invalidate 本集确认（可批末统一摘一次，避免 N 次 update；但必须摘）。

### 禁止
- 停止后删除已成功线稿。  
- 假装可停（按钮无 abort）。

### 验收
- 24 镜批量，出到第 3 点停止 → 前 3 张仍在，可继续「缺图优先」补剩余。

---

## 7.6 X-15 · 运行互锁（P0）

### 现状锚点
- `batchRunning` 会 disable 部分按钮；拆镜队列进行中仍可点重拆/关台/切破坏性操作。

### UI
- 运行中：重拆、导入、重置类、删镜、确认本集 → disabled + title 说明。  
- 可选底栏小条：`拆镜队列进行中…` / `批量线稿 3/24…`。

### 改动文件
- `use-storyboard-desk.tsx`  
- CSS 可选

### 实现步骤
1. `const deskBusy = batchRunning || sheetComposing || queueState.status === 'running' || generatingShotId != null`（按现有 queue API 字段名核对）。  
2. 破坏性按钮统一 `disabled={deskBusy}`。  
3. 与 S-02 联动：busy 时关台走确认。

### 验收
- 批量线稿中无法点「从成稿拆镜」/导入/删镜。

---

## 7.7 S-02 · 关台 / 刷新拦截（P0）

### UI
- `beforeunload`：当 `deskBusy` 或本地 dirty（可选：有未保存编辑弹窗）。  
- 关 `ScreenModal`：若 `deskBusy` → `askConfirm('任务进行中，确定关闭？关闭不会撤销已成功的线稿')`；取消则保持打开。

### 改动文件
- `use-storyboard-desk.tsx`（`studioOpen` / Modal `onClose`）

### 实现步骤
1. `useEffect` 注册/注销 `beforeunload`（仅 busy 时）。  
2. 包装 `closeStudio`：busy 则确认。

### 验收
- 批量中点刷新有浏览器提示；点关闭取消后 Modal 仍开。

---

## 7.8 H-01 + X-20 · 确认门禁 + 缺图列表（P0）

### 现状锚点
- `confirmEpisode`（约 L620）：实质硬门槛弱；覆盖率仅警告仍可确认。

### UI 线框
```text
确认本集前
┌ 确认检查 ─────────────────────┐
│ ✓ 镜数 24                     │
│ ⚠ 构图覆盖 45%（建议 ≥60%）    │
│ 缺图：S03 S07 S12 …           │
│ [取消] [仍要确认]              │
│ 达标时主按钮直接确认           │
└───────────────────────────────┘
```

### 改动文件
- `use-storyboard-desk.tsx`  
- CSS：`.sg3-confirm-gate`  
- 复用 `askConfirm` / 自绘小弹层（与编剧台 handoff 弹层类似即可）

### 实现步骤
1. 计算 `missingShots = visibleShots.filter(s => !isShotComposed(...))`。  
2. 覆盖率 < 0.6 或缺图 > 0：弹出列表，主按钮为「仍要确认」。  
3. ≥0.6 且镜数≥1：直接确认（或仍走轻量 tip）。  
4. 确认成功写入 `confirmedEpisodeIds`，清 unconfirm banner。

### 禁止
- 无提示直接确认低覆盖（除非用户点了「仍要确认」）。

### 验收
- 覆盖 40% 点确认 → 看见缺图镜号 → 取消则不写入；「仍要确认」才写入。

---

## 7.9 Q-02 · 关键行为测（P0）

### 改动文件
- `apps/web/src/blocks/craft/__tests__/StoryboardDeskBlock.test.tsx`  
- 优先测 **纯函数**（runner / shared）：不必全挂 React 流。

### 最低测例
1. `removeShotFromBreakdown` 重排 index。  
2. `stripEpisodeConfirmation` 只摘一集。  
3. `getEpisodeContactSheet` 切集不串。  
4. （可选）abort：mock 循环检查 aborted 标志的小函数。

### 验收
- `pnpm --filter @nx9/web test`（或仓库惯用命令）相关测例通过。

---

## 7.10 X-06 · 本地撤销栈（P0，Phase B 首选）

### UI
镜表工具条：`[撤销]`（`Ctrl+Z` 可 Phase C）。disabled 当栈空或 deskBusy。

### 改动文件
- `use-storyboard-desk.tsx`  
- 可选抽 `storyboard-desk/undo-stack.ts`

### 实现步骤
1. `undoStackRef: ScriptBreakdownPayload[]` 最大 20。  
2. 任何将写入新 `scriptBreakdown` 的本地结构变更**之前** `push(clone(payload))`。  
3. 撤销：`pop` + `applyDeskBreakdown`；**不**自动恢复 confirmed（保持摘除后的诚实态，或同时恢复当时 confirmed 快照——默认：**只恢复 mirror 结构，确认保持当前**，避免误交付）。  
4. 网络任务中禁止撤销。

### 验收
- 合镜 → 撤销 → 镜表恢复。

---

## 7.11 X-07 · 拖拽排序（P1）

### UI
镜卡片左侧拖手柄；拖放到新位置；松手后重排 index。

### 改动文件
1. runner：`reorderShotsInBreakdown(payload, episodeId, orderedShotIds)`  
2. `shot-story-cell.tsx` / 镜表容器  
3. CSS

### 实现步骤
1. 可用 HTML5 DnD 或项目已有 dnd 库（**先搜仓库**，有则复用，无则 HTML5）。  
2. 成功后 invalidate 确认。  
3. 入撤销栈。

### 验收
- 镜 1,2,3 拖 3 到前 → 顺序 3,1,2，index 重排。

---

## 7.12 X-08 / F-05 · 嵌入预览线稿精简（P1）

### 现状锚点
- `StoryboardPreviewWorkspace.tsx`：`embedded` 已藏 3D；**仍显示**评分、重生低分；底部仍有「提交分镜批审」（约 L500–816）。

### UI
embedded 下只保留：标题/副文案、已出/缺图 chip、图像连接 chip、**补线稿/同步**、网格。  
隐藏：评分、重生低分、提交批审、批量重生、3D。

### 改动文件
1. `StoryboardPreviewWorkspace.tsx`  
2. `keyframe-preview.css`（embedded 紧凑，可选）

### 禁止
- 改非 embedded（导演台完整预览）行为。

### 验收
- 分镜台构图 Tab 看不到「评分」「提交批审」。

---

## 7.13 X-09 · 打开导演台 spawn（P1）

### 现状锚点
- `openDirectorDesk`（约 L658）：有节点则 `focusBlock`；无则只 log「请从 Dock 放置」。  
- 编剧台对称实现：`ScriptDeskBlock` 里 `requestSpawn('storyboard-desk', …)` + `connectToSource`（约 L444–469）。

### UI
交接页按钮文案保持「打开导演台」；无节点时 tip：`已创建导演台并连线`。

### 改动文件
- `use-storyboard-desk.tsx`  
- 复用 `useFlowCommands.getState().requestSpawn`

### 实现步骤
1. 查找 `director-desk`；有则 focus。  
2. 无则：

```ts
requestSpawn('director-desk', undefined, {
  connectToSource: props.id,
  handoff: {
    from: 'storyboard-desk',
    to: 'director-desk',
    fromId: props.id,
    at: new Date().toISOString(),
    sourceStoryboardBlockId: props.id,
    episodeId: currentEpisodeId,
  },
});
```

3. 字段名以 `requestSpawn` / flow 现有约定为准（打开 `flow-commands` 核对，禁止臆造）。

### 验收
- 空画布仅分镜台 → 点打开导演台 → 出现导演台节点且有连边并可 focus。

---

## 7.14 X-22 / C-07 / C-03 · 批量范围 + 只重试缺图（P1）

### UI
```text
批量线稿 ▾
  · 缺图优先（默认）
  · 全部覆盖
[只重试失败]  ← 上次 batch 有失败时显示
```

### 实现
- UI 绑定 `generateBatchLineArt('visible' | …)` 并增加 `missingOnly: boolean`。  
- 缺图优先：跳过 `isShotComposed` 已为 true 的镜。  
- 记录 `lastBatchFailures: string[]` 供重试。

### 验收
- 已有 10 张线稿再点缺图优先 → 只打剩余；进度分母正确。

---

## 7.15 X-11 / B-03 · 增量补拆预览（P1）

### UI
```text
┌ 将新增约 N 镜 ──────────┐
│ S01 …预览行             │
│ …                       │
│ [取消] [合并入镜表]      │
└─────────────────────────┘
```

### 实现
1. 粘贴后先 `buildScriptBreakdownFromText` / 现有 parse，**不写入**。  
2. 展示将 merge 的新增镜列表。  
3. 确认后才 `mergeIncrementalBreakdown` + invalidate。

### 验收
- 取消则 payload 不变。

---

## 7.16 F-01 · 步骤条完成态（P1）

### 逻辑
```ts
hasBreakdown = Boolean(payload?.episodes?.length)
hasLineArt = stats.composedCount > 0  // 当前集
episodeConfirmed = currentEpisodeConfirmed
// breakdown done if hasBreakdown
// grid done if hasBreakdown
// compose done if hasLineArt
// handoff done if episodeConfirmed
```

CSS：现有 `.sg3-pipeline__step` 增 `.is-done`。

### 验收
- 有镜表无线稿：1–2 done，3 未 done。

---

## 7.17 B-02 · ConfirmHost 替换 window.confirm（P1）

### 锚点
- `importLegacyBreakdown`、重拆确认等 `window.confirm`（约 L354、L388）。

### 实现
- 全部改为 `askConfirm` / `confirmDelete`。

### 验收
- 不再出现浏览器原生 confirm。

---

## 7.18 X-17 · 清除本镜线稿（P1）

### UI
⋯ 菜单「清除线稿」。

### 实现
- 清空 shot 的 `previewImageUrl` / `referenceImageUrl`；移除对应 frame.imageUrl 或帧；invalidate 确认；可选 `confirmDelete`。

### 验收
- 清除后徽章变「缺图」，覆盖率下降。

---

## 7.19 X-18 · 诊断跳转（P1）

### 实现
- diagnostic 带 `shotId` 时，点击 → `setSelectedId` + `scrollIntoView`（给 cell 加 `data-shot-id`）。

### 验收
- 长列表中点击诊断能滚到对应卡。

---

## 7.20 X-19 · 未连图像空态（P1）

### UI
构图工具条下方：

```text
未连接「图像生成」节点 · 请从能力口连线后再出线稿
```

### 验收
- 断连时不点按钮也能看见原因（不只 log）。

---

## 7.21 X-21 · 撤回本集确认（P1）

### UI
底栏在已确认时：主按钮变「撤回确认」或旁置次按钮。

### 实现
- `stripEpisodeConfirmation` + tip。

### 验收
- 确认 → 撤回 → checklist 确认态为否。

---

## 7.22 X-24 · 合镜失败 inline tip（P1）

### 实现
- 首镜合镜失败：`setTip('请选择非首镜与前镜合并')`（复用现有 tip 机制；无则用 `toast` / 工具条旁红字）。

### 验收
- 不需要打开 activity log 也能看见失败原因。

---

## 7.23 X-25 / H-05 · 多集进度（P1）

### UI
顶栏集选择旁：`已确认 3/12 · 本集构图 80%`。

### 验收
- 确认一集后数字 +1。

---

## 7.24 Phase C 摘要（可后置，仍须按 ID 做时写验收）

| ID | 要点 |
|---|---|
| X-12 | ↑↓ 选镜，E 编辑，L 线稿，Del 删镜（注意输入框 focus 时不抢键） |
| X-13 | 导出本集故事板 PNG + 镜表 CSV/MD（复用 `createScriptBreakdownExportEnvelope` 若适用） |
| X-14 | 底栏显示 `Σ durationSec` 与平均 |
| F-02 | 拆镜空态三步说明 |
| F-03 | 就绪条去堆砌 emoji，改短句 |
| F-07/F-08 | 导航 scroll + 筛选计数 |
| G-03 | 复制镜 / 多选 |
| G-04/G-05 | 图标区分；换图确认 |
| Q-01 | 按 tab 拆文件：`breakdown-panel` / `grid-panel` / `compose-panel` / `handoff-panel` / `batch` |
| S-01 | 分镜工作草稿 upsert（可对标编剧台，但**本阶段勿大抄**，单独立项） |

---

## 8. 主要改动面（实现白名单见附录 A）

| 区域 | 文件 |
|---|---|
| UI / 流程 | `use-storyboard-desk.tsx`（Phase C 再拆） |
| 镜卡片 | `shot-story-cell.tsx` |
| 样式 | `storyboard-desk.v2.css` |
| 结构 API | `storyboard-desk-runner.ts` |
| 预览精简 | `StoryboardPreviewWorkspace.tsx` |
| 类型 | `packages/shared/.../storyboard-preview.ts` |
| 确认框 | `stores/confirm-dialog`（只调用，不改 store 除非缺 API） |
| 测试 | `apps/web/src/blocks/craft/__tests__/` |

**禁止**：新建第二套分镜台；恢复试出/彩色批出/底栏四按钮/预览 3D；把彩色关键帧主路径做回分镜台。

---

## 9. 流程优化建议（产品层）

1. **一条主按钮原则**：每 Tab 一个主 CTA（拆镜：从成稿生成；镜表：去构图补线稿；构图：缺图批量线稿；交接：确认本集）。  
2. **按集心智**：故事板、确认、覆盖率、frames 展示全部跟随当前集。  
3. **贵操作可停可续**：>3 次模型调用必须有进度 + 停止 + 部分成功保留。  
4. **状态诚实**：确认是交付契约；影响下游的变更必须摘确认并明示。  
5. **职责纯度**：分镜台只谈线稿/构图/故事板；评分/批审/关键帧留给导演台。  
6. **与编剧台对称**：开导演应对称 spawn；破坏性弹窗统一 ConfirmHost；长任务可停。

---

## 10. 验收清单（生产级最低线）

- [ ] 成稿变更后顶栏 Banner 必现，且可一键重拆  
- [ ] 确认后改镜/出线稿/增拆合 → 本集退出 `confirmedEpisodeIds`，UI 不再「已确认」  
- [ ] 切集后故事板大图与线稿预览不显示另一集产物  
- [ ] 可删镜；误操作可撤销至少一步结构变更（X-06）  
- [ ] 批量线稿 / 宫格线稿可停止；已成功保留  
- [ ] 批量进行中刷新/关台有拦截  
- [ ] 确认在覆盖率不足时需二次确认并列出缺图镜  
- [ ] 交接「打开导演台」在无节点时可创建并连边  
- [ ] 镜表无试出；底栏无四按钮；嵌入预览无 3D/无评分批审；无彩色批出主按钮  
- [ ] 关键行为测覆盖：删镜、确认失效、按集 contactSheet  

---

## 11. 附录 · 当前主链示意

```text
编剧台(confirmed package)
        │ handoff / edge
        ▼
分镜台 scriptBreakdown + storyboardPreview(line-art)
        │ confirm episode
        ▼
导演台 彩色关键帧 / 3D / 批出
```

今日最大风险：**状态不诚实 + 贵任务不可停 + 多集产物串味 + 结构不可删不可悔**。先收 Phase A。

---

# 附录 A · 文件白名单

```text
apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx
apps/web/src/blocks/craft/storyboard-desk/shot-story-cell.tsx
apps/web/src/blocks/craft/storyboard-desk/helpers.tsx
apps/web/src/blocks/craft/storyboard-desk.v2.css
apps/web/src/blocks/craft/storyboard-desk.css
apps/web/src/blocks/nx9/StoryboardDeskBlock.tsx
apps/web/src/blocks/craft/__tests__/StoryboardDeskBlock.test.tsx
apps/web/src/engine/storyboard-desk-runner.ts
apps/web/src/engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace.tsx
apps/web/src/engine/stage-deck/chrome/attached-workspace/storyboard-preview/**
apps/web/src/styles/keyframe-preview.css
apps/web/src/stores/confirm-dialog.ts
apps/web/src/api/client.ts
packages/shared/src/types/storyboard-preview.ts
packages/shared/src/types/script-breakdown.ts
packages/shared/src/utils/chain-storyboard.ts
packages/shared/src/utils/script-breakdown-production.ts
packages/shared/src/index.ts
# 仅测 runner/shared 时可加：
apps/server/test/**/*storyboard*
apps/web/src/engine/**/__tests__/**
```

Phase A **不要**为拆文件（Q-01）大搬家。  
允许调用但不改实现：`EpisodeQueueBar`、`useFlowCommands`、`ConfirmHost`、`api.uploadAsset`。

---

# 附录 B · DeepSeek 系统提示词（整段复制）

> 用法：把下面代码块**整段**贴给 DeepSeek-V4-Pro；把 `{ID_LIST}` 换成本次要做的 ID（推荐先 Phase A）。  
> 用户当次消息里的 ID 列表优先于文档推荐顺序。

```text
【角色】
你是 NX9 仓库的实现工程师（不是产品经理、不是架构顾问）。唯一任务：按施工文档把指定功能 ID 做完、做对、可验收。

【唯一权威文档】
docs/NX9-STORYBOARD-DESK-PRODUCTION-GAP-ANALYSIS.md
（辅读已拍板 UX：docs/NX9-REQ-SCRIPT-STORYBOARD-DESK-UX.md）
冲突时以 PRODUCTION-GAP 文档 §7 对应 ID 的「实现步骤 / 禁止 / 验收」为准。
用户当次消息里的 ID 列表 > 文档推荐顺序。

【本次任务】
只实现这些 ID：{ID_LIST}
（若用户写 Phase A，则等于文档 §6 Phase A 整条列表，仍须按 ID 逐个完成与自检。）

推荐 Phase A：X-01 → X-02+X-23 → X-03+X-16 → G-01/X-05 → C-01/C-02/X-04 → X-15 → S-02 → H-01/X-20 → Q-02

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
分镜台职责硬约束：只出线稿构图；禁止恢复「试出」、彩色批出、底栏四按钮、嵌入预览 3D、评分/批审主路径。

【开工前强制步骤（不做不许写业务代码）】
1. 通读文档：DeepSeek 必读、§1 已有能力、本次每个 ID 的 §7 小节小节、附录 A 白名单、§5 默认拍板。
2. 在代码里定位锚点（必须打开文件确认，禁止凭记忆）：
   - apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx
   - apps/web/src/blocks/craft/storyboard-desk/shot-story-cell.tsx
   - apps/web/src/engine/storyboard-desk-runner.ts
   - apps/web/src/engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace.tsx
   - packages/shared/src/types/storyboard-preview.ts
   - apps/web/src/stores/confirm-dialog.ts（askConfirm / confirmDelete）
3. 输出「施工计划」短表后再编码：ID | 改哪些文件 | 复用哪些函数 | 验收怎么测。
4. 若文档某 ID 与代码现状冲突：先写清冲突点并停下问用户；禁止擅自改语义。

【硬约束 · 数据与行为】
1. 数据真相：node.data.scriptBreakdown + node.data.storyboardPreview + node.data.confirmedEpisodeIds。
2. 确认失效必须同时处理 gridConfirmed=false 与从 confirmedEpisodeIds 移除当前集（X-02/X-23）；禁止只改其中一个。
3. 故事板大图按集存储 contactSheetsByEpisode；展示以当前集为准（X-03）；嵌入预览 frames 按当前集 shotId 过滤（X-16）。
4. 批量线稿必须 AbortSignal/循环 abort 检查（X-04）；停止后保留已成功，禁止回滚成功线稿。
5. 删镜必须 confirmDelete + removeShotFromBreakdown 重排 index（X-05）；禁止 window.confirm。
6. 打开导演台：无节点则 requestSpawn + 连边，对称编剧台送分镜（X-09，若在本次 ID 内）。
7. 破坏性弹窗一律 askConfirm/confirmDelete；本迭代禁止新增 window.confirm。
8. 改 packages/shared 后必须执行：pnpm --filter @nx9/shared build，再跑相关测试。

【硬约束 · 文件白名单】
只许改附录 A 列出的路径。禁止：
- 新建第二套分镜台/平行路由/新 Desk kind
- 大重构无关模块、改编剧台（除非文档明示）
- 「顺便」格式化大文件、改无关命名、删已有能力
- 把 use-storyboard-desk 拆文件（Q-01）除非本次 ID 显式包含 Q-01
- 恢复试出/彩色批出/底栏四按钮/预览 3D/评分批审（embedded）

【硬约束 · 禁止偷懒】
1. 禁止只改文案/CSS 冒充功能完成。
2. 禁止 TODO/占位实现、假按钮、console 空函数。
3. 禁止写「剩余下次再做」却把 ID 标成完成；未做完的 ID 必须在交付清单里标「未完成」。
4. 禁止跳过该 ID 文档里的验收项。
5. 每个 ID 做完必须对照文档验收句逐条打勾（在最终回复里）。
6. 禁止引入新依赖，除非用户明示。
7. 禁止用「重构一下更优雅」扩 scope；先让行为正确。

【实现风格】
- 复用：applyDeskBreakdown、add/split/mergeShot*、generateShotLineArt、generateBatchLineArt、generateStoryboardSheet、packageSourceHash、filterShots、computeCompositionStats、askConfirm/confirmDelete、requestSpawn。
- 新增纯函数优先放 storyboard-desk-runner.ts 或 shared，便于 Q-02 单测。
- UI：扩现有 sg3-* / sg-story-*；线框以文档 §7 为准，不要自行发明第三套布局。
- 一次提交逻辑清晰；Phase A 若一次做多 ID，按文档顺序，每完成 2～3 个 ID 自检一次。

【默认拍板（§5，用户未改口则照做）】
确认：镜数≥1 且覆盖≥60%，不足须「仍要确认」+缺图列表；
失效：结构/字段/线稿/清除/重拆/导入均摘本集确认；
故事板与 frames 展示按集；
批量默认缺图优先；
删最后一镜禁止；
撤销栈（若做 X-06）只恢复结构不强制恢复确认；
embedded 隐藏评分批审。

【自测最低集】
每完成涉及逻辑的 ID，至少做文档验收；涉及 runner/shared 的补测例。
Phase A 结束前能口述手动点选：Stale Banner、确认后改镜失效、切集故事板不串、删镜、批量停止、关台拦截、低覆盖二次确认。

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

---

# 附录 C · 资源紧时 Top5

1. X-02 + X-23 确认失效（状态撒谎是最大生产事故）  
2. X-04 批量线稿可停  
3. X-03 + X-16 按集故事板/帧  
4. X-05 删镜  
5. X-01 Stale Banner  

---

# 附录 D · 给人类的一句话怎么用 DeepSeek

1. 把 **附录 B** 整段粘贴为系统/首条提示。  
2. `{ID_LIST}` 换成例如：`X-01, X-02, X-23, X-03, X-16, G-01, X-05, C-01, C-02, X-04, X-15, S-02, H-01, X-20, Q-02`。  
3. 附一句：「仓库根目录是 NX9；先读文档再打开白名单文件；每完成一个 ID 对照 §7 验收。」  
4. 做完 Phase A 再开新会话做 Phase B，避免上下文漂。
