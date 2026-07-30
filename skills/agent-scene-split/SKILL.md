---
name: 场次拆分
title: 场次拆分
description: 将剧本/小说按场次拆分，输出稳定场景头与正文块。
version: 2.0.0
---

# 场次拆分

## 这个 skill 用来做什么
场次结构化，供环境卡与分镜。

## 输入要求
剧本/小说。

## 输出要求
JSON：scenes[{code,intExt,location,time,body}]

骨架：
```json
{"scenes":[{"code":"S01","intExt":"内","location":"客厅","time":"夜","body":"…"}]}
```

## 工作流程
识别时空变化 → 切场 → 编号 S01…

## 约束与边界
禁止一句话一新场；合并同时空。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] code 连续
- [ ] location 清晰
