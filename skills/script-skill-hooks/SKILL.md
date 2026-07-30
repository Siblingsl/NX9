---
name: 爆点构建
title: 爆点构建
description: 产出可落画面的钩子列表；区分集末钩子与付费卡点；禁止镜头表。
version: 2.0.0
---

# 爆点构建

## 这个 skill 用来做什么
生成 brief.hooks：每条钩子必须可拍、可感知，并区分追剧钩子与付费卡点语义。

## 输入要求
plotOutline + 分集信息 + 平台。

## 输出要求
```json
{"patch":{"brief":{"hooks":["钩子1"]}}}
```
每条为短句，写清「谁在什么处境下发生什么可见转折」。

## 工作流程
1. 按集扫描高潮点
2. 过滤不可视抽象句
3. 标注付费卡点候选（文案内可括号注明）
4. 输出 hooks 数组

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 禁止空泛「更有悬念」
- 钩子必须可落画面

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] hooks 非空
- [ ] 每条可拍
- [ ] 无镜头技术词堆砌
