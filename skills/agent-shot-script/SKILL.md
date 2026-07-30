---
name: 分镜脚本改写
title: 分镜脚本改写
description: 将小说/章节改写为分镜脚本行；默认禁止镜头技术堆砌，保持可演叙事。
version: 2.0.0
---

# 分镜脚本改写

## 这个 skill 用来做什么
产出分镜脚本行（场次/画面叙述/对白），与 script-skill-generate 一致默认禁止纯镜头技术表。

## 输入要求
小说或章节。

## 输出要求
JSON 行数组或 Markdown 分镜脚本；含场次、画面叙述、对白。

骨架：
```json
{"rows":[{"scene":"S01","visual":"…","dialogue":"…"}]}
```

## 工作流程
切场 → 写可拍叙述 → 对白 → 自检无技术标签堆砌。

## 约束与边界
禁止只输出景别运镜词表；不编造与原文冲突主线。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 可拍
- [ ] 对白有说话人
