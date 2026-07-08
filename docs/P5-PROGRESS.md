# NX9 P5 实现进度

> 基准：P5 共 **3** 项功能，每项约占 **33.3%**。

| # | 功能 | 状态 | 累计进度 |
|---|------|------|----------|
| 1 | GenericBlock 替换（抠图/放大/去元数据/FAL 超市） | ✅ 完成 | **33%** |
| 2 | 故事板网格批审（勾选 + 批量通过/打回） | ✅ 完成 | **67%** |
| 3 | motion-story 纳入批量运行 | ✅ 完成 | **100%** |

**当前总进度：100%**

---

## 变更日志

| 时间 | 完成项 | 进度 |
|------|--------|------|
| 2026-07-07 | P5-1：`BgRemove` / `UpscaleLite` / `WatermarkClean` / `FalMarket` 模块 + API | 33% |
| 2026-07-07 | P5-2：故事板网格视图批量审阅工具栏 | 67% |
| 2026-07-07 | P5-3：`motion-story` 加入 `RUNNABLE_BLOCKS` + flow-runner Clip 链 | 100% |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 进度追踪 | `docs/P5-PROGRESS.md` |
| Fal 网关 | `apps/server/src/modules/gateway/gateway.service.ts`（`proxyFal`） |
| 图像工具 | `apps/server/src/modules/image-ops/image-ops.service.ts` |
| 新模块 | `apps/web/src/blocks/utility/BgRemoveBlock.tsx` 等 |
| 批审 UI | `apps/web/src/panels/StoryboardPanel.tsx` |
| 批量运行 | `apps/web/src/engine/flow-runner.ts` |

---

## 使用说明

**抠图 / FAL**：设置中配置 Fal.ai API Key（`primaryApiKey`）→ 模块库添加「抠图」或「FAL 超市」。

**网格批审**：故事板 → 网格视图 → 勾选镜头 →「通过」/「打回」；「全选待审阅」一键选中 review 状态镜头。

**动效分镜批量**：画布放置 `motion-story` → 连接故事板数据或模块内加载 → 顶栏「批量运行」。

---

## 下一步（P6 候选）

- 更多 GenericBlock（ComfyUI / Grok Agent）
- 故事板生产进度墙（顶栏 Backlot 进度）
- 提示词模板用户自定义持久化
