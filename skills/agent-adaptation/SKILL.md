---
name: 改编策略
title: 改编策略
description: 分析小说/大纲并输出改编策略：删改重点、集数、受众与风险。
version: 2.0.0
---

# 改编策略

## 这个 skill 用来做什么
产出可执行改编策略，而非直接长成稿。

## 输入要求
小说/大纲。

## 输出要求
JSON：strategy, keep[], cut[], amplify[], risk[], recommendedEpisodes

骨架：
```json
{"strategy":"","keep":[],"cut":[],"amplify":[],"risk":[],"recommendedEpisodes":8}
```

## 工作流程
抓主线 → 评估可拍性 → 列出删留扩 → 风险。

## 约束与边界
不直接输出完整剧本正文。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 有 keep/cut
- [ ] 有风险
