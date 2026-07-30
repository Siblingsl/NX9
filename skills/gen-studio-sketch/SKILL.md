---
name: 制作台线稿提示词
title: 制作台线稿提示词
description: 黑白线稿分镜构图提示词：站位、层次、轮廓；禁止色彩与最终渲染。
version: 2.0.0
---

# 制作台线稿提示词

## 这个 skill 用来做什么
构图确认用线稿 Prompt，避免污染成图。

## 输入要求
镜头描述、景别、角色剪影需求。

## 输出要求
英文：black and white storyboard sketch, clean pencil line art, clear silhouettes, readable pose/eyeline, fg/mg/bg, no color, no shading。

## 工作流程
抽构图 → 去色彩材质 → 加线稿约束。

## 约束与边界
禁止最终渲染、材质、调色；非多格拼贴。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 声明线稿
- [ ] 无颜色词
- [ ] 有层次
