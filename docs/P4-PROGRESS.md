# NX9 P4 实现进度

> 基准：P4 共 **3** 项功能，每项约占 **33.3%**。  
> 目标：补 PRD 漏项 + 核心体验加固（P0–P3 文档 100% 后的第一轮增强）。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | 提示词模板库（分类浏览 + 一键填入画布） | ✅ 完成 | **33%** |
| 2 | 工作区保存失败 Toast + 一键重试 | ✅ 完成 | **67%** |
| 3 | flow-runner 同层并行执行（并发上限 3） | ✅ 完成 | **100%** |

**当前总进度：100%（P4 首轮增强已全部落地）**

---

## 选型理由

| 项 | 为什么优先 |
|----|-----------|
| 提示词模板库 | PRD 3.7 明确写了，代码里一直缺失；降低新手门槛 |
| 保存失败重试 | PRD 第十章要求；静默丢数据风险高 |
| 同层并行执行 | PRD 3.1 P1 规划；批量运行耗时可显著缩短 |

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-07 | 启动 P4：创建进度文档 | 0% |
| 2026-07-07 | P4-1：`PROMPT_TEMPLATES` 16 条 + `PromptLibraryPanel` + 顶栏入口 | 33% |
| 2026-07-07 | P4-2：`ToastHost` + 保存失败提示与重试 | 67% |
| 2026-07-07 | P4-3：`topologicalLayers` + 批量运行同层并发（上限 3） | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P4-PROGRESS.md` |
| 模板数据 | `packages/shared/src/data/prompt-templates.ts` |
| 模板面板 | `apps/web/src/panels/PromptLibraryPanel.tsx` |
| Toast | `apps/web/src/stores/toast.ts`、`apps/web/src/components/ToastHost.tsx` |
| 并行层 | `packages/shared/src/engine/flow-graph.ts`（`topologicalLayers`） |
| 批量执行 | `apps/web/src/engine/flow-runner.ts` |

---

## 使用说明

**提示词模板**：顶栏书本图标 → 按分类浏览 →「追加到画布」或「填入选中」（需先选中 prompt/chat-model 等模块）。

**保存重试**：自动保存失败时底部弹出 Toast，点击「重试」重新提交。

**并行批量运行**：无依赖关系的同级模块最多 3 个同时执行；有依赖的仍按层顺序跑。

---

## 下一步（P5 候选）

- GenericBlock 高频模块替换（`bg-remove`、`fal-market`）
- 故事板网格批审 + 生产进度墙
- motion-story 纳入批量运行
- 提示词模板用户自定义 / 持久化
- LuxTTS / Topaz 等近期功能写入总进度文档
