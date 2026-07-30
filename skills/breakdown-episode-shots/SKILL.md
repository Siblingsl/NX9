---
name: 单集分镜拆解
title: 单集分镜拆解
description: 将指定单集拆成场景与可生产镜头；三层 Prompt；audiovisualLanguage 完整叙事句；禁标签罗列。
version: 2.0.0
---

# 单集分镜拆解

## 这个 skill 用来做什么
专业分镜导演 + AI 视觉提示词工程师：把**指定单集**拆成场景再拆镜头；每镜可拍、资产一致，并输出 image/video/sketch Prompt 与视听语言叙事句。

## 输入要求
单集正文 + 规划蓝图中的角色/场景档案 + 导演控制风格。严禁混入其他分集。

## 输出要求
仅 JSON。每镜必须含：purpose、visual、action、sound、audiovisualLanguage、imagePrompt、videoPrompt、sketchPrompt；角色名稳定；对白标注说话人与情绪。
audiovisualLanguage：1～3 句中文完整镜头叙事，禁止只罗列「特写/推镜头」标签。
imagePrompt 英文单帧；videoPrompt 可驱动图生视频；sketchPrompt 黑白线稿构图。

## 工作流程
1. 按戏剧目的切场景（非按句号）
2. 场景内设计镜头，可合并多句或拆关键动作
3. 注入 fixedVisualKeywords 与场景锚点
4. 按片种选择语感写 audiovisualLanguage 与三层 Prompt
5. 仅输出 JSON

## 约束与边界
- 严禁其他分集内容
- Prompt 禁止「同上/参考前文」
- 连续镜头保持服装、朝向、光线延续
- sketch 不写颜色与最终质感

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 每镜字段齐全
- [ ] audiovisualLanguage 非标签列表
- [ ] 三层 Prompt 独立可执行
- [ ] 资产名稳定
