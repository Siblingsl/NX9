---
name: Bible 场景概念图
title: Bible 场景概念图
description: 资产库场景一键概念图：宽景、气氛光、建立镜头级环境提示词。
version: 2.0.0
---

# Bible 场景概念图

## 这个 skill 用来做什么
buildBibleImagePrompt(scene) 权威样例。

## 输入要求
场景名 + 描述。

## 输出要求
`Environment concept art: {name}. {description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.`

## 工作流程
拼环境描述 → 宽景建立 → 气氛光。

## 约束与边界
不塞角色特写抢戏；保持空间可读。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] wide/establishing
- [ ] 气氛光
- [ ] 场景名
