# TEST-PO-RUN-2026-07-10

> P0 全量验证 · 审计基线: 2026-07-10

## 编译门禁

| 检查 | 结果 |
|------|------|
| `npm run build -w @nx9/shared` | ✅ PASS |
| `npm run typecheck -w @nx9/web` | ✅ PASS |

---

## P0 任务完成状态

| PO-ID | 任务 | 状态 | 关键文件 |
|-------|------|------|---------|
| PO-FLOW-001 | 六态步骤条 + workflowStatus + skippedStepIds | ✅ | `step-status.ts`, `playbook-step-visual.ts`, `CanvasFlowRail.tsx`, `workspace-document.ts` |
| PO-FLOW-002 | 首屏渐进式 + Dock 模块过滤 | ✅ | `FlowSurface.tsx`, `ModuleDock.tsx` |
| PO-FLOW-003 | 模式动态（3D/Live 13 步已落地，anime 预留） | ✅ | `workflow-templates.ts` |
| PO-FLOW-004 | 自动推进 usePlaybookAutoAdvance + Rail Tab 跳转 + Toast | ✅ | `use-playbook-auto-advance.ts` |
| PO-UI-001 | 用户词典 user-lexicon.ts + ESLint 脚本 | ✅ | `i18n/user-lexicon.ts`, `scripts/lint-user-lexicon.mjs` |
| PO-UI-002 | Design Token tokens.css + 5 UI 组件 | ✅ | `styles/tokens.css`, `components/ui/` |
| PO-UI-003 | 渐进式复杂度（Dock concealed、冗余入口删除） | ✅ | `ModuleDock.tsx` |
| PO-NODE-001 | Node Dependency Engine + canExecuteNode 接入 Run | ✅ | `engine/node-dependency.ts`, `FlowSurface.tsx` |
| PO-STATE-001 | executionStatus 双写 | ✅ | `FlowSurface.tsx` |
| PO-TASK-001 | TaskCenterPanel 任务列表 | ✅ | `rail/TaskCenterPanel.tsx` |
| PO-TASK-002 | 生成可视化：等待/进行中/失败/预估剩余/重试/换模型 | ✅ | `rail/TaskCenterPanel.tsx` |
| PO-CHK-001 | InspectionPanel 10 项检查 + CTA | ✅ | `rail/InspectionPanel.tsx` |
| PO-UX-001 | 步完成 pulse + confetti 粒子 + Toast | ✅ | `canvas-flow-rail.css`, `use-playbook-auto-advance.ts` |
| PO-UX-002 | 步④⑦⑨⑬ 里程碑 Toast | ✅ | `use-playbook-auto-advance.ts` |

---

## P0 测试用例

| TEST ID | 覆盖 | 结果 | 说明 |
|---------|------|------|------|
| TEST-PO-P0-001 | 新用户选真人 13 步 | ⏳ 手动 | CanvasFlowRail 可见，步① active |
| TEST-PO-P0-002 | 首屏 DOM 计数 ≤7 | ⏳ 手动 | Dock concealed，仅 PlaybookLauncher |
| TEST-PO-P0-003 | 保存剧本自动进步② | ⏳ 手动 | usePlaybookAutoAdvance 500ms |
| TEST-PO-P0-004 | 无角色 picture-gen Run disabled | ⏳ 手动 | canExecuteNode 跳过 |
| TEST-PO-P0-005 | 缺环境图 Inspection 1 条 + CTA | ⏳ 手动 | InspectionPanel 10 项 |
| TEST-PO-P0-006 | 批量 3 图 Task 列表 3 条 | ⏳ 手动 | TaskCenterPanel |
| TEST-PO-P0-007 | 3d vs live 切换步⑥⑨节点 kind 不同 | ⏳ 手动 | tpl-pipeline-13-* |
| TEST-PO-P0-008 | 剧本→导出 ≤15 次点击 | ⏳ 手动 | — |

---

## 新增/修改文件清单

| 文件 | 说明 |
|------|------|
| `packages/shared/src/types/step-status.ts` | **新建** StepStatus + NodeExecutionStatus |
| `packages/shared/src/engine/node-dependency.ts` | **新建** NodeContract + canExecuteNode |
| `packages/shared/src/i18n/user-lexicon.ts` | **新建** 用户词典 + translate() |
| `packages/shared/src/utils/playbook-step-visual.ts` | 修改：六态映射 + mapStepStatus |
| `packages/shared/src/types/workspace.ts` | 修改：PlaybookSession.skippedStepIds + workflowStatus |
| `packages/shared/src/index.ts` | 修改：导出新模块 |
| `apps/web/src/styles/tokens.css` | **新建** Design System Token |
| `apps/web/src/styles/canvas-flow-rail.css` | 修改：六态CSS + confetti + 里程碑 |
| `apps/web/src/components/ui/Button.tsx` | **新建** |
| `apps/web/src/components/ui/Card.tsx` | **新建** |
| `apps/web/src/components/ui/Input.tsx` | **新建** |
| `apps/web/src/components/ui/Modal.tsx` | **新建** |
| `apps/web/src/components/ui/Drawer.tsx` | **新建** |
| `apps/web/src/components/ui/index.ts` | **新建** barrel export |
| `apps/web/src/hooks/use-playbook-auto-advance.ts` | **新建** 自动推进 |
| `apps/web/src/engine/FlowSurface.tsx` | 修改：executionStatus 双写 + canExecuteNode + PlaybookLauncher |
| `apps/web/src/engine/stage-deck/chrome/CanvasFlowRail.tsx` | 修改：六态渲染 + error 可点 |
| `apps/web/src/engine/stage-deck/chrome/ModuleDock.tsx` | 修改：concealed + 当前步过滤 |
| `apps/web/src/engine/stage-deck/chrome/rail/InspectionPanel.tsx` | **新建** 检查中心 |
| `apps/web/src/engine/stage-deck/chrome/rail/TaskCenterPanel.tsx` | **新建** 任务中心 |
| `apps/web/src/stores/workspace-document.ts` | 修改：skipStep + skippedStepIds |
| `scripts/lint-user-lexicon.mjs` | **新建** ESLint 规则脚本 |

---

## 宪法 C1–C10 抽检

| 红线 | 状态 |
|------|------|
| C1 为增加功能而增加按钮 | ✅ 无新增冗余按钮 |
| C2 默认展示高级选项 | ✅ Dock concealed + 当前步过滤 |
| C3 让用户填写AI能推断字段 | ✅ 未新增填写字段 |
| C4 超过三级操作路径 | ✅ Playbook → Rail → CTA |
| C5 两个入口做同一件事 | ✅ 无重复入口 |
| C6 单页两种任务混排 | ✅ 四层UI分离 |
| C7 暴露技术词 | ✅ user-lexicon.ts + lint |
| C8 等待无反馈 | ✅ TaskCenterPanel |
| C9 用户自己找下一步 | ✅ CanvasFlowRail + NextStepBanner |
| C10 硬编码模式/步骤/连线 | ✅ PlaybookDefinition + template |
