# NX9 内置 AI 模型目录

> 状态：增量新增（本次交付）。视频 / 文字 / 音频三张内置目录 + 合并助手 + 两处 UI 接线。
> 本次**未改动**既有连接契约、`data.model` / `llmModel` / `data.voice` 等已保存字段的读写路径。

## 1. 能力范围

NX9 原先的下拉只能看到「设置 → 连接」里用户自己配的模型，没有可直选的主流模型清单。
本次补齐三张**内置目录**，实现「开箱即可直选主流模型」：

| 目录 | 文件 | 内容 |
| --- | --- | --- |
| 视频 | `packages/shared/src/data/video-gen-models.ts` | 可灵 Kling 1.x/2.x、字节 Seedance 1.0/2.0/2.5、阿里 Wan 2.x/3.0、MiniMax Hailuo/H3、Vidu、PixVerse、Runway Gen-4、Luma Ray、Pika、Sora、Google Veo 3、xAI Grok Imagine(1.0/1.5)、Magic Hour / MH LTX（服务端已内置适配）、本地视频桥（开发）、通用 OpenAI 兼容 |
| 文字 | `packages/shared/src/data/llm-models.ts` | DeepSeek、智谱 GLM、通义千问 Qwen、Kimi(Moonshot)、GPT、Claude、Gemini、Grok、本地 Ollama / LocalAI、OpenRouter |
| 音频 | `packages/shared/src/data/audio-models.ts` | TTS 引擎：`tts-1` / `tts-1-hd` / `gpt-4o-mini-tts` / Azure 中文 / 阿里 CosyVoice / Voicebox(本地) / LuxTTS(本地)；音色目录 `AUDIO_VOICES`（OpenAI 六个既有音色 + 2 个 Azure 中文音色） |

内置目录**不含任何凭据**，也不代表账号额度：它只回答「有哪些主流模型可以直接选」。

## 2. 数据结构

```ts
export interface VideoGenModelDef {
  id: string;                 // 目录内唯一 id
  label: string;              // 中文可读名
  provider: string;           // kling / byteplus / aliyun / minimax / openai / google / xai / magichour / grokgo / openai-compatible
  model: string;              // 上游 OpenAI 兼容模型串（写入 clip-gen data.model）
  baseUrlHint?: string;       // 仅在该端点稳定已知时填写
  supportsReference?: boolean;
  supportsAudio?: boolean;
  maxDurationSec?: number;
  aspectRatios?: string[];
  group?: 'kling'|'seedance'|'wan'|'minimax'|'openai'|'google'|'runway'|'luma'|'pika'|'vidu'|'other';
  hint?: string;              // 中文能力提示，直接展示
}
```

- `LlmModelDef`：`id / label / provider / model / baseUrl? / hint? / group?`（`group` 含 `local`）。
- `AudioModelDef`：`id / label / provider / model / baseUrl? / hint? / group?`（`group` 含 `local`）。
- `AudioVoiceDef`：`id / label / provider / group? / hint?`（`id` 即下发给 `/audio/speech` 的 `voice`）。

### 词表诚实约定（重要）

- `model` 是**网关直通串**：各家聚合网关对同一厂商的命名并不统一，目录按「厂商家族名」给出稳定串，
  hint 里注明「具体型号串以你的网关命名为准」——不要把目录里的串当作厂商官方 API 的权威 id。
- **不确定的字段一律留空**：`maxDurationSec` 全部未填；`supportsReference` / `supportsAudio` 只对
  公开稳定能力置位（如 Veo 3 原生音频）。
- 这些能力位目前是**目录元数据**（供 UI 提示与后续校验），**未**接入 `validateVideoModelParams`
  等既有校验链路 —— 也就是说 NX9 目前不会因为目录标注而拦下/改写参数。
- 未知能力宁可不写，不臆造版本号与参数。

## 3. 合并语义（`packages/shared/src/data/model-catalog.ts`）

```ts
listMergedVideoModelOptions(connections)  // 视频
listMergedLlmModelOptions(connections)    // 文字
listMergedAudioModelOptions(connections)  // 音频（TTS 引擎）
listMergedAudioVoiceOptions(connections)  // 音色（引擎 ≠ 音色，见下）
```

```ts
export interface MergedModelOption {
  id: string;                 // 下拉值 = 写入上游的模型串
  label: string;
  hint?: string;
  source: 'builtin' | 'connection';
  key: string;                // 渲染主键：builtin:<目录 id> / conn:<连接 id>::<模型>
  builtinId?: string;
  connectionId?: string;
  connectionModel?: string;
  connectionLabel?: string;
  group?: string;
  groupLabel: string;         // 「内置模型」/「我的连接」/「内置音色」
}
```

规则：

1. **内置在前，连接在后**；`source` 供 UI 分节。
2. **按上游模型串去重（忽略大小写）**，内置优先 —— 同一串只出现一次。
   - 例：连接里配的 `kling-v2` 已被内置目录覆盖 → 不重复出现，且保留内置项。
   - 例：`本地视频桥（开发）` 与 `xAI Grok Imagine` 共用上游串 `grok-imagine-video` →
     合并列表只保留先出现的 `xAI Grok Imagine`；想走本地桥请在「设置 → 连接」选中
     「本地视频桥（开发）」连接来切换端点（内置目录仍同时列出两条，供目录查阅）。
3. `id` 是**写入值**（沿用既有字段），`key` 才是 React 主键 —— 因此同串项不会撞 key。
4. 合并函数是纯函数，不修改传入的连接数组。

### 为什么音色单独一个合并函数

连接里的 `model` 存的是 **TTS 引擎**（如 `tts-1`），不是音色（`alloy`）。把 `tts-1` 当 `voice`
下发必然被上游拒绝，所以：

- `listMergedAudioModelOptions` → 引擎维度（含 `tts-1` 等）；
- `listMergedAudioVoiceOptions` → 音色维度：内置音色 + 连接里**声明的非引擎值**；
  命中内置引擎名的连接值（`tts-1` / `tts-1-hd` / `gpt-4o-mini-tts`）一律剔除，
  避免造出「选得上、发出去必错」的假选项。

## 4. UI 入口

| 位置 | 文件 | 变化 |
| --- | --- | --- |
| 视频工作台模型下拉 | `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx` | 消费 `mergedOptions`，分「内置模型 / 我的连接 / 配置视频连接…」；选中内置只写 `data.model`，选中连接沿用既有激活逻辑 |
| 通用模型下拉组件 | `.../composer/ComposerModelSelect.tsx` | 新增可选 `groupLabel` / `hint`，分组小节渲染；不传则与旧行为完全一致（其余 4 处调用无需改动） |
| 视频模型 hook | `apps/web/src/hooks/use-connected-video-models.ts` | 新增 `mergedOptions` / `hasBuiltins`；`isKnownModel` 纳入内置目录（否则选中的内置模型会被「回落连接默认模型」逻辑立刻改掉）；`options` / `connected` 等既有返回值语义不变 |
| 配音音色（单轨 TTS） | `apps/web/src/blocks/core/SoundGenBlock.tsx` | `voice` 下拉改为目录驱动，`<optgroup>` 分「内置音色 / 我的连接」；缺省仍是 `alloy`；目录外旧值保留一条「自定义」可回显 |
| 配音音色（多角色） | `apps/web/src/blocks/nx9/VoiceCastBlock.tsx` | 硬编码音色改为消费 `AUDIO_VOICES`（id 未变，仅补中文标签，并补齐 `onyx`） |

写入字段**未变**：视频仍是 node `data.model`；音色仍是 node `data.voice` / `profileMap`；
未新增任何持久化字段。

## 5. 与连接机制的关系

- **连接仍是凭据与端点的唯一来源**：内置项只有模型名，没有 Key / BaseURL。
- 选中内置模型 = 只写节点 `data.model`；随后请求仍按既有逻辑从
  `settings.videoApiKey` / `videoBaseUrl` / 激活连接取端点与密钥。
  若该模型在你的端点不可用，会以**上游报错**的形式失败（NX9 不做静默兜底）。
- 选中连接模型 = 既有行为：激活该连接并回写 `videoApiKey` / `videoBaseUrl` / `videoProvider`，
  同时 patch 节点 `data.model`。
- `DEFAULT_CONNECTIONS` / `BUILTIN_CONNECTION_PRESETS` **未增删任何条目**；
  仅在 `gen-models.ts` 追加了 `listConnectedAudioModels`（音频连接的引擎推导，供合并层使用）。

## 6. 已实现 / 未实现边界

已实现：

- 三张内置目录 + 查询函数（`lookupVideoGenModel` / `lookupLlmModel` / `lookupAudioModel` / `lookupAudioVoice`）。
- 四个合并助手（视频 / 文字 / 音频引擎 / 音色），内置在前、按写入值去重、带 `source` 与分组标题。
- 视频模型下拉、单轨配音音色、多角色配音音色三处接线，分组显示「内置 / 我的连接」。
- 单测 27 例：`apps/web/src/engine/__tests__/builtin-video-models.test.ts`、
  `builtin-llm-audio-models.test.ts`。

未实现（本次范围外 / 有明确理由）：

1. **文字模型下拉未接线**。`use-connected-llm-models` 的 `selectModel` 会同时写
   `llmModel` + `llmApiKey` + `llmBaseUrl` 三个字段；内置项没有配对密钥，直接接线会出现
   「baseUrl 变成厂商端点、Key 还是旧 Key」的错配，属不可接受的回退风险。
   需要先设计「内置项只写 `llmModel`、不动连接/密钥」的方案（且 `ScriptDeskBlock.test.tsx`
   对该 hook 有 mock，需一并评估）。合并助手已就绪，接线是后续一步。
2. **音频 TTS 引擎下拉未接线**。节点侧目前没有 TTS 引擎字段（`api.proxyTts` 支持 `model`，
   但节点未保存该字段）；新增字段会改变已保存数据契约，故只提供数据层与合并助手。
3. **能力位未进入运行时校验**（`supportsReference` / `supportsAudio` / `maxDurationSec` /
   `aspectRatios` 仅作元数据与提示）。
4. **不做厂商串 → 任意网关串的别名映射**：目录里的 `model` 直接下发，网关命名不一致时
   需要用户在「设置 → 连接」里改用自己网关的模型名。
5. `本地视频桥（开发）` 与 `xAI Grok Imagine` 共用上游串，合并列表按串去重（见 §3）。

## 7. 验证方式与已知阻碍

本仓库 `packages/shared/src/index.ts`（barrel）**引用了 9 个当前不存在的 `data/*` 模块**
（既有缺陷，本次未触碰，也未按 AGENTS 规则删除或改写这些 import）。后果：

- `packages/shared` 无法构建，`@nx9/web` 的 `typecheck` / 依赖 barrel 的 vitest 均不可用；
  任何 `import ... from '@nx9/shared'` 的测试会在 Vite 解析阶段直接失败：
  `Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts"`。
- 因此本次新增单测**走相对路径直取 shared 源码**（只依赖本次新增的目录文件），与缺陷解耦。

已执行的隔离验证（非真实构建）：

```bash
# 1) 仅对本次新增/追加的 shared 数据文件做独立 tsc（见 packages/shared/tsconfig.catalog-check.json）
cd packages/shared && npx tsc -p tsconfig.catalog-check.json        # exit 0

# 2) 新增单测
cd apps/web && npx vitest run src/engine/__tests__/builtin-video-models.test.ts \
                              src/engine/__tests__/builtin-llm-audio-models.test.ts   # 27 passed, exit 0
```

`tsconfig.catalog-check.json` 仅覆盖
`gen-models.ts / video-gen-models.ts / llm-models.ts / audio-models.ts / model-catalog.ts`，
不含 UI 层（UI 依赖 barrel，见上）。UI 改动仅做了语法级解析校验。
