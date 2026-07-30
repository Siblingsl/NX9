---
name: 叙事一致性审稿
title: 叙事一致性审稿
description: 只诊断不改正文；输出 diagnostics 分级与 code 枚举；禁止镜头表。
version: 2.0.0
---

# 叙事一致性审稿

## 这个 skill 用来做什么
审查 ScreenplayPackage 的人物、时间线、世界规则与对白一致性，只输出 diagnostics，不改写正文。

## 输入要求
完整或局部 ScreenplayPackage（brief/bible/screenplay）。

## 输出要求
```json
{"diagnostics":[{"level":"warning|error|info","code":"","message":""}]}
```
不得返回改写后的 episodes。

## 工作流程
1. 建角色/时间/规则索引
2. 扫描矛盾
3. 分级（error/warning/info）并给稳定 code
4. 只输出 diagnostics

## 约束与边界
- 禁止修改 screenplay 正文
- 禁止输出镜头表
- code 使用短横线英文，如 character-name-drift

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] 仅 diagnostics
- [ ] level 合法
- [ ] code 非空
- [ ] 未改写正文
