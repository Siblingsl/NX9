# NX9 内部稳定生产可用提示词清单

> 目的：标明产品里**哪些功能依赖「内部系统提示词 / 生产模板提示词」**（非用户随手写的一句话），并列出每类提示词应满足的规格，供后续统一打磨、版本化与验收。  
> **核心产品决策：NX9 必须内置 Skill（可版本化的生产提示词包）；外部 Skill 生态不是当前完成条件。**
>
> 范围：基于当前仓库代码与 `skills/` 种子文件盘点（2026-07-28；Skill 战略补记同日）。  
> 不含：用户在 Prompt Bar 里临时输入的内容；不含纯 UI placeholder。

---

## 0. 怎么读这份清单

### 0.1 提示词三类

| 类型 | 含义 | 典型落点 |
|------|------|----------|
| **A. LLM System** | 发给大模型的角色指令 + 输出契约（JSON / Markdown / 纯文本） | `agent.service.ts`、`DEFAULT_*_PROMPTS`、`skills/*.md` |
| **B. Gen Template** | 拼进生图 / 生视频 / 线稿 / 定妆请求的英文（或中英）生产模板 | `studio-prompt-builder`、`character-sheet-master`、`asset-bible-image` |
| **C. Library / Preset** | 产品内可复用的提示词片段库（用户可点选，但需稳定可生产） | `PROMPT_TEMPLATES`、`CINEMA_PROMPT_PRESETS`、`CAMERA_PROMPT_PRESETS` |

### 0.2 稳定生产可用 = 必须同时满足

1. **契约稳定**：输出字段名、类型、必填项与下游解析器一致；禁止「同上 / 参考前文」。
2. **可验收**：有黄金样例（输入→期望结构）与失败时的兜底行为说明。
3. **风格可控**：真人 / 动漫 / 国漫 / 3D 等形态有明确语感分支或注入点。
4. **资产一致性**：角色 `fixedVisualKeywords`、场景锚点、服装锁定可注入且跨镜不漂。
5. **版本可覆盖**：支持 Dev Prompt Overrides / 配置中心覆盖，默认值可回滚。
6. **非演示级**：禁止只写「你是某某，输出 JSON」的单行壳；须含规则、禁令、范例、质量条。

### 0.3 优先级（建议排期）

| 优先级 | 含义 |
|--------|------|
| **P0** | 主制片链路（剧本→拆镜→成图/成片）直接依赖；缺则主流程不稳定 |
| **P1** | 资产 / 一致性 / 反推；影响成品质与返工成本 |
| **P2** | 工具链 / 快捷能力 / 提示词库；影响体验与效率 |
| **P3** | 演示、薄封装、可后补 |

### 0.4 现状总览（摘要）

| 领域 | 现状判断 |
|------|----------|
| 分镜拆解（`DEFAULT_SCRIPT_BREAKDOWN_PROMPTS`） | 已较厚，接近生产级，需黄金样例与风格分支验收 |
| 角色设定板（`CHARACTER_SHEET_MASTER`） | 已生产级 |
| 编剧台 Skill 默认值 / Agent 多接口 | **大量偏薄**，与 Breakdown 厚度不一致 |
| 一致性审查 / Vision 反推 / 链接解析 | **偏薄**，重复文案且缺评分 rubric |
| Bible 一键定妆/场景（`buildBibleImagePrompt`） | **过薄**，与 Master Sheet 差距大 |
| 制作台拼装器（studio image/video/sketch） | 骨架可用，缺片种/负面词/模型适配层 |
| 用户提示词库 / 电影感预设 | 有种子，缺覆盖度与生产验收 |
| **内置 Skill（SKILL.md + 编剧台 chips + Agent）** | **架构半齐、主路径注入未收敛**；见 §0.5 —— **必须作为生产能力补齐，不是可选项** |

---

## 0.5 产品决策：为什么必须内置 Skill（强制）

### 0.5.1 一句话结论

| 问题 | 结论 |
|------|------|
| NX9 需要内置 Skill 吗？ | **必须要。** 内置 Skill = 产品核心生产能力（可版本化的 System / 模板包），不是锦上添花。 |
| 需要支持外部 Skill 生态吗？ | **现阶段不需要作为主需求。** 不做第三方市场 / 跨产品兼容；最多远期预留「本地导入一份 `SKILL.md`」。 |

**强调：没有稳定的内置 Skill，主制片链路上的「换角色就变专家」能力会永久依赖用户临时写提示词，质量不可控、不可验收、不可回滚——这与「内部稳定生产可用」目标直接冲突。**

### 0.5.2 为什么内置 Skill 如此重要

NX9 是**自研制片管线产品**，大量功能本质是：选中一套方法论 → 注入 LLM / 节点 → 产出契约化结果。这些能力若没有内置 Skill，产品只剩空壳节点：

1. **质量门槛**：编剧台 10 能力、分镜/改编/导演规划、电影感润色、配音分配、视频模型方言等，必须由产品提供生产级正文；不能指望每个用户自己写 System。
2. **契约与验收**：下游解析器（JSON patch、分镜表、音色映射表）只认稳定字段。内置 Skill 是契约的权威载体；外部随意文案会直接打穿解析与验收。
3. **一致性与可回滚**：同一 Prompt ID 一处权威、Dev Overrides 可覆盖、版本可回滚——只有内置包能进产品门禁（黄金样例 + 契约测）。
4. **与提示词清单同源**：本文件列出的 A/B/C 类生产提示词，很大一部分**就应落成内置 Skill 正文**（或与 Skill 同权威源），而不是散落在 `agent.service` 硬编码、shared 一句话壳、`skills/*.md` 三套并行。

因此：**打磨本清单 = 打磨内置 Skill；内置 Skill 未收口，本清单 P0/P1 就不能宣称生产可用。**

### 0.5.3 仓库里实际存在的两套「Skill」（勿混为一谈）

| 形态 | 是什么 | 现状 | 对生产的意义 |
|------|--------|------|--------------|
| **产品内 Skill（主路径）** | 编剧台 chips（`topic` / `plot` / …）、`DEFAULT_SCRIPT_DESK_SKILL_PROMPTS`、Agent 内硬编码 System | **真正在跑**，但大量偏薄 | **必须加厚并与权威源对齐** —— 这是 P0 |
| **SKILL.md 库（种子 + API）** | 仓库 `skills/*.md`、`SkillsModule` CRUD、启动 seed、`useSkillVault` | 种子与 API 已有；前端 vault **几乎未接入主流程**；Agent **多数未按 id 读 SKILL.md 注入** | **必须变成可注入的生产能力**，不能停留在文档装饰 |

注释与设计意图（`SkillsService`）：用户选中 Skill 后，正文应作为 system 注入 LLM，把模型变成专科专家。当前缺口是 **注入链路与权威正文未闭环**，不是「要不要做 Skill」。

### 0.5.4 内置 Skill 的正确定位（做什么 / 不做什么）

**要做成：**

> **可版本化的生产提示词包**（System + 输出契约 + 可选正反样例），固定 Skill ID，选中后注入 LLM / 画布节点 / 编剧台 Agent。

**不要做成：**

- 通用 Agent IDE 的「Skill 应用商店」
- 与 Cursor / Claude 等外部 Agent Skills 市场兼容层
- 与业务无关的「Skill OS 平台」空壳（有 CRUD、无注入、无契约）

### 0.5.5 外部 Skill：明确边界（避免范围膨胀）

| 外部形态 | 决策 | 理由 |
|----------|------|------|
| Cursor / Claude / 第三方 Agent Skills 市场 | **不做** | NX9 是自研制片工具，不是通用 Agent 运行时；身份与验收边界必须清晰 |
| 用户上传 / 导入本地一份 `SKILL.md` | **可后期做**（高级能力） | 与内置同一注入路径即可；不挡主路径 |
| 远程 URL / 订阅包 / 插件商店 | **短期明确不做** | 鉴权、System 污染、契约漂移、验收成本过高 |

已有本地 CRUD 与 Seedance seed ≈「本地可编辑的内置包」。**缺的是主流程注入与权威提示词，不是接外部生态。**

### 0.5.6 落地铁律（避免三套文案）

1. **每个 Skill / Prompt ID 只保留一处权威正文**（优先 `skills/<id>/SKILL.md` 或 shared 默认同源；`agent.service` / 编剧台默认 **引用** 该源，禁止各写各的）。
2. **内置 Skill 必须可注入**：列表 / 编辑 / seed 只是手段；验收标准是「选中 → LLM 收到完整 System → 输出过契约」。
3. **外部导入不得覆盖内置 P0 权威包的默认行为**（若将来做导入，须隔离命名空间或显式「覆盖确认」）。
4. **排期**：先闭环内置 P0 Skill（见 §6.1 / §9），再谈库面板体验；**禁止**先做外部 Skill 再补内置正文。

---

## 1. 剧本与编剧台（LLM System · P0）

### 1.1 编剧台 Skill（`ScriptDesk`）

| ID | 功能 | 当前落点 | 需要的提示词规格 |
|----|------|----------|------------------|
| `topic` | 选题 / logline / 平台 | `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS` + `agent.scriptSkillSystem` | 平台差异（短剧/漫剧/长剧）、logline 字数与卖点结构、禁止输出镜头表 |
| `world` | 世界观 / 时代 / 视觉规则 | 仅 shared 默认薄壳 | 时代/地点/世界观/视觉风格/规则列表；可复用环境概念，禁止一句话一新世界 |
| `character` | 人物档案（六层+视觉锚点） | 薄壳 | identity / appearance / personality / relationships / goal / voice / `fixedVisualKeywords`（英文）；同名唯一；draft only |
| `plot` | 情节大纲 / 集数 | shared + server 部分加厚 | 起承转合、集边界、与 brief 字段契约一致 |
| `pacing` | 节奏 / 单集时长 | shared + server | balanced/slow/fast 定义、目标时长与平台匹配 |
| `dialogue` | 对白成稿层 | 薄壳 | 说话人标注、情绪、口语可演；不写镜头语言；保留场次结构 |
| `hooks` | 爆点 / 钩子 | shared + server | 可落画面、冲击力、集末钩子与付费卡点区分 |
| `consistency` | 叙事一致性诊断 | 薄壳 | diagnostics 分级（error/warning/info）、code 枚举、**只诊断不改正文** |
| `generate` | 分集剧本正文 | 薄壳 | 场次+动作+对白；禁止 imagePrompt/镜头表；与 bible 设定对齐 |
| `ingest` | 粘贴文本整理为分集 | 薄壳 | 保真、分集切分规则、sourceType=pasted |

**缺口**：shared 默认多为「一句话壳」；server 仅对 topic/plot/pacing/hooks 加厚，其余 Skill 走兜底。生产需要 **10 套完整 System**，字段契约与 `ScreenplayPackage` patch schema 一一对应，并附 1～2 个正反样例。

### 1.2 剧本拆解（Storyboard Desk / Breakdown）

| 提示词 | 功能 | 当前落点 | 需要的规格 |
|--------|------|----------|------------|
| `episodePlannerSystem` | 多集项目蓝图 | `DEFAULT_SCRIPT_BREAKDOWN_PROMPTS` | 已较完整：戏剧弧、角色档案、场景复用、仅 JSON。生产还需：片种切换语感、集数上限策略、黄金样例包 |
| `episodeBreakdownSystem` | 单集→场景→镜头 + 三层 Prompt | 同上 | 已含 audiovisualLanguage / image / video / sketch 标准。生产还需：风格自动分支验收、字段 schema 版本锁定、负例（禁止标签罗列） |

**用户侧应能覆盖（Dev Overrides 已有入口）的文案维度**：导演控制中的图片风格 / 视频风格 / 目标形态如何驱动语感。

### 1.3 Agent 制片管线接口（`AgentService`）

每条都是独立 **A. LLM System**，当前多为短指令，生产需补齐「角色 + 规则 + 输出 schema + 禁令 + 样例」。

| 方法 / 能力 | 产品入口（示意） | 需要的提示词 |
|-------------|------------------|--------------|
| `dialogueFromText` | 对白提取 / VoiceCast 前置 | 说话人+对白+情绪；排除旁白；最少行数；JSON 数组契约 |
| `shotScriptFromText` | 小说→分镜脚本行 | 可视化动作、对白推动、时长 2–4s、shotType 枚举；**是否允许镜头语言**需与产品统一（现禁镜头语言） |
| 故事骨架（skill `script-skeleton`） | 工具 / Agent | 三幕、分集、付费卡点；JSON 字段完整 |
| 分镜表（skill `production-storyboard-table`） | 工具 / Agent | 一行一镜、运镜可执行、S-Class 分组、连续性原则 |
| `adaptation` | 改编策略 | tone/pacing/omit/emphasis；与 skill `script-adaptation` 对齐 |
| `screenplay` | 分集剧本纯文本 | 集/场标题体例、对白与动作规范；与编剧台 `generate` 避免双标准 |
| `directorPlan` | 导演规划 | 场景安排、镜头风格、走位、关键视觉；markdown 结构固定 |
| `extractAssets` | 角色/场景抽取 | 六层 bible + locations；名称稳定 |
| `novelEvents` | 长篇事件提取 | 章摘要字数、出场角色列表 |
| `splitScenes`（LLM 模式） | 场次拆分 | sceneCode/内外/日夜/角色/摘要；与规则模式结果可对齐 |
| `extractEnvironments` | 环境卡 | lighting/props/era；与场次一对多策略 |
| `agent.controller` 编剧助手 | 对话式助手 | 专业简洁；边界（不越权改资产） |

**缺口**：多处与 `skills/*.md`、编剧台 Skill **文案三套并行**，生产前需收敛为「一份权威 System + 可选 skill 正文注入」。

---

## 2. 制作台 / 导演台 · 生图生视频拼装（Gen Template · P0）

### 2.1 镜头三层 Prompt Builder

| Builder | 用途 | 当前落点 | 需要的提示词内容 |
|---------|------|----------|------------------|
| `buildStudioImagePrompt` | 分镜关键帧 / 静帧 | `studio-prompt-builder.ts` | 片头固定质量句、景别/运镜英译、内容行、光色、美术方向、角色/场景 enrich、**负面词包**、片种后缀 |
| `buildStudioVideoPrompt`（及同类） | 图生视频 / 文生视频 | 同上 | 起幅→动作→运镜动机→情绪曲线→时长感；与 image 身份锁定；模型方言（通用 / Seedance 等） |
| `buildStudioSketchPrompt` / `buildLineArtShotPrompt` | 线稿 / 构图草图 | `line-art-prompt.ts` + studio | 黑白线稿约束句已有；需景别变体、宫格版 `buildLineArtGridPrompt` 生产验收 |
| `buildShotPrompt`（导演台批出） | 导演台批量成图 | `director-desk-runner.ts` | 在 studio 之上叠加：3D camera direction、构图模板约束、`missingForced` 行为说明文案 |

**需要额外固化的「后缀包」（建议独立常量表）**：

- 通用质量 / 电影感后缀  
- 负面词：水印、多面板、脸漂、多余肢体等  
- 构图强制模板注入句（`buildConstrainedPrompt` 已有机制，缺标准文案库）  
- Seedance / 图生视频 continuation（见 `clip-chain`、`skills/seedance-*`）

### 2.2 角色 / 场景一致性注入

| 提示词 | 用途 | 落点 | 规格 |
|--------|------|------|------|
| Character consistency suffix | 把角色锚点拼进生成 prompt | `character-prompt.ts` | 恒定层 + 当前镜变体；禁止覆盖用户主体意图 |
| Environment enrich | 场景光线/时代/材质 | `environment-prompt.ts` | 可复用环境卡字段映射 |
| Character sheet angle/pose/expression | 定妆变体 | `character-sheet-prompt.ts` / creative | 变体词表稳定、可本地化 |

### 2.3 资产库 Bible 一键出图

| 提示词 | 用途 | 落点 | 规格 |
|--------|------|------|------|
| Character bible sheet | 定妆参考图 | `buildBibleImagePrompt`（character） | **当前过薄**；应对齐或调用 `CHARACTER_SHEET_MASTER` 的精简生产版：正/侧/背或单张锁定 ID |
| Scene bible art | 场景概念图 | `buildBibleImagePrompt`（scene） | 宽景、氛围光、确立镜头；与 `SCENE_SHEET_PROMPT_TEMPLATE` 对齐 |
| Costume sheet | 服装设定 | `COSTUME_SHEET_PROMPT_TEMPLATE` | tech-pack 质量、白底、材质标注规则 |

### 2.4 角色设定板 Master（已具备生产级骨架）

| 提示词 | 用途 | 落点 | 后续仍需 |
|--------|------|------|----------|
| `CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE` | 多格角色 ID 锁定板 | `character-sheet-master.ts` | 模型适配（部分模型不吃中英混排）、格子数可配置文案、负面词、失败重试指令 |

---

## 3. 一致性 / 质检 / Vision（LLM System · P1）

| 能力 | 产品入口 | 当前文案特征 | 需要的生产提示词 |
|------|----------|--------------|------------------|
| 分镜预览连续性 | `storyboard-preview-runner` | 短 system + 维度 focus | **三维独立 rubric**：角色 / 场景 / 轴线道具；评分 0–100 校准样例；issues 可定位到 frameLabel |
| Continuity 节点 | `ContinuityCheckBlock` / `flow-runner` | 与上重复且更短 | 统一为同一份 Continuity Supervisor System；输出 schema 版本化 |
| 宫格反推三层 Prompt | `grid.service` `visionCellPrompt` | 有 JSON 字段表，规则偏短 | 每层 Prompt 质量条（同 Breakdown 的 image/video 标准）；尾帧判定细则；风格跟随 storyPrompt |
| 图片反推 Prompt | `vision-tools.reversePrompt` | 一行英文 | 主体/环境/光/风格/质量分段；tags 受控词表 |
| 风格拆分 | `extractStyle` | 一行 | styleTokens vs sceneTokens 分离原则；negativePrompt 默认包 |
| 参考视频→分镜表 | `analyze.service` | 短中文 + 表头 | 景别词表、时长规则、英文提示词列质量；抽帧失败时的推断策略 |
| 主题快剪分镜 | `quickMontage` | 短 | 与上共用「Markdown 分镜表」权威模板 |
| 爆款复刻计划 | `replicateVideoPlan` | 短 JSON | rhythm/structure/storyboard/promptPack 字段质量定义 |
| 链接解析→创作摘要 | `link-parser.service` | 短 JSON | prompt 英文可用、mediaKind 枚举、摘要去广告噪声 |
| Inpaint 连续性修复 | `inpaint-repair` | （若有 instruction） | 局部修复指令：只改问题区域、锁定身份 |

**统一要求**：Vision 类必须写清「看图顺序、最多送几张、分数校准、无法判断时的默认行为」。

---

## 4. 提示词工程工具链（A + C · P1/P2）

### 4.1 内置 Skills（种子方法论 → 运行时必须可注入 LLM）

> **本节是 §0.5 的施工清单。** 内置 Skill 是提示词工程工具链的主干：没有可注入的内置包，下面的润色 / 分镜 / 配音能力都无法稳定生产。

| Skill ID | 需要的提示词角色 |
|----------|------------------|
| `cinema-prompt` | 口语→电影五要素英文提示词 |
| `prompt-polish` | 五段结构润色 + 负面词 |
| `storyboard-sketch` | 线稿/构图专用改写 |
| `storyboard-breaker` | 文本→可拍分镜 |
| `script-rewriter` / `script-screenplay` / `script-adaptation` / `script-skeleton` | 与 Agent 对应能力权威文案 |
| `production-director-plan` / `production-storyboard-table` | 导演规划 / 分镜表 |
| `voice-assigner` | 角色→音色/语速/情绪 |
| `seedance-*`（sequence / continuation / first-last / reference / vocab / examples） | 视频模型方言与镜头续写 |

**生产要求（强制）：**

1. Skill 正文 **不是文档装饰**，必须定义为「可注入的 System/User 模板」+ 输出契约 + 可选样例。  
2. 与硬编码 `agent.service`、编剧台 `DEFAULT_*` **去重收敛为同一权威源**（见 §0.5.6）。  
3. 验收以「选中 Skill → 请求体含完整正文 → 下游解析通过」为准，不以「磁盘上有 SKILL.md」为准。  
4. **外部 Skill 不在本节交付范围内**；勿用「接市场」替代上述内置闭环。

### 4.2 画布节点内嵌 LLM

| 能力 | 落点 | 需要 |
|------|------|------|
| Prompt 合并 | `flow-runner`「合并两版 prompt…」 | 保留主体意图、去冲突、输出单段英文；可选保留中文说明 |
| Chat / Cinema / Camera 节点 | `systemPrompt` 用户可填 | 产品默认 System 模板（空节点时） |
| Prompt 库面板 | `PROMPT_TEMPLATES` | 见下节扩充规格 |

### 4.3 用户可选库（须「能直接生产」）

| 库 | 当前 | 需要扩充的提示词类型 |
|----|------|----------------------|
| `PROMPT_TEMPLATES` | 图像/视频/分镜/人像/产品少量种子 | 短剧钩子、对白特写、动作连镜、产品环绕、氛围空镜、动漫 KV、写实剧照等 **按品类成套**；每条含 promptEn + 适用节点 + tags |
| `CINEMA_PROMPT_PRESETS` | 光/镜/节奏/调色 | 片种包（甜宠/悬疑/仙侠/赛博）、镜头语言包 |
| `CAMERA_PROMPT_PRESETS` | 推拉环绕升降等 | 与导演台 3D `cameraPrompt` 字段同源文案 |
| Picture Pro Actions `defaultPromptHint` | UI 提示 | 非 System；可另做「一键填入示例 prompt」生产句（可选 P2） |

---

## 5. 声音 / 配音 / 音乐（P2）

| 能力 | 现状 | 需要的提示词 |
|------|------|--------------|
| 角色配音分配 | skill `voice-assigner` | 音色池映射表 + 性格→voice 规则 + 输出表契约（可改为 JSON 供 VoiceCast 自动填） |
| TTS 情绪/语速 | 多为参数非 LLM | 若走 LLM 推荐：情绪标签受控词表 |
| `music-gen` / SoundGen | 用户 prompt 直传 gateway | **BGM 生产模板库**：情绪×时长×乐器；片头/片尾/转场；中英双语模板；负面（人声歌词污染等，视模型） |
| 音效描述 | 资产 sound 类 | SFX 英文短提示词规范（冲击/环境/ Foley） |

---

## 6. 按「需要交付的提示词产物」汇总表

下列每一行 = 一份应版本化管理的生产提示词（建议 ID 稳定，便于 Overrides）。

### 6.1 P0 必交付

| 建议 Prompt ID | 类型 | 一句话要什么 |
|----------------|------|--------------|
| `sys.script.skill.topic` … `sys.script.skill.ingest`（10） | A | 编剧台全 Skill 完整 System + JSON patch 契约 |
| `sys.breakdown.episode-planner` | A | 多集蓝图（可基于现有加厚验收） |
| `sys.breakdown.episode-shots` | A | 单集拆镜 + 三层 Prompt 标准（可基于现有加厚验收） |
| `sys.agent.dialogue-extract` | A | 对白提取 |
| `sys.agent.shot-script` | A | 小说→分镜行 |
| `sys.agent.adaptation` / `screenplay` / `director-plan` / `extract-assets` / `novel-events` / `scene-split` / `environments` | A | Agent 制片管线全套 |
| `gen.studio.image` / `gen.studio.video` / `gen.studio.sketch` | B | 制作台三层拼装模板 + 后缀/负面词包 |
| `gen.director.batch-shot` | B | 导演台批出（含 3D camera / 构图约束说明） |
| `gen.character.sheet.master` | B | 角色设定板（已有，需模型适配版） |
| `gen.bible.character` / `gen.bible.scene` | B | 资产库一键定妆/场景（对齐 Master/Scene Sheet） |

### 6.2 P1 必交付

| 建议 Prompt ID | 类型 | 一句话要什么 |
|----------------|------|--------------|
| `sys.continuity.supervisor` | A | 统一连续性审查（三角色维度 + 评分 rubric） |
| `sys.grid.cell-reverse` | A | 宫格单格三层反推 |
| `sys.vision.reverse-image` / `extract-style` | A | 图反推 / 风格拆分 |
| `sys.vision.video-storyboard` / `quick-montage` / `replicate-plan` | A | 视频/主题/爆款→分镜 |
| `sys.link-parser` | A | 链接→创作摘要 prompt |
| `sys.prompt.merge` / `sys.prompt.polish` / `sys.prompt.cinema` | A | 合并 / 润色 / 电影感 |
| `gen.character.consistency-suffix` / `gen.environment.enrich` | B | 一致性注入句模板 |
| `gen.scene.sheet` / `gen.costume.sheet` | B | 场景板 / 服装板 |
| `gen.seedance.*` | B/A | Seedance 方言与续写 |

### 6.3 P2 建议交付

| 建议 Prompt ID | 类型 | 一句话要什么 |
|----------------|------|--------------|
| `lib.prompt-templates.*` | C | 分类扩充的可点选生产模板 |
| `lib.cinema-presets.*` / `lib.camera-presets.*` | C | 与导演台同源的片段库 |
| `sys.voice.assigner` | A | 配音分配 JSON 化 |
| `lib.music.bgm.*` / `lib.sfx.*` | C | 音乐/音效生产模板 |
| `sys.agent.chat-assistant` | A | 通用编剧助手边界 |

---

## 7. 每类提示词的「内容大纲」（写作时按此填）

### 7.1 LLM System 必备章节

1. **角色与任务边界**（做什么 / 绝不做什么）  
2. **输入说明**（会收到哪些字段）  
3. **硬性规则**（忠于原文、资产名稳定、禁止上下文依赖短语…）  
4. **输出契约**（JSON schema 或 Markdown 表头；字段释义）  
5. **质量条 / 范例**（1 正例 + 1 负例）  
6. **片种或风格分支**（若适用）  
7. **失败与不确定**（缺信息时如何降级）

### 7.2 Gen Template 必备章节

1. **任务句**（关键帧 / 视频 / 线稿 / 设定板）  
2. **主体与动作**（占位符）  
3. **资产锁定**（角色关键词、服装、场景锚点）  
4. **镜头语言**（景别、运镜、焦距感）  
5. **光色与美术**  
6. **质量与禁令**（含 negative）  
7. **模型方言附录**（可选独立文件）

### 7.3 Library / Preset 必备字段

- `id` / `label` / `category|group`  
- `promptEn`（主生产句）  
- `promptZh`（说明）  
- `tags` / 适用节点 kinds  
- `negativePrompt`（可选）  
- 适用片种

---

## 8. 与代码落点对照（便于施工）

| 区域 | 主要文件 |
|------|----------|
| 编剧台 Skill 默认 | `packages/shared/src/types/screenplay-package.ts` → `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS` |
| 拆镜 System | `packages/shared/src/types/script-breakdown.ts` → `DEFAULT_SCRIPT_BREAKDOWN_PROMPTS` |
| Agent 硬编码 | `apps/server/src/modules/agent/agent.service.ts` |
| Skill 种子与服务 | `skills/*.md`、`apps/server/src/modules/skills/seed-skills.ts`、`skills.service.ts`、`useSkillVault`（注入闭环见 §0.5） |
| 制作台拼装 | `packages/shared/src/utils/studio-prompt-builder.ts` |
| 角色板 | `packages/shared/src/utils/character-sheet-master.ts` |
| Bible 一键 | `packages/shared/src/utils/asset-bible-image.ts` |
| 场景/服装板 | `packages/shared/src/utils/creative-asset-prompts.ts` |
| 一致性注入 | `character-prompt.ts` / `environment-prompt.ts` / `line-art-prompt.ts` |
| 连续性 | `storyboard-preview-runner.ts`、`ContinuityCheckBlock.tsx`、`flow-runner.ts` |
| Vision / 反推 | `grid.service.ts`、`vision-tools.service.ts`、`analyze.service.ts`、`link-parser.service.ts` |
| 用户库 | `packages/shared/src/data/prompt-templates.ts`、`prompt-presets.ts` |
| Dev 覆盖 | `apps/web/src/stores/dev-prompt-overrides.ts` |

---

## 9. 建议的落地顺序

1. **先立内置 Skill 战略（§0.5）**：确认「内置必做 / 外部非主需求」；禁止并行开外部生态。  
2. **收敛权威源**：每个 Prompt / Skill ID 只保留一处权威正文；Agent / 编剧台 / `skills/*.md` 引用同一源。  
3. **闭环内置注入**：列表与 seed 不够；必须打通「选中 → 注入 System → 契约输出」再宣称 Skill 可用。  
4. **先填 P0**：编剧台 10 Skill + Agent 管线 + studio 三层 + bible 对齐 Master。  
5. **再统一 P1 Continuity / Vision**：消灭三处复制粘贴的短 system。  
6. **最后扩 C 类库与声音模板**；本地导入 `SKILL.md`（若做）排在内置 P0/P1 之后。  
7. **每条 P0/P1 配**：黄金样例 JSON/Markdown + 解析单测或契约测。

---

## 10. 明确「不需要」当成内部生产提示词 / 当前交付的

- Prompt Bar / 节点上用户实时输入的正文  
- 仅 UI 的 `defaultPromptHint`（除非升级为「一键填入生产示例」）  
- 纯规则引擎路径（如场次拆分 `mode: 'rule'`）中的非 LLM 文案  
- ASR / 字幕识别引擎本身（非生成式提示词；若将来加「字幕润色 LLM」再单列）  
- **外部 Skill 市场 / 跨产品 Agent Skills 兼容 / 远程订阅包**（见 §0.5.5；不是本清单交付物）

---

*文档版本：v1.1 · 盘点日期 2026-07-28 · v1.1 增补 §0.5 内置 Skill 战略（强制强调）与 §4.1 / §9 / §10 对齐 · 随实现进展更新「现状判断」列即可。*
