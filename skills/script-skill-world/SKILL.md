---
name: 世界观构建
title: 世界观构建
description: 产出时代、地点、世界观与可复用视觉规则列表；禁止一句话一新世界与镜头表。
version: 2.0.0
---

# 世界观构建

## 这个 skill 用来做什么
构建稳定可复用的**故事世界设定**，写入 bible.world，供角色、成稿与拆镜共用。强调规则列表与视觉锚点，禁止碎片化「一句话一个新世界」。

## 输入要求
用户创意 / 已有 brief / 原文世界线索。若已有 bible.world，做增量修订。

## 输出要求
```json
{"patch":{"bible":{"world":{"era":"","location":"","worldview":"","visualStyleNotes":"","rules":[]}}}}
```
- `era` / `location`：稳定字符串
- `worldview`：核心设定段落
- `visualStyleNotes`：美术与光色总则（仍非镜头表）
- `rules`：可执行规则数组（社会、能力、禁忌等）

## 工作流程
1. 识别时代/地点是否已锁定
2. 提炼 3–8 条硬规则（可被后续一致性检查引用）
3. 写 visualStyleNotes 作为全局美术方向，不写单镜
4. 输出 patch

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 禁止无依据新增平行世界支线
- rules 必须可判定，禁止空泛「很有氛围」

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] era/location 非空
- [ ] rules ≥3 且可判定
- [ ] 无镜头表字段
- [ ] 与 brief 题材不冲突
