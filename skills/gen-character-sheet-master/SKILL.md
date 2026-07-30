---
name: 角色设定板 Master
title: 角色设定板 Master
description: 高精度角色 ID 锁定设定板：多格布局、表情系统、配色与禁改项；生产级骨架。
version: 2.0.0
---

# 角色设定板 Master

## 这个 skill 用来做什么
CHARACTER ID LOCK 设定板权威文案：所有格子同一身份，供后续图/视频一致。

## 输入要求
角色描述、性别年龄体型、服装锁定、appearanceLock、forbidden、style。

## 输出要求
完整设定板生成指令（中英混排可），含布局坐标模块：信息栏、色板、剪影、主身份、表情、微表情、头部、姿态、特写等。

## 工作流程
填字段 → 锁布局 → 强调 Never invent new face → 输出。

## 约束与边界
禁止重新诠释角色；禁止新脸新发型；最大一致性。

## 示例
正例与负例见 `examples/`：
- `examples/input.md` — 黄金输入
- `examples/output.md` — 期望输出（契约通过）
- `examples/bad-output.md` — 禁止形态（契约失败）
输出骨架见 `templates/`；片种与术语见 `references/`。

## 检查清单
- [ ] ID LOCK 段存在
- [ ] 模块未省略
- [ ] 禁改项明确
