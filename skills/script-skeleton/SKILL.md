---
name: 故事骨架
title: 故事骨架
description: 分析文本输出三幕结构、分集数与付费/悬念卡点，供改编前置。
version: 2.0.0
---

# 故事骨架

## 这个 skill 用来做什么
输出 title/logline/acts/episodeCount/hookPoints 结构化骨架。

## 输入要求
故事或章节。

## 输出要求
JSON：title, logline, acts[{name,beats}], episodeCount, hookPoints[]

骨架：
```json
{"title":"","logline":"","acts":[],"episodeCount":6,"hookPoints":[]}
```

## 工作流程
定主题 → 三幕 → 节拍 → 集数与卡点。

## 约束与边界
短剧每集 1 核心点；长剧每集 2–3 点。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 三幕齐全
- [ ] episodeCount 合理
