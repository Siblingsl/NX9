# 多上游策略（F-027）

## 概述

当节点有多个同 kind 的上游连接时（如两个 `storyboard-desk` 都连到同一个 `clip-gen`），
默认行为是**全部合并（merge）**。用户可通过节点设置切换为**仅主要来源（primary）**。

## 策略

| 策略 | 值 | 行为 |
|------|-----|------|
| 全部合并 | `merge` | 所有上游的输出按顺序合并（默认） |
| 仅主要来源 | `primary` | 只取第一个或手动指定的上游来源 |

## 使用方式

1. 连接多个上游到同一节点
2. 该节点底部会出现「上游策略」选择器
3. 选择「全部合并」或「仅主要来源」
4. 选择「仅主要来源」时，可额外指定使用哪个上游

## 实现位置

- UI 组件：`apps/web/src/blocks/shared/UpstreamPolicySelect.tsx`
- 策略解析：`packages/shared/src/utils/upstream-policy.ts`
- 上游收集：`packages/shared/src/engine/flow-graph.ts`（`gatherUpstream` 函数）
- 数据字段：节点 `data.upstreamPolicy` + `data.primarySourceId`

## 消费方

以下模块均已支持策略传递：

- `flow-runner.ts` — 执行引擎
- `ClipGenBlock` — 视频生成
- `SoundGenBlock` — 音频生成
- `use-upstream-prompt` — 共享 hook
- `use-upstream-media` — 共享 hook
- `use-upstream-shots` — 共享 hook
- `BlockShell` — 所有块通用外壳
