---
name: 剧情构建
title: 剧情构建
description: 产出起承转合大纲与分集数；对齐 brief 契约；禁止镜头表。
version: 2.0.0
---

# 剧情构建

## 这个 skill 用来做什么
把选题与世界落成可分集的剧情大纲（plotOutline）与 episodeCount，服务后续 generate / breakdown。

## 输入要求
brief（topic/logline）+ bible 摘要 + 用户补充剧情。

## 输出要求
```json
{"patch":{"brief":{"plotOutline":"","episodeCount":1}}}
```
plotOutline 需含起承转合与集边界提示；episodeCount 为正整数。

## 工作流程
1. 对齐 logline 冲突
2. 划集边界（每集戏剧弧）
3. 写 outline 文本
4. 给出推荐集数

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 不把多集剧情压进一集描述却把 episodeCount 写成 1（除非用户明确单集）
- 禁止无依据大结局剧透式扩写与用户冲突的新主线

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] plotOutline 含起承转合
- [ ] episodeCount ≥1
- [ ] 与 logline 一致
- [ ] 无镜头语言
