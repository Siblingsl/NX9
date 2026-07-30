# 禁止输出（负例）
```json
{"patch":{"brief":{"topic":"一个很长很长的选题标题超过十字限制而且还夹带镜头：特写推镜头"},"shots":[{"imagePrompt":"close-up"}]}}
```
失败原因：超长 topic、夹带镜头语言与 imagePrompt。
