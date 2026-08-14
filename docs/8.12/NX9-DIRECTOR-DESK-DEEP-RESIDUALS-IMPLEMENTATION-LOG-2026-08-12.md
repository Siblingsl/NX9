# NX9 导演台深度残留实施日志（2026-08-12）

> 对应文档：`docs/8.12/NX9-DIRECTOR-DESK-DEEP-RESIDUALS-2026-08-12.md`
> 实施原则：每票给代码锚点与测试证据；UI 无法真开浏览器的一律标「待人工复验」，不冒充通过。

## 票项状态总表

| ID | 状态 | 关键锚点 | 验证 |
|----|------|----------|------|
| DD-D-01 | 已闭环 | `director-keyframe-batch-runner.ts:113` 只写 `videoStatus/videoAssetId`；`smart-edit-orchestrator.ts:155` `approvedOnly` 按 `videoStatus==='approved'`；`ClipEditorBlock.tsx:95` 透传 | `dd01-video-gate.test.ts` |
| DD-D-02 | 已闭环 | `VideoWorkspace.tsx` 视频审阅网格：`approveStoryboardVideoShot` / `rejectStoryboardVideoShot` / `adoptStoryboardVideoVersion` / 全部通过；剪辑台 `approvedOnly` 按视频批准 | `dd01-video-gate.test.ts` |
| DD-D-03 | 已闭环 | `DirectorDeskBlock.tsx:226,1122-1141` 待修复列表与「去 3D 重拍」；`director-main-panel.tsx:151-153` 待修复文案；`director3d-commit-adapter.ts` 提交时重建 guide 自动清 `captureUrlPendingRepair` | `dd03-director3d-semantics.test.ts`、`director3d-commit-adapter.test.ts`；UI 待人工复验 |
| DD-D-04 | 已闭环 | `packages/shared/src/utils/chain-storyboard.ts:248` `hasDirector3dGuide`；`director-desk-runner.ts:605,798,1124` 统计/3donly/硬失败统一 | `dd03-director3d-semantics.test.ts` |
| DD-D-05 | 已闭环 | `DirectorDeskBlock.tsx` 3D 构图文案无「暂未开放」；`director-main-panel.tsx:153` 开关驱动；`StoryboardPreviewWorkspace.tsx:708` 开关驱动 | `dd03-director3d-semantics.test.ts`；UI 待人工复验 |
| DD-D-06 | 已闭环 | `flow-runner.ts:1133` 批出只写 `lastBatchPreviewUrl`，不再写 `previewUrl`；主预览走 `currentShot.firstFrameAssetId`；胶片/交付点击写 `previewUrl` 仅作画布缩略图缓存 | `dd03-director3d-semantics.test.ts` |
| DD-D-07 | 已闭环 | `DirectorDeskBlock.tsx:272,454` `useGlobalArtDirection:false`；`director-desk-runner.ts:939` 默认不注入全局风格 | 既有 `director-desk-runner.test.ts` 已同步 |
| DD-D-08 | 已闭环 | `FlowSurface.tsx` spawn 只从链镜表查找，无全局 `storyboard.shots` 回退 | `dd03-director3d-semantics.test.ts` |
| DD-D-09 | 已闭环 | `flow-runner.ts:520-548` 每镜成功立即写链镜表并落中间 receipt 到节点 `directorKeyframeBatch/directorBatchReceipt`；`director-keyframe-batch-runner.ts` 续跑跳过已成功镜 | `dd09-batch-progress.test.ts`、`director-keyframe-batch-runner.test.ts` |
| DD-D-10 | 已闭环 | `ClipGenBlock.tsx:291-306` partial 批次显示失败镜原因 + 「重试失败 N 镜」按钮，复用 `run()` 同一条消费路径 | `dd03-director3d-semantics.test.ts`、`dd09-batch-progress.test.ts`；UI 待人工复验 |
| DD-D-11 | 已闭环 | `director3d-split.ts:268` `autoSplitMixedDirector3dGraph`；`flow-payload.ts:119` hydrate 时自动拆分 `split-required` | `director3d-split.test.ts` |
| DD-D-12 | 已闭环 | `director-desk-runner.ts:1181-1185,1217` `suspect-monochrome` 与 `unknown` 都进 `review`，auto 不再放行 unknown | 相关 director-desk runner 测试 |
| DD-D-13 | 已闭环 | `packages/director3d/src/ui/StageDeckShell.tsx:386-407` `requestShotChange` 脏确认 + `pendingShotId` 保留草稿/恢复已提交 | `dd03-director3d-semantics.test.ts`；UI 待人工复验 |
| DD-D-14 | 部分（浏览器侧闭环；真供应商硬阻塞） | `e2e-script-storyboard-director.spec.ts` 双集切换 + 整页刷新持久化断言 2026-08-13 通过；`scripts/real-provider-smoke.mjs` 7 SKIP（缺 key） | 浏览器 mock/持久化已闭环；真实供应商小样本见下方人工复验清单 |

## 关键行为变化

- 视频写回不再覆盖关键帧 `status/keyframeStatus`；剪辑台 `approvedOnly` 只认视频批准，避免「有片但编排吃空」。
- 3D Data URL 隔离后，统计、3donly 队列、`allowWithout3d===false` 仍识别「有 3D 机位（待修复）」；导演台出现黄色修复条，点击「去 3D 重拍」聚焦该镜并切到 3D 舞台。
- 3D 重新上传并提交后，`director3dGuide` 被新提交重建，`captureUrlPendingRepair` 不再残留。
- 导演台主文案与真实能力统一由 `DIRECTOR_3D_ENABLED` 驱动。
- 关键帧批次 `consuming` 中断后，已成功镜的 chain 写回与中间 receipt 均已落节点；刷新续跑只打失败镜。
- 混装导演台在 hydrate 时自动拆出独立 3D 节点，旧节点标记 `split-done`。

## 测试

- `pnpm --filter @nx9/web typecheck`：通过。
- `apps/web` 全量 vitest：63 files，390 passed，1 skipped；唯一 unhandled error 为既有 `/api/settings` 无 base URL 环境噪声（`ScriptDeskBlock.test.tsx`），非本轮回归。

## 建议人工复验清单（浏览器）

1. 导演台：造一个 `captureUrlPendingRepair` 镜，确认修复条、统计 `3D 待修复 N`、「去 3D 重拍」跳转；重新上传并提交后标记消失。
2. 导演台 / 分镜台预览：`DIRECTOR_3D_ENABLED=true` 下不再出现「3D 暂未开放 / 3D 舞台暂未开放 / 3D 机位暂未开放」。
3. clip-gen：构造 partial 批次，确认失败原因列表与「重试失败 N 镜」按钮，重试只打失败镜。
4. 3D 舞台：编辑候选后点切镜，确认出现「保留草稿并切换 / 恢复已提交版本并切换」确认条。
5. 批次中断：刷新后节点 receipt 保留，重跑不整批重打已成功镜。
6. 真实供应商小样本：1 镜线稿 → 彩色关键帧 → 视频 URL 写回 chain。**2026-08-13 状态：缺 `NX9_PROVIDER_*` / `NX9_REAL_PICTURE_URL` / `NX9_REAL_VIDEO_URL`，smoke 7 SKIP，硬阻塞**；key 到位后按 `docs/REAL-PROVIDER-VALIDATION.md` 签字回填。
7. 双集 / 多 chain 切换 + 刷新持久化：**2026-08-13 E2E 已覆盖**（`e2e-script-storyboard-director.spec.ts` 2 passed，含双集切换、批出、刷新后导演台仍读 4 镜）；pendingRepair 目视与中断态 receipt 目视仍待人工复验。

# NX9 导演台深度残留完票报告

## 统计

- 总票数：14 | 已闭环：13 | ⏸ 记档：0 | 部分闭环：1（DD-D-14：浏览器 mock/双集/刷新持久化已闭环，真实供应商小样本硬阻塞）

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-DIRECTOR-DESK-DEEP-RESIDUALS-2026-08-12.md` 全文与总表，下列票均已处理：

- 已闭环：DD-D-01、DD-D-02、DD-D-03、DD-D-04、DD-D-05、DD-D-06、DD-D-07、DD-D-08、DD-D-09、DD-D-10、DD-D-11、DD-D-12、DD-D-13
- 部分闭环：DD-D-14（浏览器侧已闭环；真实供应商小样本缺 `NX9_PROVIDER_*` / 真实图片/视频 URL key 硬阻塞）

## 回归风险

- 视频写回不再覆盖 `keyframeStatus/status`：旧批次消费若依赖被覆盖状态，需重新走审阅门禁；这是预期收口。
- 3D Data URL 隔离后，`captureUrlPendingRepair` 会在新提交时自动清空；旧节点需要重新上传提交一次。
- 批次 `consuming` 中断续跑只打失败镜；中途成功镜的 receipt 以节点 `directorBatchReceipt` 为准。

## 建议人工复验清单（浏览器）

双集 / 多链刷新浏览器证据已于 2026-08-13 回填（E2E 2 passed）；真实供应商小样本等待 key 后执行并回填。
