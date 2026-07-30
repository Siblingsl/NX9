---
name: 分集成稿生成
title: 分集成稿生成
description: 根据 brief/bible 生成场次+动作+对白分集正文；禁 imagePrompt/镜头表；对齐 bible。
version: 2.0.0
---

# 分集成稿生成

## 这个 skill 用来做什么
生成或重写 `screenplay.episodes` 成稿：场景头、动作、对白，对齐 bible 与 brief，禁止视觉提示词与镜头表。

## 输入要求
brief + bible + 用户集数/倾向。

## 输出要求
```json
{"patch":{"brief":{"title":""},"screenplay":{"sourceType":"generated","episodes":[{"index":1,"title":"第1集","bodyMd":"场次+动作+对白"}]}}}
```


## 工作流程
1. 锁定集数与每集戏剧弧
2. 按 bible 稳定角色名与世界规则
3. 写 bodyMd（无镜头词）
4. 输出 patch

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 禁止 imagePrompt / videoPrompt / sketchPrompt
- 角色名必须与 bible 一致
- 每集须有开场钩子与集末钩子（短剧）

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] episodes 非空
- [ ] bodyMd 含场次与对白
- [ ] 无提示词字段
- [ ] 对齐 bible
