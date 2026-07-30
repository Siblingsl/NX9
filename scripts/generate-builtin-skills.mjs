/**
 * Generate full NX9 builtin Skill projects (§1.5 / awesome-skills layout).
 * Usage: node scripts/generate-builtin-skills.mjs
 *
 * Writes skills/<name>/{metadata.json,SKILL.md,references,examples,templates,scripts,tests}
 * Only builtin (main production) skills — no thin stubs, no library packs.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROOT, 'skills');
const NOW = '2026-07-30T08:00:00Z';

function skillMd({ title, description, version, purpose, input, output, workflow, constraints, checklist }) {
  return `---
name: ${title}
title: ${title}
description: ${description}
version: ${version}
---

# ${title}

## 这个 skill 用来做什么
${purpose}

## 输入要求
${input}

## 输出要求
${output}

## 工作流程
${workflow}

## 约束与边界
${constraints}

## 示例
正例与负例见 \`examples/\`：
- \`examples/input.md\` — 黄金输入
- \`examples/output.md\` — 期望输出（契约通过）
- \`examples/bad-output.md\` — 禁止形态（契约失败）
输出骨架见 \`templates/\`；片种与术语见 \`references/\`。

## 检查清单
${checklist}
`;
}

function writeProject(def) {
  const dir = join(SKILLS_DIR, def.name);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  for (const sub of ['', 'references', 'examples', 'templates', 'scripts', 'tests']) {
    mkdirSync(join(dir, sub), { recursive: true });
  }

  const resources = {
    examples: 'examples/',
    references: 'references/',
    templates: 'templates/',
    scripts: 'scripts/',
    tests: 'tests/',
  };

  const meta = {
    name: def.name,
    title: def.title,
    description: def.description,
    version: def.version || '2.0.0',
    entry: 'SKILL.md',
    author: 'nx9',
    status: 'stable',
    language: 'zh-CN',
    updated_at: NOW,
    tags: def.tags,
    compatibility: { nx9: '>=0.1.0' },
    dependencies: [],
    resources,
    nx9: {
      promptId: def.promptId,
      category: def.category,
      priority: def.priority || 'P0',
      lane: 'builtin',
    },
  };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');

  writeFileSync(
    join(dir, 'SKILL.md'),
    skillMd({
      title: def.title,
      description: def.description,
      version: meta.version,
      purpose: def.purpose,
      input: def.input,
      output: def.output,
      workflow: def.workflow,
      constraints: def.constraints,
      checklist: def.checklist,
    }),
    'utf-8',
  );

  writeFileSync(join(dir, 'references', 'domain-notes.md'), def.domainNotes, 'utf-8');
  writeFileSync(join(dir, 'references', 'workflow-rules.md'), def.workflowRules, 'utf-8');
  writeFileSync(join(dir, 'templates', def.templateName || 'output-schema.md'), def.template, 'utf-8');
  if (def.promptPack) {
    writeFileSync(join(dir, 'templates', 'prompt-pack.md'), def.promptPack, 'utf-8');
  }
  writeFileSync(join(dir, 'examples', 'input.md'), def.exampleInput, 'utf-8');
  writeFileSync(join(dir, 'examples', 'output.md'), def.exampleOutput, 'utf-8');
  writeFileSync(join(dir, 'examples', 'bad-output.md'), def.exampleBad, 'utf-8');
  writeFileSync(
    join(dir, 'scripts', 'check_sections.py'),
    `#!/usr/bin/env python3
"""Local structural check for ${def.name}."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "这个 skill 用来做什么", "输入要求", "输出要求",
    "工作流程", "约束与边界", "示例", "检查清单",
]
text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
missing = [s for s in REQUIRED if s not in text]
assert not missing, f"missing sections: {missing}"
assert (ROOT / "metadata.json").exists()
assert (ROOT / "examples" / "input.md").exists()
assert (ROOT / "examples" / "output.md").exists()
print("ok: ${def.name}")
`,
    'utf-8',
  );
  writeFileSync(
    join(dir, 'tests', 'test_metadata.py'),
    `#!/usr/bin/env python3
"""Metadata + layout tests for ${def.name}."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_metadata_name_matches_dir():
    meta = json.loads((ROOT / "metadata.json").read_text(encoding="utf-8"))
    assert meta["name"] == ROOT.name
    assert meta["entry"] == "SKILL.md"
    assert meta["status"] in ("draft", "stable", "deprecated")
    assert len(meta.get("description", "")) >= 20
    assert meta.get("nx9", {}).get("lane") == "builtin"

def test_layout_complete():
    for rel in [
        "SKILL.md", "metadata.json",
        "examples/input.md", "examples/output.md", "examples/bad-output.md",
        "references/domain-notes.md", "references/workflow-rules.md",
        "templates/${def.templateName || 'output-schema.md'}",
        "scripts/check_sections.py", "tests/test_metadata.py",
    ]:
        assert (ROOT / rel).exists(), rel

if __name__ == "__main__":
    test_metadata_name_matches_dir()
    test_layout_complete()
    print("PASS ${def.name}")
`,
    'utf-8',
  );
}

const COMMON_NO_SHOT = `- 禁止输出镜头表、imagePrompt、videoPrompt、sketchPrompt、景别/运镜指令
- 仅输出约定 JSON（可包在 markdown code fence 中），不要长篇解释
- 角色同名唯一；不得无依据新增主线事件`;

const PLATFORM_NOTES = `# 平台与片种语感

| 平台/片种 | 选题与节奏要点 |
|-----------|----------------|
| 抖音/快手短剧 | 3 秒钩子；每集 60–120s；强反转；口语对白 |
| 漫剧/条漫感 | 表情夸张；分格感强；少写实运镜词 |
| 长剧/连续剧 | 人物弧更长；集末钩子服务追剧而非硬卡点 |
| 小红书/种草叙事 | 生活场景锚点；人设清晰；少血腥暴力 |

导演控制中的「图片风格 / 视频风格 / 目标形态」只影响下游分镜语感，本 Skill 仍只写叙事层。
`;

/** @type {Array<object>} */
const SKILLS = [];

function add(def) {
  SKILLS.push(def);
}

// ─── 编剧台 10 ───
add({
  name: 'script-skill-topic',
  title: '选题策划',
  description: '撰写选题标题、logline、目标平台与一句话卖点；禁止镜头表与视觉提示词。',
  promptId: 'sys.script.skill.topic',
  category: 'script-desk',
  tags: ['script', 'topic', 'brief'],
  purpose: `根据用户创意，产出可进入短剧/漫剧工业化流水线的**选题 brief**。本 Skill 只负责选题层（topic / logline / 平台），不写角色、世界观、分集正文或镜头语言。输出为可合并进 \`ScreenplayPackage\` 的 JSON patch。`,
  input: `1. 用户自然语言创意、小说片段或一句话卖点（必填）
2. 可选：目标平台偏好、片种（短剧/漫剧/长剧）、时长预算
3. 可选：当前 \`ScreenplayPackage.brief\` 片段（用于增量改写）
输入不足时先补问核心冲突与受众，再生成；禁止凭空编造与用户意图冲突的题材。`,
  output: `仅输出 JSON patch（字段可部分出现）：
\`\`\`json
{"patch":{"brief":{"topic":"","logline":"","targetPlatforms":[],"title":""}}}
\`\`\`
字段契约：
- \`topic\`：选题标题，建议 ≤10 汉字，可产品化、可检索
- \`logline\`：一句话梗概，建议 ≤25 汉字，含主角+欲望+障碍
- \`targetPlatforms\`：平台名数组，如 \`["抖音","快手"]\`
- \`title\`：可选作品标题
禁令：不得出现镜头表、景别、运镜、imagePrompt、角色档案、分集正文。`,
  workflow: `1. 抽取核心冲突、受众、情绪承诺
2. 按平台差异改写卖点结构（短剧偏钩子，长剧偏人物弧）
3. 压缩 topic / logline 至字数上限且保留信息量
4. 输出 JSON patch，不解释`,
  constraints: `${COMMON_NO_SHOT}
- topic / logline 超长视为失败
- 不预设完整角色表与世界观（交给后续 Skill）
- 平台名使用常见中文产品名，勿写未知英文缩写`,
  checklist: `- [ ] topic ≤10 字且可产品化
- [ ] logline ≤25 字且含冲突
- [ ] targetPlatforms 非空且合法
- [ ] 无镜头/提示词字段
- [ ] 可直接 merge 进 ScreenplayPackage.brief`,
  domainNotes: PLATFORM_NOTES,
  workflowRules: `# 工作规则
1. 先卖点后细节：没有 logline 不写分集。
2. 平台决定节奏承诺，但本 Skill 只写入 platforms，不写 pacing 数值。
3. 用户已给 brief 时做最小 diff patch，勿整包清空。
`,
  template: `# 输出骨架
\`\`\`json
{
  "patch": {
    "brief": {
      "title": "作品标题（可选）",
      "topic": "选题标题",
      "logline": "主角+欲望+障碍",
      "targetPlatforms": ["抖音"]
    }
  }
}
\`\`\`
`,
  exampleInput: `# 黄金输入
都市女主发现合租室友是消失十年的前未婚夫，她要在三十天内查清当年车祸真相，否则家族公司被吞并。
目标平台：抖音短剧。
`,
  exampleOutput: `# 期望输出
\`\`\`json
{"patch":{"brief":{"topic":"合租前夫","logline":"女主与失踪前夫合租，三十天内揭开车祸真相","targetPlatforms":["抖音"],"title":"合租的前夫"}}}
\`\`\`
`,
  exampleBad: `# 禁止输出（负例）
\`\`\`json
{"patch":{"brief":{"topic":"一个很长很长的选题标题超过十字限制而且还夹带镜头：特写推镜头"},"shots":[{"imagePrompt":"close-up"}]}}
\`\`\`
失败原因：超长 topic、夹带镜头语言与 imagePrompt。
`,
});

add({
  name: 'script-skill-world',
  title: '世界观构建',
  description: '产出时代、地点、世界观与可复用视觉规则列表；禁止一句话一新世界与镜头表。',
  promptId: 'sys.script.skill.world',
  category: 'script-desk',
  tags: ['script', 'world', 'bible'],
  purpose: `构建稳定可复用的**故事世界设定**，写入 bible.world，供角色、成稿与拆镜共用。强调规则列表与视觉锚点，禁止碎片化「一句话一个新世界」。`,
  input: `用户创意 / 已有 brief / 原文世界线索。若已有 bible.world，做增量修订。`,
  output: `\`\`\`json
{"patch":{"bible":{"world":{"era":"","location":"","worldview":"","visualStyleNotes":"","rules":[]}}}}
\`\`\`
- \`era\` / \`location\`：稳定字符串
- \`worldview\`：核心设定段落
- \`visualStyleNotes\`：美术与光色总则（仍非镜头表）
- \`rules\`：可执行规则数组（社会、能力、禁忌等）`,
  workflow: `1. 识别时代/地点是否已锁定
2. 提炼 3–8 条硬规则（可被后续一致性检查引用）
3. 写 visualStyleNotes 作为全局美术方向，不写单镜
4. 输出 patch`,
  constraints: `${COMMON_NO_SHOT}
- 禁止无依据新增平行世界支线
- rules 必须可判定，禁止空泛「很有氛围」`,
  checklist: `- [ ] era/location 非空
- [ ] rules ≥3 且可判定
- [ ] 无镜头表字段
- [ ] 与 brief 题材不冲突`,
  domainNotes: `# 世界设定原则
- 同一地点+时间+视觉规则 = 同一场景概念，供下游复用
- 超能力/玄幻必须写清代价与上限
- 当代都市：写清阶层、行业、城市气质即可
`,
  workflowRules: `# 工作规则
1. 先锁定时代地点，再写规则。
2. 规则冲突时以用户最新输入为准并标注。
3. visualStyleNotes 服务一致性，不替代分镜。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"bible":{"world":{"era":"当代","location":"上海","worldview":"…","visualStyleNotes":"冷青都市夜景，霓虹湿路","rules":["禁止公开超能力","家族企业控制舆论"]}}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
赛博朋克港城，义体合法但情绪芯片黑市流通。女主是缉查官，不能公开使用情绪读取。
`,
  exampleOutput: `# 期望输出
\`\`\`json
{"patch":{"bible":{"world":{"era":"近未来","location":"港城","worldview":"义体合法，情绪芯片黑市流通","visualStyleNotes":"雨夜霓虹、湿沥青反光、冷青主调","rules":["公开场合禁止情绪读取","缉查官佩戴可识别徽章","黑市交易仅在下城区"]}}}}
\`\`\`
`,
  exampleBad: `# 禁止输出
把每个句子都建成新世界字段，或输出镜头推拉摇移清单。
`,
});

add({
  name: 'script-skill-character',
  title: '人物构建',
  description: '产出角色六层设定与英文 fixedVisualKeywords；同名唯一；叙事层 draft only。',
  promptId: 'sys.script.skill.character',
  category: 'script-desk',
  tags: ['script', 'character', 'bible'],
  purpose: `为圣经角色层写入可入库的人物卡：身份、外貌、性格、关系、目标、声音，以及下游生图锁定用的 \`fixedVisualKeywords\`（英文）。本步为 draft，不直接改成稿对白。`,
  input: `用户描述的人物 / brief / 原文人物线索。可一次多名，但同名必须合并。`,
  output: `\`\`\`json
{"patch":{"bible":{"characters":[{"name":"","identity":"","appearance":"","personality":"","relationships":"","goal":"","voiceNotes":"","fixedVisualKeywords":""}]}}}
\`\`\`
六层 + 视觉锚点均需尽量完整；\`fixedVisualKeywords\` 为英文逗号分隔关键词串。`,
  workflow: `1. 列出角色并消解同名冲突
2. 填六层叙事字段
3. 从外貌提炼英文视觉锚点（发型、服装标志、年龄感、体型）
4. 输出 characters 数组 patch`,
  constraints: `${COMMON_NO_SHOT}
- 同名角色只能有一条档案
- 不写分镜、不写定妆图完整 sheet 排版指令（那是 gen-character-sheet-master）
- 叙事层 draft only，不直接覆盖 screenplay.episodes 正文`,
  checklist: `- [ ] 每名角色 name 唯一
- [ ] 六层字段齐全或标明未知
- [ ] fixedVisualKeywords 为英文
- [ ] 无镜头表`,
  domainNotes: `# 人物六层
1 identity 身份 2 appearance 外貌 3 personality 性格
4 relationships 关系 5 goal 目标 6 voiceNotes 说话方式
fixedVisualKeywords 供拆镜/生图锁定 ID，勿写剧情。
`,
  workflowRules: `# 工作规则
1. 主角优先完整，配角可短但必须有视觉锚点。
2. 关系网用「对谁：关系」短句。
3. 禁止用「好看/帅气」代替具体外貌。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"bible":{"characters":[{"name":"林晚","identity":"缉查官","appearance":"短发，左眉疤","personality":"冷静克制","relationships":"对顾衡：旧识反目","goal":"查清芯片案","voiceNotes":"短句，少修辞","fixedVisualKeywords":"short black hair, left brow scar, navy tactical coat, mid-20s East Asian woman"}]}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
女主林晚，二十多岁缉查官，短发左眉疤，冷静，与顾衡是旧识反目。
`,
  exampleOutput: `# 期望输出
见 templates 骨架中的林晚条目（可直接作为正例）。
`,
  exampleBad: `# 禁止输出
\`\`\`json
{"characters":[{"name":"林晚","appearance":"很美"},{"name":"林晚","appearance":"长发"}]}
\`\`\`
失败：同名分裂 + 外貌空泛。
`,
});

add({
  name: 'script-skill-plot',
  title: '剧情构建',
  description: '产出起承转合大纲与分集数；对齐 brief 契约；禁止镜头表。',
  promptId: 'sys.script.skill.plot',
  category: 'script-desk',
  tags: ['script', 'plot', 'brief'],
  purpose: `把选题与世界落成可分集的剧情大纲（plotOutline）与 episodeCount，服务后续 generate / breakdown。`,
  input: `brief（topic/logline）+ bible 摘要 + 用户补充剧情。`,
  output: `\`\`\`json
{"patch":{"brief":{"plotOutline":"","episodeCount":1}}}
\`\`\`
plotOutline 需含起承转合与集边界提示；episodeCount 为正整数。`,
  workflow: `1. 对齐 logline 冲突
2. 划集边界（每集戏剧弧）
3. 写 outline 文本
4. 给出推荐集数`,
  constraints: `${COMMON_NO_SHOT}
- 不把多集剧情压进一集描述却把 episodeCount 写成 1（除非用户明确单集）
- 禁止无依据大结局剧透式扩写与用户冲突的新主线`,
  checklist: `- [ ] plotOutline 含起承转合
- [ ] episodeCount ≥1
- [ ] 与 logline 一致
- [ ] 无镜头语言`,
  domainNotes: PLATFORM_NOTES,
  workflowRules: `# 工作规则
短剧：每集一个核心情节点 + 集末钩子。
长剧：每集 2–3 情节点，钩子服务追剧。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"brief":{"plotOutline":"起：…\\n承：…\\n转：…\\n合：…","episodeCount":8}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
沿用「合租前夫」logline，要 8 集短剧大纲。
`,
  exampleOutput: `# 期望输出
\`\`\`json
{"patch":{"brief":{"plotOutline":"起：合租暴露身份\\n承：追查车祸线索\\n转：家族内鬼现身\\n合：对峙与真相","episodeCount":8}}}
\`\`\`
`,
  exampleBad: `# 禁止输出
只有流水账事件列表、无集边界，或夹带「特写推镜头」。
`,
});

add({
  name: 'script-skill-pacing',
  title: '节奏构建',
  description: '定义 balanced/slow/fast 与单集目标时长；对齐平台；禁止镜头表。',
  promptId: 'sys.script.skill.pacing',
  category: 'script-desk',
  tags: ['script', 'pacing', 'brief'],
  purpose: `写入节奏策略与单集时长预算，约束后续对白密度与拆镜时长。`,
  input: `brief 平台信息 + 用户对快慢的要求。`,
  output: `\`\`\`json
{"patch":{"brief":{"pacing":"balanced|slow|fast","targetEpisodeDurationSec":90}}}
\`\`\`
pacing 仅允许三枚举；时长为正整数秒。`,
  workflow: `1. 读平台与片种
2. 映射到 pacing 枚举
3. 给出 targetEpisodeDurationSec
4. 输出 patch`,
  constraints: `${COMMON_NO_SHOT}
- pacing 不得写自由文本
- 时长须合理（短剧通常 60–180）`,
  checklist: `- [ ] pacing ∈ balanced|slow|fast
- [ ] durationSec 合理
- [ ] 与平台匹配`,
  domainNotes: `# pacing 定义
- fast：高密度钩子，少喘息
- balanced：冲突与喘息交替
- slow：人物与氛围优先，仍须有推进
`,
  workflowRules: `# 工作规则
抖音短剧默认 fast 或 balanced + 90s。
漫剧可略慢但仍须可视冲突。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"brief":{"pacing":"fast","targetEpisodeDurationSec":90}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
抖音短剧，要爽感强、少铺垫。
`,
  exampleOutput: `# 期望输出
\`\`\`json
{"patch":{"brief":{"pacing":"fast","targetEpisodeDurationSec":75}}}
\`\`\`
`,
  exampleBad: `# 禁止输出
\`\`\`json
{"patch":{"brief":{"pacing":"中速偏快一点"}}}
\`\`\`
`,
});

add({
  name: 'script-skill-dialogue',
  title: '对白构建',
  description: '改写成稿对白层：说话人、情绪、可演口语；不写镜头语言。',
  promptId: 'sys.script.skill.dialogue',
  category: 'script-desk',
  tags: ['script', 'dialogue', 'screenplay'],
  purpose: `在已有分集正文上强化对白：可演、可标注说话人与情绪，推动情节，禁止镜头语言。`,
  input: `当前 screenplay.episodes + bible 角色声音笔记 + 用户指示。`,
  output: `\`\`\`json
{"patch":{"screenplay":{"episodes":[{"id":"保留或新id","index":1,"title":"","bodyMd":"含对白的正文"}],"sourceType":"generated"}}}
\`\`\`
bodyMd 使用场景头 + 动作 + \`角色：（情绪）台词\` 格式。`,
  workflow: `1. 读取角色 voiceNotes
2. 按场改写对白密度
3. 去掉镜头词
4. 输出 episodes patch`,
  constraints: `${COMMON_NO_SHOT}
- 对白必须可朗读，禁止大段心理独白代替台词（可转动作/表情）
- 保留场次结构，勿无故合并毁掉因果`,
  checklist: `- [ ] 每句对白有说话人
- [ ] 情绪标注合理
- [ ] 无景别运镜词
- [ ] sourceType 合理`,
  domainNotes: `# 对白格式
\`角色名：（情绪）台词\`
旁白用「旁白：」或动作段，勿与角色音色混淆。
`,
  workflowRules: `# 工作规则
1. 一句一对白意图。
2. 冲突场提高对白密度，过渡场用动作。
3. 方言仅在人物设定允许时使用。
`,
  template: `# 输出骨架（bodyMd 片段）
\`\`\`md
## S01 | 内景 · 合租客厅 | 夜
林晚关上门。
林晚：（压抑）你到底是什么时候搬进来的？
顾衡：（平静）比你早三天。
\`\`\`
`,
  exampleInput: `# 黄金输入
第1集正文过虚，请加强林晚与顾衡对峙对白，保持短剧口语。
`,
  exampleOutput: `# 期望输出
JSON patch，episodes[0].bodyMd 含带情绪标注的对白，无镜头词。
`,
  exampleBad: `# 禁止输出
\`特写林晚眼睛，推镜头，她说：你是谁？\`
`,
});

add({
  name: 'script-skill-hooks',
  title: '爆点构建',
  description: '产出可落画面的钩子列表；区分集末钩子与付费卡点；禁止镜头表。',
  promptId: 'sys.script.skill.hooks',
  category: 'script-desk',
  tags: ['script', 'hooks', 'brief'],
  purpose: `生成 brief.hooks：每条钩子必须可拍、可感知，并区分追剧钩子与付费卡点语义。`,
  input: `plotOutline + 分集信息 + 平台。`,
  output: `\`\`\`json
{"patch":{"brief":{"hooks":["钩子1"]}}}
\`\`\`
每条为短句，写清「谁在什么处境下发生什么可见转折」。`,
  workflow: `1. 按集扫描高潮点
2. 过滤不可视抽象句
3. 标注付费卡点候选（文案内可括号注明）
4. 输出 hooks 数组`,
  constraints: `${COMMON_NO_SHOT}
- 禁止空泛「更有悬念」
- 钩子必须可落画面`,
  checklist: `- [ ] hooks 非空
- [ ] 每条可拍
- [ ] 无镜头技术词堆砌`,
  domainNotes: `# 钩子类型
- 集末钩子：迫使点下一集
- 付费卡点：高信息揭露前切断（产品策略，文案需克制）
`,
  workflowRules: `# 工作规则
优先「关系反转 / 身份暴露 / 倒计时压迫」三类可视钩子。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"brief":{"hooks":["第3集末：保险柜打开，里面是女主的死亡证明","第6集：顾衡当众叫出她的旧姓"]}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
8 集短剧，需要每 2 集一个强钩子。
`,
  exampleOutput: `# 期望输出
至少 4 条可拍钩子，写入 brief.hooks。
`,
  exampleBad: `# 禁止输出
\`["增加一点张力","电影感爆发"]\`
`,
});

add({
  name: 'script-skill-consistency',
  title: '叙事一致性审稿',
  description: '只诊断不改正文；输出 diagnostics 分级与 code 枚举；禁止镜头表。',
  promptId: 'sys.script.skill.consistency',
  category: 'script-desk',
  tags: ['script', 'consistency', 'qa'],
  purpose: `审查 ScreenplayPackage 的人物、时间线、世界规则与对白一致性，只输出 diagnostics，不改写正文。`,
  input: `完整或局部 ScreenplayPackage（brief/bible/screenplay）。`,
  output: `\`\`\`json
{"diagnostics":[{"level":"warning|error|info","code":"","message":""}]}
\`\`\`
不得返回改写后的 episodes。`,
  workflow: `1. 建角色/时间/规则索引
2. 扫描矛盾
3. 分级（error/warning/info）并给稳定 code
4. 只输出 diagnostics`,
  constraints: `- 禁止修改 screenplay 正文
- 禁止输出镜头表
- code 使用短横线英文，如 character-name-drift`,
  checklist: `- [ ] 仅 diagnostics
- [ ] level 合法
- [ ] code 非空
- [ ] 未改写正文`,
  domainNotes: `# 常见 code
- character-name-drift
- timeline-contradiction
- world-rule-break
- relationship-inconsistency
- missing-speaker
`,
  workflowRules: `# 工作规则
error：阻断下游生产；warning：建议修；info：提示。
不确定时用 warning 而非臆造 error。
`,
  template: `# 输出骨架
\`\`\`json
{"diagnostics":[{"level":"error","code":"character-name-drift","message":"第2集出现「小林」疑似林晚异名"}]}
\`\`\`
`,
  exampleInput: `# 黄金输入
同一包内第1集林晚短发，第3集无解释变为长发；规则写禁止公开超能力但她当众读取情绪。
`,
  exampleOutput: `# 期望输出
至少两条 diagnostics（外观漂移 + 世界规则破坏）。
`,
  exampleBad: `# 禁止输出
直接返回改写后的 bodyMd，或空数组却明显有矛盾。
`,
});

add({
  name: 'script-skill-generate',
  title: '分集成稿生成',
  description: '根据 brief/bible 生成场次+动作+对白分集正文；禁 imagePrompt/镜头表；对齐 bible。',
  promptId: 'sys.script.skill.generate',
  category: 'script-desk',
  tags: ['script', 'generate', 'screenplay'],
  purpose: `生成或重写 \`screenplay.episodes\` 成稿：场景头、动作、对白，对齐 bible 与 brief，禁止视觉提示词与镜头表。`,
  input: `brief + bible + 用户集数/倾向。`,
  output: `\`\`\`json
{"patch":{"brief":{"title":""},"screenplay":{"sourceType":"generated","episodes":[{"index":1,"title":"第1集","bodyMd":"场次+动作+对白"}]}}}
\`\`\`
`,
  workflow: `1. 锁定集数与每集戏剧弧
2. 按 bible 稳定角色名与世界规则
3. 写 bodyMd（无镜头词）
4. 输出 patch`,
  constraints: `${COMMON_NO_SHOT}
- 禁止 imagePrompt / videoPrompt / sketchPrompt
- 角色名必须与 bible 一致
- 每集须有开场钩子与集末钩子（短剧）`,
  checklist: `- [ ] episodes 非空
- [ ] bodyMd 含场次与对白
- [ ] 无提示词字段
- [ ] 对齐 bible`,
  domainNotes: PLATFORM_NOTES,
  workflowRules: `# 工作规则
场景头：\`## S编号 | 内景/外景 · 地点 | 时间\`
动作自然段；对白带说话人。
`,
  template: `# 输出骨架
见输出要求 JSON；bodyMd 参考 script-skill-dialogue 模板。
`,
  exampleInput: `# 黄金输入
按现有 brief/bible 生成第1集，约 90 秒可演长度。
`,
  exampleOutput: `# 期望输出
episodes[0] 含完整 bodyMd，sourceType=generated。
`,
  exampleBad: `# 禁止输出
正文中夹带 imagePrompt 或「特写/推镜头」技术表。
`,
});

add({
  name: 'script-skill-ingest',
  title: '成稿解析入库',
  description: '将用户粘贴文本保真整理为分集正文；sourceType=pasted；禁止镜头表。',
  promptId: 'sys.script.skill.ingest',
  category: 'script-desk',
  tags: ['script', 'ingest', 'screenplay'],
  purpose: `把用户粘贴的剧本/小说整理为分集 \`screenplay\`，保真优先，\`sourceType\` 固定为 \`pasted\`。`,
  input: `用户粘贴长文本；可选分集提示。`,
  output: `\`\`\`json
{"patch":{"screenplay":{"sourceType":"pasted","episodes":[{"index":1,"title":"第1集","bodyMd":"..."}]}}}
\`\`\`
`,
  workflow: `1. 识别已有分集标记或合理切分
2. 规范化场景头与对白格式（不改情节）
3. sourceType=pasted
4. 输出`,
  constraints: `${COMMON_NO_SHOT}
- 禁止大幅改写剧情（那是 generate/rewriter）
- 保真：人名、关键对白、因果不得丢`,
  checklist: `- [ ] sourceType=pasted
- [ ] 保真
- [ ] 无镜头表`,
  domainNotes: `# 保真原则
可修格式，不可改结局与关系实质。
`,
  workflowRules: `# 工作规则
无明确分集时按章节或强转折切分，并在 title 标明。
`,
  template: `# 输出骨架
\`\`\`json
{"patch":{"screenplay":{"sourceType":"pasted","episodes":[{"index":1,"title":"第1集","bodyMd":"…"}]}}}
\`\`\`
`,
  exampleInput: `# 黄金输入
（粘贴带「第1集」「第2集」标题的剧本文本）
`,
  exampleOutput: `# 期望输出
两集 episodes，sourceType pasted，正文保真。
`,
  exampleBad: `# 禁止输出
擅自改结局或 sourceType=generated。
`,
});

// ─── Breakdown ───
add({
  name: 'breakdown-episode-planner',
  title: '多集项目蓝图规划',
  description: '把原文规划为可进入分镜生产的多集项目蓝图：戏剧弧、角色档案、场景复用；仅 JSON。',
  promptId: 'sys.breakdown.episode-planner',
  category: 'storyboard-desk',
  tags: ['breakdown', 'planner', 'episodes'],
  purpose: `你是项目架构师（导演/分镜/编剧 overlapping）。把原文规划成可直接进入分镜生产的多集蓝图：忠于事实与因果，每集可拍戏剧弧，角色与场景稳定可复用。`,
  input: `原文/剧本文本 + 可选导演控制（片种、风格、目标形态）+ 集数上限策略。`,
  output: `仅输出 JSON 对象（不要 markdown 解释）。必须包含：故事整体分析、分集列表（钩子→推进→冲突→集末钩子）、角色候选档案（含 fixedVisualKeywords 英文）、可复用场景概念、幕/章节戏剧骨架。字段以 NX9 ScriptBreakdown 规划契约为准。`,
  workflow: `1. 识别人物目标、障碍、反转与情绪拐点（禁止按标点切分）
2. 决定集边界；短文也要补齐可拍结构且不与原文冲突
3. 写稳定角色档案与场景复用规则
4. 仅输出 JSON`,
  constraints: `- 禁止把不同分集剧情压进同一集
- 禁止无依据新增主线事件
- 同名角色唯一；场景禁止一句话一个新场景
- 仅 JSON，无解释`,
  checklist: `- [ ] 每集戏剧弧完整
- [ ] 角色含 fixedVisualKeywords
- [ ] 场景可复用
- [ ] 纯 JSON`,
  domainNotes: PLATFORM_NOTES + `\n片种语感影响后续 shots，本步先锁叙事蓝图。\n`,
  workflowRules: `# 工作规则
先戏剧后字数；角色与场景只输出候选设定，不假定已入库。
`,
  template: `# JSON 规划骨架（示意）
\`\`\`json
{"title":"","storyAnalysis":{},"episodes":[{"index":1,"title":"","hook":"","goal":"","conflict":"","endingHook":""}],"characters":[],"scenes":[]}
\`\`\`
`,
  exampleInput: `# 黄金输入
短篇：女督察调查义体黑市，发现上司就是幕后。要 6 集短剧蓝图。
`,
  exampleOutput: `# 期望输出
纯 JSON，含 6 集弧与角色/场景候选，无 markdown 包裹说明。
`,
  exampleBad: `# 禁止输出
按自然段切成「第1段/第2段」冒充分集；或输出散文大纲。
`,
});

add({
  name: 'breakdown-episode-shots',
  title: '单集分镜拆解',
  description: '将指定单集拆成场景与可生产镜头；三层 Prompt；audiovisualLanguage 完整叙事句；禁标签罗列。',
  promptId: 'sys.breakdown.episode-shots',
  category: 'storyboard-desk',
  tags: ['breakdown', 'shots', 'storyboard'],
  purpose: `专业分镜导演 + AI 视觉提示词工程师：把**指定单集**拆成场景再拆镜头；每镜可拍、资产一致，并输出 image/video/sketch Prompt 与视听语言叙事句。`,
  input: `单集正文 + 规划蓝图中的角色/场景档案 + 导演控制风格。严禁混入其他分集。`,
  output: `仅 JSON。每镜必须含：purpose、visual、action、sound、audiovisualLanguage、imagePrompt、videoPrompt、sketchPrompt；角色名稳定；对白标注说话人与情绪。
audiovisualLanguage：1～3 句中文完整镜头叙事，禁止只罗列「特写/推镜头」标签。
imagePrompt 英文单帧；videoPrompt 可驱动图生视频；sketchPrompt 黑白线稿构图。`,
  workflow: `1. 按戏剧目的切场景（非按句号）
2. 场景内设计镜头，可合并多句或拆关键动作
3. 注入 fixedVisualKeywords 与场景锚点
4. 按片种选择语感写 audiovisualLanguage 与三层 Prompt
5. 仅输出 JSON`,
  constraints: `- 严禁其他分集内容
- Prompt 禁止「同上/参考前文」
- 连续镜头保持服装、朝向、光线延续
- sketch 不写颜色与最终质感`,
  checklist: `- [ ] 每镜字段齐全
- [ ] audiovisualLanguage 非标签列表
- [ ] 三层 Prompt 独立可执行
- [ ] 资产名稳定`,
  domainNotes: `# 片种语感
真人：摄影与材质；动漫：线、影、速度线；国漫：烟尘光雾器物质感。
`,
  workflowRules: `# 视听语言结构建议
运镜景别如何服务情绪 → 关键帧信息 → 光色材质 → 可选声画同步。
`,
  template: `# 单镜字段骨架
\`\`\`json
{"id":"s1","purpose":"","visual":"","action":"","sound":"","audiovisualLanguage":"","imagePrompt":"","videoPrompt":"","sketchPrompt":"","characters":[],"scene":""}
\`\`\`
`,
  exampleInput: `# 黄金输入
仅第2集：林晚在雨夜天台对峙顾衡。风格：真人写实。
`,
  exampleOutput: `# 期望输出
JSON 含多镜；某镜 audiovisualLanguage 为完整句子；imagePrompt 含角色英文锚点。
`,
  exampleBad: `# 禁止输出
\`audiovisualLanguage":"特写，推镜头，平视，长焦"\` 或混入第3集剧情。
`,
});

// ─── Agent 管线 ───
const agentDefs = [
  {
    name: 'agent-dialogue-extract',
    title: '对白提取',
    description: '从剧本/小说提取全部对白行并标注说话人与情绪，供配音与校对。',
    promptId: 'sys.agent.dialogue-extract',
    category: 'agent',
    tags: ['agent', 'dialogue'],
    purpose: '抽取文本中所有对白，结构化标注说话人，不改写剧情。',
    input: '剧本或小说文本。',
    output: 'JSON：`{"lines":[{"speaker":"","emotion":"","text":"","episodeHint":""}]}`',
    workflow: '扫描引号/剧本对白格式 → 消解说话人 → 输出数组。',
    constraints: '不编造对白；不确定说话人时用 unknown 并 warning。',
    checklist: '- [ ] 不漏关键对白\n- [ ] speaker 字段存在',
    schema: '{"lines":[{"speaker":"林晚","emotion":"压抑","text":"你到底是谁？"}]}',
  },
  {
    name: 'agent-shot-script',
    title: '分镜脚本改写',
    description: '将小说/章节改写为分镜脚本行；默认禁止镜头技术堆砌，保持可演叙事。',
    promptId: 'sys.agent.shot-script',
    category: 'agent',
    tags: ['agent', 'shot-script'],
    purpose: '产出分镜脚本行（场次/画面叙述/对白），与 script-skill-generate 一致默认禁止纯镜头技术表。',
    input: '小说或章节。',
    output: 'JSON 行数组或 Markdown 分镜脚本；含场次、画面叙述、对白。',
    workflow: '切场 → 写可拍叙述 → 对白 → 自检无技术标签堆砌。',
    constraints: '禁止只输出景别运镜词表；不编造与原文冲突主线。',
    checklist: '- [ ] 可拍\n- [ ] 对白有说话人',
    schema: '{"rows":[{"scene":"S01","visual":"…","dialogue":"…"}]}',
  },
  {
    name: 'script-skeleton',
    title: '故事骨架',
    description: '分析文本输出三幕结构、分集数与付费/悬念卡点，供改编前置。',
    promptId: 'sys.script.skill.skeleton',
    category: 'agent',
    tags: ['script', 'structure'],
    purpose: '输出 title/logline/acts/episodeCount/hookPoints 结构化骨架。',
    input: '故事或章节。',
    output: 'JSON：title, logline, acts[{name,beats}], episodeCount, hookPoints[]',
    workflow: '定主题 → 三幕 → 节拍 → 集数与卡点。',
    constraints: '短剧每集 1 核心点；长剧每集 2–3 点。',
    checklist: '- [ ] 三幕齐全\n- [ ] episodeCount 合理',
    schema: '{"title":"","logline":"","acts":[],"episodeCount":6,"hookPoints":[]}',
  },
  {
    name: 'agent-adaptation',
    title: '改编策略',
    description: '分析小说/大纲并输出改编策略：删改重点、集数、受众与风险。',
    promptId: 'sys.agent.adaptation',
    category: 'agent',
    tags: ['agent', 'adaptation'],
    purpose: '产出可执行改编策略，而非直接长成稿。',
    input: '小说/大纲。',
    output: 'JSON：strategy, keep[], cut[], amplify[], risk[], recommendedEpisodes',
    workflow: '抓主线 → 评估可拍性 → 列出删留扩 → 风险。',
    constraints: '不直接输出完整剧本正文。',
    checklist: '- [ ] 有 keep/cut\n- [ ] 有风险',
    schema: '{"strategy":"","keep":[],"cut":[],"amplify":[],"risk":[],"recommendedEpisodes":8}',
  },
  {
    name: 'agent-screenplay',
    title: '分集剧本写作',
    description: '根据改编策略与原文写出分集剧本；场次+动作+对白；禁镜头表。',
    promptId: 'sys.agent.screenplay',
    category: 'agent',
    tags: ['agent', 'screenplay'],
    purpose: '把策略落地为分集剧本正文。',
    input: '改编策略 + 原文要点。',
    output: '分集 bodyMd 或 JSON episodes；无 imagePrompt。',
    workflow: '按集写戏剧弧 → 场次 → 对白。',
    constraints: COMMON_NO_SHOT,
    checklist: '- [ ] 分集完整\n- [ ] 无镜头表',
    schema: '{"episodes":[{"index":1,"title":"第1集","bodyMd":"…"}]}',
  },
  {
    name: 'agent-director-plan',
    title: '导演规划',
    description: '根据剧本草拟导演规划：风格、节奏、重点场、视觉母题。',
    promptId: 'sys.agent.director-plan',
    category: 'agent',
    tags: ['agent', 'director'],
    purpose: '输出导演阐述级规划，指导拆镜与生成，不代替分镜表。',
    input: '剧本或大纲。',
    output: 'JSON：artDirection, cameraStyle, pacing, keySequences[], visualMotifs[]',
    workflow: '读剧本情绪曲线 → 定风格 → 标重点场。',
    constraints: '不输出逐镜表；不写具体 imagePrompt 全文。',
    checklist: '- [ ] 有 artDirection\n- [ ] 有 keySequences',
    schema: '{"artDirection":"","cameraStyle":"","pacing":"","keySequences":[],"visualMotifs":[]}',
  },
  {
    name: 'agent-extract-assets',
    title: '资产抽取',
    description: '从文本提取角色与场景，并为角色填写六层设定与视觉锚点。',
    promptId: 'sys.agent.extract-assets',
    category: 'agent',
    tags: ['agent', 'assets'],
    purpose: '产出可入库的角色/场景候选列表。',
    input: '剧本/小说。',
    output: 'JSON：characters[]（六层+fixedVisualKeywords）, environments[]',
    workflow: '扫实体 → 合并同名 → 补六层 → 场景概念去重。',
    constraints: '同名唯一；场景按地点+时间+光色合并。',
    checklist: '- [ ] 角色有锚点\n- [ ] 场景可复用',
    schema: '{"characters":[],"environments":[]}',
  },
  {
    name: 'agent-novel-events',
    title: '章节事件提取',
    description: '分析长篇文本，提取每章关键事件、人物与因果，供分集规划。',
    promptId: 'sys.agent.novel-events',
    category: 'agent',
    tags: ['agent', 'events'],
    purpose: '章节级事件表，服务 planner。',
    input: '长篇或多章文本。',
    output: 'JSON：chapters[{index,title,events[],characters[],causality}]',
    workflow: '按章切 → 抽事件 → 标因果。',
    constraints: '不改写为剧本；不丢关键反转。',
    checklist: '- [ ] 每章有 events\n- [ ] 因果可读',
    schema: '{"chapters":[{"index":1,"title":"","events":[],"characters":[],"causality":""}]}',
  },
  {
    name: 'agent-scene-split',
    title: '场次拆分',
    description: '将剧本/小说按场次拆分，输出稳定场景头与正文块。',
    promptId: 'sys.agent.scene-split',
    category: 'agent',
    tags: ['agent', 'scenes'],
    purpose: '场次结构化，供环境卡与分镜。',
    input: '剧本/小说。',
    output: 'JSON：scenes[{code,intExt,location,time,body}]',
    workflow: '识别时空变化 → 切场 → 编号 S01…',
    constraints: '禁止一句话一新场；合并同时空。',
    checklist: '- [ ] code 连续\n- [ ] location 清晰',
    schema: '{"scenes":[{"code":"S01","intExt":"内","location":"客厅","time":"夜","body":"…"}]}',
  },
  {
    name: 'agent-environments',
    title: '环境卡生成',
    description: '为场次生成环境卡：空间、光色、道具锚点与可复用视觉规则。',
    promptId: 'sys.agent.environments',
    category: 'agent',
    tags: ['agent', 'environment'],
    purpose: '环境设定卡，对齐下游场景生图。',
    input: '场次列表或剧本。',
    output: 'JSON：environments[{name,sceneCode,time,lighting,palette,props,rules}]',
    workflow: '聚类同场景 → 写光色道具 → 去重。',
    constraints: '不写镜头表；不一人一景无共用。',
    checklist: '- [ ] 光色明确\n- [ ] 可复用',
    schema: '{"environments":[{"name":"合租客厅","sceneCode":"S01","lighting":"暖黄台灯","palette":"木色/灰","props":["沙发"],"rules":["夜戏主灯偏暖"]}]}',
  },
  {
    name: 'production-storyboard-table',
    title: '分镜表',
    description: '根据导演规划或剧本生成可执行分镜表，每行一镜，含景别运镜时长与描述。',
    promptId: 'sys.production.storyboard-table',
    category: 'storyboard-desk',
    tags: ['storyboard', 'table'],
    purpose: '输出生产用分镜表行，供审核与生成节点消费。',
    input: '导演规划或剧本。',
    output: 'JSON 数组行：id,group,shotSize,cameraMove,durationSec,descriptionZh,dialogue,sfx,videoDesc,associateAssetIds',
    workflow: '按情绪转折分镜 → 首镜定调 → 连续检查 → 控时长。',
    constraints: '一镜一动作；运镜可执行；单组 ≤15s；相邻镜连续。',
    checklist: '- [ ] 行字段齐全\n- [ ] 时长合理\n- [ ] 连续性',
    schema: '[{"id":"1","group":"S01","shotSize":"CU","cameraMove":"推","durationSec":4,"descriptionZh":"…","dialogue":"","sfx":"","videoDesc":"","associateAssetIds":[]}]',
  },
];

for (const a of agentDefs) {
  add({
    name: a.name,
    title: a.title,
    description: a.description,
    promptId: a.promptId,
    category: a.category,
    tags: a.tags,
    purpose: a.purpose,
    input: a.input,
    output: `${a.output}\n\n骨架：\n\`\`\`json\n${a.schema}\n\`\`\``,
    workflow: a.workflow,
    constraints: a.constraints,
    checklist: a.checklist,
    domainNotes: `# 领域说明\n${a.title} 属于 NX9 Agent/生产管线。运行时由 SkillsService 注入 SKILL.md 正文。\n`,
    workflowRules: `# 工作规则\n${a.workflow}\n失败时返回可诊断错误，勿静默编造。\n`,
    template: `# 输出骨架\n\`\`\`json\n${a.schema}\n\`\`\`\n`,
    exampleInput: `# 黄金输入\n（提供与「${a.title}」匹配的短样本文本）\n`,
    exampleOutput: `# 期望输出\n符合契约的 JSON，可被下游解析。\n\`\`\`json\n${a.schema}\n\`\`\`\n`,
    exampleBad: `# 禁止输出\n散文解释代替 JSON；或字段缺失的空壳。\n`,
  });
}

// ─── Gen templates ───
add({
  name: 'gen-studio-image',
  title: '制作台关键帧提示词',
  description: '专业分镜关键帧英文提示词：景别运镜、角色/环境一致性、质量句与约束；单帧可执行。',
  promptId: 'gen.studio.image',
  category: 'gen',
  tags: ['gen', 'image', 'studio'],
  purpose: '权威文案与样例来源，供 studio-prompt-builder 对齐；拼装器可读 templates。',
  input: '镜头描述、角色档案、环境、艺术方向、景别运镜。',
  output: '英文多行提示词：质量句 + 景别 + 运镜 + Scene content + Lighting + Art direction + Constraints（单帧、无水印、无多格）。',
  workflow: '锁主体与连续性 → 补摄影语言 → 注入角色/环境 enrich → 加约束尾句。',
  constraints: '单帧；无 UI/水印/箭头标注；身份与服装连续。',
  checklist: '- [ ] 英文可执行\n- [ ] 含质量与约束\n- [ ] 无多格拼贴词',
  domainNotes: `# 结构\nSubject + Action + Environment + Camera + Lighting + Style + Quality\n`,
  workflowRules: `# 工作规则\n优先 shot.imagePromptPro；否则 descriptionZh；再 enrich 角色环境。\n`,
  template: `# 模板
Professional storyboard keyframe, single cinematic still frame...
{shotSize}
{camera}
Scene content: {subject}
Lighting: {lighting}
Art direction: {art}
Constraints: consistent character identity..., single frame only, no watermark...
`,
  promptPack: `## quality
Professional storyboard keyframe, single cinematic still frame, high narrative clarity, production quality, locked character/environment continuity.

## constraints
Constraints: consistent character identity across franchise bible, coherent environment continuity, keep environment realistic, single frame only, no watermark, no UI chrome, no multi-panel grid, no text overlay, no arrows, no colored guide lines, no annotation labels, no timestamps.
`,
  exampleInput: `# 输入
中景，雨夜天台，林晚对峙，冷青光，真人写实。
`,
  exampleOutput: `# 输出
Professional storyboard keyframe... medium shot... Scene content: ... rainy rooftop confrontation...
`,
  exampleBad: `# 负例
\`同上，保持刚才风格\` 或要求 multi-panel grid。
`,
});

add({
  name: 'gen-studio-video',
  title: '制作台视频提示词',
  description: '图生/文生视频提示词：起幅、动作过程、运镜动机、情绪曲线与连续性约束。',
  promptId: 'gen.studio.video',
  category: 'gen',
  tags: ['gen', 'video', 'studio'],
  purpose: '连续镜头视频提示词权威样例与规则包。',
  input: '镜头、时长、运镜、角色环境、首帧约束。',
  output: '英文视频提示：时长意图、景别、Camera、Action & performance、光色连续、Constraints（身份锁定、无跳切）。',
  workflow: '定时长 → 动机运镜 → 动作情绪 → 连续约束；参考箭头只作意图不渲染。',
  constraints: '保持首帧身份服装；无字幕/UI；无把参考箭头画进成片。',
  checklist: '- [ ] 有动作过程\n- [ ] 有运镜动机\n- [ ] 身份锁定句',
  domainNotes: `# 模型方言\n不同视频模型对时长与运镜词敏感度不同；保持一句一动作。\n`,
  workflowRules: `# 工作规则\nvideoPromptPro > videoPromptEn > descriptionZh。\n`,
  template: `# 模板
Cinematic continuous shot...
Duration intent: about {n} seconds.
Camera: {move}
Action & performance: {action}
Constraints: maintain character identity...
`,
  promptPack: `## quality
Cinematic continuous shot, natural motion, production-ready short clip, identity-locked from first frame.

## constraints
Constraints: maintain character identity and costume from first frame, continuous motivated camera, no jump cuts, no text overlay, filmic motion blur only when motivated, keep spatial continuity, keep environment realistic.
Guide policy: reference may include colored director arrows/marks (red=action, blue=camera, orange=light, green=compose, purple=emotion). Use them only as motion/staging intent. Never render arrows, guide lines, labels, or timestamps in any video frame.
`,
  exampleInput: `# 输入
4 秒，缓推，林晚上前质问，雨势加大。
`,
  exampleOutput: `# 输出
含 Duration / Camera / Action / Constraints 的英文段落。
`,
  exampleBad: `# 负例
只写「电影感大片」无动作。
`,
});

add({
  name: 'gen-studio-sketch',
  title: '制作台线稿提示词',
  description: '黑白线稿分镜构图提示词：站位、层次、轮廓；禁止色彩与最终渲染。',
  promptId: 'gen.studio.sketch',
  category: 'gen',
  tags: ['gen', 'sketch', 'studio'],
  purpose: '构图确认用线稿 Prompt，避免污染成图。',
  input: '镜头描述、景别、角色剪影需求。',
  output: '英文：black and white storyboard sketch, clean pencil line art, clear silhouettes, readable pose/eyeline, fg/mg/bg, no color, no shading。',
  workflow: '抽构图 → 去色彩材质 → 加线稿约束。',
  constraints: '禁止最终渲染、材质、调色；非多格拼贴。',
  checklist: '- [ ] 声明线稿\n- [ ] 无颜色词\n- [ ] 有层次',
  domainNotes: `# 用途\n仅草图确认，不替代关键帧。\n`,
  workflowRules: `# 工作规则\n调用 buildLineArtShotPrompt 语义对齐本模板。\n`,
  template: `# 模板
black and white storyboard sketch, clean pencil line art, clear silhouettes, {composition}, no color, no shading, white background
`,
  promptPack: `## quality
Black and white line-art storyboard draft, clean contour, composition preview only.

## constraints
Constraints: composition draft only; preserve character identity via silhouette, hairline and costume landmarks; no color, no shading fill, no polished render, no photoreal skin, no watermark, no multi-panel collage.
`,
  exampleInput: `# 输入
两人中景对峙，左林晚右顾衡，前景栏杆。
`,
  exampleOutput: `# 输出
含 silhouette / eyeline / foreground rail 的线稿英文句。
`,
  exampleBad: `# 负例
photoreal skin, cinematic color grade。
`,
});

add({
  name: 'gen-director-batch-shot',
  title: '导演批量镜头约束',
  description: '批量镜头生成时叠加 3D camera / 构图约束与连续性规则的提示词包。',
  promptId: 'gen.director.batch-shot',
  category: 'gen',
  tags: ['gen', 'director', 'batch'],
  purpose: '导演台批量出镜时的附加约束与质量句，不复制 studio 全文，只叠加。',
  input: '镜头列表 + 构图模板 + 参考板约束。',
  output: '在 studio image/video 基础上追加 camera/构图/阻断原因策略。',
  workflow: '读约束 → buildConstrainedPrompt → 失败则 blocked 原因。',
  constraints: '约束失败不得硬生成；保持资产 ID。',
  checklist: '- [ ] 约束可解释\n- [ ] 不覆盖用户非空手写（除非 force）',
  domainNotes: `# 与 studio 关系\n本 Skill 是叠加层；权威单镜仍见 gen-studio-*。\n`,
  workflowRules: `# 工作规则\ntemplate + ReferenceConstraint 注入；blocked 时返回原因。\n`,
  template: `# 叠加尾句
Composition lock: {template}. Camera volume: {camera3d}. Continuity: {anchors}.
`,
  promptPack: `## style_lock_prefix
[Style lock — keep consistent across shots]

## character_ref_hint
[Use character reference likeness; keep face/costume consistent]

## camera_3d_hint
[Match 3D blocking camera composition and staging]

## overlay
Constraints: director batch continuity — keep franchise identity, motivated camera, do not invent new wardrobe or face; if composition constraint blocked, surface reason and do not hard-generate.
`,
  exampleInput: `# 输入
批量 12 镜，统一左侧人物朝向，禁止越轴。
`,
  exampleOutput: `# 输出
每镜 Prompt 含 composition lock；违规镜 blocked。
`,
  exampleBad: `# 负例
忽略阻断继续生成导致越轴。
`,
});

add({
  name: 'gen-character-sheet-master',
  title: '角色设定板 Master',
  description: '高精度角色 ID 锁定设定板：多格布局、表情系统、配色与禁改项；生产级骨架。',
  promptId: 'gen.character.sheet.master',
  category: 'gen',
  tags: ['gen', 'character-sheet'],
  purpose: 'CHARACTER ID LOCK 设定板权威文案：所有格子同一身份，供后续图/视频一致。',
  input: '角色描述、性别年龄体型、服装锁定、appearanceLock、forbidden、style。',
  output: '完整设定板生成指令（中英混排可），含布局坐标模块：信息栏、色板、剪影、主身份、表情、微表情、头部、姿态、特写等。',
  workflow: '填字段 → 锁布局 → 强调 Never invent new face → 输出。',
  constraints: '禁止重新诠释角色；禁止新脸新发型；最大一致性。',
  checklist: '- [ ] ID LOCK 段存在\n- [ ] 模块未省略\n- [ ] 禁改项明确',
  domainNotes: `# 模型适配\n部分模型对中英混排敏感；可降级为英文主导但保留模块。\n负面词：watermark, logo, extra limbs, identity change...\n`,
  workflowRules: `# 工作规则\n对齐 CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE 字段占位。\n`,
  template: `# 关键段落
【CHARACTER ID LOCK PRIORITY】
Never reinterpret the character...
【基础设定字段】风格/描述/性别/年龄/...
【必须包含模块】顶部信息栏 / COLOR PALETTE / SILHOUETTE / MAIN IDENTITY / EXPRESSIONS ...
`,
  exampleInput: `# 输入
林晚，短发左眉疤，海军战术外套，东亚女性 mid-20s。
`,
  exampleOutput: `# 输出
填好占位的 Master Sheet 提示词全文。
`,
  exampleBad: `# 负例
只生成单张美图，无多格 ID 锁。
`,
});

add({
  name: 'gen-bible-character',
  title: 'Bible 角色定妆图',
  description: '资产库角色一键定妆：正面全身、干净背景、身份一致的概念设定图提示词。',
  promptId: 'gen.bible.character',
  category: 'gen',
  tags: ['gen', 'bible', 'character'],
  purpose: 'buildBibleImagePrompt(character) 的权威说明与样例；对齐 Master 精简生产版。',
  input: 'name + description (+ 可选参考图)。',
  output: '`Character design sheet: {name}. {description}. Front view, full body, clean background, consistent identity, concept art quality.`',
  workflow: '拼 name/description → 加正面全身与 clean background → 可选负向。',
  constraints: '不生成多人格；不换脸；背景干净。',
  checklist: '- [ ] 含角色名\n- [ ] 全身正面\n- [ ] 身份一致句',
  domainNotes: `# 与 Master 关系\nBible 一键是精简单图；完整多格用 gen-character-sheet-master。\n`,
  workflowRules: `# 工作规则\n写回 referenceImageUrl / referencePrompt。\n`,
  template: `Character design sheet: {name}. {description}. Front view, full body, clean background, consistent identity, concept art quality.
`,
  promptPack: `## template
Character design sheet: {name}. {description}. Front view, full body, clean background, consistent identity, concept art quality.

## constraints
Constraints: single character, no face swap, no multi-persona collage, clean seamless background, identity-locked.
`,
  exampleInput: `# 输入
name=林晚；description=short black hair, left brow scar, navy coat
`,
  exampleOutput: `# 输出
Character design sheet: 林晚. short black hair.... Front view, full body...
`,
  exampleBad: `# 负例
华丽场景群像，看不清身份。
`,
});

add({
  name: 'gen-bible-scene',
  title: 'Bible 场景概念图',
  description: '资产库场景一键概念图：宽景、气氛光、建立镜头级环境提示词。',
  promptId: 'gen.bible.scene',
  category: 'gen',
  tags: ['gen', 'bible', 'scene'],
  purpose: 'buildBibleImagePrompt(scene) 权威样例。',
  input: '场景名 + 描述。',
  output: '`Environment concept art: {name}. {description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.`',
  workflow: '拼环境描述 → 宽景建立 → 气氛光。',
  constraints: '不塞角色特写抢戏；保持空间可读。',
  checklist: '- [ ] wide/establishing\n- [ ] 气氛光\n- [ ] 场景名',
  domainNotes: `# 用途\n环境资产参考图，供分镜场景一致性。\n`,
  workflowRules: `# 工作规则\n与 environments 卡光色规则一致。\n`,
  template: `Environment concept art: {name}. {description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.
`,
  promptPack: `## template
Environment concept art: {name}. {description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.

## constraints
Constraints: establishing environment only, no random characters dominating frame, coherent architecture and materials, no watermark, no UI chrome.
`,
  exampleInput: `# 输入
合租客厅，夜，暖台灯，木色家具。
`,
  exampleOutput: `# 输出
Environment concept art: 合租客厅. … Wide shot, atmospheric lighting...
`,
  exampleBad: `# 负例
只写角色脸部特写。
`,
});

function main() {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
  for (const def of SKILLS) writeProject(def);
  console.log(`Generated ${SKILLS.length} builtin skill projects → ${SKILLS_DIR}`);
  console.log(SKILLS.map((s) => s.name).sort().join('\n'));
}

main();
