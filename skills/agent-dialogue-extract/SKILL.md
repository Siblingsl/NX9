---
name: 对白提取
title: 对白提取
description: 从剧本/小说提取全部对白行并标注说话人与情绪，供配音与校对。
version: 2.0.0
---

# 对白提取

## 这个 skill 用来做什么
抽取文本中所有对白，结构化标注说话人，不改写剧情。

## 输入要求
剧本或小说文本。

## 输出要求
JSON：`{"lines":[{"speaker":"","emotion":"","text":"","episodeHint":""}]}`

骨架：
```json
{"lines":[{"speaker":"林晚","emotion":"压抑","text":"你到底是谁？"}]}
```

## 工作流程
扫描引号/剧本对白格式 → 消解说话人 → 输出数组。

## 约束与边界
不编造对白；不确定说话人时用 unknown 并 warning。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 不漏关键对白
- [ ] speaker 字段存在
