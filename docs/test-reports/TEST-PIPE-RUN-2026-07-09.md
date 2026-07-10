# TEST-PIPE 13-Step Pipeline 实施报告

**日期**：2026-07-09  
**基线**：`docs/NX9-13STEP-PRODUCTION-PIPELINE-SPEC.md`

## 构建验证

| Command | Status |
|---------|--------|
| `npm run build -w @nx9/shared` | ✅ |
| `npm run typecheck -w @nx9/web` | ✅ |
| `npx nest build` (server) | ✅ |

## 测试结果

| 测试文件 | 总数 | 通过 | 失败 |
|----------|------|------|------|
| 全部 16 文件（含新建 test-pipe） | 71 | 71 | 0 |

### 新增 TEST-PIPE 测试（14 项）

| ID | 断言 | 状态 |
|----|------|------|
| TEST-PIPE-000 | resolveNextStep 13 步 playbook 第一步 script | ✅ |
| TEST-PIPE-000-live | pb-pipeline-13-live 13 步 | ✅ |
| TEST-PIPE-101 | scriptPlan v2 往返 | ✅ |
| TEST-PIPE-201 | scene-split readiness 检测 | ✅ |
| TEST-PIPE-301 | materializeShots 写 sceneCode / keyframeStatus | ✅ |
| TEST-PIPE-401 | extractAssets bible 六层字段 | ✅ |
| TEST-PIPE-501 | environment library upsert fixture | ✅ |
| TEST-PIPE-601 | spawnCameraBlocksForShots 类型签名 | ✅ |
| TEST-PIPE-801 | keyframeStatus 迁移 v2→v3 | ✅ |
| TEST-PIPE-901 | all_keyframes_approved 门禁 | ✅ |
| TEST-PIPE-1201 | review-gate 用 videoStatus | ✅ |
| TEST-PIPE-000-playbook | 10 个新 readiness key 全部注册 | ✅ |
| TEST-PIPE-1001 | ConsistencyIssue 类型 | ✅ |
| TEST-PIPE-readiness | 新 readiness 函数默认返回值 | ✅ |

## §12 完成度更新

| # | 标准 | 状态 |
|---|------|------|
| 1 | Launcher 提供 13 步 3D / 13 步真人 入口 | ✅ |
| 2 | ② Scene Split UI + API 可用 | ✅ |
| 3 | ⑤ Environment Bible 库 + UI | ✅ |
| 4 | ⑧⑫ 双阶段审阅字段 (keyframeStatus/videoStatus) | ✅ |
| 5 | 13 步 NextStepBanner 无 dead-end | ✅ |
| 6 | TEST-PIPE-000~1201 PASS | ✅ |
| 7 | 人工脚本 A PASS | ⏳ 需手动 |
| 8 | 爆款 7 步脚本 B PASS | ✅ |

**完成度：7/8**

## 变更新增文件

| 文件 | 说明 |
|------|------|
| `packages/shared/src/types/scene-split.ts` | SceneSplitRecord 类型 |
| `packages/shared/src/types/environment.ts` | EnvironmentProfile 类型 |
| `packages/shared/src/utils/environment-prompt.ts` | 环境 prompt 注入 |
| `packages/shared/src/utils/consistency-repair.ts` | ConsistencyIssue 类型 |
| `apps/web/src/engine/camera-block-spawn.ts` | 批量 spawn 导演台 |
| `apps/web/src/engine/stage-deck/chrome/rail/SceneSplitPanel.tsx` | 场次拆分 UI |
| `apps/web/src/engine/stage-deck/chrome/rail/EnvironmentBiblePanel.tsx` | 环境 Bible UI |
| `apps/web/src/engine/stage-deck/chrome/rail/CharacterBibleStepPanel.tsx` | 角色 Bible UI |
| `apps/server/test/test-pipe.test.ts` | PIPE 测试套件 |

## 变更修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/script-plan.ts` | version→2, 加 scenes/screenplayMd/directorPlanMd |
| `packages/shared/src/types/storyboard.ts` | 加 sceneId/sceneCode/keyframeStatus/videoStatus, v3 迁移 |
| `packages/shared/src/types/workspace.ts` | 加 environments 字段 |
| `packages/shared/src/data/playbook-definitions.ts` | 加 pb-pipeline-13-3d/live, 加 spawn_camera_blocks action |
| `packages/shared/src/utils/playbook-readiness.ts` | 10 个新 readiness key |
| `packages/shared/src/index.ts` | 导出新类型/函数 |
| `apps/server/src/modules/agent/agent.service.ts` | 加 sceneSplit/extractEnvironments, 扩展 extractAssets bible |
| `apps/server/src/modules/agent/agent.controller.ts` | 加 scene-split/extract-environments 路由 |
| `apps/server/src/modules/montage/montage.service.ts` | validateReviewGate 改用 videoStatus |
| `apps/web/src/stores/workspace-document.ts` | 加 scriptPlan/environments 状态 |
| `apps/web/src/engine/playbook-runner.ts` | 加 spawn_camera_blocks 动作 |
| `apps/web/src/engine/stage-deck/chrome/rail/ScriptStudioPanel.tsx` | 加保存并继续 CTA, 嵌入 SceneSplit/CharBible/Env 面板 |
| `apps/web/src/engine/stage-deck/chrome/rail/NextStepBanner.tsx` | 传递 ctx 到 advancePlaybookStep |
| `apps/web/src/api/client.ts` | 加 sceneSplit API 方法 |
| `apps/server/test/fixtures.ts` | 加 FIXTURE_NOVEL_500/SCENE_SPLIT_3/ENV_PROFILE |
