import type { CharacterProfile } from '../types/character';
import { CAMERA_PROMPT_PRESETS } from './prompt-presets';

export type BacklotTemplateKind = 'character' | 'scene' | 'shot' | 'emotion' | 'hook' | 'costume';

export type BacklotHookPhase = 'opening' | 'ending';

export type BacklotApplyTarget = 'prompt' | 'camera-prompt' | 'cinema-prompt' | 'picture-gen' | 'clip-gen';

export interface BacklotCharacterArchetype {
  name: string;
  descriptionZh?: string;
  consistencyPrompt: string;
  tags?: string[];
  referenceImageUrl?: string | null;
  referenceAudioUrl?: string | null;
}

export interface BacklotTemplate {
  id: string;
  kind: BacklotTemplateKind;
  label: string;
  description?: string;
  group?: string;
  promptEn: string;
  promptZh?: string;
  tags?: string[];
  hookPhase?: BacklotHookPhase;
  characterArchetype?: BacklotCharacterArchetype;
  defaultBlockType?: BacklotApplyTarget;
  builtin?: boolean;
}

export interface BacklotCustomTemplate {
  id: string;
  kind: BacklotTemplateKind;
  label: string;
  description?: string;
  group?: string;
  promptEn: string;
  promptZh?: string;
  tags?: string[];
  hookPhase?: BacklotHookPhase;
  characterArchetype?: BacklotCharacterArchetype;
  stageDeckScene?: unknown;
  createdAt: number;
  /** Creative Asset Center 扩展数据 */
  creative?: import('../types/creative-asset-center').WorkspaceCreativeExtension;
}

export interface BacklotCustomPayload {
  version: 1;
  items: BacklotCustomTemplate[];
}

/** 场景/镜头/情绪/钩子 — 工作区草稿（角色沿用 CharacterProfile） */
export type BacklotWorkspaceKind = Exclude<BacklotTemplateKind, 'character'>;

export interface BacklotWorkspaceItem {
  id: string;
  kind: BacklotWorkspaceKind;
  label: string;
  promptEn: string;
  promptZh?: string;
  hookPhase?: BacklotHookPhase;
  stageDeckScene?: unknown;
  /** 从自定义模板导入时关联的模板 id，用于覆盖保存 */
  sourceTemplateId?: string;
  /** Creative Asset Center 扩展数据 */
  creative?: import('../types/creative-asset-center').WorkspaceCreativeExtension;
}

export interface BacklotWorkspacePayload {
  version: 1;
  items: BacklotWorkspaceItem[];
}

const WORKSPACE_DEFAULT_LABELS: Record<BacklotWorkspaceKind, string> = {
  scene: '新场景',
  shot: '新镜头',
  emotion: '新情绪',
  hook: '新钩子',
  costume: '新服装',
};

export const BACKLOT_TEMPLATE_TABS: { key: BacklotTemplateKind; label: string; hint: string }[] = [
  { key: 'character', label: '角色库', hint: '人设 archetype + 工作区角色' },
  { key: 'costume', label: '服装库', hint: '造型套装、面料、配色与标志物' },
  { key: 'scene', label: '场景库', hint: '环境、光线、时代与空间' },
  { key: 'shot', label: '镜头库', hint: '运镜、景别、机位描述' },
  { key: 'emotion', label: '情绪库', hint: '表情、氛围、色调与节奏' },
  { key: 'hook', label: '钩子库', hint: '开场抓人 + 结尾留存' },
];

const CHARACTER_ARCHETYPES: BacklotTemplate[] = [
  {
    id: 'char-hero-journey',
    kind: 'character',
    group: '主角型',
    label: '成长型主角',
    description: '普通起点、清晰动机、可共情',
    promptEn: 'young protagonist, relatable everyday clothing, determined eyes, subtle scars of past struggle, cinematic realism',
    promptZh: '成长型主角，日常穿着，坚定眼神',
    characterArchetype: {
      name: '成长型主角',
      descriptionZh: '从平凡到觉醒的叙事主角',
      consistencyPrompt:
        'young adult protagonist, consistent face, natural skin, simple modern outfit, expressive eyes, same hairstyle throughout',
      tags: ['protagonist'],
    },
  },
  {
    id: 'char-cold-ceo',
    kind: 'character',
    group: '主角型',
    label: '冷面总裁',
    description: '高定西装、克制表情、权力感',
    promptEn: 'cold CEO archetype, tailored dark suit, sharp jawline, restrained expression, luxury office backdrop hints',
    promptZh: '冷面总裁，高定深色西装',
    characterArchetype: {
      name: '冷面总裁',
      descriptionZh: '外冷内热，短剧高频人设',
      consistencyPrompt:
        'male CEO, slick black hair, tailored charcoal suit, white shirt, no tie, cold gray eyes, same facial structure',
      tags: ['romance', 'ceo'],
    },
  },
  {
    id: 'char-student',
    kind: 'character',
    group: '日常型',
    label: '校园学生',
    description: '校服/休闲、青春感',
    promptEn: 'high school student, casual uniform or hoodie, youthful energy, soft daylight portrait',
    promptZh: '校园学生，青春感',
    characterArchetype: {
      name: '校园学生',
      consistencyPrompt: 'teen student, school uniform or casual hoodie, bright eyes, same youthful face, natural makeup-free look',
      tags: ['youth'],
    },
  },
  {
    id: 'char-detective',
    kind: 'character',
    group: '职业型',
    label: '悬疑侦探',
    description: '风衣、低饱和、疲惫眼神',
    promptEn: 'noir detective, trench coat, tired eyes, rain-soaked city mood, muted palette',
    promptZh: '悬疑侦探，黑色电影气质',
    characterArchetype: {
      name: '悬疑侦探',
      consistencyPrompt: 'detective in beige trench coat, stubble, weary eyes, same face under fedora shadow, film noir palette',
      tags: ['noir', 'mystery'],
    },
  },
  {
    id: 'char-ai-companion',
    kind: 'character',
    group: '幻想型',
    label: 'AI 伴侣',
    description: '未来感、柔和光晕、非恐怖科幻',
    promptEn: 'friendly AI companion hologram, soft cyan glow, humanoid silhouette, futuristic but warm',
    promptZh: 'AI 伴侣，柔和全息光',
    characterArchetype: {
      name: 'AI 伴侣',
      consistencyPrompt: 'humanoid AI avatar, soft cyan rim light, gentle smile, sleek white bodysuit, consistent holographic edge glow',
      tags: ['sci-fi'],
    },
  },
  {
    id: 'char-elder-mentor',
    kind: 'character',
    group: '配角型',
    label: '长者导师',
    description: '皱纹、温和、智慧感',
    promptEn: 'wise elder mentor, gentle wrinkles, warm smile, traditional robes or cardigan, soft window light',
    promptZh: '长者导师，温和智慧',
    characterArchetype: {
      name: '长者导师',
      consistencyPrompt: 'elderly mentor, silver hair, kind eyes, linen cardigan, same gentle facial lines, warm skin tones',
      tags: ['mentor'],
    },
  },
];

const SCENE_TEMPLATES: BacklotTemplate[] = [
  {
    id: 'scene-neon-alley',
    kind: 'scene',
    group: '都市',
    label: '霓虹巷弄',
    description: '雨夜、反射、赛博氛围',
    promptEn: 'rainy neon alley at night, wet pavement reflections, steam vents, cyberpunk mood without clutter, cinematic depth',
    promptZh: '雨夜霓虹巷弄',
    defaultBlockType: 'picture-gen',
  },
  {
    id: 'scene-sunlit-cafe',
    kind: 'scene',
    group: '室内',
    label: '阳光咖啡馆',
    description: '大窗、植物、暖木色',
    promptEn: 'sunlit cafe interior, large windows, hanging plants, warm wood tones, cozy bokeh, lifestyle photography',
    promptZh: '阳光咖啡馆内景',
  },
  {
    id: 'scene-corporate-lobby',
    kind: 'scene',
    group: '室内',
    label: '企业大堂',
    description: '玻璃、大理石、冷调商务',
    promptEn: 'modern corporate lobby, floor-to-ceiling glass, marble floor, cool daylight, minimalist luxury',
    promptZh: '现代企业大堂',
  },
  {
    id: 'scene-mountain-dawn',
    kind: 'scene',
    group: '自然',
    label: '山顶黎明',
    description: '史诗广角、薄雾、金色光',
    promptEn: 'mountain summit at dawn, epic wide landscape, low mist, golden sun rays, ultra detailed environment',
    promptZh: '山顶黎明史诗风景',
  },
  {
    id: 'scene-abandoned-factory',
    kind: 'scene',
    group: '废墟',
    label: '废弃工厂',
    description: '尘粒、丁达尔、 post-apocalyptic',
    promptEn: 'abandoned factory interior, dust particles in god rays, rusted machinery, desaturated green tint',
    promptZh: '废弃工厂，丁达尔光',
  },
  {
    id: 'scene-ancient-temple',
    kind: 'scene',
    group: '历史',
    label: '古寺庭院',
    description: '红墙、香炉烟、东方美学',
    promptEn: 'ancient temple courtyard, red walls, incense smoke, stone pavement, east asian cinematic aesthetic',
    promptZh: '古寺庭院，东方美学',
  },
  {
    id: 'scene-bedroom-night',
    kind: 'scene',
    group: '室内',
    label: '深夜卧室',
    description: '台灯、私密、情绪叙事',
    promptEn: 'intimate bedroom at night, single warm lamp, soft shadows, messy authentic details, emotional storytelling space',
    promptZh: '深夜卧室，台灯情绪光',
  },
  {
    id: 'scene-rooftop-city',
    kind: 'scene',
    group: '都市',
    label: '城市天台',
    description: '天际线、风、告白/对峙常用',
    promptEn: 'city rooftop at blue hour, skyline bokeh, wind in hair, dramatic open sky, cinematic two-shot backdrop',
    promptZh: '城市天台蓝调时刻',
  },
];

const SHOT_TEMPLATES: BacklotTemplate[] = CAMERA_PROMPT_PRESETS.map((p) => ({
  id: `shot-${p.id}`,
  kind: 'shot' as const,
  group: p.group,
  label: p.label,
  description: p.group,
  promptEn: p.text,
  promptZh: p.label,
  defaultBlockType: 'camera-prompt' as const,
  builtin: true,
}));

const EMOTION_TEMPLATES: BacklotTemplate[] = [
  {
    id: 'emo-joy-burst',
    kind: 'emotion',
    group: '积极',
    label: '喜极而泣',
    description: '释放、眼眶湿润、光变柔',
    promptEn: 'overwhelming joy, tears of happiness, soft bloom on highlights, gentle smile trembling, warm color grade',
    promptZh: '喜极而泣，柔光释放',
    defaultBlockType: 'cinema-prompt',
  },
  {
    id: 'emo-quiet-grief',
    kind: 'emotion',
    group: '消极',
    label: '静默悲伤',
    description: '低饱和、留白、微表情',
    promptEn: 'quiet grief, desaturated palette, still posture, micro-expression of loss, empty negative space',
    promptZh: '静默悲伤，低饱和留白',
  },
  {
    id: 'emo-rising-anger',
    kind: 'emotion',
    group: '张力',
    label: '压抑怒意',
    description: '特写、硬光、呼吸感',
    promptEn: 'suppressed anger building, tight close-up, hard side light, visible breath, tense jaw, rising string tension mood',
    promptZh: '压抑怒意，硬光特写',
  },
  {
    id: 'emo-nostalgia',
    kind: 'emotion',
    group: '怀旧',
    label: '怀旧滤镜',
    description: '颗粒、褪色、慢节奏',
    promptEn: 'nostalgic memory tone, faded colors, subtle film grain, slow pacing, dreamy soft vignette',
    promptZh: '怀旧记忆色调',
  },
  {
    id: 'emo-dread',
    kind: 'emotion',
    group: '悬疑',
    label: '不安悬置',
    description: '冷调、阴影、静默',
    promptEn: 'creeping dread, cold blue shadows, off-center framing, uncomfortable silence before reveal',
    promptZh: '不安悬置，冷调阴影',
  },
  {
    id: 'emo-romantic',
    kind: 'emotion',
    group: '浪漫',
    label: '暧昧心动',
    description: '浅景深、暖肤、慢推',
    promptEn: 'romantic tension, shallow depth of field, warm skin tones, slow push-in, breathless pause between lines',
    promptZh: '暧昧心动，浅景深暖肤',
  },
  {
    id: 'emo-triumph',
    kind: 'emotion',
    group: '积极',
    label: '胜利时刻',
    description: '仰角、高对比、鼓点节奏',
    promptEn: 'triumphant breakthrough, low angle hero framing, high contrast, energetic cut rhythm, lens flare accent',
    promptZh: '胜利时刻，仰角高对比',
  },
  {
    id: 'emo-comedic',
    kind: 'emotion',
    group: '喜剧',
    label: '尴尬喜剧',
    description: '定格、广角畸变、夸张',
    promptEn: 'awkward comedic beat, slight wide-angle distortion, freeze-frame emphasis, bright even lighting',
    promptZh: '尴尬喜剧节拍',
  },
];

const HOOK_TEMPLATES: BacklotTemplate[] = [
  {
    id: 'hook-open-eyes',
    kind: 'hook',
    hookPhase: 'opening',
    group: '开场',
    label: '瞳孔放大',
    description: '3 秒抓注意力',
    promptEn: 'Opening hook: extreme close-up eyes widening in shock, smash cut to wide reveal, high contrast, 3 seconds',
    promptZh: '开场：瞳孔特写 → 大全景揭示',
    defaultBlockType: 'prompt',
  },
  {
    id: 'hook-open-mystery-object',
    kind: 'hook',
    hookPhase: 'opening',
    group: '开场',
    label: '神秘物件',
    description: '手特写 → 身份悬念',
    promptEn: 'Opening hook: trembling hand reaching mystery object, rack focus, unanswered question in first 3 seconds',
    promptZh: '开场：神秘物件特写',
  },
  {
    id: 'hook-open-mid-action',
    kind: 'hook',
    hookPhase: 'opening',
    group: '开场',
    label: '动作中途切入',
    description: 'in medias res 高能量',
    promptEn: 'Opening hook: start mid-chase mid-action, disorienting handheld, reveal context after 5 seconds',
    promptZh: '开场：动作中途硬切',
  },
  {
    id: 'hook-open-whisper',
    kind: 'hook',
    hookPhase: 'opening',
    group: '开场',
    label: '低语悬念',
    description: '黑屏/暗场 + 一句台词',
    promptEn: 'Opening hook: near-black frame, single whispered line, slow fade-in to face, intimate microphone closeness',
    promptZh: '开场：低语 + 渐显人脸',
  },
  {
    id: 'hook-end-cliffhanger',
    kind: 'hook',
    hookPhase: 'ending',
    group: '结尾',
    label: '悬崖定格',
    description: '关键动作前黑屏',
    promptEn: 'Ending cliffhanger: freeze frame milliseconds before impact or reveal, cut to black, unresolved gasp',
    promptZh: '结尾：悬崖定格黑屏',
  },
  {
    id: 'hook-end-twist-line',
    kind: 'hook',
    hookPhase: 'ending',
    group: '结尾',
    label: '反转金句',
    description: '平静画面 + 颠覆台词',
    promptEn: 'Ending twist: calm two-shot holds, character delivers reversal line, subtle zoom on listener reaction',
    promptZh: '结尾：反转金句 + 听者反应',
  },
  {
    id: 'hook-end-cta-follow',
    kind: 'hook',
    hookPhase: 'ending',
    group: '结尾',
    label: '追更引导',
    description: '下集预告式构图',
    promptEn: 'Ending hook for serial: silhouette walking into unknown light, title card space, to-be-continued energy',
    promptZh: '结尾：追更式剪影离去',
  },
  {
    id: 'hook-end-emotional-loop',
    kind: 'hook',
    hookPhase: 'ending',
    group: '结尾',
    label: '情绪回环',
    description: '与开场镜像构图',
    promptEn: 'Ending emotional loop: mirror opening composition with opposite emotion, same framing, story circle complete but sequel question',
    promptZh: '结尾：与开场镜像回环',
  },
  {
    id: 'hook-end-product-reveal',
    kind: 'hook',
    hookPhase: 'ending',
    group: '结尾',
    label: '产品亮相',
    description: '商业片收尾',
    promptEn: 'Ending product hero reveal: slow orbit, logo safe area, premium lighting, satisfying final frame hold',
    promptZh: '结尾：产品英雄位亮相',
  },
];


const COSTUME_TEMPLATES: BacklotTemplate[] = [
  {
    id: 'costume-urban-casual',
    kind: 'costume',
    group: '日常',
    label: '都市休闲套',
    description: '通勤日常、干净现代',
    promptEn:
      'modern urban casual outfit, clean silhouette, soft cotton top, straight trousers, minimal sneakers, muted palette, production costume continuity',
    promptZh: '都市休闲：简洁上衣 + 直筒裤 + 基础运动鞋，低饱和配色',
    tags: ['casual', 'modern'],
  },
  {
    id: 'costume-tailored-suit',
    kind: 'costume',
    group: '正装',
    label: '高定西装',
    description: '权力感、职场、精英',
    promptEn:
      'tailored dark business suit, sharp lapels, crisp white shirt, slim tie, polished leather shoes, restrained luxury, locked wardrobe continuity',
    promptZh: '高定深色西装、白衬衫、细领带、皮鞋，克制奢华',
    tags: ['formal', 'ceo'],
  },
  {
    id: 'costume-school-uniform',
    kind: 'costume',
    group: '职业',
    label: '学院制服',
    description: '青春校园',
    promptEn:
      'classic school uniform, blazer with crest, pleated skirt or straight trousers, white blouse, loafers, youthful clean look, consistent costume details',
    promptZh: '学院制服：西装外套、白衬衫、百褶裙/西裤、乐福鞋',
    tags: ['school'],
  },
  {
    id: 'costume-hanfu-flowing',
    kind: 'costume',
    group: '古装',
    label: '流云汉服',
    description: '古风仙侠日常',
    promptEn:
      'flowing hanfu costume, layered silk robes, soft sash belt, embroidered cuffs, traditional footwear, elegant drapery, historical fantasy wardrobe continuity',
    promptZh: '流云汉服：多层丝质长袍、束带、绣纹袖口',
    tags: ['hanfu', 'period'],
  },
  {
    id: 'costume-xianxia-armor',
    kind: 'costume',
    group: '战甲',
    label: '仙侠轻甲',
    description: '战斗场次',
    promptEn:
      'light xianxia armor over robes, metal shoulder plates, leather straps, flowing cape accents, sword-ready silhouette, consistent armor landmarks',
    promptZh: '仙侠轻甲：袍甲结合、肩甲、束带、可战斗轮廓',
    tags: ['armor', 'xianxia'],
  },
  {
    id: 'costume-cyber-street',
    kind: 'costume',
    group: '赛博',
    label: '赛博街头',
    description: '未来都市',
    promptEn:
      'cyberpunk streetwear, layered tech jacket, reflective panels, utility belts, high boots, neon accent trims, futuristic wardrobe continuity',
    promptZh: '赛博街头：科技外套、反光裁片、机能腰带、高筒靴',
    tags: ['cyberpunk'],
  },
  {
    id: 'costume-evening-gown',
    kind: 'costume',
    group: '礼服',
    label: '晚宴礼服',
    description: '宴会 / 红毯',
    promptEn:
      'elegant evening gown, refined silhouette, subtle shimmer fabric, minimal jewelry, formal heels, glamorous but identity-preserving costume design',
    promptZh: '晚宴礼服：修身廓形、微闪面料、精简首饰',
    tags: ['gown', 'formal'],
  },
  {
    id: 'costume-trench-detective',
    kind: 'costume',
    group: '职业',
    label: '侦探风衣套',
    description: '悬疑短剧高频',
    promptEn:
      'classic detective trench coat over dark shirt, belt cinched waist, practical trousers, leather boots, understated noir wardrobe, fixed costume landmarks',
    promptZh: '侦探风衣：深色内搭、束腰、皮靴，黑色电影气质',
    tags: ['detective', 'noir'],
  },
];

export const BUILTIN_BACKLOT_TEMPLATES: BacklotTemplate[] = [
  ...CHARACTER_ARCHETYPES,
  ...COSTUME_TEMPLATES,
  ...SCENE_TEMPLATES,
  ...SHOT_TEMPLATES,
  ...EMOTION_TEMPLATES,
  ...HOOK_TEMPLATES,
];

export function emptyBacklotCustom(): BacklotCustomPayload {
  return { version: 1, items: [] };
}

export function emptyBacklotWorkspace(): BacklotWorkspacePayload {
  return { version: 1, items: [] };
}

export function newBacklotWorkspaceItem(kind: BacklotWorkspaceKind): BacklotWorkspaceItem {
  return {
    id: `ws-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    label: WORKSPACE_DEFAULT_LABELS[kind],
    promptEn: '',
    hookPhase: kind === 'hook' ? 'opening' : undefined,
  };
}

export function listBacklotTemplates(
  kind: BacklotTemplateKind,
  custom: BacklotCustomTemplate[] = [],
): Array<BacklotTemplate | BacklotCustomTemplate> {
  const builtins = BUILTIN_BACKLOT_TEMPLATES.filter((t) => t.kind === kind);
  const customs = custom.filter((t) => t.kind === kind);
  return [...customs, ...builtins];
}

/** 各库默认分组（下拉选项基准） */
export const DEFAULT_BACKLOT_GROUPS: Record<BacklotTemplateKind, string[]> = {
  character: ['主角型', '日常型', '职业型', '幻想型', '配角型'],
  costume: ['日常', '正装', '职业', '古装', '奇幻', '战甲', '赛博', '礼服'],
  scene: ['都市', '室内', '自然', '废墟', '历史'],
  shot: ['推拉', '环绕', '升降', '横移', '转场', '特殊', '固定'],
  emotion: ['积极', '消极', '张力', '怀旧', '悬疑', '浪漫', '喜剧'],
  hook: ['开场', '结尾'],
};

/** 合并内置 + 工作区已有分组，供下拉选择 */
export function listBacklotGroupOptions(
  kind: BacklotTemplateKind,
  custom: BacklotCustomTemplate[] = [],
): string[] {
  const set = new Set<string>(DEFAULT_BACKLOT_GROUPS[kind]);
  for (const t of BUILTIN_BACKLOT_TEMPLATES) {
    if (t.kind === kind && t.group) set.add(t.group);
  }
  for (const c of custom) {
    if (c.kind !== kind) continue;
    const g = c.group?.trim();
    if (!g || g === '我的工作区') set.add('未分组');
    else set.add(g);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

export function archetypeToCharacter(
  archetype: BacklotCharacterArchetype,
  id?: string,
  sourceTemplateId?: string,
): CharacterProfile {
  return {
    id: id ?? `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: archetype.name,
    descriptionZh: archetype.descriptionZh ?? '',
    consistencyPrompt: archetype.consistencyPrompt,
    referenceImageUrl: archetype.referenceImageUrl ?? null,
    referenceAudioUrl: archetype.referenceAudioUrl ?? null,
    tags: archetype.tags ?? [],
    sourceTemplateId,
  };
}

export function backlotTemplatePrompt(t: BacklotTemplate | BacklotCustomTemplate): string {
  return t.promptEn?.trim() || t.promptZh?.trim() || '';
}

export function customFromBuiltin(
  tpl: BacklotTemplate,
  overrides?: Partial<BacklotCustomTemplate>,
): BacklotCustomTemplate {
  return {
    id: `custom-${Date.now()}`,
    kind: tpl.kind,
    label: tpl.label,
    description: tpl.description,
    group: tpl.group,
    promptEn: tpl.promptEn,
    promptZh: tpl.promptZh,
    tags: tpl.tags,
    hookPhase: tpl.hookPhase,
    characterArchetype: tpl.characterArchetype,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function characterToCustomTemplate(
  char: CharacterProfile,
  group: string,
  templateLabel?: string,
  existing?: Pick<BacklotCustomTemplate, 'id' | 'createdAt'>,
): BacklotCustomTemplate {
  const label = templateLabel?.trim() || char.name;
  const promptEn = char.consistencyPrompt?.trim() || char.name;
  return {
    id: existing?.id ?? `custom-character-${Date.now()}`,
    kind: 'character',
    label,
    promptEn,
    promptZh: char.descriptionZh || undefined,
    group,
    characterArchetype: {
      name: char.name,
      descriptionZh: char.descriptionZh,
      consistencyPrompt: char.consistencyPrompt || '',
      tags: char.tags,
      referenceImageUrl: char.referenceImageUrl,
      referenceAudioUrl: char.referenceAudioUrl,
    },
    createdAt: existing?.createdAt ?? Date.now(),
  };
}

export function workspaceItemToCustomTemplate(
  item: BacklotWorkspaceItem,
  group: string,
  templateLabel?: string,
  existing?: Pick<BacklotCustomTemplate, 'id' | 'createdAt'>,
): BacklotCustomTemplate {
  const hookGroup =
    item.hookPhase === 'opening' ? '开场' : item.hookPhase === 'ending' ? '结尾' : undefined;
  return {
    id: existing?.id ?? `custom-${item.kind}-${Date.now()}`,
    kind: item.kind,
    label: templateLabel?.trim() || item.label,
    promptEn: item.promptEn,
    promptZh: item.promptZh,
    group: group || hookGroup || '未分组',
    hookPhase: item.hookPhase,
    stageDeckScene: item.stageDeckScene,
    creative: item.creative,
    createdAt: existing?.createdAt ?? Date.now(),
  };
}

export function templateToWorkspaceItem(
  tpl: BacklotTemplate | BacklotCustomTemplate,
  sourceTemplateId?: string,
): BacklotWorkspaceItem | null {
  if (tpl.kind === 'character') return null;
  const linkedId = sourceTemplateId ?? ('createdAt' in tpl ? tpl.id : undefined);
  const creative = 'creative' in tpl ? tpl.creative : undefined;
  // 内置模板没有 creative：按文案预填服装/场景基础字段
  const seededCreative =
    creative
    ?? (tpl.kind === 'costume'
      ? {
          description: tpl.promptZh || tpl.description || tpl.label,
          category: tpl.group,
          tags: tpl.tags ?? [],
        }
      : tpl.kind === 'scene'
        ? {
            description: tpl.promptZh || tpl.description || tpl.label,
            tags: tpl.tags ?? [],
          }
        : undefined);
  return {
    id: `ws-${tpl.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: tpl.kind,
    label: tpl.label,
    promptEn: tpl.promptEn,
    promptZh: tpl.promptZh,
    hookPhase: tpl.hookPhase,
    stageDeckScene: 'stageDeckScene' in tpl ? tpl.stageDeckScene : undefined,
    sourceTemplateId: linkedId,
    creative: seededCreative as BacklotWorkspaceItem['creative'],
  };
}
