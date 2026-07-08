# NX9 P7 实现进度 — Backlot 模板库

> 统一 **角色 / 场景 / 镜头 / 情绪 / 钩子** 五库，替代分散的「提示词模板 + 角色库」入口。

| # | 功能 | 状态 | 累计 |
|---|------|------|------|
| P7-1 | 统一 schema + 内置 preset（五库） | ✅ | 20% |
| P7-2 | BacklotLibraryPanel 五 Tab UI + 搜索 | ✅ | 40% |
| P7-3 | 应用逻辑（画布 / 故事板 / 角色导入） | ✅ | 60% |
| P7-4 | 自定义模板持久化（工作区 save） | ✅ | 80% |
| P7-5 | Stage Deck 存为场景模板 | ✅ | 100% |

**当前总进度：100%**

---

## 交付物

### 数据层 `packages/shared/src/data/backlot-templates.ts`

| 库 | 内置数量 | 说明 |
|----|---------|------|
| 角色库 | 6 archetype | 可一键导入工作区角色 |
| 场景库 | 8 | 环境/光线 preset |
| 镜头库 | 8 | 来自 `CAMERA_PROMPT_PRESETS` |
| 情绪库 | 8 | 表情/氛围/色调 |
| 钩子库 | 9 | 开场 4 + 结尾 5 |

### UI

- 顶栏 **Layers 图标** → `BacklotLibraryPanel`（360px）
- 五 Tab + 搜索 + **统一分组模板列表**（内置与自定义同组展示）
- **工作区优先流程**：各库先「新建」编辑草稿 → 直接应用 / 保存为模板
  - 角色库：中文人设、一致性 prompt、参考图预览、克隆参考音、保存/导入保留媒体
  - 场景/镜头/情绪/钩子：工作区草稿（`backlotWorkspace`）
- **模板管理**：自定义模板导入后可覆盖保存；删除带确认与 toast
- **Stage Deck**：场景统一走「载入工作区 → 选分组保存」，不再直存模板库
- **筛选**：全部分组 / 仅内置 / 仅自定义；钩子库额外支持开场/结尾
- 模板库：内置与已保存模板，支持「导入到工作区」或直接应用

### 持久化

- `WorkspacePayload.backlotCustom` — 已保存模板
- `WorkspacePayload.backlotWorkspace` — 场景/镜头/情绪/钩子工作区草稿
- `WorkspacePayload.characters` — 工作区角色

### 应用 Hook

- `apps/web/src/hooks/use-backlot-apply.ts`

---

## 变更日志

| 时间 | 项 |
|------|-----|
| 2026-07-07 | 角色 Tab 补齐参考图/参考音；模板覆盖保存；Stage Deck 统一工作区流程 |
| 2026-07-07 | 工作区优先流程：移除「新建模板」，各库新建→应用/保存为模板 |
| 2026-07-07 | 模板列表重构：自定义并入分组、来源/分组/钩子筛选 |
| 2026-07-07 | P7 全量：Backlot 模板库五库 + 自定义持久化 + Stage Deck 联动 |

---

## 关键文件

| 模块 | 路径 |
|------|------|
| 模板数据 | `packages/shared/src/data/backlot-templates.ts` |
| 面板 | `apps/web/src/panels/BacklotLibraryPanel.tsx` |
| 应用逻辑 | `apps/web/src/hooks/use-backlot-apply.ts` |
| 工作区字段 | `packages/shared/src/types/workspace.ts` → `backlotCustom` |
| 入口 | `apps/web/src/layout/AppShell.tsx` |

---

## 后续可选

- [ ] 模板市场 / 云端同步
- [ ] 从故事板批量生成钩子建议
- [ ] 情绪库 → clip-gen 节奏参数联动
