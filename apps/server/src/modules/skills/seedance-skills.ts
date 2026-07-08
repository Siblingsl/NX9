import type { SeedSkill } from './seed-skills';

/** Seedance 2.0 Skill OS — methodology seeds (docs-only, NX9-native wording). */
export const SEEDANCE_SKILLS: SeedSkill[] = [
  {
    id: 'seedance-vocab-zh',
    content: `---
name: Seedance 中文词汇
description: 中文视频提示词词汇与写法规则（保留参考标签）
---

# Seedance 中文提示词规则

## 硬规则
- 参考标签 Image1、Video1、Audio1 及 @图1、@视频1 必须原样保留，不翻译
- 先写参考角色，再写动作、镜头、光线、声音
- 不用空泛词：电影感、高级感、氛围感 — 拆成景别、运镜、光源、材质、色彩
- 不让模型生成最终字幕、广告文案
- 连续剧情不要一次写完整结局

## 五段顺序
主体 → 景别 → 运镜 → 光线材质 → 声音环境
`,
  },
  {
    id: 'seedance-sequence',
    content: `---
name: Seedance 连续剧情
description: 三段以上连续剧情，按 Clip 分段生成
---

# 连续剧情模板

\`\`\`text
项目目标：[故事最终要到达的结果]
已发生：[已经被接受的视频事实]
本段只拍：[本 clip 的一个可见任务]
不能提前出现：[保留到后面 clip 的内容]
参考：Image1 锁定主体；Video1 仅参考运镜；Audio1 仅参考节奏
提示词：[一个动作 + 一个镜头 + 真实光线 + 声音]
\`\`\`

## 原则
- Clip 01 完成并确认后，再写 Clip 02
- 每段只拍一个可见任务
- 输出时标注 clip 序号
`,
  },
  {
    id: 'seedance-continuation',
    content: `---
name: Seedance 续拍
description: 基于上一段视频结尾继续拍下一段
---

# 续拍指南

## 输入
- 上一段视频的描述或结尾帧内容
- 本段要拍的新动作

## 输出
1. **已发生**（从上一段继承的事实，3-5 条）
2. **本段只拍**（单一任务）
3. **Seedance 提示词**（中文，含参考标签）

## 禁止
- 重复上一段已完成的动作
- 提前揭示后续剧情
`,
  },
  {
    id: 'seedance-reference-workflow',
    content: `---
name: Seedance 多模态引用
description: @Image/@Video/@Audio 引用规范
---

# 多模态引用工作流

| 类型 | 用途 | 写法 |
|------|------|------|
| Image | 角色/产品外观锁定 | Image1 为角色参考，严格保持… |
| Video | 仅参考运镜节奏 | Video1 仅参考运镜，不改变主体 |
| Audio | 节奏/环境声 | Audio1 仅参考节奏 |

## 上限提醒（Seedance 2.0）
- 图片参考 ≤9
- 视频参考 ≤3
- 音频参考 ≤3
- prompt ≤5000 字符
`,
  },
  {
    id: 'seedance-first-last-frame',
    content: `---
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
`,
  },
  {
    id: 'seedance-examples-zh',
    content: `---
name: Seedance 中文范例
description: 可直接改写的 Seedance 中文提示词范例
---

# 范例

\`\`\`text
Image1为产品参考，严格保持logo、标签、瓶身形状和颜色不变。
仅改变光线和微小动作：左侧暖色条形光扫过玻璃，水珠沿瓶身缓慢下滑。
镜头固定产品近景，轻微推镜到标签。声音：低环境声，结尾一声轻微玻璃声。
不要新增字幕、水印或无关文字。
\`\`\`

改写用户输入时保持此密度与结构，不添加空泛形容词。
`,
  },
];
