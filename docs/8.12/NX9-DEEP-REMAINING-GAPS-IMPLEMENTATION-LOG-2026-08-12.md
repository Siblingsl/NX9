# NX9 深挖残留问题（DR-01～09）实施日志（2026-08-12）

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-DEEP-REMAINING-GAPS-2026-08-12.md` 全部 9 张票
> 状态：DR-01～DR-07、DR-09 已闭环；DR-08 按文档 ⏸ 记档（产品后置）；ENG-03 已闭环

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| DR-01 | P0 | ❌ | 已闭环 | `core-pipeline-runner.ts` `approveAllKeyframes` 只写链镜表 |
| DR-02 | P0 | ❌ | 已闭环 | `ReportWorkspace.tsx` 链来源 + `patchUpstreamShot` 写回 |
| DR-03 | P1 | ❌ | 已闭环 | `simpleConcatExport` / `ExportWorkspace` 只消费连接链 |
| DR-04 | P1 | ❌ | 已闭环 | `parseContinuityLlmJson` + 写回降级 `review` |
| DR-05 | P2 | ⚠ | 已闭环 | beat-sync 标 `bpm-interval` +「未听音分析」 |
| DR-06 | P2 | ⚠ | 已闭环 | `TimelinePanel` 音量包络折线 + 可拖菱形关键帧 |
| DR-07 | P2 | ⚠ | 已闭环 | BGM 仅导入 + 真生成未接入明确失败 |
| DR-08 | P2 | ⏸ | ⏸ 记档 | `audioUrl` 音画对齐产品口径未定 |
| DR-09 | P2 | ⚠ | 已闭环 | `ClipGenBlock.run` 委托 `runFlowBatch`；孤儿 `GenConfigPillBar` 已删 |

## 逐票实施记录

### DR-01 批审只写链镜表

- 状态：已闭环
- 改动文件：`apps/web/src/engine/core-pipeline-runner.ts:305` `approveAllKeyframes`
- 行为变化：修复前 `approveAllKeyframes` 用 `activeEpisodeShots(doc.storyboard)` 批全局镜像，多链场景门禁读链、批审写全局；修复后只从 `getAllChainShots` 取链镜，逐镜 `patchShotOnChainGraph` 写回各自 desk，只批有 `firstFrameAssetId` 的镜，无链返回 `{ ok: 0, blocked: 'no-chain' }`，禁止回退全局 `updateShot`。
- 测试：`dr01-chain-approval.test.ts` 3 例（只批链上有图镜 / 无链 blocked / 源码守卫无 `doc.updateShot`）通过。
- UI 自检：待人工复验 Studio 与 Playbook 批审在无连接链时出现 blocked 提示，多链只批本链镜。

### DR-02 审片工作区链隔离

- 状态：已闭环
- 改动文件：`apps/web/src/engine/stage-deck/chrome/attached-workspace/report/ReportWorkspace.tsx:69,83,137,145,162`
- 行为变化：修复前镜头列表来自全局 `activeEpisodeShots(storyboard)`、写回走全局 `updateShot`；修复后列表来自 `resolveShotsForBlock(blockId, nodes, edges)`，批准/打回走 `patchUpstreamShot`，写回失败时节点进 `blocked` + `gatePassed:false`，不再静默写全局。
- 测试：`dr02-report-workspace-chain.test.ts` 3 例（链来源与写回 / 无全局引用 / blocked 状态）通过。
- UI 自检：待人工复验审片工作区在无链时 blocked、有链时批准写回本链镜。

### DR-03 简单导出只消费链镜表

- 状态：已闭环
- 改动文件：`apps/web/src/engine/core-pipeline-runner.ts:870` `simpleConcatExport`；`apps/web/src/engine/stage-deck/chrome/attached-workspace/config/ExportWorkspace.tsx:27,78`
- 行为变化：修复前简易拼接读全局 `activeEpisodeShots(doc.storyboard)`；修复后只消费 `getAllChainShots`，无链返回「未连接上游链镜表，已禁止回退全局导出（F-003）」，缺视频或未采用直接 error，导出工作区文案明示「仅导出连接链中已采用的视频，不读全局镜表」。
- 测试：`dr03-chain-export.test.ts` 4 例（链导出 / 无链 blocked / 源码守卫 / ExportWorkspace 链隔离）通过。
- UI 自检：待人工复验 Studio / Playbook / 导出工作区无连接链时不再产生「全局镜表假导出」。

### DR-04 连续性检查去围栏 + 写回降级

- 状态：已闭环
- 改动文件：`apps/web/src/engine/continuity-check-runner.ts:58` `parseContinuityLlmJson`；`apps/web/src/engine/flow-runner.ts:1752,1780,1796`
- 行为变化：修复前 LLM 返回 markdown 围栏时 `JSON.parse` 失败静默空过，issues 无 shot 映射却把 `upstream.shotIds` 整表标 failed；修复后去围栏解析，仅对能映射 `shotId/shotIndex` 的 issue 写回 `keyframeStatus:'review'` + note，无映射时只写节点 `continuityReport`，禁止整表 failed。
- 测试：`dr04-continuity-parse.test.ts` 5 例（围栏解析 / 非 JSON / 缺 issues / 写回 review / 源码无 failed 分支）通过。
- UI 自检：待人工复验连续性检查出建议时审片格进入 review 而非整链 failed。

### DR-05 beat-sync 名实诚实化

- 状态：已闭环
- 改动文件：`apps/web/src/engine/flow-runner.ts:1989-1994`
- 行为变化：修复前按用户填的 BPM 等间隔切点却无任何声明；修复后节点 meta 写 `algorithm:'bpm-interval'` + `listenedToAudio:false`，message 与 content 明示「按 BPM 估切，未做听音分析」。
- 测试：`dr05-beat-sync-honesty.test.ts` 2 例（meta 标注 / 文案）通过。
- UI 自检：待人工复验 beat-sync 节点结果不出现「已对齐鼓点」类文案。

### DR-06 音量关键帧时间轴可视

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/core/clip-editor/TimelinePanel.tsx:111,373,401,603`；`apps/web/src/blocks/core/clip-editor/edit-desk.css:1003`
- 行为变化：修复前 `volumeKeyframes` 只在检查器列表显示数字；修复后选中片段在轨上渲染包络折线与菱形关键帧，指针拖动只改 `atSec`（`op:'set-volume-keyframe'`），音量保持不变。
- 测试：`dr06-volume-envelope-timeline.test.ts` 2 例（渲染与拖动 op / CSS 可交互）通过。
- UI 自检：待人工复验轨道上菱形可拖、`atSec` 随拖动更新。

### DR-07 BGM 诚实边界（仅导入）

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/core/SoundGenBlock.tsx:187`；`apps/web/src/panels/SettingsModal.tsx:638`；`apps/web/src/engine/flow-runner.ts:1023`；`docs/REAL-PROVIDER-VALIDATION.md:62-67`
- 行为变化：修复前设置项可能引导用户配置 BGM API；修复后音乐模式只提供导入，UI 明示「BGM 仅支持导入音频（真生成未接入，禁止假成功）」，设置面板标「预留 / 真实 BGM 生成 API 未接入」，画布 run 的 music 分支仍走 `runSoundGenBgm`，网关未接 provider 时明确 `BGM_NOT_IMPLEMENTED` 失败。
- 测试：`dr07-bgm-import-only.test.ts` 5 例（无生成按钮 / 设置文案 / runner 分支 / 验收文档）通过。
- UI 自检：待人工复验 BGM 模式不再出现可配置生成入口，失败文案明确。

### DR-08 audioUrl 音画对齐 ⏸ 记档

- 状态：⏸ 记档，本轮不实施
- 原因：网关无稳定消费通道，产品未定义「参考音 / 配乐轨 / 口型」口径，禁止半接线造成假 UI。
- 触发条件：产品定义音画对齐口径后，按 VG-48 / DR-08 重新评估并开票。
- 锚点：`docs/REAL-PROVIDER-VALIDATION.md:85`；`docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` VG-48。

### DR-09 视频卡双实现收敛

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/core/ClipGenBlock.tsx:167`；删除 `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/GenConfigPillBar.tsx`
- 行为变化：修复前卡面 `ClipGenBlock` 自带完整 `run()` 与工作台批量路径漂移，`GenConfigPillBar` 全仓零 import；修复后卡面 `run` 委托 `runFlowBatch`（同一组装器 / 超时恢复路径），孤儿 PillBar 已不存在，非 canvasFirst 回退卡面不再维护第二套执行逻辑。
- 测试：`vg-r2-p3.test.ts`（PillBar 不存在、卡面委托）与 `dd03-director3d-semantics.test.ts`（批量/重试入口）通过。
- UI 自检：待人工复验回退卡面运行与工作台运行写回同一账本。


### ENG-03 flow-runner 拆分（工程债）

- 状态：已闭环
- 改动文件：`apps/web/src/engine/flow-runner.ts`（2502→335 行）；新增 `apps/web/src/engine/flow-runner-ops/` 下 `types / errors / helpers / base-ops / clip-gen-ops / media-ops / story-ops / tool-ops / legacy-honesty-ops`
- 行为变化：修复前 60+ 工具分支全部堆在 `executeBlock` 单函数内；修复后主文件只保留前置计算 + 域分发 + `runFlowBatch`，各分支按域逐字迁入 6 个 ops 模块，动态 import 相对路径同步修正。
- 测试：web typecheck ✅；全量 vitest 77 files / 484 passed / 1 skipped ✅；flow-runner 定向 16 文件 / 102 passed ✅；新增 `flow-runner-split-guard.test.ts` 守卫主文件 <1000 行且分支锚点落在 ops 文件。
- UI 自检：N/A（纯执行层拆分，无 UI 变更）。
## 验证

- 定向 vitest（9 文件）：37 passed（dr01～dr07 + vg-r2-p3 + dd03）。
- `apps/web` 全量 vitest：74 files，466 passed / 1 skipped。
- 收口时 `pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/director3d typecheck`、`pnpm --filter @nx9/web typecheck` 均通过。
- A10 定向 vitest（16 文件）：102 passed（含 flow-runner 拆分守卫）。
- A10 全量 vitest：77 files，484 passed / 1 skipped。

# NX9-DEEP-REMAINING-GAPS 完票报告

## 统计

- 总票数：9 | 已闭环：8 | ⏸ 记档：1 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-DEEP-REMAINING-GAPS-2026-08-12.md` 全文与汇总表，下列票均已处理：

- 已闭环：DR-01、DR-02、DR-03、DR-04、DR-05、DR-06、DR-07、DR-09
- ⏸ 记档：DR-08

## ⏸ 后置项

- DR-08 `audioUrl` 音画对齐：产品未定义口径，禁止半接线；触发条件与锚点见上。

## 回归风险

- `approveAllKeyframes` / `simpleConcatExport` 行为改为链优先：无连接链的旧工作室流程会 blocked，这是 F-003 预期行为，不是回退。
- continuity 写回从整表 failed 改为 review：导演台 / 视频门禁不再因建议性 warning 整链卡死，审片列表会显示 review 条目。
- `ClipGenBlock` 卡面委托 `runFlowBatch` 后，卡面日志与节点状态由统一 runner 产出；回退卡面历史数据走迁移补丁。

## 建议人工复验清单（浏览器）

1. Studio 批审：连接两套分镜链时只批本链；无链时出现 blocked 提示。
2. 审片工作区：批准/打回只写上游链镜表，断开链后节点 blocked。
3. 导出工作区：无连接链时禁止导出；有链但缺采用视频时 error 文案明确。
4. 连续性检查：模型返回围栏 JSON 与纯文本时均不假绿，issue 只降级 review。
5. beat-sync / BGM：节点与设置文案不宣称听音对齐或 BGM 真生成。
6. 音量关键帧：剪辑台轨上菱形可拖动改 `atSec`。
