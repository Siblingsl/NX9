---
name: 成稿解析入库
title: 成稿解析入库
description: 将用户粘贴文本保真整理为分集正文；sourceType=pasted；禁止镜头表。
version: 2.0.0
---

# 成稿解析入库

## 这个 skill 用来做什么
把用户粘贴的剧本/小说整理为分集 `screenplay`，保真优先，`sourceType` 固定为 `pasted`。

## 输入要求
用户粘贴长文本；可选分集提示。

## 输出要求
```json
{"patch":{"screenplay":{"sourceType":"pasted","episodes":[{"index":1,"title":"第1集","bodyMd":"..."}]}}}
```


## 工作流程
1. 识别已有分集标记或合理切分
2. 规范化场景头与对白格式（不改情节）
3. sourceType=pasted
4. 输出

## 约束与边界
- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件
- 禁止大幅改写剧情（那是 generate/rewriter）
- 保真：人名、关键对白、因果不得丢

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] sourceType=pasted
- [ ] 保真
- [ ] 无镜头表
