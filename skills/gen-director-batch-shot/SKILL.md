---
name: 导演批量镜头约束
title: 导演批量镜头约束
description: 批量镜头生成时叠加 3D camera / 构图约束与连续性规则的提示词包。
version: 2.0.0
---

# 导演批量镜头约束

## 这个 skill 用来做什么
导演台批量出镜时的附加约束与质量句，不复制 studio 全文，只叠加。

## 输入要求
镜头列表 + 构图模板 + 参考板约束。

## 输出要求
在 studio image/video 基础上追加 camera/构图/阻断原因策略。

## 工作流程
读约束 → buildConstrainedPrompt → 失败则 blocked 原因。

## 约束与边界
约束失败不得硬生成；保持资产 ID。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 约束可解释
- [ ] 不覆盖用户非空手写（除非 force）
