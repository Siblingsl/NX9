# NX9 素材库 · 角色能力梳理

> 状态：现状分析（只读整理，供强化方案对齐）  
> 范围：素材库「角色」Tab / `CharacterProfile` 全链路  
> 依据：仓库现行代码与共享类型，不以外部产品为对照  
> 日期：2026-08-04

---

## 1. 结论摘要

| 维度 | 现状 |
|------|------|
| **主入口** | 全局 `AssetLibraryModal` 的「角色」Tab（私有/公共双 scope） |
| **设定权威面** | 角色档案编辑、设定板/定妆图、参考媒体、一致性 Prompt **只在素材库**；画布不再有独立「角色设定板」节点 |
| **叙事草稿面** | 编剧台 Bible `pkg.bible.characters` 是**叙事草稿，默认不入库**；需「设定就绪」面板显式同步 |
| **消费方式** | ① 镜表按名绑定 `characterIds` ② `@角色:名` mention ③ 节点 `characterId` / `characterAssetRef` ④ 运行时 `resolveBlockCharacters` + prompt/参考图注入 |
| **独立可用** | 可脱离制片链：手工新建 → 定妆/设定板 → 在图像/视频节点 @引用或挂 AssetRef |
| **历史节点** | `character-sheet` 已 migrate → `asset-import`；设定主路径强制走素材库 |

---

## 2. 数据模型与存储

### 2.1 核心类型 `CharacterProfile`

定义：`packages/shared/src/types/character.ts`

| 字段 | 用途 |
|------|------|
| `id` / `name` | 稳定 ID；`name` 同时是 `@角色:` 引用名与镜表匹配键 |
| `descriptionZh` | 中文简述 |
| `consistencyPrompt` | 注入生图/生视频的一致性文案（生产主字段） |
| `referenceImageUrl` | 主参考 / 定妆图（挑参考图时优先） |
| `referenceAudioUrl` / `voiceProfileId` | LuxTTS / 配音克隆 |
| `bible` | 六层锚点：identity / appearance / personality / background / voice / relationships |
| `creative` | Creative Asset Center 扩展（多视图、设定板、表情姿态格、服装绑定、锁、prompt pack） |
| `tags` / `sourceTemplateId` | 标签；模板来源 |
| `deletedAt` | 软删 → 资产回收站 |

库载荷：`CharacterLibraryPayload { version: 1, characters: CharacterProfile[] }`，挂在工作区文档 `workspace.characters`。

### 2.2 Creative 扩展（生产级设定板）

`CharacterCreativeExtension`（`creative-asset-center.ts`）承载：

- 身份扩展：昵称、别名（防重名匹配）、职业、体型等  
- 多视图 URL：完整设定板、正/3-4/侧/背、剪影、情绪特写  
- 变体格：表情 / 微表情 / 头部角度 / 姿态 / 服装细节 / 手部  
- 一致性元数据：`locked`、negative、seed/lora  
- 服装库绑定：`costumeId` / `costumeLabel` / `costumePrompt`  
- Prompt pack：`image` / `video` / `bible` / `negative`

列表缩略图优先级（`characterToItem`）：`creative.fullSheetUrl` → `referenceImageUrl`。

### 2.3 双 Scope

| Scope | 存储 | 读写 |
|-------|------|------|
| **private** | 当前工作区 `useWorkspaceDocument.characters` | 默认可写 |
| **public** | 用户级 `usePublicAssetLibrary`（跨项目） | 默认只读；需 `allowPublicWrite` 才可直接改；常规路径是「复制到项目」 |

ACL：`packages/shared/src/utils/library-acl.ts` + `use-library-acl.ts`。

### 2.4 与「Bible 草稿」的边界（易混）

```
编剧台 ScreenplayPackage.bible.characters   ← 叙事草稿（不入库）
        │ 设定就绪 · 同步入库 / 拆分 syncAssets
        ▼
工作区 characters.characters (CharacterProfile)  ← 素材库权威
        │ 名称/别名匹配
        ▼
镜表 shot.characterNames → shot.characterIds
        │ resolveBlockCharacters
        ▼
图像 / 视频 / 导演台 / 3D 舞台 消费
```

素材库详情内 `ScreenplaySupportPanel` 只读挂载成稿/Bible 摘录，**不反向写 Bible**。

---

## 3. 入口一览

### 3.1 UI 打开入口

| 入口 | 位置 | 行为 | 默认 Tab |
|------|------|------|----------|
| 画布顶栏「素材库」 | `CanvasStageShell` → `AppShell.toggleAssetLibModal` | 打开 Modal | **角色** |
| Modal 内 Tab「角色」 | `AssetLibraryModal` | 列表 + 详情 | `character` |
| Scope 切换「项目 / 公共」 | Modal 顶栏 | 私有↔公共；切 scope 时 Tab 回角色 | 角色 |
| 编剧台人物卡「素材库」 | `ScriptDeskBlock` | `openAt({ tab:'character', itemId: name })` | 定位同名角色 |
| 设定就绪面板「打开素材库」 | `AssetReadinessPanel` | `openAt({ tab:'character' })` | 角色 |
| Playbook / CanvasFlowRail | 就绪条件 `has_character_bibles` | 「打开素材库 · 角色」 | 角色 |
| Prompt 条 / AssetStrip「素材库」 | `PromptBarAssetStrip` | 打开并可选挂 `characterAssetRef` | 当前已挂或角色 |
| `AssetLinkField`「打开素材库」 | 节点表单（如配音） | 跳到对应 kind | 传入 kind |
| 制作台 Dock「角色库」 | `ProductionStudioPage` | **简化 AssetsHub**，非完整 Modal | char 子页 |
| 制作台 Dock「素材库」 | 同上 | AssetsHub（角/场/声） | char |
| 资产回收站 | 顶栏 / 命令面板 / 素材库内嵌 | 软删角色恢复/清空 | 类型筛含角色 |

统一导航 API：`useAssetLibraryModalUi.openAt({ tab, itemId?, scope?, projectId?, query? })`。  
`setOpen(true)` / `toggle()` 默认 **private + character**。

### 3.2 数据写入入口（角色如何进库）

| 来源 | 机制 | 是否覆盖已有 |
|------|------|----------------|
| 素材库「新建角色」 | `newCharacterProfile()` + `upsertCharacter` | 新建 |
| 素材库详情编辑 | `saveCharacter` → private/public upsert | 覆盖同 id |
| 编剧「设定就绪 · 同步入库」 | `syncBibleAssets`：仅缺名时 upsert 瘦档案 | **不覆盖**已有同名键 |
| 剧本拆分 `syncAssets` | `profilesFromBreakdown` + upsert | 合并字段，保留已有图/creative |
| 制作台 AssetsHub | `desk.saveCharacter` → 同工作区库 | upsert |
| 公共库 → 项目 | 「复制到项目」 | 写入 private |
| 项目 → 公共 | 「复制到公共库」 | 写入 public |

**注意**：Bible 草稿编辑本身**不**改素材库；未点同步则分镜按名绑定会失败（未绑定）。

---

## 4. 素材库内「角色」能力（编辑面）

实现主文件：

- `apps/web/src/panels/AssetLibraryModal.tsx`
- `apps/web/src/panels/asset-library/AssetDetailFields.tsx`（`CharacterDetailFields`）

### 4.1 列表与健康度

- 列表项：`characterToItem` → label / prompt / image / audio  
- 诊断条（角色 Tab）：重名、未使用、缺 consistencyPrompt、未锁定、镜表引用但库中无匹配等  
- 健康度徽章（详情）：名称 + 外貌 + 一致性 Prompt + 主图，满分 4

### 4.2 详情可编辑块

1. **核心一致性**：身份、昵称、别名、标签、外貌锚点、性格、consistencyPrompt、negative  
2. **角色设定板 · 一键生成**：Master Sheet → 经画布「图像生成」节点出图 → 裁切回填多格（需私有可写 + 画布有 picture-gen）  
3. **参考资产**：主参考 / 完整板 / 四视图 / 剪影 / 特写；可上传；可锁视图  
4. **变体网格**：表情、微表情、角度、姿态、服装细节、手部  
5. **服装绑定**：选服装库条目，快照 `costumePrompt`  
6. **声音**：上传 `referenceAudioUrl`（供配音/LuxTTS）  
7. **生成定妆图（F-037）**：`useBibleImageGen` skill `gen-bible-character` → 写回 `referenceImageUrl`  
8. **剧本支撑**：只读 Bible/成稿摘录  
9. **ACL 动作**：删→回收站；复制到公共 / 从公共复制到项目

### 4.3 库内出图依赖

| 动作 | 依赖 | 写回 |
|------|------|------|
| 一键设定板 | 私有库 + 画布存在 `picture-gen` + GenSettings | `creative.*` 多 URL + 常同步主参考 |
| 生成定妆图 | 可写 + 生图服务/skill | `referenceImageUrl` |
| 刷新一致性 Prompt | 本地 `refreshCharacterPrompts` | prompt 字段 |

---

## 5. 单独使用方式（脱离主制片 Desk 链）

适用：爆款复刻、单节点试验、只出角色参考、公共库复用。

### 5.1 推荐路径

```
打开素材库（顶栏）→ 新建角色
  → 填外貌 / consistencyPrompt
  →（可选）生成定妆图 或 一键设定板
  →（可选）复制到公共库供多项目
  → 画布「图像生成」/「视频生成」：
       · Prompt 里写 @角色:张三
       · 或 Prompt 条挂 characterAssetRef
       · 或节点 CharacterSelect 选 characterId
```

### 5.2 可独立消费角色的节点/工作区

| 载体 | 如何用角色 |
|------|------------|
| `picture-gen` | `@角色` enrich + `buildCharacterContext`；参考图 |
| `clip-gen` | 同上 + `CharacterSelect` / 镜关联 |
| Prompt / Generation / Video / Picture Workspace | Mention kinds 含 `character`；AssetStrip |
| `sound-gen` | 选有 `referenceAudioUrl` 的角色做克隆参考；`AssetLinkField` |
| `voice-cast`（已迁 sound-gen 模式） | 音色映射 UI 文案含「角色库」voice profiles（与 CharacterProfile 音频相关但入口是 voice.profiles） |
| `reference-board` / `prompt-studio` 等 | 经 mention / AssetRef（视节点实现） |

无需编剧台/分镜台即可完成「建档 → 出图 → @引用」。

### 5.3 制作台简化面

`ProductionStudioPage` 的「角色库」是 **AssetsHub 轻量表单**（名 + consistencyPrompt + 参考图/音频），与完整 Modal **共用同一工作区 `characters`**，但**没有**设定板一键裁切、Creative 全字段、公共库 Tab。强化完整能力应以 Modal 为准，制作台可后续对齐或明确「快捷入口」。

---

## 6. 流程处使用方式（主制片链）

主链：`script-desk` →（设定就绪）→ `storyboard-desk` → `director-desk` → `picture-gen` / `clip-gen` / 剪辑。

### 6.1 编剧台

| 步骤 | 角色相关行为 |
|------|----------------|
| 抽取/编辑 Bible | `pkg.bible.characters` 草稿；文案标明「人物草稿 · 不入库」 |
| @ 提及 | 可插 `@角色:库名` 或 Bible 人名；技能指令可 `enrichPromptWithAssetMentions` |
| 设定就绪 Tab | `inspectBibleAssets` 比库缺谁；**同步入库** `syncBibleAssets`；**标记就绪**（可强制） |
| 送出交接 | 未就绪可仍送出（软）；下游分镜会提示未绑定 |
| 人物卡「素材库」 | 跳转打开同名库条目做视觉设定 |

### 6.2 分镜台

| 步骤 | 角色相关行为 |
|------|----------------|
| 拆镜 / 镜表 | `characterNames`（及可选 `@角色:` 编辑） |
| 绑定 | `bindStoryboardShotAssets`：按 **name / nickname / aliases** → `characterIds` |
| 未绑定筛选 | 名在镜表但库无匹配 → 「未绑定」；确认构图时警告 |
| 线稿生成 | 角色一致性经共享 prompt 路径注入（与库档案质量强相关） |
| 上游设定未就绪 | 软确认文案引导回编剧台或改 @角色/@场景 |

### 6.3 导演台

| 步骤 | 角色相关行为 |
|------|----------------|
| 关键帧批出 | `director-desk-runner`：`resolveBlockCharacters` → `enrichPromptWithCharacters` |
| 参考图序 | 默认倾向：线稿优先时可 线稿 > 角色 > 场景；（开关下）可含 3D 截图 |
| 强制角色参考 | 缺档或缺图进 missingForced / 面板缺口 |
| 3D 舞台 | `prepareDirectorProjectForShot`：按 `characterIds`/`characterNames` 生成/显隐 3D character 物体 |

### 6.4 Playbook / 就绪轨

- `has_character_bibles`：要求库中有角色设定与参考图；动作直达素材库角色 Tab。  
- `AssetReadinessPanel` / FlowRail 是流程闸门入口，不是第二套编辑器。

### 6.5 核心流水线 runner

- `core-pipeline-runner` / `flow-runner` / `picture-gen-executor`：统一 `buildCharacterContext`。  
- 镜 → 角色解析顺序：`blockData.characterId` → `shot.characterIds` → `shot.characterNames` 按名查库。

---

## 7. 节点载体与迁移

### 7.1 当前目录中的相关节点

| kind | 与角色关系 |
|------|------------|
| **无**独立 character-sheet 节点 | 设定主入口 = 素材库（catalog 注释已写死） |
| `asset-import` | 通用素材导入；历史 character-sheet 迁移落点 |
| `script-desk` | Bible 草稿 + 设定就绪 + 跳转素材库 |
| `storyboard-desk` | 名绑定 / 未绑定预检 |
| `director-desk` | 批出注入 + 3D 角色摆位 |
| `picture-gen` | mention / context / 参考图；**设定板出图执行器** |
| `clip-gen` | CharacterSelect + mention + 镜角色 |
| `sound-gen` | 角色参考音频；AssetLinkField |
| `asset-gate` | **已废弃** → 能力并入编剧设定就绪 + 分镜预检 |
| `reference-board` / `prompt-studio` / `style-lab` 等 | 间接消费 @角色 / AssetRef |
| `voice-cast` | 迁移为 sound-gen 的 cast 模式 |

迁移表：`character-sheet` → `asset-import`（`migrate-block-kinds.ts`）。

### 7.2 节点上的角色挂载字段

| 字段 | 含义 |
|------|------|
| `characterId` | 显式指定单一角色档案（clip-gen / sound-gen 等） |
| `characterAssetRef` | `AssetRef`（id/kind/scope/label），Prompt 条 / 交互协议 |
| `characterIds`（shot） | 镜级多角色稳定 ID |
| `characterNames`（shot） | 语义名；绑定前/未匹配时仍存在 |

---

## 8. 运行时消费机制（四种）

### 8.1 名称 / 别名绑定（流程主路径）

`bindStoryboardShotAssets` + `characterMatchKeys`：

- 键：`name`、`creative.nickname`、`creative.aliases[]`  
- 产出：`shot.characterIds`  
- 失败表现：分镜「未绑定」、导演强制参考缺口

### 8.2 `@角色:标签` Mention

- 格式：`@角色:张三`（`formatAssetMention` / `parseAssetMentions`）  
- 展开：`enrichPromptWithAssetMentions` 用库条目 `prompt` 替换 token  
- UI：编剧聊天、Prompt Workspace、Picture/Video Workspace、AssetMentionPicker  

另有轻量 `parseMentionsFromPrompt`（`@Name` 无「角色:」前缀）在旧路径按角色名匹配——与 `@角色:` 协议并存，改名/强化时需统一。

### 8.3 `AssetRef` 结构化挂载

- `PromptBarAssetStrip` / `AssetLinkField` / `node-interaction` pushRef  
- `resolveAssetRef` + `enrichPromptWithAssets`  
- 适合节点 UI「已关联素材」条，不依赖 prompt 纯文本

### 8.4 `resolveBlockCharacters` → Prompt / 参考图

```
resolveBlockCharacters(blockData, shot, library)
  → characterPromptSuffix / enrichPromptWithCharacters
  → pickReferenceImage（档案 referenceImageUrl 优先，再上游图）
```

导演台在此基础上再叠线稿 / 场景 / 3D 优先级。

---

## 9. 技能与提示词资产

| Skill / 工具 | 用途 |
|--------------|------|
| `gen-bible-character` | 定妆图（F-037） |
| `gen-character-sheet-master` | Master Sheet 整板提示词（设定板一键） |
| `script-skill-character` | 编剧侧人物技能 |
| `character-prompt.ts` | 运行时一致性后缀 |
| `character-sheet-prompt.ts` / `character-sheet-master.ts` | 设定板模板与同步 |
| `character-sheet-crop`（web engine） | 整板裁切回填多格 |

---

## 10. 权限、回收站与跨项目

- 私有：项目内读写；删 → `deletedAt` → `AssetTrashPanel`（可恢复/彻底删/过期清空）  
- 公共：默认只读；复制到私有后再深化设定板  
- 公共角色：跨项目复用同一用户公共库  
- `openAt({ projectId })`：若与当前工作区不同会先 `selectWorkspace`

---

## 11. 两套「角色库」表面对照

| | 全局素材库 Modal | 制作台 AssetsHub「角色库」 |
|--|------------------|---------------------------|
| 数据 | 同 `workspace.characters` | 同左 |
| 设定板一键 | ✅ | ❌ |
| Creative 全字段 | ✅ | ❌（精简） |
| 定妆图 F-037 | ✅ | ❌（可手传图） |
| 公共库 | ✅ | ❌ |
| 剧本支撑面板 | ✅ | ❌ |
| 定位 | **生产主入口** | 制作台快捷维护 |

强化角色能力时，应以 **AssetLibraryModal + CharacterProfile** 为单一事实源；制作台只做瘦客户端或引导打开 Modal。

---

## 12. 端到端流程示意

### 12.1 主制片（推荐）

```mermaid
flowchart LR
  A[编剧台 Bible 草稿] -->|同步入库 / 拆分 sync| B[素材库 CharacterProfile]
  B -->|完善定妆/设定板| B
  A -->|设定就绪| C[分镜台]
  B -->|按名绑定 characterIds| C
  C -->|确认构图| D[导演台]
  B -->|resolve + 参考图| D
  D --> E[图像/视频节点]
  B -->|@角色 / AssetRef| E
```

### 12.2 独立角色生产

```mermaid
flowchart LR
  M[打开素材库] --> N[新建/编辑角色]
  N --> O[定妆图 / 设定板]
  O --> P[picture-gen / clip-gen]
  P -->|@角色 或 AssetRef| Q[出图/出片]
```

---

## 13. 强化时可对齐的缺口（观察，非本期实现）

以下仅作后续方案输入，**本文不改代码**：

1. **双协议 Mention**：`@角色:名` vs 裸 `@名` 并存，文档与 UI 提示宜统一。  
2. **Bible ↔ 库单向**：同步不覆盖已有；深化设定后回写 Bible 无正式通道。  
3. **制作台 vs Modal**：字段与出图能力不对齐，易造成「角色库里改了但设定板找不到」。  
4. **设定板强依赖画布 picture-gen**：独立使用时用户可能不知道必须先有图像节点。  
5. **VoiceCast「角色库」文案**：实际选项来自 `voice.profiles`，与 `CharacterProfile.referenceAudioUrl` 关系需在产品上讲清。  
6. **未绑定只靠名称**：无手动「从库挑选绑定」时，别名/错别字成本高（aliases 已缓解一部分）。  
7. **公共库设定板**：公共只读 → 必须先复制到私有才能一键设定板。  
8. **3D 角色**：舞台物体由档案 id/名驱动，与 2D 定妆图资产未形成强制一一校验。

---

## 14. 关键文件索引

| 区域 | 路径 |
|------|------|
| 类型 | `packages/shared/src/types/character.ts` |
| Creative | `packages/shared/src/types/creative-asset-center.ts` |
| 库工具 / Mention | `packages/shared/src/utils/asset-library.ts` |
| 运行时解析 | `packages/shared/src/utils/character-prompt.ts` |
| 镜绑定 | `packages/shared/src/types/script-breakdown.ts` → `bindStoryboardShotAssets` |
| Modal UI | `apps/web/src/panels/AssetLibraryModal.tsx` |
| 详情 | `apps/web/src/panels/asset-library/AssetDetailFields.tsx` |
| Modal 状态 | `apps/web/src/stores/asset-library-modal-ui.ts` |
| 工作区 CRUD | `apps/web/src/stores/workspace-document.ts` |
| 公共库 | `apps/web/src/stores/public-asset-library.ts` |
| 设定就绪 | `apps/web/src/engine/asset-readiness.ts` + `AssetReadinessPanel.tsx` |
| 拆分入库 | `apps/web/src/engine/script-breakdown-runner.ts` |
| 导演消费 | `apps/web/src/engine/director-desk-runner.ts` |
| 3D 同步 | `apps/web/src/engine/director3d-character-sync.ts` |
| 列表 hook | `apps/web/src/hooks/use-asset-library-items.ts` |
| 节点选择器 | `apps/web/src/blocks/shared/CharacterSelect.tsx` / `AssetLinkField.tsx` |
| 目录与迁移 | `packages/shared/src/catalog/block-catalog.ts` / `migrate-block-kinds.ts` |

---

## 15. 一句话产品定义

**素材库角色 = 项目（及公共）视觉身份与一致性资产的唯一编辑面；编剧 Bible 是叙事草稿；分镜用名称把草稿接到库 ID；生成节点用绑定结果、@提及或 AssetRef 注入文案与参考图。**

强化「角色相关功能」时，优先补齐：绑定 UX、Modal/制作台一致性、Mention 协议、设定板独立可用性、以及 Bible↔库同步策略——而不是再造并行角色节点。
