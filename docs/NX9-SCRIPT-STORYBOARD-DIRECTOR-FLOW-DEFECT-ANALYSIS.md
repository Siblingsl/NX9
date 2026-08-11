# NX9 编剧台、分镜台、导演台运行链路缺陷分析

> 审计范围：编剧台 → 分镜台 → 导演台 → 视频生成
>
> 审计方式：当前代码静态核对、关键函数调用链追踪、相关测试执行结果核对
>
> 审计结论：主链可演示，但尚不具备生产级数据安全和交付可靠性

---

## 1. 总结结论

当前三台的主链可以演示：

```text
编剧台 → 分镜台 → 导演台 → 视频生成
```

但还不能认为是生产可用。最大问题不是少几个按钮，而是：

1. 线稿和关键帧的数据语义仍然混在一起。
2. 链镜表并没有完全成为唯一真相源。
3. 多集切换和确认状态存在串集、误判风险。
4. 导演台并发写回存在互相覆盖的可能。
5. 编剧台、分镜台、导演台之间缺少版本化交接契约。
6. 测试主要验证纯函数和渲染，没有覆盖真实三台串联流程。

当前最需要优先处理的是：

> 线稿污染关键帧字段、导演并发写回覆盖、确认状态跨集清除、旧 handoff 继续放行。

在这四项修复前，继续做界面优化或恢复 3D 都会建立在不可靠的数据链上。

---

## 2. 严重度定义

| 等级 | 含义 |
|---|---|
| P0 | 可能造成错交付、数据丢失、状态欺骗、跨链污染或不可逆错误 |
| P1 | 主流程可继续，但会造成明显返工、误解、效率损失或异常恢复困难 |
| P2 | 体验、维护性或一致性问题，不直接阻断主链 |

本文中“已确认”表示已经从当前代码找到明确调用路径；“待验证”表示存在风险，但仍需要浏览器或集成测试复现。

---

## 3. P0 严重缺陷

### 3.1 分镜线稿被写成导演关键帧

**状态：已确认，P0**

分镜台生成线稿后，会写入：

- `firstFrameAssetId`
- `keyframeStatus: 'review'`
- `status: 'review'`

代码锚点：

- `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx:1807`
- `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx:2003`
- `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx:2239`

实际数据链变成：

```text
分镜线稿
  → firstFrameAssetId
  → 导演台认为已有关键帧
```

影响：

- 导演台的缺关键帧判断可能把线稿当成已有彩图。
- `skipExisting` 可能跳过本应生成的彩色关键帧。
- 胶片条可能显示线稿，但状态却是关键帧状态。
- 视频生成阶段可能消费线稿，而不是彩色关键帧。
- `review` 同时表示线稿已生成和彩图待审，状态语义冲突。

应明确分离：

```text
分镜台：lineArtUrl / previewImageUrl
导演台：firstFrameAssetId / keyframeStatus
```

不能让分镜线稿占用导演关键帧字段。

### 3.2 分镜台仍在写全局 storyboard

**状态：已确认，P0**

`applyScriptBreakdownPayload` 会直接调用 `doc.setStoryboard(...)`。

代码锚点：

- `apps/web/src/engine/script-breakdown-runner.ts:175-180`

分镜台还多处调用全局 `updateShot`：

- `use-storyboard-desk.tsx:1445`
- `use-storyboard-desk.tsx:1680`
- `use-storyboard-desk.tsx:1807`
- `use-storyboard-desk.tsx:2003`
- `use-storyboard-desk.tsx:2239`

这与“`chainStoryboard` 是 SSOT、全局 storyboard 只做迁移缓冲”的设计不一致。

影响：

- 两个分镜台可能互相污染全局镜表。
- 分镜台 A 的线稿可能被分镜台 B 的兼容逻辑读到。
- 旧的全局消费者仍可能看到不属于当前链的镜头。
- 任一未迁移消费者都可能产生串链批出。

当前实际状态是“链数据 + 全局镜表双写”，不是严格的链隔离。

### 3.3 导演台并发写回可能互相覆盖

**状态：代码机制已确认，真实浏览器结果待集成复现，P0**

导演台 `patchShot` 使用 React 渲染中的 `nodes` 快照：

- `apps/web/src/blocks/core/DirectorDeskBlock.tsx:300-308`
- `apps/web/src/engine/chain-storyboard-utils.ts:89-108`

导演台默认并发数为 2，批处理池位于：

- `apps/web/src/engine/director-desk-runner.ts:920-939`

可能发生：

```text
A 镜和 B 镜并发开始
A 读取旧 chain，写入 A 的关键帧
B 也读取同一个旧 chain，写入 B 的关键帧
B 的写入覆盖 A
```

影响：

- 批出多镜后只保留部分 URL。
- 已生成成功的镜头可能被旧数据覆盖。
- 审阅状态、失败状态和关键帧 URL 可能互相丢失。
- UI 显示成功数量，但刷新后上游链数据不完整。

当前测试通过同步修改内存数组模拟更新，无法覆盖 React Flow 异步更新场景。

### 3.4 当前集不存在时，导演台静默回退全链

`DirectorDeskBlock` 当前逻辑：

```ts
const byEpisode = episodeId
  ? chain.shots.filter((s) => s.episodeId === episodeId)
  : activeChainEpisodeShots(chain);

return byEpisode.length > 0 ? byEpisode : chain.shots;
```

代码锚点：

- `apps/web/src/blocks/core/DirectorDeskBlock.tsx:120-129`
- `packages/shared/src/utils/chain-storyboard.ts:65-69`

如果 handoff 的 `episodeId` 过期、拼错或不属于当前 chain，系统不会阻断，而是返回全部镜头。

后果：

- 用户想批第 2 集，实际批了整部剧。
- 当前集不存在时没有明确错误。
- 批出、审阅和推视频范围都可能扩大。

正确行为应为：

```text
episodeId 存在但匹配不到
  → 显示集不存在 / 交接过期
  → 禁止批出
  → 要求重新同步
```

不能静默回退全量。

### 3.5 单集出线稿可能清掉全部集确认状态

**状态：已确认，P0**

多个线稿路径调用：

```ts
applyScriptBreakdownPayload(props.id, nextBreakdown);
```

代码锚点：

- `use-storyboard-desk.tsx:1443`
- `use-storyboard-desk.tsx:1688`
- `use-storyboard-desk.tsx:1806`
- `use-storyboard-desk.tsx:2002`
- `use-storyboard-desk.tsx:2249`

该函数在重写镜表时会重置确认状态。部分路径随后才调用 `stripEpisodeConfirmation`，但此前可能已经清空 `confirmedEpisodeIds`。

可能发生：

```text
第 1 集已确认
在第 2 集生成一张线稿
第 1 集确认状态也被清掉
```

正确规则：

- 改动某一集：只移除这一集确认。
- 全量重拆：才清空全部确认。

### 3.6 旧 handoff 没有版本校验

**状态：已确认，P0**

编剧台修改已确认成稿时会调用 `unconfirmIfEdited`，但已经写入导演台的 `lastHandoff` 不会自动失效。

导演台判断确认状态时直接信任：

```ts
if (handoff?.confirmed === true) return true;
```

代码锚点：

- `apps/web/src/blocks/core/DirectorDeskBlock.tsx:154-162`

可能发生：

```text
编剧台确认剧本
→ 分镜台确认第 1 集
→ 导演台收到 confirmed=true
→ 编剧台修改第 1 集
→ 导演台仍认为本集已确认
```

handoff 至少需要携带并校验：

- 剧本版本或 hash
- 分镜版本或 hash
- 线稿版本
- 确认时间
- handoff 版本号

没有版本校验，`lastHandoff` 只是不可验证的历史快照。

### 3.7 故事板大图仍可能串集

`getEpisodeContactSheet` 找不到当前集专属大图时，会无条件回退全局字段：

- `packages/shared/src/types/storyboard-preview.ts:354-362`

因此可能发生：

```text
第 1 集生成故事板
→ 切到第 2 集
→ 第 2 集没有故事板
→ 仍显示第 1 集故事板
```

当前测试还把全局回退作为预期行为：

- `apps/web/src/blocks/craft/__tests__/StoryboardDeskBlock.test.tsx:166-175`

正确行为应是：

```text
当前集没有 contactSheetsByEpisode[episodeId]
  → 显示“本集尚未生成故事板”
```

旧全局字段只能在迁移时经过签名验证后兼容读取，不能无条件展示。

### 3.8 预览显示按集，但操作范围仍然是全量 frames

`StoryboardPreviewWorkspace` 用 `displayFrames` 过滤显示内容：

- `StoryboardPreviewWorkspace.tsx:110-115`

但选择和批量重生仍使用 `payload.frames`：

- `StoryboardPreviewWorkspace.tsx:190-211`

可能发生：

```text
界面只显示第 2 集
用户点击批量重生
实际处理第 1、2、3 集的 frame
```

需要统一当前集过滤范围，至少覆盖：

- 选择
- 全选
- 批量重生
- 确认
- 缺图统计
- 生成数量
- 当前镜预览

---

## 4. P1 重要问题

### 4.1 编剧台送到已有分镜台时没有按连接关系选择目标

编剧台使用：

```ts
nodes.find((n) => n.type === 'storyboard-desk')
```

代码锚点：

- `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx:483-489`

它查找的是画布中第一个分镜台，而不是当前编剧台连接的分镜台。

多链场景：

```text
编剧 A → 分镜 A
编剧 B → 分镜 B
```

编剧 B 送分镜时可能更新分镜 A 的 handoff。

应基于：

- 当前节点出边
- `sourceScriptBlockId`
- 已有 handoff 来源
- upstream policy

选择目标，不能全画布查找第一个。

### 4.2 分镜台当前集依赖全局 activeEpisodeId

代码锚点：

- `use-storyboard-desk.tsx:153-163`
- `use-storyboard-desk.tsx:2915`

两个分镜台共享同一个全局当前集。分镜台 A 切到第 2 集，分镜台 B 也可能受到影响。

当前集应存储在当前节点或当前链数据中，而不是全局工作区状态。

### 4.3 打开分镜台会产生隐式回填副作用

打开分镜台时会扫描整个 `storyboardPreview.frames`，将图片回填到：

- `scriptBreakdown`
- `chainStoryboard`
- 全局 `storyboard`

代码锚点：

- `use-storyboard-desk.tsx:1657-1710`

用户只是打开页面，却可能触发：

- 镜头数据修改
- 关键帧状态修改
- 确认状态变化
- 全局镜表写入

这类同步应该是明确的用户动作，而不是打开页面时的隐式 effect。

### 4.4 编剧台关闭时没有完整处理运行中任务

编剧台虽然禁用了部分按钮，但 `ScreenModal` 仍直接调用：

- `ScriptDeskBlock.tsx:1437-1467`

`handleCloseStudio` 没有完整检查：

- `busy`
- `continueBusy`
- `rewritingEpIndex`

用户可以在生成、续写或重写中关闭台面。任务可能继续消耗模型调用，用户却无法判断任务是否仍在运行。

应明确提供：

```text
继续后台运行
停止任务并保留已成功结果
取消关闭
```

### 4.5 编剧台续写仍使用 window.confirm

代码锚点：

- `ScriptDeskBlock.tsx:892`

这与项目内 `askConfirm` / `confirmDelete` 体系不一致，不能统一记录状态、埋点和取消行为。

另外，续写遇到一集失败后直接停止后续循环：

- `ScriptDeskBlock.tsx:955-967`

它没有形成与首次生成一致的“失败集列表 + 只重试失败”闭环。

### 4.6 分镜线稿停止不能取消底层网络请求

分镜台虽然创建了 `AbortController`：

- `use-storyboard-desk.tsx:1926-1929`

但生成调用没有传 `signal`：

- `use-storyboard-desk.tsx:1985`
- `use-storyboard-desk.tsx:2178`
- `use-storyboard-desk.tsx:2187`

点击停止后只能阻止下一轮循环，不能真正取消当前请求。导演台的 `runPictureGenJob` 也存在相同问题。

UI 文案应明确为“尽快停止，不再开始新镜”，或者把 signal 真正传到底层 API。

### 4.7 导演台线稿覆盖统计没有严格按当前集过滤

导演台的 `lineArtByShotId` 会读取：

- `lastHandoff.lineArtFrames`
- 上游 `storyboardPreview.frames`

代码锚点：

- `DirectorDeskBlock.tsx:131-152`

但没有严格按照当前 `episodeId` 过滤，导致以下统计可能失真：

- 线稿覆盖数
- 缺图提示
- 参考缺口
- 当前集上下文

### 4.8 交接数据只是一次性快照，不是可验证的交付凭证

分镜台写入：

- `episodeId`
- `confirmed`
- `lineArtFrames`
- `compositionCoverage`

代码锚点：

- `use-storyboard-desk.tsx:1260-1271`

但没有携带可校验的剧本版本、分镜版本和线稿版本。因此导演台无法判断 handoff 是刚刚确认的，还是旧交接残留。

---

## 5. 各台职责和数据边界问题

### 5.1 编剧台

应负责：

- 成稿生成、续写、重写
- Bible 抽取和设定就绪
- 成稿确认
- 送分镜交接

当前主要问题：

- 交接目标可能选错。
- handoff 没有版本校验。
- 运行中关闭语义不清。
- 续写失败恢复不完整。
- 仍存在原生 `window.confirm`。

### 5.2 分镜台

应负责：

- 从已确认成稿拆镜
- 镜头结构编辑
- 线稿构图
- 本集确认
- 交接导演台

当前主要问题：

- 线稿写入了关键帧字段。
- 仍然双写全局 storyboard。
- 当前集依赖全局状态。
- 单集改动可能清掉全部确认。
- 预览显示范围和操作范围不一致。
- 打开页面触发隐式数据回填。

### 5.3 导演台

应负责：

- 消费已确认的本集镜表
- 消费线稿、角色、场景参考
- 生成彩色关键帧
- 关键帧审阅
- 推送视频生成

当前主要问题：

- 并发写回可能覆盖。
- 当前集不存在时回退全链。
- 旧 handoff 可以继续放行。
- 线稿覆盖统计未严格按集过滤。
- 停止不能取消在飞请求。

---

## 6. 端到端运行链路风险

### 6.1 编剧台 → 分镜台

当前流程：

```text
确认成稿
→ 送到分镜台
→ 分镜台手动拆镜
```

主要断点：

- 目标分镜台可能选错。
- 交接没有强版本绑定。
- 成稿修改后旧 handoff 不自动失效。
- 交接不是一个可验证的交付事务。

### 6.2 分镜台内部

当前流程：

```text
拆镜
→ 编辑 / 增删拆合
→ 出线稿
→ 确认
```

主要断点：

- 线稿和关键帧字段混用。
- 单集变化可能影响全局确认。
- 预览过滤和实际操作范围不一致。
- contact sheet 仍可能跨集显示。

### 6.3 分镜台 → 导演台

当前流程：

```text
确认本集
→ 打开导演台
→ 导演台读取 chain + handoff
```

主要断点：

- handoff 没有版本校验。
- 旧确认可以继续使用。
- 当前集不匹配时可能回退全链。
- 线稿变化不会形成明确的“重新交接”状态。

### 6.4 导演台 → 视频生成

当前流程：

```text
批出关键帧
→ 审阅
→ 推送 clip-gen
```

主要断点：

- 并发写回存在丢数据风险。
- 推送缺少批次版本概念。
- 推送后无法明确确认视频节点是否已经消费最新关键帧。
- 关键帧字段被线稿污染时，视频链可能消费错误媒体。

---

## 7. 测试覆盖不足

当前相关测试覆盖统计会随用例新增而变化。就“编剧台 → 分镜台 → 导演台 → 视频生成”的串联缺陷而言，现有测试主要集中在纯函数/小范围 helper/组件冒烟，端到端链路与跨集隔离仍存在明显空缺（见下方缺失关键测试清单）。

已有测试主要覆盖：

- runner 纯函数
- 删除镜头
- 确认状态 helper
- contact sheet helper
- 组件渲染冒烟

缺失的关键测试：

- 编剧台 → 分镜台 → 导演台真实串联。
- 两个分镜台之间的数据隔离。
- 多集切换不串产物。
- 导演台并发写回不丢数据。
- 线稿不会写入 `firstFrameAssetId`。
- 线稿不会污染 `keyframeStatus`。
- 单集改动只清当前集确认。
- 旧 handoff 在剧本修改后失效。
- 当前集不存在时导演台禁止批出。
- 关闭窗口时任务仍在运行的行为。
- 停止后保留部分成功结果。
- preview 显示过滤和实际操作范围一致。

尤其需要修正当前测试中对全局 `contactSheetUrl` 无条件回退的预期，否则测试会掩盖串集缺陷。

---

## 8. 修复优先级

### Phase 1：数据安全

1. 分离线稿字段和关键帧字段。
2. 禁止分镜线稿写 `firstFrameAssetId`。
3. 禁止分镜生成路径写全局 `workspace.storyboard`。
4. 修复导演台链镜表原子写回，避免并发覆盖。
5. 当前集匹配失败时禁止回退整链。
6. contact sheet 禁止无条件回退全局。

### Phase 2：确认和交接

1. 确认状态按集维护。
2. 线稿、编辑、增删拆合只清当前集确认。
3. handoff 增加剧本 hash、分镜 hash、线稿版本和 handoff 版本。
4. 剧本修改后自动使旧 handoff 失效。
5. 导演台只接受与当前上游版本匹配的确认状态。

### Phase 3：多链隔离

1. 编剧台按连接关系选择分镜台。
2. 分镜台当前集从节点/链数据读取，不读全局 active episode。
3. 预览显示、选择、批处理使用同一集过滤后的 frames。
4. 线稿、故事板、关键帧和视频生成全部按 chain/episode 隔离。

### Phase 4：长任务和异常恢复

1. 编剧台运行中关闭必须明确确认。
2. 分镜批量线稿把 `AbortSignal` 传到底层请求。
3. 导演台停止后不再领取新任务，并明确显示在飞任务。
4. 统一失败列表和只重试失败。
5. 所有破坏性确认统一使用项目内确认组件。

### Phase 5：端到端验收

至少需要完成以下流程：

```text
编剧台生成 2 集
→ 确认成稿
→ 送分镜
→ 分镜拆 2 集
→ 第 1 集出线稿
→ 第 1 集确认
→ 打开导演台
→ 导演只显示第 1 集
→ 批出 2 镜
→ 并发写回后两镜都存在
→ 推送 clip-gen
→ 切换第 2 集
→ 第 1 集产物不串入第 2 集
→ 修改编剧台第 1 集
→ 导演台旧交接失效
```

---

## 9. 当前审计结论

三台的 UI 骨架和主要按钮已经具备，但数据链仍存在生产级风险：

```text
主链可跑 ≠ 数据链可信
有按钮 ≠ 交付闭环成立
有测试 ≠ 三台流程已验收
```

在完成 Phase 1 和 Phase 2 之前，不建议把系统描述为：

- 可稳定批量生产
- 可安全处理多集项目
- 可安全支持多条创作链
- 可直接作为导演台交付入口

当前应先收敛数据真相、集范围、确认契约和交接版本，再继续做体验增强或恢复 3D 能力。
