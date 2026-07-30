---
name: Bible 角色定妆图
title: Bible 角色定妆图
description: 资产库角色一键定妆：正面全身、干净背景、身份一致的概念设定图提示词。
version: 2.0.0
---

# Bible 角色定妆图

## 这个 skill 用来做什么
buildBibleImagePrompt(character) 的权威说明与样例；对齐 Master 精简生产版。

## 输入要求
name + description (+ 可选参考图)。

## 输出要求
`Character design sheet: {name}. {description}. Front view, full body, clean background, consistent identity, concept art quality.`

## 工作流程
拼 name/description → 加正面全身与 clean background → 可选负向。

## 约束与边界
不生成多人格；不换脸；背景干净。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 含角色名
- [ ] 全身正面
- [ ] 身份一致句
