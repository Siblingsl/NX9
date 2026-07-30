---
name: 分集剧本写作
title: 分集剧本写作
description: 根据改编策略与原文写出分集剧本；场次+动作+对白；禁镜头表。
version: 2.0.0
---

# 分集剧本写作

## 这个 skill 用来做什么
把策略落地为分集剧本正文。

## 输入要求
改编策略 + 原文要点。

## 输出要求
分集 bodyMd 或 JSON episodes；无 imagePrompt。

骨架：
```json
{"episodes":[{"index":1,"title":"第1集","bodyMd":"…"}]}
```

## 工作流程
按集写戏剧弧 → 场次 → 对白。

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 分集完整
- [ ] 无镜头表
