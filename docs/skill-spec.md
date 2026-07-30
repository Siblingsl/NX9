# NX9 Skill 项目规范（摘要）

> 完整效力条款见 `docs/NX9-REQUIREMENTS-SOLUTION-BUILTIN-PROMPTS-AND-CONNECTIONS.md` §1.5 / §12A。  
> 本文件是仓库内可执行摘要，供校验脚本与贡献者对齐。

## 一 Skill 一目录

```text
skills/<skill-name>/
├── metadata.json          # 强制
├── SKILL.md               # 强制 · entry
├── references/            # 强制 · 至少 1 文件
├── examples/              # 强制 · input.md + output.md（建议 bad-output.md）
├── templates/             # 强制 · 至少 1 文件
├── scripts/               # 推荐 · 仅本 Skill 辅助脚本
└── tests/                 # 强制 · 至少 1 文件
```

目录名 = `metadata.json.name` = 运行时 Skill ID（小写短横线）。

## SKILL.md 九段（中文标题强制）

1. YAML frontmatter（name/title/description/version，与 metadata 一致）  
2. `# <Title>`  
3. `## 这个 skill 用来做什么`  
4. `## 输入要求`  
5. `## 输出要求`  
6. `## 工作流程`  
7. `## 约束与边界`  
8. `## 示例`  
9. `## 检查清单`  

禁止单行壳「你是某某，输出 JSON」。

## 仓库脚本

| 命令 | 作用 |
|------|------|
| `node scripts/validate-skills.mjs` | 校验全部 Skill |
| `node scripts/build-skill-index.mjs` | 生成 `skill-index.json` |
| `node scripts/generate-builtin-skills.mjs` | 按模板重建全部内置 Skill |

## 权威源

运行时注入只读 `skills/<name>/SKILL.md`（去 frontmatter）。  
`seed-skills.ts` / `seedance-skills.ts` 默认空；不以 TS 字符串为长期真相。
