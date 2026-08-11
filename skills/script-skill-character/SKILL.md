---
name: 人物构建
title: 人物构建
description: 产出角色六层设定与英文 fixedVisualKeywords；同名唯一；叙事层 draft only。
version: 2.0.0
---

# 人物构建

## 这个 skill 用来做什么
为圣经角色层写入可入库的人物卡：身份、外貌、性格、关系、目标、声音，以及下游生图锁定用的 `fixedVisualKeywords`（英文）。人物视觉形态必须继承并服从 `bible.world.visualStyleNotes`（真人写实、3D、二维等），不得自行改变；本步为 draft，不直接改成稿对白。

## 输入要求
用户描述的人物 / brief / 原文人物线索。可一次多名，但同名必须合并。

## 输出要求
```json
{"patch":{"bible":{"characters":[{"name":"","identity":"","appearance":"","personality":"","relationships":"","goal":"","voiceNotes":"","fixedVisualKeywords":""}]}}}
```
六层 + 视觉锚点均需尽量完整；`fixedVisualKeywords` 为英文逗号分隔关键词串。

## 工作流程
1. 读取并确认 `bible.world.visualStyleNotes`；未选择时只补人物设定，不得进入剧本生成
2. 列出角色并消解同名冲突
3. 填六层叙事字段
4. 从外貌和已锁定视觉形态提炼英文视觉锚点（发型、服装标志、年龄感、体型、真人/3D/二维材质形态）
5. 输出 characters 数组 patch

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 同名角色只能有一条档案
- 不写分镜、不写定妆图完整 sheet 排版指令（那是 gen-character-sheet-master）
- 叙事层 draft only，不直接覆盖 screenplay.episodes 正文

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 每名角色 name 唯一
- [ ] 六层字段齐全或标明未知
- [ ] fixedVisualKeywords 为英文
- [ ] 无镜头表
