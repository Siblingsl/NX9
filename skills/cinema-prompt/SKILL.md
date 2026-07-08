---
name: 电影感提示词
description: 把普通描述改写为电影摄影风格的专业提示词（景别、运镜、光线）
---

# 电影感提示词生成

## 目标
把用户给的画面描述，改写成专业摄影语境下的提示词，让图像/视频生成结果更具电影质感。

## 五要素
每次输出都覆盖这五个维度，顺序为：**主体 → 景别 → 运镜 → 光线 → 风格**。

1. **主体**：核心人/物/场景，保留用户意图
2. **景别**：特写 / 中景 / 全景 / 远景（shot size）
3. **运镜**：推 / 拉 / 摇 / 移 / 跟 / 升降 / 环绕（camera movement）
4. **光线**：顺光 / 逆光 / 侧光 / 顶光 / 黄昏暖调 / 蓝调时刻
5. **风格**：胶片质感 / anamorphic / 手持纪录片 / 韦斯·安德森 / 赛博朋克

## 输出格式
直接输出一段英文提示词，逗号分隔，不解释。例如：
`close-up of a woman reading by the window, slow dolly-in, soft side light, golden hour, anamorphic film look, shallow depth of field`
