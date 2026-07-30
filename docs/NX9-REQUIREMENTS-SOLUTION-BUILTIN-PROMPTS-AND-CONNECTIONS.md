# NX9 功能需求与解决方案：内置提示词 + 设置「连接」整合

> **文档性质**：可执行的功能需求 + 落地方案（非代码实现）。  
> **依据**：`需求.txt`（内置提示词；设置里的连接重新整理整合）+ `docs/NX9-PRODUCTION-PROMPTS-INVENTORY.md` + 当前仓库代码行为 + **用户强制补强（独立 Skill 项目规范 + 设置内可查看修改）**。  
> **Skill 目录/正文规范**：严格对齐本文 **§1.5 / §12A**（源自 awesome-skills 仓库规范；落地到 NX9 的 `skills/`，禁止另起混装目录）。  
> **真相源优先级**：用户当次指令 → 本文 → 提示词清单 → `约束开发要求.md` → 现有代码（见 `AGENTS.md`）。  
> **编写日期**：2026-07-30 · 版本 **v1.2**  
> **范围外**：外部 Skill 市场 / 跨产品 Agent Skills 兼容 / 远程订阅包；画布「数据/能力口连线」规则（F-006 等）不在本 epic 重做，仅在与报错文案交叉处引用。

---

## 0. 一句话目标

把 NX9 做成三件可验收的事：

1. **内置提示词 / 内置 Skill**：主制片链路依赖的生产能力，以**彼此独立、结构完整的 Skill 项目**交付；可注入、可版本化、可黄金样例验收。  
2. **设置 → 技能**：每个内置 Skill 均可在设置中**单独查看与修改**（含 `metadata.json` / `SKILL.md` 及附属资源），保存后立即成为运行时权威源。  
3. **设置 → 连接**：文字 / 图片 / 视频 / 音频的**模型连接**管理（下拉/主卡选用；官方与自定义；切换不删）。  
   **设置 → 服务**（独立分区）：Voicebox / LuxTTS / BGM、RunningHub、环境说明、诊断与维护——**不再放进连接页**。

三者强耦合：**没有可用连接，Skill 无法稳定生产；没有独立 Skill 项目与设置编辑面，提示词无法验收、无法回滚、无法产品化维护。**

---

## 1. 术语与边界

### 1.1 两类「连接」（勿混）

| 术语 | 含义 | 本文件是否主交付 |
|------|------|------------------|
| **设置连接** | 设置弹窗「连接」页：模型供应商、API Key、Base URL、本地桥、探测 | **是（主交付之一）** |
| **画布连线** | 节点左右数据口 / 上下能力口、上游依赖 | **否**（沿用既有 F-006 / upstream 规则）；本文件只要求「缺配置 / 缺上游」报错能指向正确设置项或操作 |

### 1.2 提示词三类（沿用清单）

| 类型 | 含义 |
|------|------|
| **A. LLM System** | 发给大模型的角色指令 + 输出契约 |
| **B. Gen Template** | 拼进生图 / 生视频 / 线稿 / 定妆请求的生产模板 |
| **C. Library / Preset** | 可点选片段库（须能直接生产） |

### 1.3 稳定生产可用（强制门槛）

同时满足：契约稳定、可验收（黄金样例 + 失败兜底）、风格可控、资产一致性可注入、版本可覆盖回滚、非演示级单行壳。

### 1.4 产品决策（强制，来自清单 §0.5 + 用户补强）

| 问题 | 结论 |
|------|------|
| 是否必须内置 Skill？ | **必须。** 内置 Skill = 可版本化生产提示词包 |
| Skill 物理形态 | **每个需求对应的 Skill 必须是独立完整的 Skill 项目**；**禁止**把多个 Skill 正文/元数据混在同一目录、同一大文件、同一 seed 巨型字符串里作为权威源 |
| 设置内编辑 | **每个**独立 Skill 必须可在 **设置 → 技能** 中查看与修改；改完即生效（见 REQ-P-S07） |
| 外部 Skill 生态 | **现阶段不做主需求**；远期若做「本地导入」，导入结果仍须落成独立 Skill 项目目录，不得覆盖内置 P0 默认包（须确认） |
| 权威源 | **每个 Skill `name`（= 目录名）只保留一处权威项目根**；Agent / 编剧台 / shared 常量 **只引用**该项目，禁止三套并行各写各的 |
| 连接交互模型 | **多连接清单 + 每模态「当前使用」下拉**（`AppSettings.connections: ModelConnection[]`）；切换当前 ≠ 删除；增删改必须显式操作 |
| 连接视觉品质 | **强制高级感**：禁止廉价 emoji 堆砌、拥挤小卡、系统原生丑下拉凑合上线；须达到 §6A 视觉验收 |

### 1.5 Skill 项目强制规范（对齐 awesome-skills · 不可降级）

> **效力**：凡本文 / 清单中列为「Skill」或「可注入 LLM System」且纳入内置交付的条目，**必须**满足本节；不满足则不得宣称该 Skill「生产可用」或「已完成」。

#### 1.5.1 独立完整（强制）

1. **一 Skill 一目录**：`skills/<skill-name>/`，目录名 = `metadata.json.name` = 运行时 Skill ID。  
2. **禁止混装**：不得把多个 Skill 的 `SKILL.md` 拼进一个文件；不得只用 `seed-skills.ts` 内巨型字符串充当唯一真相（seed 仅允许**首次写入独立项目目录**的引导数据）。  
3. **最小可发布集**（缺一不可）：
   - `metadata.json`（合法且通过校验）
   - `SKILL.md`（含 frontmatter + 规定章节）
   - `examples/`（至少 1 组真实输入/输出）
   - `SKILL.md` 内检查清单（或 `examples/` / `templates/` 中等价清单）
4. **推荐齐全**（P0 交付强烈建议齐；P1 起强制齐）：`references/`、`templates/`、`tests/`；有专属脚本时放本 Skill 的 `scripts/`（禁止塞进仓库根业务逻辑）。  
5. **可独立阅读、测试、索引**：任一 Skill 目录拷出后，仅凭该目录即可理解用途、契约与样例。

#### 1.5.2 仓库级配套（NX9 根下 `skills/` 治理）

在 NX9 仓库内（不必新建外部 awesome-skills 仓库），强制具备：

| 产物 | 职责 |
|------|------|
| `skills/<name>/` | 全部内置 Skill 项目根 |
| `skill-index.json`（建议放仓库根或 `skills/skill-index.json`） | 扫描生成的全量索引，供设置页列表 / 自动注册 |
| `scripts/validate-skills.*`（或 `scripts/validate_repo.py`） | 校验 metadata、目录、章节、重复 name |
| `scripts/build-skill-index.*` | 扫描 `skills/` 生成索引 |
| `docs/skill-spec.md`（可与本文 §1.5/§12A 同源摘要） | 团队可见的 Skill 标准 |

仓库级 `assets/`（图标、共享片段）可选；**共享文案不得替代**各 Skill 自己的权威 `SKILL.md`。

#### 1.5.3 命名（强制）

- 目录 / `name`：小写、短横线、无空格、无中文；表达用途（如 `script-skill-topic`、`cinema-prompt`）。  
- 禁止：`ProjectPlanner`、`project_planner`、`选题`、`skill1`。  
- 主入口文件名固定 `SKILL.md`；元数据固定 `metadata.json`。

#### 1.5.4 `metadata.json`（强制字段）

必填：`name`、`title`、`description`、`version`（semver）、`entry`（通常 `SKILL.md`）。  
推荐：`tags`、`author`（`nx9`）、`status`（`draft`\|`stable`\|`deprecated`）、`language`、`updated_at`、`compatibility`、`dependencies`、`resources`。  
校验：合法 JSON；`name`=目录名；`entry` 文件存在；无重复 `name`；`resources` 指向目录存在（若声明）。

#### 1.5.5 `SKILL.md` 章节顺序（强制统一）

1. YAML frontmatter（至少含 name/title/description/version，与 metadata 一致）  
2. `# <Skill Name>`  
3. `## 这个 skill 用来做什么`（适用场景）  
4. `## 输入要求`  
5. `## 输出要求`（含契约 / schema / 禁令）  
6. `## 工作流程`  
7. `## 约束与边界`  
8. `## 示例`（可指向 `examples/`）  
9. `## 检查清单`  

禁止只写「你是某某，输出 JSON」的单行壳。NX9 制片契约（JSON patch、分镜表等）写在「输出要求」中，可另附 `templates/` 中的格式模板。

#### 1.5.6 附属目录职责

| 目录 | 放什么 | 不放什么 |
|------|--------|----------|
| `examples/` | 真实 input/output、good/bad | 正式契约定义（契约在 SKILL.md / templates） |
| `templates/` | 可复用输出骨架、检查表模板 | 一次性对话记录 |
| `references/` | 规则、术语、片种分支说明、FAQ | 具体一次生成结果 |
| `tests/` | metadata/章节/样例结构校验 | 与本 Skill 无关的全局测 |
| `scripts/` | **仅本 Skill** 辅助脚本 | 仓库通用工具（放仓库 `scripts/`） |

#### 1.5.7 治理规则（强制）

- **新增**：建目录 → `metadata.json` → `SKILL.md` → `examples/`（及 references）→ 更新索引 → 校验通过。  
- **修改**：升 `version`、更新 `updated_at`；结构/规则变则同步 examples/references；设置页保存须走同一套规则。  
- **删除**：先 `status: deprecated`，索引保留一段时间；禁止默默物理删除导致主链断裂。

---

## 2. 现状摘要（查档事实）

### 2.1 内置提示词

| 领域 | 现状 | 风险 |
|------|------|------|
| 分镜拆解 `DEFAULT_SCRIPT_BREAKDOWN_PROMPTS` | 较厚，接近生产级 | 缺黄金样例与片种分支验收 |
| 角色设定板 `CHARACTER_SHEET_MASTER` | 生产级骨架 | 模型适配 / 负面词仍需 |
| 编剧台 10 Skill + Agent 多接口 | **大量偏薄**；`agent.service` 内 `scriptSkillSystem` 仅 topic/plot/pacing/hooks 有短模板，其余兜底一句 | 与 Breakdown 厚度严重不一致 |
| `skills/*/SKILL.md` + SkillsModule + seed | 仅有单文件 SKILL.md；**缺** `metadata.json` / `examples/` / `references/` / `tests/` / 索引校验；seed 字符串与目录并存 | **不符合 §1.5 独立完整项目标准**；主流程注入未闭环；设置中**不可**按项目查看修改 |
| Bible 一键 / Continuity / Vision | 偏薄或重复短 system | 返工成本高、契约易漂；须拆成独立 Skill 项目后加厚 |
| Dev Prompt Overrides | 前端 localStorage 覆盖部分 key | 与「Skill 项目权威源 + 设置编辑」未统一；不得长期替代设置内正式编辑 |
| 设置弹窗 | 仅有连接 / 画布 / 偏好 / 用量 | **无「技能」分区**；与「每个 Skill 可在设置中查看修改」缺口直接冲突 |
### 2.2 设置「连接」（代码落点：`SettingsModal.ConnectionSettings` + `ModelConnection` + `gateway.service`）

| 现象 | 说明 |
|------|------|
| **交互骨架已有、观感不合格** | 已实现四模态分区、「当前使用」`<select>`、连接宫格、官方预设 / 自定义新增、设为当前 / 编辑 / 删除；**用户反馈：不高级、不好看**（emoji 头像、小卡挤、原生下拉、操作钮过碎）——**E1 UX 未验收通过** |
| 数据模型方向正确 | `connections: ModelConnection[]` + `BUILTIN_CONNECTION_PRESETS`；活跃连接同步回写旧字段（`llmApiKey` 等）以兼容 gateway |
| 回退链仍隐式 | `apiKey('llm'\|'image'\|'video'\|'tts')` 逻辑在 gateway；UI **未展示**「当前实际用哪把 Key / 哪条回退」 |
| 本地桥与云端混排 | Voicebox / LuxTTS / BGM 仍堆在音频区；与「云端 TTS 连接」心智未分层 |
| Magic Hour / Fal / RunningHub | 仍偏文案或隐式占用 primary；未全部纳入「连接条目」心智 |
| 诊断混入 | 探测 / Prisma 迁移仍在连接页底部 |
| 旧字段并存 | `llm*` / `primary*` / `video*` 等与 `connections` 双写；须在方案中写清权威源（见 SOL-C-01） |

---

## 3. 史诗总览与优先级

| Epic | 名称 | 优先级 | 依赖 |
|------|------|--------|------|
| **E1** | 设置「连接」：**多连接管理器**（下拉选用 + 列表/宫格 CRUD）+ 凭证回写兼容 | **P0** | 无 |
| **E1V** | 连接页 **视觉与交互精修**（高级列表/宫格，达标 §6A） | **P0** | E1 交互契约 |
| **E2** | 连接探测 / 生效态 / 失败指引 | **P0** | E1 字段模型 |
| **E3** | 内置 Skill **独立项目化**（§1.5 目录/metadata/章节）+ 权威源收敛 + 注入闭环 | **P0** | E1（LLM 可用） |
| **E3S** | 设置 → **技能**：列表 / 查看 / 修改 / 重置 / 校验（每个 Skill 可独立编辑） | **P0** | E3 目录模型 |
| **E4** | P0 各 Skill 正文按模板加厚（编剧台 10 + Agent + studio/bible 对应项目） | **P0** | E3、E3S |
| **E5** | P1 Continuity / Vision / 一致性注入 → 各自独立 Skill 项目 | **P1** | E3 |
| **E6** | P2 库预设 / 声音模板；可选本地导入为独立项目 | **P2** | E3–E5 |

建议排期：**E1 → E1V（可紧随或同迭代）→ E2 与 E3 可并行 → E3S → E4 → E5 → E6**。  
**禁止**：先做外部 Skill 市场；禁止用「一个大 Markdown / 一个 seed 文件」冒充多 Skill；禁止设置里不能改就宣称 Skill 产品化完成；**禁止**以「功能能用」为由跳过连接页视觉验收。

---

# 第一部分：设置「连接」重新整理整合

## 4. 用户故事与成功标准

### 4.1 用户故事

1. 作为制片用户，我打开「设置 → 连接」，**文字 / 图片 / 视频 / 音频** 各自有一个清晰的「当前使用」**下拉框**，一眼能切换到已保存的官方或自定义连接。  
2. 作为用户，我想从下拉旁的「添加」里选 **主流官方预设**（OpenAI / Gemini / Claude / xAI…）或填 **自定义**（Base URL + Key + 模型），新增后出现在该模态的连接列表/宫格里。  
3. 作为用户，我切换「当前使用」时，**其它已连接条目必须保留**；只有我点删除并确认时才移除。  
4. 作为用户，我可以对任意已存连接：**手动设为当前**、**编辑**（标签 / Key / URL / 模型）、**手动删除**。  
5. 作为用户，我希望连接区看起来 **干净、高级、像专业创作工具**，而不是简陋卡片墙或系统原生表单堆砌。  
6. 作为进阶用户 / 运维，我仍能理解回退链、env 优先级，并在诊断区探测连通性。

### 4.2 成功标准（验收）【完成度：交互契约部分落地；视觉不合格 → E1V 未完成】

- [x] 四模态各自独立：连接清单互不串模态。  
- [x] 每模态有「当前使用」下拉，选项 = 该模态已保存连接。  
- [x] 可新增官方预设与自定义；支持编辑 / 设为当前 / 删除。  
- [x] **切换当前 ≠ 删除**；删除须显式操作（建议二次确认）。  
- [ ] **视觉与交互品质达 §6A**（当前原型未通过用户观感验收）。  
- [ ] 下拉内可直观区分「官方预设来源」与「自定义」（标签或分组）。  
- [ ] 活跃连接的生效摘要 / 回退说明在 UI 可见。  
- [ ] 探测覆盖主通道连接 + 本地桥；报错映射到正确模态。

---

## 5. 功能需求：连接管理器信息架构（E1）【交互：基本落地 · 视觉：未达标】

### REQ-C-01 页面结构（强制）

设置弹窗一级分区：`连接` | `技能`（见 §12B）| `画布` | `偏好` | `用量`。

「连接」页固定分区（自上而下）：

1. **总览条** — 四态：文字 / 图片 / 视频 / 音频；各显示当前活跃连接短名或「未配置」（**禁止**用一排廉价 emoji 充当主视觉）。  
2. **文字模型** — 见 REQ-C-01a  
3. **图片模型**  
4. **视频模型**  
5. **音频模型**（云端 TTS 走连接清单；Voicebox / LuxTTS / BGM 为同区「本地桥 / 附属」折叠，不占主下拉）  
6. **环境与说明（只读折叠）** — Magic Hour 仅 env、代理提示等  
7. **诊断（折叠）** — 一键探测；维护类操作沉底  

**废弃交互**：把整页做成「每个供应商一长表单、只能存一套 Key」的旧 IA；旧字段仅作 gateway 兼容回写，**不再作为主 UI**。

### REQ-C-01a 单模态区块结构（四态强制同构）

每个模态区块 **必须** 包含且仅按此心智排列：

```text
┌─────────────────────────────────────────────────────────┐
│  模态标题（文字 / 图片 / 视频 / 音频）          [＋ 添加] │
│  ─────────────────────────────────────────────────────  │
│  当前使用  [  下拉：已保存连接列表 · 含模型名  ▾  ]       │
│  ─────────────────────────────────────────────────────  │
│  已保存连接 · 列表 或 宫格（见 REQ-C-01b）                 │
│    · 手动「设为当前」 · 编辑 · 删除（确认）               │
└─────────────────────────────────────────────────────────┘
```

| 控件 | 行为（强制） |
|------|----------------|
| **当前使用 · 下拉** | 选项 = 本模态 `connections.filter(kind)`；变更只改 `isActive`，**不得**删除其它项 |
| **＋ 添加** | 打开「添加连接」面板：Tab **主流官方** \| **自定义** |
| **主流官方** | 展示 `BUILTIN_CONNECTION_PRESETS` 过滤本 `kind`；点选后**新增一条**连接（预填 baseUrl/model/provider），等待用户填 Key（或稍后编辑）；**不得**覆盖已有同名条目（同 provider 可多条，以 id 区分） |
| **自定义** | 空白表单：标签、Provider、Base URL、API Key、默认模型 → 保存为新连接 |
| **连接列表 / 宫格** | 展示本模态全部已保存连接；活跃项有清晰高亮（非仅靠小勾） |
| **设为当前** | 与下拉等价；同模态仅一条 `isActive` |
| **编辑** | 就地或侧滑/浮层表单；保存更新该 id |
| **删除** | 仅手动；删除当前项后：自动激活同模态另一条（若有）或变为「未配置」；**须确认** |

### REQ-C-01b 列表 vs 宫格（产品形态）

| 形态 | 适用 | 要求 |
|------|------|------|
| **连接列表（推荐默认）** | 条目 ≥3 或宽信息（URL/模型） | 单列紧凑行：品牌色点 / 短标 / provider·model / 状态 / 操作；行高统一、留白充足 |
| **连接宫格** | 条目少、强调品牌辨识 | 最多 2 列；卡片面积够点；**禁止**三颗挤在一起的迷你 icon 钮作为唯一操作区 |

允许设置内「列表 | 宫格」轻量切换；**默认交付列表形态**（更易做高级感）。无论哪种，须满足 §6A。

### REQ-C-01c 生命周期（强制 · 「已连接不要删」）

| 操作 | 允许结果 |
|------|----------|
| 下拉切换 A→B | A 仍在清单，仅 `isActive` 变化 |
| 添加官方预设 / 自定义 C | 清单增加 C，**默认设为当前**（同模态原活跃项保留在清单、仅取消 isActive） |
| 编辑 | 只改该 id 字段 |
| 删除 | 须确认；禁止因「换官方模型」或「保存设置」而清空清单 |
| 保存设置 | 持久化完整 `connections[]`；禁止静默丢弃未激活项 |

### REQ-C-02～C-05 通道字段（映射到 ModelConnection + 兼容回写）

主 UI **不再**按「单卡单 Key」展示；字段进入连接编辑表单：

| 模态 `kind` | 连接字段 | 激活时回写旧字段（兼容 gateway） |
|-------------|----------|----------------------------------|
| `llm` | apiKey, baseUrl, model, provider, label | `llmApiKey` / `llmBaseUrl` / `llmModel` |
| `image` | 同上；Gemini 等用对应 provider | `primaryApiKey` / `primaryBaseUrl`（兼容出图）；gemini 条目另映射 `gemini*` |
| `video` | 同上；provider ∈ xai / grokgo / custom… | `videoProvider` + 对应 `xai*` / `grokGo*` / `video*` |
| `audio` | 云端 TTS 连接 | `ttsApiKey` / `ttsBaseUrl` |

音频区 **额外**（非连接下拉主路径）：

1. Voicebox 本地桥：enable、baseUrl、defaultProfile、探测  
2. LuxTTS：enable、baseUrl、参考音频、无 GPU 保底、探测  
3. BGM：provider、apiKey  

**回退文案（强制可见）**：当某模态无活跃连接或 Key 空时，展示 gateway 回退提示（如 LLM 可回退 primary），见 SOL-C-02。

### REQ-C-06 高级供应商 CRUD

`advancedProviders`：可并入「自定义连接」协议枚举，或保留诊断区折叠 CRUD。阶段 A：能探测即可；勿与四模态主列表抢视觉焦点。

### REQ-C-07 `categoryKeys` / `cloudTargets`

本 epic 不新做 UI；「环境与说明」标注未产品化。[待确认是否废弃]

### REQ-C-08 密钥安全与保存

- 脱敏展示；日志 / toast 禁止完整 Key  
- 空字符串语义与现网 API 对齐并在编辑表单标注  
- 删除连接 = 删除该条密钥材料（确认文案写清）

---

## 6. 解决方案：连接数据模型与路由（E1）

### SOL-C-01 权威数据模型【强制】

```ts
// 已有类型（packages/shared）— 权威清单
interface ModelConnection {
  id: string;
  label: string;
  kind: 'llm' | 'image' | 'video' | 'audio';
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
```

- **UI 权威源**：`AppSettings.connections`  
- **运行时短期兼容**：激活连接变更时同步旧扁平字段，供 `gateway.service` 继续解析  
- **中期目标**：gateway 直接按 `kind` 读活跃 `ModelConnection`，再套 SOL-C-02 回退；旧字段只读迁移  

首次打开若 `connections` 空但旧字段有 Key：自动迁移生成对应模态的一条连接并 `isActive`（静默一次性）。

### SOL-C-02 统一回退矩阵（写进方案，前后端同表）

| 能力 kind | Key 解析顺序（与现 `gateway.service` 对齐并文档化） |
|-----------|-----------------------------------------------------|
| llm | 活跃 llm 连接 → `llmApiKey` → `primaryApiKey` |
| image（OpenAI 兼容） | 活跃 image 连接 → `primaryApiKey` → `llmApiKey` |
| image（Gemini） | 活跃 gemini 连接 → `geminiApiKey` → env `GEMINI_API_KEY` |
| image（Magic Hour） | 仅 env `MAGIC_HOUR_API_KEY` |
| image（Fal） | **当前** primary / 活跃兼容 image Key（UI 标明；独立 `falApiKey` 见 §18） |
| video | 按活跃 video 连接 provider：xai / grokgo / custom 链（同现网） |
| tts | 活跃 audio 连接 → `ttsApiKey` → `primaryApiKey` |
| bgm | 仅 `bgmApiKey` |

**UI 必须渲染该表的「当前行生效结果」**。

### SOL-C-03 添加面板：官方 + 自定义

- 预设源：`BUILTIN_CONNECTION_PRESETS`（按 kind 过滤）  
- 官方项展示：供应商名、默认模型、主机名（非完整敏感 URL 亦可）  
- 自定义：完整表单；protocol/provider 自由或枚举  
- **添加 ≠ 替换**：始终 `push` 新 id  

### SOL-C-04 UI 改动落点

| 层 | 文件（预期） |
|----|----------------|
| UI | `apps/web/src/panels/SettingsModal.tsx`（建议拆 `ConnectionManager/`：ModalitySection、ActiveSelect、ConnList、AddSheet） |
| 样式 | `settings-modal.css`（E1V 重点重做连接区 token） |
| 类型 | `packages/shared/src/types/settings.ts`（`ModelConnection` / presets） |
| 持久化 | `settings.service.ts` |
| 解析 | `gateway.service.ts` |

### SOL-C-05 迁移与兼容

- 不删旧扁平字段；双写至 gateway 直读连接为止  
- 老用户已存 Key 经 SOL-C-01 迁移进 `connections`  
- 文档与设置页同步「回退矩阵」折叠说明  

---

## 6A. 解决方案：连接页视觉与交互精修（E1V · 强制）【当前：未达标】

> **背景**：现网原型（总览条 + 模态卡 + 原生 `<select>` + 小宫格 + emoji）被判定「太丑、不高级」。功能契约可保留，**视觉必须重做**后才算 E1 完成。

### REQ-C-V01 视觉原则（强制）

1. **克制**：少装饰、少 emoji；供应商用简洁字母标或单色几何标，不用彩色大脑/相机 emoji 当主图标。  
2. **层次**：标题 → 当前使用 → 清单；一条主操作路径，次要操作（编辑/删除）用悬停或溢出菜单收敛，避免三颗小钮永远外露抢视线。  
3. **材质**：与 NX9 设置弹窗玻璃/暗色体系一致；用细边框 + 轻微分层，**禁止**厚投影、荧光描边、圆角胶囊堆砌。  
4. **排版**：标签字重与字号有明确级差；辅助信息（provider、model）用次级色，一行内可读完。  
5. **状态**：活跃连接用左边线 / 微底色 / 「使用中」文字标签，三选一做透，勿叠三种。  
6. **下拉**：自定义样式的选择器（或等效 Popover 列表），分组：「已保存 · 官方」「已保存 · 自定义」；禁止裸系统 `<select>` 作为最终形态。  
7. **空态**：无连接时给一句短说明 + 主按钮「添加官方模型」，不要大片灰空。  
8. **密度**：模态区间距统一；单屏优先看完「当前使用 + 前几条连接」，长列表可滚动，勿把四模态表单拉成无限墙。

### REQ-C-V02 推荐线框（列表默认）

```text
文字模型                                          [添加]
当前使用  ┌──────────────────────────────────┐
          │  OpenAI · gpt-4o-mini        ▾   │  ← 定制下拉
          └──────────────────────────────────┘
已保存
  │ OpenAI          openai · gpt-4o-mini    使用中   ⋯
  │ xAI Grok        xai · grok-2                    ⋯
  │ 工作室代理       custom · …                     ⋯
```

`⋯` 菜单：设为当前 | 编辑 | 删除。

### REQ-C-V03 宫格形态（可选）

若用宫格：2 列、卡片内边距 ≥ 12px、主信息最多 3 行、底部单一「管理」入口；**禁止**复刻当前「图标 + 三微钮」原型作为终态。

### REQ-C-V04 验收（产品 / 设计）

- [ ] 去掉导航栏后，连接页仍像「专业工具设置」而非后台 CRUD 临时页  
- [ ] 四模态结构同构，学习一次即可  
- [ ] 切换当前后，旧连接仍在列表且无闪烁清空  
- [ ] 添加官方 / 自定义流程 ≤ 3 步可完成填 Key  
- [ ] 深色主题对比度可读；焦点态可键盘操作  

### SOL-C-V01 实现要点

- 用 Popover / Listbox 替换原生 select（可复用项目已有 desk UI 组件，勿新造设计体系）  
- CSS 变量统一连接区：`--conn-row-h`、`--conn-accent`、`--conn-muted`  
- 删除现连接区装饰性 emoji；预设可用 `provider` → 单色初始字母  
- 动画：切换活跃、展开添加面板仅用短促 opacity/translate（≤ 200ms），勿弹跳  

### REQ-C-15 连接侧明确不做

- 切换「当前使用」或添加官方预设时 **静默删除** 其它已保存连接。  
- 以「单供应商长表单、全局只能存一套 Key」冒充连接管理器终态。  
- 以当前 emoji + 原生 `<select>` + 三微钮小宫格 **宣称视觉完成**。  
- 把 Prisma 迁移、调试堆在首屏主视线。  

---
## 7. 功能需求：env 与 UI 优先级（E1）

### REQ-C-09 优先级表（产品文案与实现必须一致）

| 配置项 | UI 设置 | 环境变量 | 建议优先级 |
|--------|---------|----------|------------|
| Gemini Key | 活跃 gemini 连接 / `geminiApiKey` | `GEMINI_API_KEY` | **UI 非空优先，否则 env** |
| Magic Hour | 无（连接页只读说明） | `MAGIC_HOUR_API_KEY` | **仅 env** |
| 代理 | 系统 / Node `HTTPS_PROXY` | 同左 | 「环境与说明」给排查步骤 |
| 其余主 Key | 活跃 `ModelConnection`（及兼容旧字段） | 一般无 | **以设置存储为准** |

### REQ-C-10 热更新

- 目标：保存设置后，**下一次** gateway 请求即读新值。  
- 若适配器 init 缓存 Key：改为每次请求解析或保存时失效。  
- 仅当无法热更新时黄字「需重启 server」——禁止一刀切。

---

## 8. 功能需求：探测、生效态、失败指引（E2）

### REQ-C-11 探测矩阵（强制）

| 探测目标 | 动作 | 成功标准 |
|----------|------|----------|
| 活跃 LLM 连接 | 轻量 chat/models 或 `GET /models` | HTTP 2xx 或模型列表 |
| 活跃 Image 连接 | `GET /models` 优先 | 可达 + 鉴权过 |
| Gemini 连接 / Key | hasKey + 可选 models | Key 有效或明确 401/403 |
| Magic Hour | hasKey（env） | 已加载 / 未配置 |
| 活跃 Video 连接 | 按 provider ping | 鉴权过或桥在线 |
| 活跃 Audio（TTS）连接 | models 或 dry-run（慎计费） | 鉴权过 |
| Voicebox / LuxTTS | 现有 probe | available + 策略摘要 |
| BGM | 最小鉴权或「已配置」弱校验 | 明确消息 |
| 其它已保存但未激活连接 | 可选「探测此条」 | 不强制进「探测全部」 |

**「探测全部」**：并行探测各模态**当前活跃**连接 + 本地桥，汇总到总览条。

### REQ-C-12 连接状态 API（建议）

`GET /api/settings/connection-status`  
返回每模态：活跃连接 id/label、`configured`、`probe`、`effectiveKeySource`、`effectiveBaseUrl`、`hints[]`、已保存条数。

### REQ-C-13 错误码 / 文案映射

| 场景 | 用户可见指引 |
|------|----------------|
| 无 LLM 连接 / Key | 「请到 设置 → 连接 → 文字模型 添加或选用连接」 |
| 无图片连接 / Key | 「设置 → 连接 → 图片模型」 |
| Gemini 未配却选 Gemini | 「设置 → 连接 → 图片/文字 中添加 Gemini 连接」 |
| Magic Hour 未配 | 「在 apps/server/.env 配置 MAGIC_HOUR_API_KEY 后重启 server」 |
| Fal 失败且无兼容 Key | 「Fal 使用图片兼容连接的 Key，请添加并设为当前」 |
| 视频 Key 与 provider 不匹配 | 「当前视频连接为 X，请编辑该连接或切换下拉」 |
| Voicebox/LuxTTS 离线 | 「本地桥未连接：检查 Base URL 并点击探测」 |
| BGM 无 Key | 保持现有明确报错 |

### REQ-C-14 与画布连线报错的区分

- 「请连接分镜台 / 图像生成节点」→ **画布操作**。  
- 「未配置 API Key / 未添加连接」→ **设置连接**。  
文案区分「连线到上游节点」vs「配置模型服务」。

---

## 9. 解决方案：探测实现要点（E2）

### SOL-C-06

- 扩展探测：优先活跃 `ModelConnection`，再本地桥，再 advanced。  
- 前端诊断区升级为通道探测面板。  
- 结果短时缓存（如 30s）。  
- 不计费优先。

### SOL-C-07 总览条计算规则

| 状态 | 规则示例 |
|------|----------|
| 就绪 | 该模态有活跃连接且 Key 非空（且最近探测成功或无失败史） |
| 部分就绪 | 有已保存连接但无活跃 / 或 Key 空仅靠回退 |
| 未配置 | 该模态 `connections` 为空且回退亦空 |
| 探测失败 | 活跃连接 Key 有但探测失败 |

---

## 10. 连接相关「全面清单」：供应商与能力落点

下列每一行须在连接页或「环境说明」中有归属，避免「功能有、设置找不到」。

| 能力 | 运行时入口（示意） | 设置归属 |
|------|-------------------|----------|
| 剧本拆解 / 编剧台 Skill / Agent | LLM gateway | **文字 · 当前使用下拉** |
| 制作台 / 导演台出图 | primary / Gemini / Magic Hour | **图片 · 连接清单** + env 说明 |
| 抠图 / Inpaint（Fal） | `proxyFal` ← 兼容图片 Key | **图片**（文案标明 Fal） |
| 图生视频 / Grok Imagine | video 活跃连接 | **视频 · 连接清单** |
| TTS 配音 | 活跃 audio 连接 + Voicebox / LuxTTS | **音频 · 下拉 + 本地桥** |
| BGM | `/api/gateway/music` | **音频 · BGM** |
| Seedance 技能包 | Skill 正文 + 视频模型方言 | **提示词 E3/E4**；连接侧仍走视频/LLM |
| RunningHub / Comfy 预留 | rh / advanced | 图片可选 / 诊断自定义 |
| advancedProviders | 探测 / 扩展 | 诊断或自定义连接 |
| 云盘 cloudTargets | 未产品化 | 说明区标注未开放 |

---

# 第二部分：内置提示词 / 内置 Skill

## 11. 用户故事与成功标准

### 11.1 用户故事

1. 作为编剧，点编剧台某一 Skill，模型收到**该独立 Skill 项目**的完整生产级 System，输出可被 patch schema 解析。  
2. 作为产品，每一个需求 Skill 在磁盘上都是 **`skills/<name>/` 完整项目**（metadata + SKILL.md + examples 等），互不混装；Agent / 编剧台只引用该项目。  
3. 作为用户 / 调优者，打开 **设置 → 技能**，能浏览全部内置 Skill，点开某一个即可查看并修改其正文与元数据，保存后主链路立刻用新版本。  
4. 作为开发，校验脚本能挡住不合格项目；每条 P0/P1 有黄金样例；可「重置为官方版本」。

### 11.2 成功标准【完成度：90%】

- [x] 每个交付 Skill 均为独立目录项目，通过 `validate-skills`（§1.5 / §12A）。  
- [x] **禁止**多 Skill 混在同一权威文件；seed 不得作为运行时唯一正文源。  
- [x] 「选中 Skill → 请求体含完整 System（来自该项目 `entry`）→ 输出过契约」可验收。  
- [x] **设置 → 技能**：列表、详情、编辑、保存、校验失败提示、重置官方包，对**每一个**内置 Skill 可用。  
- [x] 消除 shared 一句话壳 / agent 硬编码长文 / 非项目化 SKILL 三套并存。  
- [x] 清单 P0 所涉 Skill 全部项目化并在设置中可改。  
- [x] 外部 Skill 市场不做。

---

## 12. 功能需求：权威源与注入（E3）【完成度：90%】

### REQ-P-01 权威源铁律（强制）【完成度：90%】

1. 每个 Skill **一处权威：独立 Skill 项目根** `skills/<name>/`（见 §1.5）。  
2. 运行时只读该项目的 `metadata.entry`（默认 `SKILL.md`）注入；`examples/` / `references/` / `templates/` 按需拼装或仅供人读/校验。  
3. `agent.service` / `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS` **只引用**项目内容（或由构建脚本从项目生成只读快照）；**禁止**内嵌完整长文副本作为第二真相。  
4. 种子：仅允许首次把官方包写入独立目录；**永不**在运行时用 seed 字符串覆盖用户在设置中保存的修改。  
5. 产品升级官方包：须提供「重置为官方版本」；默认不静默覆盖。

### REQ-P-02 注入闭环（强制）【完成度：90%】

| 入口 | 注入要求 |
|------|----------|
| 编剧台 chips（topic…ingest） | 按 Skill `name` 加载对应**项目** System + 用户指令 + package 上下文 |
| Agent 制片接口 | 同 `name` 同一项目；输出 schema 与前端解析一致 |
| 画布 Chat / 选中 Skill | `SkillsService` 读项目 `entry` → system 注入 |
| 设置中保存后的版本 | 与上述入口同一加载路径（禁止设置改 A、运行读 B） |

验收：**不以「磁盘有个 SKILL.md」为准**；必须以「独立项目校验通过 + 注入链路 + 契约输出」为准。

### REQ-P-03 Skill ID / Prompt ID 稳定表【完成度：100%】

- 运行时 Skill ID = 目录名 = `metadata.name`（kebab-case）。  
- 清单中的 Prompt ID（如 `sys.script.skill.topic`）须在 `metadata` 中增加稳定字段映射，建议：

```json
"nx9": {
  "promptId": "sys.script.skill.topic",
  "category": "script-desk",
  "priority": "P0"
}
```

- 新增 Skill 必须先登记清单与索引，再实现目录与设置可见。

### REQ-P-04 内容大纲与 §1.5.5 对齐（强制）【完成度：90%】

- **A 类 Skill**：必须按 §1.5.5 九段结构书写；「输出要求」中写清 JSON/Markdown 契约、禁令、片种分支、失败降级。  
- **B 类**若以 Skill 项目交付（如 seedance / bible 文案权威）：同样遵守独立项目 + 模板章节；代码拼装器只引用项目内 templates/正文片段。  
- **C 类**点选库：可仍为数据文件；一旦升级为「可注入 Skill」，必须项目化，不得继续混在大 JSON 里当 System 源。

---

## 12A. 功能需求：独立 Skill 项目结构（E3 · 强制照搬规范）【完成度：100%】

### REQ-P-S01 单项目目录树（强制）【完成度：100%】

每个 Skill 必须具备（最小集加粗）：

```text
skills/<skill-name>/
├── metadata.json          # 强制
├── SKILL.md               # 强制 · entry
├── references/            # P0 强烈建议 / P1 强制至少 1 个规则文件
├── examples/              # 强制 · 至少 1 组
│   ├── input.md
│   └── output.md
├── templates/             # 有固定输出骨架时强制
├── scripts/               # 可选 · 仅本 Skill
└── tests/                 # P0 强烈建议 · 至少 metadata/章节校验说明或脚本
```

**禁止**：

- `skills/all-skills.md`、`skills/bundle/` 多 Skill 合订  
- 仅 `skills/<name>.md` 单文件（无目录项目）作为终态  
- 多个逻辑 Skill 共用一个 `SKILL.md`  
- 把 examples/references 只写在仓库别处而不放进该项目

### REQ-P-S02 `metadata.json` 校验（强制）【完成度：100%】

与 §1.5.4 及下方规则一致，自动化至少检查：

- 合法 JSON；必填五字段齐全  
- `name` === 目录名；全局唯一  
- `version` 为 semver；`entry` 文件存在  
- 若声明 `resources.*`，目录存在  
- `status` ∈ draft|stable|deprecated  
- `description` 非空泛（建议长度下限，如 ≥20 字）

### REQ-P-S03 `SKILL.md` 模板符合性（强制）【完成度：100%】

必须能被校验脚本识别出 §1.5.5 规定标题（允许中英文同义，但仓库内统一用中文标题集）。  
frontmatter 的 name/title/description/version 必须与 `metadata.json` **一致**（不一致则校验失败，设置页禁止保存）。

### REQ-P-S04 索引与校验脚本（强制）【完成度：100%】

- `build-skill-index`：扫描生成 `skill-index.json`（name、title、description、version、status、tags、promptId、path）。  
- `validate-skills`：CI / 本地 / 设置页保存前均可调用；失败则阻断合并或阻断保存。  
- 设置页列表**只消费索引或等价 API**，禁止前端手写 Skill 名单与磁盘分叉。

### REQ-P-S05 映射：清单需求 → 独立项目（强制示例）【完成度：90%】

下列每一行 = **一个**独立 Skill 项目（名称可微调，但必须一对一，禁止合并）：

| 需求 / Prompt | 建议目录 `name` |
|---------------|-----------------|
| 编剧台 topic…ingest（10） | `script-skill-topic` … `script-skill-ingest`（10 个目录） |
| episode-planner / episode-shots | `breakdown-episode-planner` / `breakdown-episode-shots` |
| Agent dialogue / shot-script / … | `agent-dialogue-extract`、`agent-shot-script`、…（各一目录） |
| cinema-prompt / prompt-polish / … | 已有目录升级为完整项目（补 metadata/examples/…） |
| seedance-* | 每个 seedance 子能力保持独立目录，补齐规范 |
| continuity supervisor | `continuity-supervisor`（单独项目，禁止与 vision 混文件） |
| grid/vision/link-parser 等 | 各一目录 |

**Gen Template 拼装代码**可共享工具函数，但**权威文案与样例**仍分属各自 Skill 项目或明确的 `gen-*` 项目，不得回退到「一个 studio-prompt-builder 注释里写死全文」。

---

## 12B. 功能需求：设置 → 技能（E3S · 强制）【完成度：100%】

### REQ-P-S06 设置信息架构【完成度：100%】

`SettingsModal` 增加分区（与连接平级）：

| id | label | hint |
|----|-------|------|
| `skills` | 技能 | 内置 Skill 查看与修改 |

入口：设置左侧导航；命令面板可 `nx9:openSettingsSection` → `skills`。

### REQ-P-S07 每个 Skill 可查看、可修改（强制）【完成度：100%】

| 能力 | 要求 |
|------|------|
| 列表 | 展示索引中全部 Skill：title、name、version、status、tags、priority；支持搜索 / 按 category 筛选 |
| 查看 | 点选后只读预览：metadata 摘要 + `SKILL.md` 渲染 + examples/references 文件树 |
| 修改 | 可编辑：`metadata.json` 字段、`SKILL.md` 全文；可选编辑 `examples/*`、`templates/*`、`references/*`（至少 SKILL.md + metadata 为 P0 必达） |
| 保存 | 写入该 Skill 项目目录；自动更新 `updated_at`；**建议**要求用户确认是否 bump `version`（patch 默认 +1） |
| 校验 | 保存前跑与仓库相同的校验规则；失败展示条目级错误，**不落盘** |
| 重置 | 「恢复官方版本」：用官方包覆盖当前项目（二次确认）；用户改动可先导出 |
| 导出/导入（P1） | 导出为 zip/目录；导入必须生成**独立目录**且校验通过；禁止覆盖 `status:stable` 的 P0 内置包除非显式确认 |

**强制**：列表中的**每一个**内置 Skill 都能完成查看 + 修改 + 保存闭环；不得只有部分 Skill 可编辑、其余灰显「仅代码内置」。

### REQ-P-S08 API（方案级）【完成度：100%】

在现有 Skills CRUD 上扩展（名称可调整）：

| 接口 | 作用 |
|------|------|
| `GET /api/skills` | 列表（来自索引/扫描，含 metadata 摘要） |
| `GET /api/skills/:name` | 详情：metadata + entry 正文 + 资源文件列表 |
| `GET /api/skills/:name/files/*` | 读项目内相对路径文件 |
| `PUT /api/skills/:name` | 更新 metadata + SKILL.md（事务性） |
| `PUT /api/skills/:name/files/*` | 更新附属文件 |
| `POST /api/skills/:name/validate` | 只校验不保存 |
| `POST /api/skills/:name/reset` | 重置官方包 |
| `POST /api/skills/reindex` | 重建 skill-index |

权限：本地单机产品按现有设置鉴权；禁止路径穿越出 `skills/<name>/`。

### REQ-P-S09 与 Dev Overrides 关系【完成度：100%】

- **正式调优路径** = 设置 → 技能（写回 Skill 项目）。  
- Dev Overrides 可保留给开发期临时覆盖，但 UI 须注明「临时；正式请改设置 → 技能」；不得作为唯一编辑入口。

---

## 13. 功能需求：P0 提示词交付（E4）【完成度：90%】

### REQ-P-05 编剧台 10 Skill（A · P0）【完成度：90%】

**强制**：下表每一行是**独立完整 Skill 项目**（§1.5 / REQ-P-S01），并在设置 → 技能中可查看修改。

| 芯片 ID | 建议项目 `name` | 功能要点 |
|---------|-----------------|----------|
| `topic` | `script-skill-topic` | 平台差异、logline 结构、禁镜头表 |
| `world` | `script-skill-world` | 时代/地点/视觉规则列表；禁一句话一新世界 |
| `character` | `script-skill-character` | 六层 + `fixedVisualKeywords` 英文；同名唯一；draft only |
| `plot` | `script-skill-plot` | 起承转合、集边界、与 brief 契约一致 |
| `pacing` | `script-skill-pacing` | balanced/slow/fast 定义、时长与平台 |
| `dialogue` | `script-skill-dialogue` | 说话人/情绪/可演口语；不写镜头语言 |
| `hooks` | `script-skill-hooks` | 可落画面；集末钩子 vs 付费卡点 |
| `consistency` | `script-skill-consistency` | 只诊断；diagnostics 分级与 code 枚举 |
| `generate` | `script-skill-generate` | 场次+动作+对白；禁 imagePrompt/镜头表；对齐 bible |
| `ingest` | `script-skill-ingest` | 保真分集；sourceType=pasted |

每项目：`examples/` 至少 1 正例 + 1 负例（或 good/bad）；与 `ScreenplayPackage` patch schema 字段一一对应；`SKILL.md` 按 §1.5.5 写满。

### REQ-P-06 拆镜（A · P0）【完成度：90%】

| Prompt ID | 独立项目 `name` | 要求 |
|-----------|-----------------|------|
| `sys.breakdown.episode-planner` | `breakdown-episode-planner` | 基于现有加厚；片种语感；集数上限策略；黄金样例在 `examples/` |
| `sys.breakdown.episode-shots` | `breakdown-episode-shots` | 三层 Prompt 标准；schema 版本锁定；负例禁标签罗列 |

导演控制中的图片风格 / 视频风格 / 目标形态须能驱动语感分支（规则可放各项目 `references/`）。

### REQ-P-07 Agent 管线（A · P0）【完成度：80%】

下列**各自**独立 Skill 项目（非单行壳），`name` 建议 `agent-<capability>`，与对应能力一对一：

`dialogue-extract`、`shot-script`、`adaptation`、`screenplay`、`director-plan`、`extract-assets`、`novel-events`、`scene-split`、`environments`；以及 `script-skeleton` / `production-storyboard-table`（已有目录则升级为完整项目）。

**禁止**把多个 Agent 能力写进同一个 `agent.service` 内嵌字符串当作权威源。

**产品统一点**：[待确认] `shot-script` 是否允许镜头语言——默认 **维持禁止**，与 `script-skill-generate` 一致。

### REQ-P-08 Gen Template（B · P0）【完成度：80%】

| Prompt ID | 交付形态 | 要求 |
|-----------|----------|------|
| `gen.studio.image` / `video` / `sketch` | 独立项目 `gen-studio-image` 等，或「一个 gen-studio 项目 + templates 分文件」但**禁止**与编剧 Skill 混目录 | 质量句、景别运镜、enrich、负面词包、片种后缀；视频含模型方言 |
| `gen.director.batch-shot` | `gen-director-batch-shot` | 叠加 3D camera / 构图约束 |
| `gen.character.sheet.master` | `gen-character-sheet-master` | 已有骨架 + 模型适配 + 负面词 |
| `gen.bible.character` / `scene` | `gen-bible-character` / `gen-bible-scene` | 对齐 Master/Scene Sheet |

拼装器代码可读项目内 `templates/`；权威样例在项目 `examples/`。

---

## 14. 功能需求：P1 / P2（E5 / E6）【完成度：60%】

### REQ-P-09 P1（摘要）【完成度：60%】

- 统一连续性审查为独立项目 `continuity-supervisor`（三角色维度 + rubric）；预览 / Continuity 节点 / flow-runner **只引用**该项目。  
- `grid-cell-reverse`、`vision-reverse-image`、`vision-extract-style`、`vision-video-storyboard`、`link-parser`、`prompt-merge` 等**各一项目**。  
- 一致性后缀 / 环境 enrich / scene·costume sheet / seedance-*：各保持或升级为独立项目。  
- Vision Skill 的 `references/` 必须写清：看图顺序、最多几张、分数校准、无法判断默认行为。

### REQ-P-10 P2（摘要）【完成度：30%】

- C 类库扩充；若某预设升级为可注入 Skill，必须先项目化再进设置列表。  
- `voice-assigner` 补齐完整项目规范并 JSON 契约化。  
- 可选：本地导入 → 校验 → 写入**新的**独立目录；禁止静默覆盖 P0 内置包。

### REQ-P-11 明确不做【完成度：100%】

- 用户 Prompt Bar 临时输入；纯 UI `defaultPromptHint`（除非升级为一键填入且仍不冒充 Skill 项目）。  
- 纯规则引擎路径非 LLM 文案。  
- 外部 Skill 市场 / 远程订阅包。  
- **多 Skill 合订权威文件**、**仅设置外可改 / 设置内不可改** 的所谓「完成」。

---

## 15. 解决方案：提示词工程落地（E3–E6）

### SOL-P-01 目录与加载（独立项目）

```text
skills/
  script-skill-topic/
    metadata.json
    SKILL.md
    references/
    examples/
    templates/
    tests/
  script-skill-world/
    ...
  cinema-prompt/
    metadata.json
    SKILL.md
    ...
  seedance-sequence/
    ...
skill-index.json                 # 或 skills/skill-index.json
scripts/validate-skills.mjs      # 或 .py
scripts/build-skill-index.mjs
docs/skill-spec.md               # 可与本文 §1.5 同步摘要
apps/server/.../skills/skills.service.ts   # 按项目读 metadata+entry；validate；reset
apps/server/.../agent/agent.service.ts     # skills.getSystem(name) only
apps/web/.../SettingsModal → SkillsSettingsPanel
```

**加载顺序**：设置保存的项目文件 →（可选 Dev Override）→ 最小兜底告警字符串（仅防崩溃，并打 error 日志）。

**迁移现有**：为每个已有 `skills/*/SKILL.md` 补 `metadata.json`、按模板补章节、补 `examples/`；把 `seed-skills.ts` 改为「目录缺失时写入完整项目骨架」，禁止长期以 TS 字符串为权威。

### SOL-P-02 编剧台注入改造

- 芯片 ID → `script-skill-<id>` 项目映射表（单一处）。  
- 删除 / 掏空 `scriptSkillSystem` 长文 map。  
- `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS`：改为短摘要或构建时从项目生成；运行时以服务端项目为准。

### SOL-P-03 设置 → 技能 UI（E3S）

- 新组件如 `SkillsSettingsPanel`：左列表右编辑器。  
- 编辑器：Metadata 表单 + SKILL.md Markdown 编辑 + 资源 Tab。  
- 保存调 `PUT /api/skills/:name`；失败展示校验错误。  
- 与「连接」分区并列；样式复用 `nx9-settings__*`。

### SOL-P-04 Gen Template

- 拼装器引用 `gen-*` 项目 templates；负面词/片种包可放 `references/negative-pack.md` 或 templates。  
- 导演台只叠加，不复制权威全文。

### SOL-P-05 契约测试

每项目 `tests/` + 仓库级 validate：

1. metadata / 章节合规  
2. `examples/` 黄金输入输出  
3. 解析器单测（mock LLM 返回 examples/output）

### SOL-P-06 与连接的联调验收

| 步骤 | 期望 |
|------|------|
| 连接页 LLM 就绪 | 编剧台 Skill 可跑 |
| 设置 → 技能改某项目并保存 | 下一次同芯片请求使用新正文 |
| 校验故意删章节后保存 | 被拒绝且磁盘未改 |
| 无 LLM Key | 指向设置 → 连接 → 文字 |

## 16. 端到端验收清单（合并）

### 16.1 连接（E1 / E1V / E2）

1. 新用户打开连接页：四模态无连接时为空态 +「添加」引导，文案无歧义。  
2. 文字/图片/视频/音频 **各有「当前使用」下拉**；选项仅含本模态已保存连接。  
3. 从「主流官方」添加 OpenAI 等预设 → 清单新增一条；再添加自定义 → 又增一条；**切换下拉不会删除**任一条。  
4. 手动「设为当前」与下拉切换等价；同模态仅一条活跃。  
5. 编辑某连接的 Key/URL/模型后保存，仅该条更新。  
6. 删除须确认；删当前后自动激活同模态下一条或变为未配置。  
7. **视觉达 §6A**（定制下拉、列表默认、无廉价 emoji 主视觉）。  
8. 仅有兼容图片 Key、无文字连接时：文字侧展示回退提示（若 gateway 仍支持）。  
9. Voicebox / LuxTTS 探测正确；诊断不抢主视线。  
10. 保存后立即再请求，活跃连接 Key 生效（或仅标注项需重启）。  
11. 触发无 Key 的生图/配音/BGM：报错指向正确模态。

### 16.2 内置提示词与 Skill 项目（E3 / E3S / E4）

1. `validate-skills` 对全部内置项目通过；无合订/缺 metadata。  
2. 编剧台 10 个 `script-skill-*` 目录彼此独立，各跑通 patch 契约。  
3. **设置 → 技能**：打开任意 P0 Skill → 修改一句可见标记 → 保存 → 再跑同芯片，输出/请求体含该标记。  
4. 保存时删掉「输出要求」章节 → 校验失败且文件回滚/未写入。  
5. 「重置为官方版本」后标记消失，行为恢复。  
6. 修改项目后 Agent 与编剧台同 `name` 行为一致。  
7. 现有 `cinema-prompt` 等目录已补齐 metadata/examples 并出现在设置列表。  
8. 无「仅代码内嵌、设置列表不可见」的 P0 Skill。

---

## 17. 交付阶段与工时量级（供排期，非承诺）

| 阶段 | 内容 | 量级感 |
|------|------|--------|
| S0 | 本文评审；拍板 §18 | 0.5d |
| S1 | 连接管理器交互契约对齐（下拉 / 增删改 / 不误删） | 1d（多数已有，补缺口） |
| S1V | **连接页视觉精修 E1V**（列表默认、定制下拉、§6A） | 1.5–2.5d |
| S2 | 探测矩阵 + connection-status + 报错映射 | 2–3d |
| S3 | 自定义/advanced 与预设面板收尾 | 0.5–1d |
| S4 | Skill 独立项目骨架 + validate/index + 迁移现有目录 | 2–3d |
| S4b | **设置 → 技能** 列表/查看/编辑/保存/重置 | 2–3d |
| S5 | P0 各项目按模板加厚正文 + 契约测 | 5–8d |
| S6 | gen/bible 项目化与拼装器引用 | 2–3d |
| S7 | P1 Continuity/Vision 分项目统一引用 | 2–3d |
| S8 | P2 库与导入 | 按需 |

---

## 18. 待产品确认项

1. Fal 是否继续共用兼容图片连接 Key，还是新增独立 `falApiKey` / 独立连接条目？  
2. Magic Hour 是否要支持设置页写入（还是长期仅 env）？  
3. `categoryKeys` / `cloudTargets`：废弃还是后续做 UI？  
4. Prisma 迁移是否移出连接页、改到独立「维护」？  
5. `shot-script` 是否允许镜头语言？  
6. ~~权威源载体~~ → **已拍板**：独立 `skills/<name>/` 项目为权威；设置可改；shared/agent 仅引用。  
7. 高级 Provider 阶段 B：是否要做「绑定为默认 LLM/图片 endpoint」？  
8. Gen Template：`gen-studio-image/video/sketch` 三个目录，还是一个 `gen-studio` 下用 `templates/` 拆分？（**无论哪种，禁止与 script-skill 混目录**）  
9. 设置 → 技能是否允许新建自定义 Skill（P0 仅编辑内置，新建放 P1）？  
10. ~~连接展示默认：列表还是宫格？~~ → **已拍板：默认列表**（不做宫格切换）  
11. ~~添加官方预设后是否默认「添加并设为当前」？~~ → **已拍板：加入并设为当前** 

---

## 19. 文档关系

| 文档 | 关系 |
|------|------|
| `需求.txt` | 本 epic 产品指令来源 |
| 用户提供的 awesome-skills 规范 | **Skill 项目结构强制标准**；已吸收为本文 §1.5 / §12A / §12B |
| `docs/NX9-PRODUCTION-PROMPTS-INVENTORY.md` | Prompt ID 盘点；清单条目落地时必须映射到独立 Skill 项目 |
| `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` | 既有 F-xxx；避免与 F-006 冲突 |
| `docs/upstream-policy.md` | 多上游策略；与设置连接无关 |
| 本文 | **内置 Skill 项目化 + 设置技能编辑 + 设置连接管理器（含视觉）** 的需求与解决方案 SSOT |

---

## 20. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-07-30 | 首版：合并需求.txt 与生产提示词清单；连接侧全面展开 |
| v1.1 | 2026-07-30 | **强制**：一需求一独立完整 Skill 项目（awesome-skills 目录/metadata/SKILL 模板）；设置 → 技能可查看修改；新增 E3S / §12A / §12B |
| v1.2 | 2026-07-30 | **连接重定位**：四模态「当前使用」下拉 + 官方/自定义新增；切换不删已连接；手动选用/编辑/删除；默认高级列表（宫格可选）；新增 E1V / §6A；纠正「连接 UI 已 100%」误标 |
| v1.2.1 | 2026-07-30 | §18 拍板：默认**列表**；添加官方/自定义后**加入并设为当前**；落地 ConnectionSettings 列表 UI |

---

*实施时以用户当次指令为准；若拍板变更 §18，先改本文再改代码。*  
*任何宣称「Skill 已完成」的交付，必须同时满足：独立项目校验通过 + 设置内可查看修改 + 注入闭环验收。*  
*任何宣称「连接页已完成」的交付，必须同时满足：多连接契约（不误删）+ §6A 视觉验收通过。*
