---
name: 环境卡生成
title: 环境卡生成
description: 为场次生成环境卡：空间、光色、道具锚点与可复用视觉规则。
version: 2.0.0
---

# 环境卡生成

## 这个 skill 用来做什么
环境设定卡，对齐下游场景生图。

## 输入要求
场次列表或剧本。

## 输出要求
JSON：environments[{name,sceneCode,time,lighting,palette,props,rules}]

骨架：
```json
{"environments":[{"name":"合租客厅","sceneCode":"S01","lighting":"暖黄台灯","palette":"木色/灰","props":["沙发"],"rules":["夜戏主灯偏暖"]}]}
```

## 工作流程
聚类同场景 → 写光色道具 → 去重。

## 约束与边界
不写镜头表；不一人一景无共用。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 光色明确
- [ ] 可复用
