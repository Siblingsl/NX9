---
name: 章节事件提取
title: 章节事件提取
description: 分析长篇文本，提取每章关键事件、人物与因果，供分集规划。
version: 2.0.0
---

# 章节事件提取

## 这个 skill 用来做什么
章节级事件表，服务 planner。

## 输入要求
长篇或多章文本。

## 输出要求
JSON：chapters[{index,title,events[],characters[],causality}]

骨架：
```json
{"chapters":[{"index":1,"title":"","events":[],"characters":[],"causality":""}]}
```

## 工作流程
按章切 → 抽事件 → 标因果。

## 约束与边界
不改写为剧本；不丢关键反转。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 每章有 events
- [ ] 因果可读
