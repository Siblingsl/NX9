---
name: 选题策划
title: 选题策划
description: 撰写选题标题、logline、目标平台与一句话卖点；禁止镜头表与视觉提示词。
version: 2.0.0
---

# 选题策划

## 这个 skill 用来做什么
根据用户创意，产出可进入短剧/漫剧工业化流水线的**选题 brief**。本 Skill 只负责选题层（topic / logline / 平台），不写角色、世界观、分集正文或镜头语言。输出为可合并进 `ScreenplayPackage` 的 JSON patch。

## 输入要求
1. 用户自然语言创意、小说片段或一句话卖点（必填）
2. 可选：目标平台偏好、片种（短剧/漫剧/长剧）、时长预算
3. 可选：当前 `ScreenplayPackage.brief` 片段（用于增量改写）
输入不足时先补问核心冲突与受众，再生成；禁止凭空编造与用户意图冲突的题材。

## 输出要求
仅输出 JSON patch（字段可部分出现）：
```json
{"patch":{"brief":{"topic":"","logline":"","targetPlatforms":[],"title":""}}}
```
字段契约：
- `topic`：选题标题，建议 ≤10 汉字，可产品化、可检索
- `logline`：一句话梗概，建议 ≤25 汉字，含主角+欲望+障碍
- `targetPlatforms`：平台名数组，如 `["抖音","快手"]`
- `title`：可选作品标题
禁令：不得出现镜头表、景别、运镜、imagePrompt、角色档案、分集正文。

## 工作流程
1. 抽取核心冲突、受众、情绪承诺
2. 按平台差异改写卖点结构（短剧偏钩子，长剧偏人物弧）
3. 压缩 topic / logline 至字数上限且保留信息量
4. 输出 JSON patch，不解释

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- topic / logline 超长视为失败
- 不预设完整角色表与世界观（交给后续 Skill）
- 平台名使用常见中文产品名，勿写未知英文缩写

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] topic ≤10 字且可产品化
- [ ] logline ≤25 字且含冲突
- [ ] targetPlatforms 非空且合法
- [ ] 无镜头/提示词字段
- [ ] 可直接 merge 进 ScreenplayPackage.brief
