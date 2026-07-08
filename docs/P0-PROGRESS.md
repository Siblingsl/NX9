# NX9 P0 实现进度

> 基准：P0 共 **6** 项功能，每项约占 **16.7%**。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | 故事板面板 + workspace schema v2 + 分镜 Markdown 导入 | ✅ 完成 | **17%** |
| 2 | 画布执行引擎 + 模块间数据流 | ✅ 完成 | **33%** |
| 3 | Undo/Redo UI | ✅ 完成 | **50%** |
| 4 | Seedance Skill 种子包 | ✅ 完成 | **67%** |
| 5 | AI 配音 voice lines + 角色绑定 + 批量 TTS | ✅ 完成 | **83%** |
| 6 | picture-gen / clip-gen 真实 gateway | ✅ 完成 | **100%** |

**当前总进度：100%（P0 已全部落地）**

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-06 | P0-1：workspace v2、`StoryboardPanel`、Markdown 分镜导入、ChatModel 一键导入 | 17% |
| 2026-07-06 | P0-2：`flow-runner` 拓扑批量执行、`gatherUpstream` 数据流、透传/预览模块 | 33% |
| 2026-07-06 | P0-3：顶栏 Undo/Redo 按钮 + Ctrl+Z/Y 快捷键 | 50% |
| 2026-07-06 | P0-4：6 个 Seedance Skill 种子 + Skills 抽屉「导入 Seedance 包」 | 67% |
| 2026-07-06 | P0-5：voice profiles/lines、故事板配音 Tab、`POST .../voice/generate` | 83% |
| 2026-07-06 | P0-6：gateway 真实 image（DALL·E）+ video（异步轮询）+ 模块 UI 更新 | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P0-PROGRESS.md` |
| 故事板类型 | `packages/shared/src/types/storyboard.ts` |
| 分镜导入 | `packages/shared/src/utils/storyboard-import.ts` |
| 拓扑/上游 | `packages/shared/src/engine/flow-graph.ts` |
| 故事板 UI | `apps/web/src/panels/StoryboardPanel.tsx` |
| 批量执行 | `apps/web/src/engine/flow-runner.ts` |
| Seedance 种子 | `apps/server/src/modules/skills/seedance-skills.ts` |
| 配音 API | `apps/server/src/modules/workspace/voice-workspace.service.ts` |
| 图像/视频网关 | `apps/server/src/modules/gateway/gateway.service.ts` |

---

## 下一步（P1）

见 `docs/NX9-PRD.md` 第九章：审阅门控、宫格链路、FFmpeg 合成、SSE 任务进度等。
