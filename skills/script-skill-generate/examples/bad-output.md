# 禁止形态（契约失败）

## 失败 1：bodyMd 体例错误
`bodyMd` 使用 `【场景：出租屋外，下午】` 且对白带引号：`司机："李稳？"`

## 失败 2：夹带提示词 / 镜头词
`bodyMd` 含 `特写`、`镜头推进`、`imagePrompt:`。

## 失败 3：容器错误
只输出纯文本剧本、或不含 `patch.screenplay.episodes`。

## 失败 4：JSON 泄漏进正文
`title` 或 `bodyMd` 出现 `","bodyMd":"` 之类字段碎片。

## 失败 5：完结误标
非终章 `bodyMd` 以 `（完）` 收束。
