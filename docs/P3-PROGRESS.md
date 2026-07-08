# NX9 P3 实现进度

> 基准：P3 共 **3** 项功能，每项约占 **33.3%**。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | Remotion 轻量预览 | ✅ 完成 | **33%** |
| 2 | 多用户 / Prisma 数据库迁移 | ✅ 完成 | **67%** |
| 3 | 计费与用量追踪 | ✅ 完成 | **100%** |

**当前总进度：100%（P3 已全部落地）**

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-06 | P3-1：`RemotionPreviewPanel` + `timelineToRemotion` / `clipAtTime` + 导出 Remotion JSON | 33% |
| 2026-07-06 | P3-2：Prisma SQLite、`User`/`Workspace`/`UsageEvent`、用户切换、JSON→Prisma 迁移 API | 67% |
| 2026-07-06 | P3-3：Gateway 用量埋点、`UsagePanel`、按用户汇总 API 调用与消耗单位 | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P3-PROGRESS.md` |
| Remotion 导出 | `packages/shared/src/utils/remotion-export.ts` |
| 预览面板 | `apps/web/src/panels/RemotionPreviewPanel.tsx` |
| Prisma Schema | `apps/server/prisma/schema.prisma` |
| 用户模块 | `apps/server/src/modules/users/` |
| 用量模块 | `apps/server/src/modules/usage/` |
| 迁移 API | `apps/server/src/modules/admin/` |
| 用户会话 | `apps/web/src/stores/user-session.ts` |
| 用量面板 | `apps/web/src/panels/UsagePanel.tsx` |

---

## 使用说明

**Remotion 预览**：顶栏胶片图标 → 基于故事板时间线播放预览 → 可导出 Remotion 合成 JSON。

**Prisma 多用户**：
1. 顶栏用户下拉切换/新建用户
2. 设置 →「迁移 JSON → Prisma」
3. 设置环境变量 `NX9_STORAGE=prisma` 并重启服务端

**用量追踪**：顶栏图表图标 → 查看近 7 天 API 调用与预估消耗单位（LLM/图像/视频/TTS 分类）。

---

## PRD 全阶段状态

| 阶段 | 状态 |
|------|------|
| P0 | ✅ 100% |
| P1 | ✅ 100% |
| P2 | ✅ 100% |
| P3 | ✅ 100% |
| P4 | ✅ 100% |

---

## 下一步（P5）

见 `docs/P4-PROGRESS.md` 末尾候选列表。
