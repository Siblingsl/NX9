# 领域说明

分集剧本写作属于 NX9 Agent / 编剧台主链。运行时由 `SkillsService.resolveSystemPrompt('agent-screenplay')` 注入本 `SKILL.md` 正文。

## 与 script-skill-generate 的分工

| Skill | 出口形态 | 何时用 |
|-------|----------|--------|
| `agent-screenplay` | **纯文本**剧本 | `/script/screenplay`；编剧台生成/续写/重写 |
| `script-skill-generate` | **JSON patch**（episodes[].bodyMd） | 编剧台「生成剧本」芯片走 `scriptSkill` |

两者的 **bodyMd / 正文体例必须完全一致**，只是外层容器不同。

## 体例为什么锁死

短剧后续要拆场、抽资产、进分镜。场景头与对白标点一旦集际漂移，拆镜与质检会系统性失败。  
因此「好看」次于「可解析、可续写、可对齐」。
