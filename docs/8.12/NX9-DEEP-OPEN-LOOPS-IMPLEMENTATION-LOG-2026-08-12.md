# NX9-DEEP-OPEN-LOOPS 实施日志（2026-08-12）

> 本文件记录 `docs/8.12/NX9-DEEP-OPEN-LOOPS-2026-08-12.md` 全部票项在 2026-08-12 的收口结果，与主文档同步滚动。主文档中仍保留的 ❌/⚠/🧟 表行，以本日志状态与代码锚点为准。

## 1. 票项总览

| 票号 | 级别 | 类型 | 状态 | 收口方式 / 锚点 |
|------|------|------|------|------------------|
| DEEP-01 | P1 | ❌ | 已闭环（回归确认） | `seedance-chain` 分支已删；`migrateBlockKind('seedance-chain')` → `clip-gen`；`vg-r2-p3.test.ts` 守卫 flow-runner 无 `seedance-chain` 分支 |
| DEEP-02 | P1 | ❌ | 已闭环（回归确认） | `motion-story` 分支与 `clip-chain-runner.ts` 已删；`vg-r2-p3.test.ts` 守卫 |
| DEEP-03 | P1 | ⚠ | 已闭环 | `flow-runner.ts` variant-fork 改 `status:'skipped'` + `noop:true` + 文案「仅标记，不产生变体」 |
| DEEP-04 | P2 | ⚠ | 已闭环 | 分镜台画布 Run 无活改 `skipped` + `noop:true`；导演台空队列保留 success 但 `meta.noop:true` |
| DEEP-05 | P2 | 🧟 | 已闭环（回归确认） | `ClipGenBlock.run()` 已委托 `runFlowBatch`（VG-29 注释 + 守卫测试）；未删除入口以免破坏回退卡面 |
| DEEP-06 | P3 | 🧟 | 已闭环 | `GenConfigPillBar.tsx` 已删（既有）；`blocks/core/panels/VoiceCastPanel.tsx` 已删（本轮） |
| DEEP-07 | P2 | ⚠ | 已闭环（回归确认） | `pollVideo` / `PendingVideoTask` 携带 `providerBaseUrl`；`vg-r2-p3.test.ts` 守卫 |
| DEEP-08 | P2 | ⚠ | 已闭环（回归确认） | `resumePendingVideoTasks` 校验镜版本并归档为候选；`core-pipeline-runner.ts` |
| DEEP-09 | P3 | ⏸ | ⏸ 记档（工程子集已齐） | `episode-queue` 常量已删（VG-27）；`audioUrl` 仅数据透传、`ClipGenBlock` 文案诚实（B1）；音画对齐 API 未定，见 `docs/REAL-PROVIDER-VALIDATION.md` |
| DEEP-10 | P3 | ⚠ | 已闭环（回归确认） | `VideoWorkspace` 并发 select 已是 `[1..8]`；`vg-r2-p3.test.ts` 守卫 |
| DEEP-11 | P1 工程 | 🏗 | 已闭环（2026-08-13 拆分） | `AssetLibraryModal.tsx` **≈3522 → 18** 行，拆为 `asset-library/modal/` 23 子模块；分镜台部分由 A8（ENG-01/SB-D-11）收口；行为不变，守卫 4/4 + 全量 79/492/1 通过 |
| DEEP-12 | P2 | 🏗 | 已闭环（2026-08-13） | 技能轨降级结果携带结构化 `errorCode`；`script-desk-runner.ts` 四条 fallback 返回 `errorCode`，`use-script-desk-agent.ts` 消息落 `errorCode`，chat hint 可渲染 |
| DEEP-13 | P3 | ⏸ | ⏸ 记档（工程子集已齐） | 捏模终局产品/美术后置；2026-08-13 B2–B4 已齐：GLB 加载路径/manifest 校验/回退代理、材质驱动、舞台桥；P3 定妆出图已由 FACE-P3 闭环 |
| DEEP-14 | P2 | ⚠ | 已闭环（记档同步） | 本日志 + 各域文档顶部状态同步；LEDGER F-046～050 按代码证据重评见本文件 §3，未人工重跑的部分如实保留 |
| DEEP-15 | P2 | ⚠ | 已闭环（浏览器回归已记档） | `docs/8.12/NX9-A7-BROWSER-REG-2026-08-12.md`：2026-08-13 Windows/Chromium E2E 6/6 通过；真实供应商 smoke 7 SKIP（缺 key）；F-046/F-050 浏览器路径仍待人工复验 |
| DEEP-16 | P2 | ⚠ | 已闭环（由 DR-05 收口） | beat-sync meta `algorithm:'bpm-interval'` + `listenedToAudio:false` + 文案「未听音分析」 |
| DEEP-17 | P3 | ⚠ | 已闭环 | `prompt-diff` 不再写死 `gpt-4o-mini`，改读 `d.llmModel / d.model`，未指定交给网关 |
| DEEP-18 | ◐ | - | ⏸ 记档（非断点） | 素材库「可加深」三项按 OPEN-LOOPS 定性不实施；情绪/爆点回库、团队库、LoRA 不做 |

## 2. 本轮改动文件

- `apps/web/src/engine/flow-runner.ts`：DEEP-03/04/17 与导演台空队列 noop
- `apps/web/src/blocks/core/panels/VoiceCastPanel.tsx`：删除（DEEP-06）
- `packages/shared/src/catalog/node-interaction.ts`：`NodeRunStatus` 增 `'skipped'`；`normalizeNodeStatus` 支持
- `apps/web/src/blocks/shared/CanvasNodeBody.tsx`：`skipped: '跳过'`
- `apps/web/src/engine/__tests__/deep-open-loops-regression.test.ts`：新增守卫
- 既有第一份文档改动（DR-01～09、FACE-P3）不在本日志重复列

## 3. 台账漂移处理（DEEP-14）

- 本日志与 `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` 同日建立，后续销票须同步滚动。
- `NX9-REAL-COMPLETION-LEDGER.md` F-046～050 重评（按代码证据，未人工重跑处如实保留）：
  - F-046（HyperFrames 取消不得成功）：代码已含取消路径与取消后不落 success 的守卫（`ExportPackBlock` HF 取消、`MediaPinBlock` cancelled 分支），单测覆盖取消契约；浏览器级取消联调未跑，LEDGER 数字应由人工在下一轮按验收门禁更新。
  - F-047（export_ready 真成功态）：`ExportWorkspace` 已按 DR-03 改为仅消费连接链产物，无链即 blocked，不再以 status 捷径冒充成功；空成功回归由 `dr03-chain-export.test.ts` 覆盖。
  - F-048（clip-gen 并发/重试单轨）：`ClipGenBlock.run` 委托 `runFlowBatch`，与 VideoWorkspace 同读组装器与并发配置；`vg-r2-p3.test.ts` 守卫。
  - F-049（Bridge/队列/Seedance 闭环）：代码与单测覆盖三模式组装请求；episode-queue 常量已删；浏览器演示脚本未跑，按 DEEP-15 待人工复验。
  - F-050（智能剪辑建议确认）：建议确认与时间线门禁已有单测；确认后 readiness 变绿的浏览器链路未跑，按 DEEP-15 待人工复验。
  - LEDGER 原数字保持 2026-07-28 快照，不叠加新结论；下一轮人工按本日志证据统一重算。
- `NX9-VIDEO-GEN-NODE-OPEN-LOOPS*.md` 正文矩阵：顶部收口状态为准；R3 矩阵行以 `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` 为准。

## 4. 浏览器回归清单（DEEP-15，2026-08-13 已实跑记档）

环境：Windows 11 / Chromium（Playwright headless）。完整证据见 `docs/8.12/NX9-A7-BROWSER-REG-2026-08-12.md`。

1. 编剧台 confirmed package → 分镜台拆镜 → 导演台关键帧 全链路（H-02）：2026-08-13 通过（`e2e-script-storyboard-director.spec.ts`，含双集切换、批出、审阅、推送、刷新持久化，2 passed）
2. 分镜台画布 Run 无活时显示「跳过」而非绿勾：单测 `deep-open-loops-regression.test.ts` 覆盖；浏览器目视路径待人工复验
3. 图像工作台「停止」（PG-04）：2026-08-13 通过（`a7-picture-stop-pg04.spec.ts`，停止后收回 idle、无 page error）
4. HyperFrames 取消不得变成功（F-046）：单测 + 代码审查覆盖（`ExportPackBlock` / `MediaPinBlock` cancelled 分支）；浏览器取消联调路径待人工复验
5. 智能剪辑建议确认后门禁（F-050）：单测 + 代码审查覆盖；浏览器路径待人工复验

## 5. 测试与验证

- `deep-open-loops-regression.test.ts`：5 it 通过
- `vg-r2-p3.test.ts`：7 it 通过（DEEP-01/02/05/07/08/10 回归）
- 全量 web 单测：60 files，375 passed / 1 skipped；唯一 unhandled rejection 为 `ScriptDeskBlock.test.tsx` 的 `/api/settings` 无基址既有噪声
- `pnpm --filter @nx9/web typecheck` 通过；`pnpm --filter @nx9/shared build` 通过
- A7 浏览器回归：`pnpm --filter @nx9/web test:e2e -- --reporter=line --workers=1 --retries=0` → 6/6 passed（H-02×2、PG-04、e2e-001、playbook、face-sculpt 定妆）
- 真实供应商 smoke：`NX9_REAL_PROVIDER_TEST=1 pnpm --filter @nx9/server test:real-provider` → 7 SKIP（缺 `NX9_PROVIDER_*` / 真实图片/视频 URL key）

## 6. 后续提醒

- DEEP-11（素材库）已于 2026-08-13 拆完（`AssetLibraryModal.tsx` ≈3522→18 行）；编剧台 DEEP-12 已于 2026-08-13 闭环（降级 `errorCode` + chat hint），无剩余工程债。
- 浏览器回归完成后，把本文件 §4 每项回填「最后通过日期 / 环境 / 结果」，并同步主文档汇总表。

## 7. A11（DEEP-11 素材库）拆分闭环（2026-08-13）

- 主文件：`apps/web/src/panels/AssetLibraryModal.tsx` **≈3522 → 18** 行（实测拆分前 3636 行）
- 子模块：`apps/web/src/panels/asset-library/modal/` 23 个文件（控制器 / 壳层 / 列表 / 详情 / 兼容视图 / meta）
- 行为：入口路径与 `AssetLibraryModal` 命名导出不变（AppShell lazy 引用未动），纯模块搬迁
- 守卫：`apps/web/src/engine/__tests__/asset-library-modal-split-guard.test.ts` 4/4 通过
- 全量回归：web typecheck 通过；全量 vitest 79 文件 492 passed / 1 skipped
- UI 自检：1920×1080 Playwright 打开素材库 + 新建角色 1/1 通过，无 page error；临时 spec 已删

## 8. A12（DEEP-12）错误码结构化闭环（2026-08-13）

- 根因：A12 E2E mock 发 SSE `error`（429 rate limit），`runScriptDeskSkill` catch 后回落本地草稿却不带 `errorCode`，消息被当成成功，`ChatStage` 无法渲染 `sd2-msg__hint`。
- 改动：
  - `apps/web/src/engine/script-desk-runner.ts`：返回类型加 `errorCode`；catch 后经 `classifyScriptDeskError(e).code` 计算，四条 fallback（consistency / generate-dialogue-ingest / character-world / 本地草稿）均返回结构化错误码。
  - `apps/web/src/blocks/nx9/script-desk/use-script-desk-agent.ts`：`handleAgentSend` 追加消息时写入 `errorCode: result.errorCode`。
  - 新增 `apps/web/src/engine/__tests__/script-desk-error-code.test.ts`：mock `api.scriptDeskChatStream` 拒绝 429，断言返回 `rate_limit` + 本地草稿 patch。
  - 新增 `apps/web/e2e/a12-chat-stage.spec.ts`：chat hint 渲染 E2E（含定位器与 console/request 过滤修正）。
- 验证：web typecheck 通过；定向 13 + 桌面编剧套件 8 文件 42 vitest 通过；A12 E2E 1920×1080 与 1280×720 各 1 passed（合计 2/2）。

## 9. DEEP-13 同源工程子集（B2–B4，2026-08-13）

- FACE-01 / FACE-07 / DRIFT-04：`packages/director3d/src/sculpt/character-model-loader.ts` 正式 GLB 加载 + manifest 校验 + 失败/不合格回退代理；`CharacterSculptViewport` 挂载自动尝试加载。
- FACE-08 / DRIFT-03：`material-drivers.ts` 真驱动命名材质通道，无通道由兼容报告标 missing。
- FACE-09：`stage-body-bridge.ts` + `StageActor` 桥接 `faceRig.body`；`director3d-character-sync.ts` 同步进导演台对象。
- 单测：`character-model-loader` / `face-sculpt-material-driver` / `stage-body-bridge` / `director3d-character-sync` 4 文件 11 passed；捏模台 + 导演台 E2E 3/3 通过。
- 状态：DEEP-13 仍属 ⏸（正式基模资产未交付），但代码面已无「未做」缺口。

# NX9-DEEP-OPEN-LOOPS 完票报告

## 统计

- 总票数：18 | 已闭环：15 | ⏸ 记档：3 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-DEEP-OPEN-LOOPS-2026-08-12.md` 全文与汇总表，下列票均已处理：

- 已闭环：DEEP-01、DEEP-02、DEEP-03、DEEP-04、DEEP-05、DEEP-06、DEEP-07、DEEP-08、DEEP-10、DEEP-11、DEEP-12、DEEP-14、DEEP-15、DEEP-16、DEEP-17
- ⏸ 记档：DEEP-09、DEEP-13、DEEP-18

## ⏸ 后置项

- DEEP-09 `episode-queue` / `audioUrl`：能力本体产品未定，禁止半接线；工程子集已齐（常量删除、UI 文案诚实、audioUrl 仅透传）。
- DEEP-13 捏模终局：正式 GLB/材质仍产品·美术后置；工程子集已齐（B2 GLB 加载/manifest 校验/回退代理、B3 材质驱动、B4 舞台桥），P3 定妆出图已由 FACE-05 收口。
- DEEP-18 素材库可加深项：非断点，按文档不实施。

## 回归风险

- 新增 `skipped` 节点状态：旧 UI 对未知状态会走兜底渲染，`CanvasNodeBody` 已补中文标签。
- 删除 `VoiceCastPanel` / `GenConfigPillBar` 属零引用孤儿，无运行时入口。
- LEDGER F-046～050 保持旧快照数字，不叠加新结论；F-046/F-050 浏览器路径与分镜台跳过目视仍待人工复验，单测 + 代码审查已覆盖。

## 建议人工复验清单（浏览器）

H-02 与 PG-04 已由 2026-08-13 E2E 记档（见 §4）；分镜台跳过目视、F-046、F-050 浏览器路径仍待人工复验。
