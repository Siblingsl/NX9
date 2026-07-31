/**
 * 参考板 Playbook：槽位配方 + 深度动作复刻装配（REQ-DV）。
 * Playbook 定义集中在此，禁止只写死在单个 React 文件。
 */
import type { GenPromptPack } from './gen-skill-pack';
import { fillGenTemplate } from './gen-skill-pack';

export type ReferenceSlotRole =
  | 'depth_motion'
  | 'character'
  | 'scene'
  | 'style'
  | 'first_frame'
  | 'last_frame'
  | 'extra';

export type ReferenceSlotMediaType = 'image' | 'video' | 'audio' | 'any';

export type DepthConvertStatus = 'idle' | 'converting' | 'ready' | 'error';

export interface ReferenceSlot {
  id: string;
  role: ReferenceSlotRole;
  label: string;
  mediaType: ReferenceSlotMediaType;
  required: boolean;
  assetUrl?: string;
  /** depth_motion：源动作视频 */
  sourceVideoUrl?: string;
  convertStatus?: DepthConvertStatus;
  convertError?: string;
  lock: boolean;
}

export interface ReferenceSlotTemplate {
  role: ReferenceSlotRole;
  label: string;
  mediaType: ReferenceSlotMediaType;
  required: boolean;
  lockDefault?: boolean;
  /** 同 role 多槽时用 index 区分，如人物 1/2 */
  count?: number;
}

export interface ReferencePlaybookDef {
  id: string;
  title: string;
  description: string;
  skillId?: string;
  defaultAspect?: string;
  enforceDefault?: boolean;
  slots: ReferenceSlotTemplate[];
  /** stub：仅下拉可出现，槽位可填，装配走通用规则 */
  stub?: boolean;
}

export interface ReferenceBoardData {
  playbookId: string;
  slots: ReferenceSlot[];
  userPromptExtras?: string;
  assembledPrompt?: string;
  palette?: string[];
  styleNotes?: string;
  boardImages?: string[];
  enforce?: boolean;
  aspect?: string;
}

/** 下游 clip-gen 消费的结构化引用包 */
export interface ReferencePack {
  playbookId: string;
  skillId?: string;
  assembledPrompt: string;
  enforce: boolean;
  aspect?: string;
  depthVideoUrl?: string;
  sourceVideoUrl?: string;
  characterUrls: string[];
  sceneUrl?: string;
  styleUrls: string[];
  imageUrls: string[];
  videoUrls: string[];
  ready: boolean;
  blockReason?: string;
}

/** 视频生成节点上的热门玩法状态（最小侵入，存在 clip-gen data） */
export interface ClipGenPlaybookState {
  playbookId: string;
  slots: ReferenceSlot[];
  enforce: boolean;
  aspect?: string;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export const BUILTIN_REFERENCE_PLAYBOOKS: ReferencePlaybookDef[] = [
  {
    id: 'depth-action-replica',
    title: '深度视频动作复刻',
    description: '深度视频锁动作，人物图锁外貌，场景图换环境',
    skillId: 'gen-depth-action-replica',
    defaultAspect: '9:16',
    enforceDefault: true,
    slots: [
      {
        role: 'depth_motion',
        label: '深度视频',
        mediaType: 'video',
        required: true,
        lockDefault: true,
      },
      {
        role: 'character',
        label: '人物',
        mediaType: 'image',
        required: true,
        lockDefault: true,
        count: 1,
      },
      {
        role: 'scene',
        label: '场景',
        mediaType: 'image',
        required: false,
        lockDefault: true,
        count: 0,
      },
    ],
  },
  {
    id: 'mood-board',
    title: '通用 Mood Board',
    description: '风格图墙 + 色板 + 备注（兼容旧参考板）',
    defaultAspect: '16:9',
    enforceDefault: false,
    slots: [
      {
        role: 'style',
        label: '风格参考',
        mediaType: 'image',
        required: false,
        lockDefault: false,
        count: 6,
      },
    ],
  },
  {
    id: 'first-last-frame',
    title: '首尾帧锁（预留）',
    description: '首帧 + 尾帧锁定中间运动（扩展 stub）',
    skillId: 'gen-studio-video',
    defaultAspect: '16:9',
    enforceDefault: false,
    stub: true,
    slots: [
      {
        role: 'first_frame',
        label: '首帧',
        mediaType: 'image',
        required: true,
        lockDefault: true,
      },
      {
        role: 'last_frame',
        label: '尾帧',
        mediaType: 'image',
        required: true,
        lockDefault: true,
      },
      {
        role: 'character',
        label: '人物',
        mediaType: 'image',
        required: false,
        lockDefault: true,
      },
    ],
  },
];

export function lookupReferencePlaybook(id: string): ReferencePlaybookDef | undefined {
  return BUILTIN_REFERENCE_PLAYBOOKS.find((p) => p.id === id);
}

export function createSlotsFromPlaybook(playbook: ReferencePlaybookDef): ReferenceSlot[] {
  const slots: ReferenceSlot[] = [];
  for (const tpl of playbook.slots) {
    // count=0：不预创建槽（由 UI 动态添加，如场景）
    const n = tpl.count ?? 1;
    if (n <= 0) continue;
    for (let i = 0; i < n; i++) {
      const label = n > 1 ? `${tpl.label}${i + 1}` : tpl.label;
      slots.push({
        id: uid(tpl.role),
        role: tpl.role,
        label,
        mediaType: tpl.mediaType,
        required: tpl.required && (tpl.role !== 'character' || i === 0),
        lock: tpl.lockDefault ?? true,
        convertStatus: tpl.role === 'depth_motion' ? 'idle' : undefined,
      });
    }
  }
  return slots;
}

/** 旧 Mood Board → 可编辑板数据 */
export function migrateLegacyBoardData(nodeData: Record<string, unknown>): ReferenceBoardData {
  const existingId = typeof nodeData.playbookId === 'string' ? nodeData.playbookId : '';
  const existingSlots = Array.isArray(nodeData.slots) ? (nodeData.slots as ReferenceSlot[]) : null;

  if (existingId && existingSlots?.length) {
    return {
      playbookId: existingId,
      slots: existingSlots,
      userPromptExtras: (nodeData.userPromptExtras as string) ?? '',
      assembledPrompt: (nodeData.assembledPrompt as string) ?? '',
      palette: Array.isArray(nodeData.palette) ? (nodeData.palette as string[]) : undefined,
      styleNotes: (nodeData.styleNotes as string) ?? '',
      boardImages: Array.isArray(nodeData.boardImages) ? (nodeData.boardImages as string[]) : undefined,
      enforce: (nodeData.enforce as boolean) ?? lookupReferencePlaybook(existingId)?.enforceDefault ?? false,
      aspect: (nodeData.aspect as string) ?? lookupReferencePlaybook(existingId)?.defaultAspect,
    };
  }

  const boardImages = Array.isArray(nodeData.boardImages)
    ? (nodeData.boardImages as string[]).filter(Boolean)
    : Array.isArray(nodeData.pictures)
      ? (nodeData.pictures as string[]).filter(Boolean)
      : [];
  const hasLegacy =
    boardImages.length > 0 ||
    Boolean((nodeData.styleNotes as string)?.trim()) ||
    Boolean((nodeData.content as string)?.trim());
  const playbook = lookupReferencePlaybook(hasLegacy ? 'mood-board' : 'depth-action-replica')!;
  const slots = createSlotsFromPlaybook(playbook);
  boardImages.forEach((url, i) => {
    if (slots[i] && playbook.id === 'mood-board') slots[i] = { ...slots[i], assetUrl: url };
  });

  return {
    playbookId: playbook.id,
    slots,
    userPromptExtras: '',
    assembledPrompt: hasLegacy ? ((nodeData.content as string) ?? '') : '',
    palette: Array.isArray(nodeData.palette) ? (nodeData.palette as string[]) : ['#0F766E', '#1E3A5F', '#F4F1EA'],
    styleNotes: (nodeData.styleNotes as string) ?? '',
    boardImages,
    enforce: (nodeData.enforce as boolean) ?? playbook.enforceDefault ?? false,
    aspect: playbook.defaultAspect ?? '9:16',
  };
}

export function switchPlaybook(
  playbookId: string,
  prev?: ReferenceBoardData | null,
): ReferenceBoardData {
  const def = lookupReferencePlaybook(playbookId) ?? lookupReferencePlaybook('depth-action-replica')!;
  const slots = createSlotsFromPlaybook(def);
  // 尽量保留同 role 资产
  if (prev?.slots?.length) {
    for (const slot of slots) {
      const match = prev.slots.find((s) => s.role === slot.role && !slots.some((x) => x.id !== slot.id && x.assetUrl && x.role === s.role && x.label === s.label));
      const byLabel = prev.slots.find((s) => s.role === slot.role && s.label === slot.label);
      const src = byLabel ?? match;
      if (src) {
        slot.assetUrl = src.assetUrl;
        slot.sourceVideoUrl = src.sourceVideoUrl;
        slot.convertStatus = src.convertStatus;
        slot.convertError = src.convertError;
        slot.lock = src.lock;
      }
    }
  }
  return {
    playbookId: def.id,
    slots,
    userPromptExtras: prev?.userPromptExtras ?? '',
    assembledPrompt: '',
    palette: prev?.palette,
    styleNotes: prev?.styleNotes ?? '',
    boardImages: prev?.boardImages,
    enforce: def.enforceDefault ?? false,
    aspect: def.defaultAspect,
  };
}

export function validateReferenceSlots(
  slots: ReferenceSlot[],
  enforce: boolean,
): { ready: boolean; reason?: string } {
  for (const slot of slots) {
    if (slot.role === 'depth_motion') {
      if (slot.convertStatus === 'converting') {
        return { ready: false, reason: '深度视频仍在转换中，请等待完成' };
      }
      if (slot.convertStatus === 'error') {
        return { ready: false, reason: slot.convertError || '深度视频转换失败，请重试' };
      }
      if (slot.required && !slot.assetUrl) {
        return { ready: false, reason: `请填写必填槽：${slot.label}` };
      }
    } else if (slot.required && !slot.assetUrl) {
      if (enforce || slot.required) {
        return { ready: false, reason: `请填写必填槽：${slot.label}` };
      }
    }
  }
  // 深度动作复刻：至少一个人物
  const chars = slots.filter((s) => s.role === 'character');
  if (chars.length && chars.every((c) => !c.assetUrl) && chars.some((c) => c.required)) {
    return { ready: false, reason: '至少需要一张人物参考图' };
  }
  return { ready: true };
}

function characterMentionLabel(slot: ReferenceSlot, index: number): string {
  return slot.label || `人物${index + 1}`;
}

/**
 * 用 Skill prompt-pack + 槽位装配最终提示词。
 */
export function assembleReferencePrompt(
  board: ReferenceBoardData,
  pack?: GenPromptPack | null,
): { prompt: string; blocked: boolean; reason?: string } {
  const enforce = board.enforce ?? false;
  const check = validateReferenceSlots(board.slots, enforce);
  if (!check.ready && enforce) {
    return { prompt: '', blocked: true, reason: check.reason };
  }

  const depth = board.slots.find((s) => s.role === 'depth_motion');
  const characters = board.slots.filter((s) => s.role === 'character' && s.assetUrl);
  const scene = board.slots.find((s) => s.role === 'scene' && s.assetUrl);
  const styles = board.slots.filter((s) => s.role === 'style' && s.assetUrl);
  const first = board.slots.find((s) => s.role === 'first_frame' && s.assetUrl);
  const last = board.slots.find((s) => s.role === 'last_frame' && s.assetUrl);
  const extras = (board.userPromptExtras ?? '').trim();
  const notes = (board.styleNotes ?? '').trim();
  const aspect = board.aspect || '9:16';

  if (board.playbookId === 'depth-action-replica') {
    const characterLines = characters
      .map((s, i) => {
        const tag = characterMentionLabel(s, i);
        return `${tag}外貌和服装严格参考@${tag}${s.lock ? '，全程样貌一致、五官稳定' : ''}`;
      })
      .join('。');

    const vars: Record<string, string> = {
      scene_desc: scene
        ? `背景环境严格参考@${scene.label || '场景'}，替换为该场景氛围`
        : extras || '背景按用户描述替换',
      character_locks: characterLines || '角色外貌严格参考人物参考图',
      depth_lock: depth?.assetUrl
        ? `全部动作、走位、身体姿态、互动过程和节奏，严格参考@深度视频，完整复刻，不得自行修改`
        : '动作跟随参考节奏',
      aspect,
      extras,
      dialogue: extras.includes('说') || extras.includes('台词') ? extras : '',
      quality: pack?.quality?.trim() ?? '',
      constraints: pack?.constraints?.trim() ?? '',
    };

    if (pack?.template?.trim()) {
      let prompt = fillGenTemplate(pack.template, vars).trim();
      if (pack.quality?.trim() && !prompt.includes(pack.quality.trim())) {
        prompt = `${pack.quality.trim()}\n\n${prompt}`;
      }
      if (pack.constraints?.trim()) prompt = `${prompt}\n\n${pack.constraints.trim()}`;
      if (pack.overlay?.trim()) prompt = `${prompt}\n${pack.overlay.trim()}`;
      return { prompt: prompt.trim(), blocked: false };
    }

    const parts = [
      pack?.quality?.trim() || '电影级连续镜头，动作高度复刻，身份锁定，环境可替换。',
      extras || notes || '',
      scene ? `背景替换为参考场景@${scene.label || '场景'}。` : '',
      characterLines ? `${characterLines}。` : '',
      depth?.assetUrl
        ? '全部动作、走位、身体姿态、互动过程和节奏，严格参考@深度视频，完整复刻，不得自行修改。后续人物出场顺序和所有动作继续严格跟随@深度视频。'
        : '',
      `保持角色全程样貌一致、动作自然流畅。${aspect}画幅，一镜到底，无字幕、无文字、无水印，不出现人物错位、角色互换或手脚变形。`,
      pack?.constraints?.trim() || '',
      pack?.overlay?.trim() || '',
    ].filter(Boolean);

    return { prompt: parts.join('\n'), blocked: false };
  }

  // mood / stub / first-last
  const parts: string[] = [];
  if (pack?.quality?.trim()) parts.push(pack.quality.trim());
  if (extras) parts.push(extras);
  if (notes) parts.push(notes);
  if (first?.assetUrl) parts.push(`严格参考首帧@${first.label || '首帧'}的构图与姿态起点。`);
  if (last?.assetUrl) parts.push(`结束姿态与构图严格贴近尾帧@${last.label || '尾帧'}。`);
  if (characters.length) {
    parts.push(
      characters.map((s, i) => `外貌参考@${characterMentionLabel(s, i)}`).join('；') + '。',
    );
  }
  if (styles.length) parts.push(`风格参考：${styles.map((s) => `@${s.label}`).join('、')}。`);
  if (scene?.assetUrl) parts.push(`场景参考@${scene.label || '场景'}。`);
  if (pack?.constraints?.trim()) parts.push(pack.constraints.trim());
  if (!parts.length && board.assembledPrompt) {
    return { prompt: board.assembledPrompt, blocked: false };
  }
  return { prompt: parts.join('\n') || 'cinematic scene', blocked: false };
}

export function buildReferencePack(board: ReferenceBoardData): ReferencePack {
  const def = lookupReferencePlaybook(board.playbookId);
  const enforce = board.enforce ?? def?.enforceDefault ?? false;
  const check = validateReferenceSlots(board.slots, enforce);
  const depth = board.slots.find((s) => s.role === 'depth_motion');
  const characters = board.slots
    .filter((s) => s.role === 'character' && s.assetUrl)
    .map((s) => s.assetUrl!);
  const scene = board.slots.find((s) => s.role === 'scene' && s.assetUrl)?.assetUrl;
  const styleUrls = board.slots.filter((s) => s.role === 'style' && s.assetUrl).map((s) => s.assetUrl!);
  const firstLast = board.slots
    .filter((s) => (s.role === 'first_frame' || s.role === 'last_frame') && s.assetUrl)
    .map((s) => s.assetUrl!);
  const imageUrls = [...characters, ...(scene ? [scene] : []), ...styleUrls, ...firstLast];
  const videoUrls = depth?.assetUrl ? [depth.assetUrl] : [];

  return {
    playbookId: board.playbookId,
    skillId: def?.skillId,
    assembledPrompt: (board.assembledPrompt ?? '').trim(),
    enforce,
    aspect: board.aspect ?? def?.defaultAspect,
    depthVideoUrl: depth?.assetUrl,
    sourceVideoUrl: depth?.sourceVideoUrl,
    characterUrls: characters,
    sceneUrl: scene,
    styleUrls,
    imageUrls,
    videoUrls,
    ready: check.ready && Boolean((board.assembledPrompt ?? '').trim() || !enforce),
    blockReason: check.ready
      ? enforce && !(board.assembledPrompt ?? '').trim()
        ? '请先生成并确认装配提示词'
        : undefined
      : check.reason,
  };
}

/** 从节点 data 提取引用包（含兼容旧字段） */
export function extractReferencePack(nodeData: Record<string, unknown>): ReferencePack | null {
  if (nodeData.referencePack && typeof nodeData.referencePack === 'object') {
    return nodeData.referencePack as ReferencePack;
  }
  if (nodeData.playbookId || Array.isArray(nodeData.slots)) {
    const board = migrateLegacyBoardData(nodeData);
    return buildReferencePack(board);
  }
  // 纯旧 mood：无 playbook
  const images = Array.isArray(nodeData.boardImages)
    ? (nodeData.boardImages as string[])
    : Array.isArray(nodeData.pictures)
      ? (nodeData.pictures as string[])
      : [];
  if (!images.length && !(nodeData.styleNotes || nodeData.content)) return null;
  return {
    playbookId: 'mood-board',
    assembledPrompt: String(nodeData.content || nodeData.styleNotes || ''),
    enforce: Boolean(nodeData.enforce),
    characterUrls: [],
    styleUrls: images,
    imageUrls: images,
    videoUrls: [],
    ready: true,
  };
}

/** 同步 pictures / clips / content / constraints 供上游 gather 与旧约束路径 */
export function syncReferenceBoardEmitFields(board: ReferenceBoardData): Record<string, unknown> {
  const pack = buildReferencePack(board);
  const pictures = pack.imageUrls;
  const clips = pack.videoUrls;
  const content = pack.assembledPrompt || board.styleNotes || '';
  return {
    playbookId: board.playbookId,
    slots: board.slots,
    userPromptExtras: board.userPromptExtras ?? '',
    assembledPrompt: board.assembledPrompt ?? '',
    palette: board.palette,
    styleNotes: board.styleNotes ?? '',
    boardImages: pictures.length ? pictures : board.boardImages,
    enforce: board.enforce ?? false,
    aspect: board.aspect,
    pictures,
    clips,
    content,
    prompts: content ? [content] : [],
    referencePack: pack,
    constraints: {
      style: board.styleNotes || undefined,
      palette: board.palette?.join(', '),
      assetUrls: [...pictures, ...clips],
      mustInclude: pack.depthVideoUrl
        ? ['depth motion lock', 'character identity lock']
        : undefined,
    },
  };
}

/** 从 clip-gen 节点 data 读取热门玩法（无则 null，保持普通视频生成） */
export function readClipGenPlaybook(nodeData: Record<string, unknown>): ClipGenPlaybookState | null {
  const id = (nodeData.videoPlaybookId as string | undefined)?.trim();
  if (!id) return null;
  const def = lookupReferencePlaybook(id);
  const slots = Array.isArray(nodeData.videoPlaybookSlots)
    ? (nodeData.videoPlaybookSlots as ReferenceSlot[])
    : def
      ? createSlotsFromPlaybook(def)
      : [];
  return {
    playbookId: id,
    slots,
    enforce: nodeData.videoPlaybookEnforce !== false,
    aspect:
      (nodeData.videoPlaybookAspect as string | undefined) ||
      (nodeData.aspect as string | undefined) ||
      def?.defaultAspect,
  };
}

/** 选中热门玩法 → clip-gen data patch */
export function buildClipGenPlaybookPatch(playbookId: string): Record<string, unknown> {
  const board = switchPlaybook(playbookId);
  const def = lookupReferencePlaybook(playbookId);
  return {
    videoPlaybookId: playbookId,
    videoPlaybookLabel: def?.title,
    videoPlaybookSlots: board.slots,
    videoPlaybookEnforce: board.enforce ?? true,
    videoPlaybookAspect: board.aspect ?? def?.defaultAspect,
    ...(def?.defaultAspect ? { aspect: def.defaultAspect } : {}),
  };
}

/** 清除热门玩法 → 恢复普通视频生成 */
export function clearClipGenPlaybookPatch(): Record<string, unknown> {
  return {
    videoPlaybookId: undefined,
    videoPlaybookLabel: undefined,
    videoPlaybookSlots: undefined,
    videoPlaybookEnforce: undefined,
    videoPlaybookAspect: undefined,
  };
}

/** clip-gen 玩法 → ReferenceBoardData（装配用） */
export function clipGenPlaybookToBoard(
  state: ClipGenPlaybookState,
  userPromptExtras?: string,
): ReferenceBoardData {
  return {
    playbookId: state.playbookId,
    slots: state.slots,
    enforce: state.enforce,
    aspect: state.aspect,
    userPromptExtras,
  };
}

/**
 * 从 clip-gen 玩法组装引用包。
 * 不要求「确认写入」——运行时用用户正文 + 槽位即时装配。
 */
export function buildClipGenPlaybookPack(
  state: ClipGenPlaybookState,
  userPrompt: string,
  genPack?: GenPromptPack | null,
): ReferencePack {
  const board = clipGenPlaybookToBoard(state, userPrompt);
  const { prompt, blocked, reason } = assembleReferencePrompt(board, genPack);
  const withPrompt: ReferenceBoardData = {
    ...board,
    assembledPrompt: blocked ? '' : prompt,
  };
  const pack = buildReferencePack(withPrompt);
  if (blocked) {
    return { ...pack, ready: false, blockReason: reason, assembledPrompt: '' };
  }
  // 运行时即时装配：槽位就绪即可，不强制事先确认
  const check = validateReferenceSlots(state.slots, state.enforce);
  return {
    ...pack,
    assembledPrompt: prompt,
    ready: check.ready,
    blockReason: check.reason,
  };
}
