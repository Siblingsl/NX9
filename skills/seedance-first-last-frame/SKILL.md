---
name: Seedance 首尾帧
description: 首帧/尾帧控制与 i2v 衔接
---

# 首帧 / 尾帧控制

## 首帧（first frame）
- 描述起始画面静态构图
- 用于图生视频入口
- 英文 prompt 自包含：主体 + 场景 + 光线

## 尾帧（last frame）
- 仅当镜头有明显结束姿态时需要
- 与首帧保持同一光线、服装、主体 ID

## 输出格式
| 镜号 | 需要尾帧 | 首帧 prompt | 尾帧 prompt | 视频动作 prompt |
