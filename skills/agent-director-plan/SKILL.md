---
name: 导演规划
title: 导演规划
description: 根据剧本草拟导演规划：风格、节奏、重点场、视觉母题。
version: 2.0.0
---

# 导演规划

## 这个 skill 用来做什么
输出导演阐述级规划，指导拆镜与生成，不代替分镜表。

## 输入要求
剧本或大纲。

## 输出要求
JSON：artDirection, cameraStyle, pacing, keySequences[], visualMotifs[]

骨架：
```json
{"artDirection":"","cameraStyle":"","pacing":"","keySequences":[],"visualMotifs":[]}
```

## 工作流程
读剧本情绪曲线 → 定风格 → 标重点场。

## 约束与边界
不输出逐镜表；不写具体 imagePrompt 全文。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 有 artDirection
- [ ] 有 keySequences
