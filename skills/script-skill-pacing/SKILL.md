---
name: 节奏构建
title: 节奏构建
description: 定义 balanced/slow/fast 与单集目标时长；对齐平台；禁止镜头表。
version: 2.0.0
---

# 节奏构建

## 这个 skill 用来做什么
写入节奏策略与单集时长预算，约束后续对白密度与拆镜时长。

## 输入要求
brief 平台信息 + 用户对快慢的要求。

## 输出要求
```json
{"patch":{"brief":{"pacing":"balanced|slow|fast","targetEpisodeDurationSec":90}}}
```
pacing 仅允许三枚举；时长为正整数秒。

## 工作流程
1. 读平台与片种
2. 映射到 pacing 枚举
3. 给出 targetEpisodeDurationSec
4. 输出 patch

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- pacing 不得写自由文本
- 时长须合理（短剧通常 60–180）

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] pacing ∈ balanced|slow|fast
- [ ] durationSec 合理
- [ ] 与平台匹配
