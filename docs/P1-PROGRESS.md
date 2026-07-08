# NX9 P1 实现进度

> 基准：P1 共 **6** 项功能，每项约占 **16.7%**。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | director-desk 与故事板双向联动 | ✅ 完成 | **17%** |
| 2 | 宫格 generate / split / compose 链路 | ✅ 完成 | **33%** |
| 3 | 审阅门控 + contact sheet 导出 | ✅ 完成 | **50%** |
| 4 | FFmpeg 单镜合成 MP4 | ✅ 完成 | **67%** |
| 5 | 任务队列 + 异步轮询 + SSE 进度 | ✅ 完成 | **83%** |
| 6 | 资源库 UI + 工作流 JSON 导入导出 | ✅ 完成 | **100%** |

**当前总进度：100%（P1 已全部落地）**

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-06 | P1-1：`DirectorDeskBlock`、镜头↔画布选中联动、`spawnBlockForShot`、时间线视图 | 17% |
| 2026-07-06 | P1-2：`story-grid` 可见化、`GridSplit/Compose/StoryGrid` 模块、`/api/grid/*` + sharp | 33% |
| 2026-07-06 | P1-3：审阅门控 manual/auto、打回/通过、contact sheet PNG 导出 | 50% |
| 2026-07-06 | P1-4：`montage` 模块 FFmpeg 单镜合成 + 审阅门控拦截 | 67% |
| 2026-07-06 | P1-5：`tasks` 模块 JSON 持久化、SSE `/api/tasks/:id/stream`、批量运行进度 | 83% |
| 2026-07-06 | P1-6：`AssetLibraryPanel`、工作流 JSON 导入/导出 API + UI | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P1-PROGRESS.md` |
| 导演台 | `apps/web/src/blocks/core/DirectorDeskBlock.tsx` |
| 宫格模块 | `apps/web/src/blocks/utility/GridSplitBlock.tsx`、`GridComposeBlock.tsx`、`craft/StoryGridBlock.tsx` |
| 宫格 API | `apps/server/src/modules/grid/` |
| 审阅/合成 | `apps/server/src/modules/montage/` |
| 任务队列 | `apps/server/src/modules/tasks/` |
| SSE Hook | `apps/web/src/hooks/use-task-stream.ts` |
| 资源库 | `apps/web/src/panels/AssetLibraryPanel.tsx` |
| 故事板增强 | `apps/web/src/panels/StoryboardPanel.tsx` |

---

## 下一步（P2）

见 `docs/NX9-PRD.md` 第九章：Seedance 连续 clip 链、参考视频反推分镜、Voicebox 桥接、整集 concat 导出等。
