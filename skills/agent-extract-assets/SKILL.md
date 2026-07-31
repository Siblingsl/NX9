---
name: 资产抽取
title: 资产抽取
description: 从文本提取角色与场景；角色六层设定；场景写入 locations（兼容 environments）。
version: 2.1.0
---

# 资产抽取

## 这个 skill 用来做什么
从剧本/小说正文抽出可进入编剧台 Bible 的 **人物 draft** 与 **场景 draft**。

## 输入要求
剧本或小说正文（优先含标准场头 `## S01 | 内景 · 地点 | 时间`）。

## 输出要求

只输出 JSON（可包 code fence），不要解释：

```json
{
  "characters": [
    {
      "name": "李稳",
      "archetype": "主角",
      "traits": "老实、怕事",
      "description": "三十岁，衬衫发白",
      "bible": {
        "identity": "普通职员",
        "appearance": "瘦高，衬衫发白",
        "personality": "老实本分",
        "background": "相亲失败多次",
        "voice": "口头禅偏怂",
        "relationships": "红姨介绍相亲"
      },
      "fixedVisualKeywords": "thin man, washed white shirt, nervous"
    }
  ],
  "locations": ["咖啡厅", "出租屋", "福满楼茶楼"],
  "environments": ["咖啡厅", "出租屋", "福满楼茶楼"],
  "scenes": [
    {
      "name": "咖啡厅",
      "code": "S01",
      "location": "咖啡厅",
      "summary": "内景 · 白天 · 相亲开场"
    }
  ]
}
```

字段契约（硬性）：

- `characters[]`：必填；每项至少 `name`；尽量填 bible 六层 + `fixedVisualKeywords`（英文）。
- `locations[]`：场景地点字符串数组，**必填**（即使同时写 environments）。
- `environments[]`：与 locations 同义别名，可与 locations 内容相同；下游两者都会读。
- `scenes[]`：可选增强；含 name/location/code/summary 时优先用于场景 draft。

禁止只返回 characters 而省略 locations/environments/scenes。

## 工作流程
1. 扫角色实体，同名合并
2. 从场头与正文抽地点（咖啡厅、出租屋等），写入 locations + environments
3. 若有 `## Sxx` 场头，同步写入 scenes[]（code/location/summary）
4. 补角色六层与视觉锚点
5. 输出 JSON

## 约束与边界
- 同名角色唯一；场景按地点去重
- 不要输出镜头表 / imagePrompt
- 场景名用可复用地点名，不要写整句剧情

## 示例
正例与负例见 `examples/`。

## 检查清单
- [ ] characters 非空（正文有角色时）
- [ ] locations 非空（正文有场所时）
- [ ] environments 与 locations 对齐或同内容
- [ ] 无镜头词
