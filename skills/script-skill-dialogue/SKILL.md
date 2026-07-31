---
name: 对白构建
title: 对白构建
description: 改写成稿对白层：说话人、情绪、可演口语；不写镜头语言。
version: 2.0.0
---

# 对白构建

## 这个 skill 用来做什么
在已有分集正文上强化对白：可演、可标注说话人与情绪，推动情节，禁止镜头语言。

## 输入要求
当前 screenplay.episodes + bible 角色声音笔记 + 用户指示。

## 输出要求
```json
{"patch":{"screenplay":{"episodes":[{"id":"保留或新id","index":1,"title":"","bodyMd":"含对白的正文"}],"sourceType":"generated"}}}
```
bodyMd 使用标准体例：场景头 `## S01 | 内景/外景 · 地点 | 时间`；动作自然段；对白 `角色名：台词` 或 `角色名（情绪）：台词`（禁止引号与【场景：】）。

## 工作流程
1. 读取角色 voiceNotes
2. 按场改写对白密度
3. 去掉镜头词
4. 输出 episodes patch

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 对白必须可朗读，禁止大段心理独白代替台词（可转动作/表情）
- 保留场次结构，勿无故合并毁掉因果

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 每句对白有说话人
- [ ] 情绪标注合理
- [ ] 无景别运镜词
- [ ] sourceType 合理
