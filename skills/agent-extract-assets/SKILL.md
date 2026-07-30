---
name: 资产抽取
title: 资产抽取
description: 从文本提取角色与场景，并为角色填写六层设定与视觉锚点。
version: 2.0.0
---

# 资产抽取

## 这个 skill 用来做什么
产出可入库的角色/场景候选列表。

## 输入要求
剧本/小说。

## 输出要求
JSON：characters[]（六层+fixedVisualKeywords）, environments[]

骨架：
```json
{"characters":[],"environments":[]}
```

## 工作流程
扫实体 → 合并同名 → 补六层 → 场景概念去重。

## 约束与边界
同名唯一；场景按地点+时间+光色合并。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 角色有锚点
- [ ] 场景可复用
