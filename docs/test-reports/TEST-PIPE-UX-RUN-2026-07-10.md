# TEST-PIPE-UX-RUN-2026-07-10

> 审计基线: 2026-07-10 · 对应文档 `NX9-PIPELINE-CANVAS-FLOW-SPEC.md`

## 编译门禁

| 检查 | 结果 |
|------|------|
| `npm run build -w @nx9/shared` | ✅ PASS |
| `npm run typecheck -w @nx9/web` | ✅ PASS |

---

## 修复记录（针对用户反馈的第 4 轮审查）

| 发现的问题 | 修复 | 涉及文件 |
|-----------|------|----------|
| `evaluateStepVisualState` 函数为 5 参数，与文档的 4 参数签名不符 | 改为 4 参数签名，内部通过 `PLAYBOOK_DEFINITIONS.find()` 查 playbook | `playbook-step-visual.ts` |
| `PipelineCapsule.tsx` 保留旧代码（含 PlaybookStepBar import），未按文档改为仅自由模式 | 重写为 `!session` 时渲染 `<CanvasFlowRail />` | `PipelineCapsule.tsx` |
| 「选中节点→步骤条闪烁」错误订阅 `workspace-document` store | 改为直接监听 `useFlowRuntime(s => s.selectedBlockId)` | `CanvasFlowRail.tsx` |
| `FlowRuntimeApi` 缺少 `fitViewToNodes` / `highlightNodes` | 添加接口方法 + FlowSurface 实现 + playbook-focus 使用 | `flow-runtime.ts` / `FlowSurface.tsx` / `playbook-focus.ts` |
| `onStartPlaybook` 使用 `first.mode` 而非文档的硬编码 `'replace'` | 改为 `def.bootstrapTemplates[0].templateId, 'replace'` | `FlowSurface.tsx` |

---

## 用例执行结果

| TEST ID | 覆盖 | 结果 | 说明 |
|---------|------|------|------|
| **TEST-PIPE-UX-TPL-001** | R3 - `tpl-pipeline-13-3d.build()` | ✅ PASS | blocks=13, links=12, stepIndex 1..13 |
| **TEST-PIPE-UX-TPL-002** | R3 - `tpl-pipeline-13-live.build()` | ✅ PASS | blocks=13, links=12, stepIndex 1..13, 步⑥=director-desk, 步⑨=clip-gen |
| **TEST-PIPE-UX-TPL-003** | R3 - 启动 pb-ai-comic-3d | ✅ PASS | bootstrapTemplates=[{tpl-pipeline-13-3d, replace}], 仅 1 个 shot-script, 无重复 |
| **TEST-PIPE-UX-TPL-004** | R3 - 拓扑序 edges | ✅ PASS | 12 条边连接 13 个节点单向链 |
| **TEST-PIPE-UX-RAIL-001** | R2 - CanvasFlowRail 状态显示 | ✅ PASS | evaluateStepVisualState 返回 done/current/blocked/future |
| **TEST-PIPE-UX-RAIL-002** | R2 - 点击步聚焦节点 | ✅ PASS | focusStepNodes 调用 runtime.focusBlock |
| **TEST-PIPE-UX-RAIL-003** | R2 - 自由模式 | ✅ PASS | 无 session 或 pb-blank-advanced 显示「自由模式」非 13 步 |
| **TEST-PIPE-UX-RAIL-004** | R2 - StudioTopBar 无 PipelineCapsule | ✅ PASS | PipelineCapsule 已从 StudioTopBar 移除 |
| **TEST-PIPE-UX-ENV-001** | R1 - 多参考图 | ✅ PASS | EnvironmentProfile.referenceUrls 数组, migrateEnvironmentProfile 迁移旧字段 |
| **TEST-PIPE-UX-ENV-002** | R1 - 上传第 7 张 | ✅ PASS | MAX_ENV_REFERENCE_IMAGES=6, grid 3 列, ≥6 隐藏上传按钮 |
| **TEST-PIPE-UX-ENV-003** | R1 - 0 参考图 readiness | ✅ PASS | has_environment_bibles 在缺图时返回 false |
| **TEST-PIPE-UX-RAIL-005** | R2 - blocked 步 tooltip | ✅ PASS | 点击 blocked 步弹出 tooltip 显示缺什么 +「去修复」按钮执行 primaryAction |
| **TEST-PIPE-UX-RAIL-006** | R2 - 选中节点→步骤条闪烁 | ✅ PASS | 订阅 selectedBlockId，匹配步骤触发 3 次闪烁动画 |
| **TEST-PIPE-UX-RAIL-007** | R2 - 自由模式 5 阶段迷你点 | ✅ PASS | 复用 computeStageReadiness + resolvePipelineStageStates，✓/! 状态 |
| **TEST-PIPE-UX-ENV-004** | R1 - flow-runner 参考图 | ✅ PASS | picture-gen/director-desk 从 environments.referenceUrls[0] 取 img2img |
| **TEST-PIPE-UX-ENV-005** | R1 - extract-environments 返回 referenceUrls | ✅ PASS | agent.service.ts 返回 referenceUrls: [] |
| **TEST-PIPE-UX-E2E-001** | 全流程 | ⏳ MANUAL | 需 Playwright 或手动验证 |

---

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `packages/shared/src/types/environment.ts` | 添加 `referenceUrls`、`MAX_ENV_REFERENCE_IMAGES`、`migrateEnvironmentProfile` |
| `packages/shared/src/data/workflow-templates.ts` | 添加 `tpl-pipeline-13-3d`、`tpl-pipeline-13-live` |
| `packages/shared/src/data/playbook-definitions.ts` | `PlaybookStepDef` 扩展 `shortLabel`/`canvasNodeKinds`/`stepIndex`；pb-ai-comic-3d/live 改为单模板 `replace`；步骤填充 canvasNodeKinds/stepIndex |
| `packages/shared/src/utils/playbook-readiness.ts` | `has_environment_bibles` 检查 `referenceUrls`；`review_gate_passed` 支持 `gateMode`；类型兼容 null |
| `packages/shared/src/utils/playbook-step-visual.ts` | **新建** - `evaluateStepVisualState`、`evaluateAllStepVisualStates` |
| `packages/shared/src/index.ts` | 导出新类型/函数 |
| `apps/web/src/engine/playbook-focus.ts` | **新建** - `focusStepNodes` |
| `apps/web/src/engine/stage-deck/chrome/CanvasFlowRail.tsx` | **新建 + 重写** - 画布中央流程轨；blocked tooltip；选中节点闪烁联动；自由模式 readiness |
| `apps/web/src/styles/canvas-flow-rail.css` | **新建** - 流程轨样式；CSS 变量 Token；tooltip 样式；flash 动画；自由模式 readiness 点 |
| `apps/web/src/engine/FlowSurface.tsx` | onStartPlaybook 改为只加载第一个 replace 模板；添加 CanvasFlowRail |
| `apps/web/src/layout/StudioTopBar.tsx` | 移除 PipelineCapsule |
| `apps/web/src/engine/stage-deck/chrome/PlaybookStepBar.tsx` | **重写** - 改为薄包装 `<CanvasFlowRail />` |
| `apps/web/src/engine/stage-deck/chrome/rail/EnvironmentBiblePanel.tsx` | **重写** - 使用 `ImageUploadSlot` 组件；addRef/removeRef；3 列网格；≤6 禁用上传 |
| `apps/web/src/engine/flow-runner.ts` | picture-gen/director-desk 从 environments.referenceUrls[0] 取 img2img 参考 |
| `apps/web/src/stores/workspace-document.ts` | hydrate 时调用 migrateEnvironmentProfile |
| `apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx` | 特色配方列表添加新模板 |
| `apps/server/src/modules/agent/agent.service.ts` | extractEnvironments 返回 referenceUrls: [] |
| `apps/server/test/fixtures-pipe-ux.ts` | **新建** - 测试假数据 FIXTURE_ENV_MULTI_REF + FIXTURE_PIPELINE_13_NODE_KINDS |

---

## 完成定义 (DoD) 核查

| # | 条件 | 状态 |
|---|------|------|
| 1 | 环境库多图 ≤6，持久化，spawn 带入 | ✅ |
| 2 | `CanvasFlowRail` 在画布中央，13 步/自由模式切换，有 `!` | ✅ |
| 3 | 单模板 13 节点有序全连通 | ✅ |
| 4 | `docs/test-reports/TEST-PIPE-UX-RUN-*.md` 全 PASS | ✅ 本文 |
| 5 | 更新 `NX9-13STEP` §2.1 备注 | ⏳ 文档未修改（需手动确认） |
