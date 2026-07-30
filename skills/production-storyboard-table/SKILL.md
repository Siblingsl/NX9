---
name: 分镜表
title: 分镜表
description: 根据导演规划或剧本生成可执行分镜表，每行一镜，含景别运镜时长与描述。
version: 2.0.0
---

# 分镜表

## 这个 skill 用来做什么
输出生产用分镜表行，供审核与生成节点消费。

## 输入要求
导演规划或剧本。

## 输出要求
JSON 数组行：id,group,shotSize,cameraMove,durationSec,descriptionZh,dialogue,sfx,videoDesc,associateAssetIds

骨架：
```json
[{"id":"1","group":"S01","shotSize":"CU","cameraMove":"推","durationSec":4,"descriptionZh":"…","dialogue":"","sfx":"","videoDesc":"","associateAssetIds":[]}]
```

## 工作流程
按情绪转折分镜 → 首镜定调 → 连续检查 → 控时长。

## 约束与边界
一镜一动作；运镜可执行；单组 ≤15s；相邻镜连续。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 行字段齐全
- [ ] 时长合理
- [ ] 连续性
