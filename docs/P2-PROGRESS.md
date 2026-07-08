# NX9 P2 实现进度

> 基准：P2 共 **4** 项功能，每项约占 **25%**。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | Seedance 连续 clip 链（Clip 01→02→03 上下文传递） | ✅ 完成 | **25%** |
| 2 | 参考视频反推分镜结构（OpenMontage 思路） | ✅ 完成 | **50%** |
| 3 | Voicebox 本地桥接 | ✅ 完成 | **75%** |
| 4 | 整集 concat 导出 + 时间线 JSON | ✅ 完成 | **100%** |

**当前总进度：100%（P2 已全部落地）**

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-06 | P2-1：`MotionStoryBlock` + `clip-chain` 工具 + `runClipChain` 续拍上下文 | 25% |
| 2026-07-06 | P2-2：`analyze-reference` API（ffmpeg 抽帧 + LLM 反推分镜表）+ 故事板「反推」入口 | 50% |
| 2026-07-06 | P2-3：Voicebox adapter（17493）+ 设置页探测 + TTS 优先本地桥接 | 75% |
| 2026-07-06 | P2-4：`concat-episode` FFmpeg 整集合成 + `export-timeline` JSON | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P2-PROGRESS.md` |
| Clip 链工具 | `packages/shared/src/utils/clip-chain.ts` |
| 时间线导出 | `packages/shared/src/utils/timeline-export.ts` |
| 动效分镜模块 | `apps/web/src/blocks/core/MotionStoryBlock.tsx` |
| Clip 链执行器 | `apps/web/src/engine/clip-chain-runner.ts` |
| 参考反推 | `apps/server/src/modules/montage/analyze.service.ts` |
| Voicebox 桥接 | `apps/server/src/modules/gateway/voicebox.adapter.ts` |
| 整集合成 | `apps/server/src/modules/montage/montage.service.ts`（`concatEpisode` / `exportTimeline`） |
| 故事板 P2 UI | `apps/web/src/panels/StoryboardPanel.tsx` |
| Voicebox 设置 | `apps/web/src/panels/SettingsDrawer.tsx` |

---

## 下一步（P3）

见 `docs/NX9-PRD.md` 第九章：Remotion 预览、多用户/Prisma、计费与用量追踪等。
