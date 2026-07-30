---
name: 制作台关键帧提示词
title: 制作台关键帧提示词
description: 专业分镜关键帧英文提示词：景别运镜、角色/环境一致性、质量句与约束；单帧可执行。
version: 2.0.0
---

# 制作台关键帧提示词

## 这个 skill 用来做什么
权威文案与样例来源，供 studio-prompt-builder 对齐；拼装器可读 templates。

## 输入要求
镜头描述、角色档案、环境、艺术方向、景别运镜。

## 输出要求
英文多行提示词：质量句 + 景别 + 运镜 + Scene content + Lighting + Art direction + Constraints（单帧、无水印、无多格）。

## 工作流程
锁主体与连续性 → 补摄影语言 → 注入角色/环境 enrich → 加约束尾句。

## 约束与边界
单帧；无 UI/水印/箭头标注；身份与服装连续。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 英文可执行
- [ ] 含质量与约束
- [ ] 无多格拼贴词
