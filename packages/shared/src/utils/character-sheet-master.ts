/**
 * 角色主设定板（Character Master Sheet）
 * 用于锁定角色 ID 的生产级设定板：一图多格 + 区域裁切回填。
 *
 * 核心原则：
 * 1) 提示词与裁切共用同一套「固定网格坐标系」
 * 2) 生成时在 prompt 中写死每个面板的格子位置
 * 3) 裁切时按同一坐标切分，避免位置漂移
 */

export type CharacterSheetStyleMode =
  | 'photoreal-3d'
  | 'stylized-3d'
  | 'anime'
  | 'semi-realistic'
  | 'ip-design';

export type CharacterSheetGender = 'male' | 'female' | 'neutral';

export type CharacterSheetBodyType = 'slim' | 'average' | 'athletic' | 'exaggerated';

/** 设定板面板 id — 与裁切区域、回填槽位一一对应 */
export type CharacterSheetPanelId =
  | 'main-front'
  | 'main-three-quarter'
  | 'main-side'
  | 'main-back'
  | 'silhouette-front'
  | 'silhouette-side'
  | 'expr-neutral'
  | 'expr-curious'
  | 'expr-tense'
  | 'expr-surprised'
  | 'expr-afraid'
  | 'expr-sad'
  | 'expr-determined'
  | 'expr-relaxed'
  | 'micro-eye-tension'
  | 'micro-slight-smile'
  | 'micro-mouth-tension'
  | 'micro-micro-fear'
  | 'micro-breath-control'
  | 'head-three-quarter'
  | 'head-side'
  | 'head-up'
  | 'head-down'
  | 'head-back'
  | 'pose-relaxed'
  | 'pose-tense'
  | 'pose-confident'
  | 'emotional-closeup'
  | 'detail-hairstyle'
  | 'detail-fabric'
  | 'detail-accessory'
  | 'detail-footwear'
  | 'hand-relaxed'
  | 'hand-tense'
  | 'hand-pointing'
  | 'hand-grasping'
  | 'hand-touching-face';

export interface CharacterSheetPanelLayout {
  id: CharacterSheetPanelId;
  label: string;
  group: string;
  /** 英文标签（写进设定板） */
  enLabel: string;
  /**
   * 固定网格坐标：整图 12 列 × 10 行
   * col/row 从 0 开始；colSpan/rowSpan 为占用格数
   */
  grid: { col: number; row: number; colSpan: number; rowSpan: number };
  /** 由 grid 推导的归一化矩形 [x, y, w, h]，0~1 */
  rect: [number, number, number, number];
  /** 回填到 creative 的位置 */
  fill:
    | { kind: 'field'; field: string }
    | { kind: 'variant'; group: 'expressions' | 'poses' | 'angles' | 'microExpressions' | 'costumeDetails' | 'handRefs'; id: string; label: string };
}

/** 设定板固定网格：12 列 × 10 行（与提示词 LOCKED GRID 完全一致） */
export const CHARACTER_SHEET_GRID_COLS = 12;
export const CHARACTER_SHEET_GRID_ROWS = 10;

/** 顶部信息条占用第 0 行；内容从第 1 行开始 */
const GRID_HEADER_ROWS = 1;

function cellRect(
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): [number, number, number, number] {
  const x = col / CHARACTER_SHEET_GRID_COLS;
  const y = row / CHARACTER_SHEET_GRID_ROWS;
  const w = colSpan / CHARACTER_SHEET_GRID_COLS;
  const h = rowSpan / CHARACTER_SHEET_GRID_ROWS;
  return [
    Number(x.toFixed(6)),
    Number(y.toFixed(6)),
    Number(w.toFixed(6)),
    Number(h.toFixed(6)),
  ];
}

function panel(
  partial: Omit<CharacterSheetPanelLayout, 'rect'> & {
    grid: { col: number; row: number; colSpan: number; rowSpan: number };
  },
): CharacterSheetPanelLayout {
  const { grid } = partial;
  return {
    ...partial,
    rect: cellRect(grid.col, grid.row, grid.colSpan, grid.rowSpan),
  };
}

/**
 * 锁定排版（12×10 网格）：
 *
 * Row0:  顶部信息条（名字/身份/年龄/性格/主题）
 * Row1-4:
 *   col0-1  剪影正/侧
 *   col2-2  身高比例尺
 *   col3-6  主身份四视图（正/3-4/侧/背）【最大区域】
 *   col7-10 色板 + 表情 2×4
 *   col11   预留边距
 * Row5:
 *   col7-11 微表情 5 格
 * Row6-7:
 *   col0-4  头部五角度
 *   col5-7  姿态三格
 *   col8-11 情绪特写
 * Row8-9:
 *   col0-3  服装细节 4 格
 *   col4-8  手部 5 格
 *   col9-11 预留
 */
export const CHARACTER_SHEET_PANEL_LAYOUT: CharacterSheetPanelLayout[] = [
  // 剪影（Row1-4, Col0-1）
  panel({
    id: 'silhouette-front',
    label: '剪影·正面',
    enLabel: 'SILHOUETTE FRONT',
    group: 'silhouette',
    grid: { col: 0, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'silhouetteFrontUrl' },
  }),
  panel({
    id: 'silhouette-side',
    label: '剪影·侧面',
    enLabel: 'SILHOUETTE SIDE',
    group: 'silhouette',
    grid: { col: 1, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'silhouetteSideUrl' },
  }),

  // 主身份四视图（Row1-4, Col3-6）— 全图最大区域
  panel({
    id: 'main-front',
    label: '主身份·正面',
    enLabel: 'MAIN FRONT',
    group: 'main-identity',
    grid: { col: 3, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'frontViewUrl' },
  }),
  panel({
    id: 'main-three-quarter',
    label: '主身份·3/4',
    enLabel: 'MAIN 3/4',
    group: 'main-identity',
    grid: { col: 4, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'threeQuarterViewUrl' },
  }),
  panel({
    id: 'main-side',
    label: '主身份·侧面',
    enLabel: 'MAIN SIDE',
    group: 'main-identity',
    grid: { col: 5, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'sideViewUrl' },
  }),
  panel({
    id: 'main-back',
    label: '主身份·背面',
    enLabel: 'MAIN BACK',
    group: 'main-identity',
    grid: { col: 6, row: 1, colSpan: 1, rowSpan: 4 },
    fill: { kind: 'field', field: 'backViewUrl' },
  }),

  // 表情 8（Row1-2 与 Row3-4，Col7-10）
  panel({
    id: 'expr-neutral',
    label: '表情·平静',
    enLabel: 'EXPR NEUTRAL',
    group: 'expressions',
    grid: { col: 7, row: 1, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'neutral', label: '平静' },
  }),
  panel({
    id: 'expr-curious',
    label: '表情·好奇',
    enLabel: 'EXPR CURIOUS',
    group: 'expressions',
    grid: { col: 8, row: 1, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'curious', label: '好奇' },
  }),
  panel({
    id: 'expr-tense',
    label: '表情·紧张',
    enLabel: 'EXPR TENSE',
    group: 'expressions',
    grid: { col: 9, row: 1, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'tense', label: '紧张' },
  }),
  panel({
    id: 'expr-surprised',
    label: '表情·惊讶',
    enLabel: 'EXPR SURPRISED',
    group: 'expressions',
    grid: { col: 10, row: 1, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'surprised', label: '惊讶' },
  }),
  panel({
    id: 'expr-afraid',
    label: '表情·害怕',
    enLabel: 'EXPR AFRAID',
    group: 'expressions',
    grid: { col: 7, row: 2, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'afraid', label: '害怕' },
  }),
  panel({
    id: 'expr-sad',
    label: '表情·悲伤',
    enLabel: 'EXPR SAD',
    group: 'expressions',
    grid: { col: 8, row: 2, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'sad', label: '悲伤' },
  }),
  panel({
    id: 'expr-determined',
    label: '表情·坚定',
    enLabel: 'EXPR DETERMINED',
    group: 'expressions',
    grid: { col: 9, row: 2, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'determined', label: '坚定' },
  }),
  panel({
    id: 'expr-relaxed',
    label: '表情·放松',
    enLabel: 'EXPR RELAXED',
    group: 'expressions',
    grid: { col: 10, row: 2, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'expressions', id: 'relaxed', label: '放松' },
  }),

  // 微表情 5（Row5, Col7-11）
  panel({
    id: 'micro-eye-tension',
    label: '微表情·眼部紧张',
    enLabel: 'MICRO EYE TENSION',
    group: 'micro',
    grid: { col: 7, row: 5, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'microExpressions', id: 'eye-tension', label: '眼部紧张' },
  }),
  panel({
    id: 'micro-slight-smile',
    label: '微表情·微笑',
    enLabel: 'MICRO SLIGHT SMILE',
    group: 'micro',
    grid: { col: 8, row: 5, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'microExpressions', id: 'slight-smile', label: '微笑' },
  }),
  panel({
    id: 'micro-mouth-tension',
    label: '微表情·嘴部用力',
    enLabel: 'MICRO MOUTH TENSION',
    group: 'micro',
    grid: { col: 9, row: 5, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'microExpressions', id: 'mouth-tension', label: '嘴部用力' },
  }),
  panel({
    id: 'micro-micro-fear',
    label: '微表情·微恐惧',
    enLabel: 'MICRO FEAR',
    group: 'micro',
    grid: { col: 10, row: 5, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'microExpressions', id: 'micro-fear', label: '微恐惧' },
  }),
  panel({
    id: 'micro-breath-control',
    label: '微表情·呼吸控制',
    enLabel: 'MICRO BREATH CONTROL',
    group: 'micro',
    grid: { col: 11, row: 5, colSpan: 1, rowSpan: 1 },
    fill: { kind: 'variant', group: 'microExpressions', id: 'breath-control', label: '呼吸控制' },
  }),

  // 头部 5（Row6-7, Col0-4）
  panel({
    id: 'head-three-quarter',
    label: '头部·3/4',
    enLabel: 'HEAD 3/4',
    group: 'head',
    grid: { col: 0, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'angles', id: 'head-three-quarter', label: '3/4' },
  }),
  panel({
    id: 'head-side',
    label: '头部·侧面',
    enLabel: 'HEAD SIDE',
    group: 'head',
    grid: { col: 1, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'angles', id: 'head-side', label: '侧面' },
  }),
  panel({
    id: 'head-up',
    label: '头部·仰视',
    enLabel: 'HEAD UP',
    group: 'head',
    grid: { col: 2, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'angles', id: 'head-up', label: '仰视' },
  }),
  panel({
    id: 'head-down',
    label: '头部·俯视',
    enLabel: 'HEAD DOWN',
    group: 'head',
    grid: { col: 3, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'angles', id: 'head-down', label: '俯视' },
  }),
  panel({
    id: 'head-back',
    label: '头部·背面',
    enLabel: 'HEAD BACK',
    group: 'head',
    grid: { col: 4, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'angles', id: 'head-back', label: '背面' },
  }),

  // 姿态 3（Row6-7, Col5-7）
  panel({
    id: 'pose-relaxed',
    label: '姿态·放松',
    enLabel: 'POSE RELAXED',
    group: 'posture',
    grid: { col: 5, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'poses', id: 'relaxed', label: '放松' },
  }),
  panel({
    id: 'pose-tense',
    label: '姿态·紧张',
    enLabel: 'POSE TENSE',
    group: 'posture',
    grid: { col: 6, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'poses', id: 'tense', label: '紧张' },
  }),
  panel({
    id: 'pose-confident',
    label: '姿态·自信',
    enLabel: 'POSE CONFIDENT',
    group: 'posture',
    grid: { col: 7, row: 6, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'poses', id: 'confident', label: '自信' },
  }),

  // 情绪特写（Row6-7, Col8-11）
  panel({
    id: 'emotional-closeup',
    label: '情绪特写',
    enLabel: 'EMOTIONAL CLOSE-UP',
    group: 'closeup',
    grid: { col: 8, row: 6, colSpan: 4, rowSpan: 2 },
    fill: { kind: 'field', field: 'emotionalCloseupUrl' },
  }),

  // 服装细节 4（Row8-9, Col0-3）
  panel({
    id: 'detail-hairstyle',
    label: '细节·发型',
    enLabel: 'DETAIL HAIRSTYLE',
    group: 'costume-detail',
    grid: { col: 0, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'costumeDetails', id: 'hairstyle', label: '发型' },
  }),
  panel({
    id: 'detail-fabric',
    label: '细节·材质',
    enLabel: 'DETAIL FABRIC',
    group: 'costume-detail',
    grid: { col: 1, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'costumeDetails', id: 'fabric', label: '材质' },
  }),
  panel({
    id: 'detail-accessory',
    label: '细节·配饰',
    enLabel: 'DETAIL ACCESSORY',
    group: 'costume-detail',
    grid: { col: 2, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'costumeDetails', id: 'accessory', label: '配饰' },
  }),
  panel({
    id: 'detail-footwear',
    label: '细节·鞋',
    enLabel: 'DETAIL FOOTWEAR',
    group: 'costume-detail',
    grid: { col: 3, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'costumeDetails', id: 'footwear', label: '鞋' },
  }),

  // 手部 5（Row8-9, Col4-8）
  panel({
    id: 'hand-relaxed',
    label: '手部·放松',
    enLabel: 'HAND RELAXED',
    group: 'hands',
    grid: { col: 4, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-relaxed', label: '放松' },
  }),
  panel({
    id: 'hand-tense',
    label: '手部·紧张',
    enLabel: 'HAND TENSE',
    group: 'hands',
    grid: { col: 5, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-tense', label: '紧张' },
  }),
  panel({
    id: 'hand-pointing',
    label: '手部·指向',
    enLabel: 'HAND POINTING',
    group: 'hands',
    grid: { col: 6, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-pointing', label: '指向' },
  }),
  panel({
    id: 'hand-grasping',
    label: '手部·抓握',
    enLabel: 'HAND GRASPING',
    group: 'hands',
    grid: { col: 7, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-grasping', label: '抓握' },
  }),
  panel({
    id: 'hand-touching-face',
    label: '手部·触脸',
    enLabel: 'HAND TOUCHING FACE',
    group: 'hands',
    grid: { col: 8, row: 8, colSpan: 1, rowSpan: 2 },
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-touching-face', label: '触脸' },
  }),
];

export const CHARACTER_SHEET_STYLE_LABELS: Record<CharacterSheetStyleMode, string> = {
  'photoreal-3d': '写实3D / Photoreal 3D',
  'stylized-3d': '风格化3D / Stylized 3D',
  anime: '动漫 / Anime',
  'semi-realistic': '半写实 / Semi-realistic',
  'ip-design': 'IP设计 / IP Design',
};

/** 把网格坐标转成提示词可执行描述 */
export function formatPanelGridSpec(p: CharacterSheetPanelLayout): string {
  const { col, row, colSpan, rowSpan } = p.grid;
  const colEnd = col + colSpan - 1;
  const rowEnd = row + rowSpan - 1;
  return `${p.enLabel} | grid cols ${col}-${colEnd}, rows ${row}-${rowEnd} | fill this cell only | content: ${p.label}`;
}

/** 生成「锁定排版」段落，供模型严格按格子出图 */
export function buildCharacterSheetLockedLayoutPrompt(): string {
  const lines: string[] = [
    '【LOCKED LAYOUT GRID — 最高优先级，必须严格遵守】',
    `Canvas = single image, landscape 4:3, white/off-white background.`,
    `Divide the whole image into a FIXED invisible grid: ${CHARACTER_SHEET_GRID_COLS} columns × ${CHARACTER_SHEET_GRID_ROWS} rows.`,
    `Column index 0..${CHARACTER_SHEET_GRID_COLS - 1} left→right; row index 0..${CHARACTER_SHEET_GRID_ROWS - 1} top→bottom.`,
    `Each panel MUST be drawn only inside its assigned cells. Do NOT move panels. Do NOT merge panels. Do NOT leave assigned cells empty.`,
    `Leave thin white gutters between cells (~2% of cell size). No overlapping panels. No watermark. No logo.`,
    '',
    'HEADER BAND (rows 0 only, cols 0-11):',
    'CHARACTER SHEET title + NAME + ROLE + AGE + PERSONALITY keywords + CORE THEME one sentence. Clean technical typography.',
    '',
    'COLOR PALETTE (rows 1, cols 7-10 top strip inside that zone if needed, or as 6-8 swatches above expressions): 6-8 pure color chips WITHOUT text labels.',
    '',
    'HEIGHT SCALE (rows 1-4, col 2): vertical cm ruler 0-170 for MAIN IDENTITY alignment only. No character body in this column.',
    '',
    'PANEL COORDINATE MAP (exact placement for later crop):',
  ];

  for (const p of CHARACTER_SHEET_PANEL_LAYOUT) {
    lines.push(`- ${formatPanelGridSpec(p)}`);
  }

  lines.push(
    '',
    'READING ORDER / ZONE SUMMARY:',
    '1) LEFT silhouettes: FRONT then SIDE black silhouettes (cols 0-1, rows 1-4).',
    '2) CENTER main identity (LARGEST ZONE): FRONT | 3/4 | SIDE | BACK full-body standard stand with height ruler (cols 3-6, rows 1-4). No props.',
    '3) RIGHT expressions 8 faces: row1 Neutral/Curious/Tense/Surprised; row2 Afraid/Sad/Determined/Relaxed (cols 7-10, rows 1-2).',
    '4) RIGHT micro expressions 5 crops under expressions (cols 7-11, row 5): Eye Tension / Slight Smile / Mouth Tension / Micro Fear / Breath Control.',
    '5) BOTTOM-LEFT head multi-angle (cols 0-4, rows 6-7): 3/4, Side, Up, Down, Back.',
    '6) BOTTOM-MID postures (cols 5-7, rows 6-7): Relaxed / Tense / Confident.',
    '7) BOTTOM-RIGHT emotional close-up chest-up strong emotion (cols 8-11, rows 6-7).',
    '8) FOOTER costume details (cols 0-3, rows 8-9): Hairstyle / Fabric / Accessory / Footwear.',
    '9) FOOTER hands (cols 4-8, rows 8-9): Relaxed / Tense / Pointing / Grasping / Touching Face.',
    '',
    'CROP SAFETY:',
    'Each assigned cell must contain ONLY its labeled subject, centered, with small margin inside the cell so rectangular crop remains valid.',
    'Do not draw text labels inside the image cells if possible; if labels are needed, place tiny English captions on the cell border outside the subject.',
  );

  return lines.join('\n');
}

/**
 * 生产级角色设定板主提示词（不可删减模块 + 锁定坐标）。
 */
export const CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE = `
【任务】
基于参考图/角色描述生成一张高精度角色设定板 (Character Sheet)。
锁定角色 ID，不允许生成新角色；所有格子必须基于同一角色结构与同一身份。
This sheet is the CHARACTER ID LOCK and single source of truth for future image/video generation.

【CHARACTER ID LOCK PRIORITY — 最高优先级】
- Never reinterpret the character.
- Never invent a new face, body, hairstyle, outfit, palette, or silhouette.
- All panels must share identical facial identity, bone structure, hairline, body proportion, clothing landmarks, materials and color palette.
- Maximum character consistency. Production reference quality.
- This sheet defines the canonical appearance for all future frames.

【基础设定字段】
风格: {styleLabel}
角色描述: {characterDescription}
性别: {gender}
年龄: {age}
体型: {bodyType}
风格关键词: {styleKeywords}
角色名: {characterName}
身份/职业: {role}
性格关键词: {personality}
核心主题: {coreTheme}
服装锁定: {costumeLock}
固定外貌锚点: {appearanceLock}
禁改项: {forbidden}

【画面结构】
- 画面比例: 4:3 横版 (landscape)
- 背景: 纯白 / 米白 / 极简无环境杂物
- UI: 干净技术排版，无 logo，无水印，无二维码
- 字体: 清晰可读英文标签（仅 header / 可选边注）
- 光照: 柔和摄影棚均匀光，真实皮肤与布料材质，影视级细节

{lockedLayout}

【必须包含模块 — 不得省略，且必须落在上述坐标格子内】
1. 顶部信息栏 (row 0)
   - 名字 (CHARACTER SHEET + NAME)
   - 角色身份 ROLE
   - 年龄 AGE
   - 性格关键词 PERSONALITY (3-5 个)
   - 核心主题 CORE THEME (1 句)

2. 配色系统 COLOR PALETTE
   - 6~8 个色块
   - 色块本身无文字

3. 轮廓剪影 SILHOUETTE
   - 正面剪影 @ cols0 rows1-4
   - 侧面剪影 @ cols1 rows1-4
   - 纯黑剪影，轮廓可读

4. 主身份展示 MAIN IDENTITY（最大区域，重点锁定角色）
   - 正面/3/4/侧面/背面 @ cols3-6 rows1-4
   - 标准站姿
   - 带身高比例线 (cm scale @ col2)
   - 无道具
   - 此区域必须是全图最大视觉权重

5. 表情系统 EXPRESSION SYSTEM (8 张)
   - row1: Neutral / Curious / Tense / Surprised @ cols7-10
   - row2: Afraid / Sad / Determined / Relaxed @ cols7-10
   - 同一头型、发型、五官结构

6. 微表情 MICRO EXPRESSIONS (5 张)
   - Eye Tension / Slight Smile / Mouth Tension / Micro Fear / Breath Control
   - 位置: cols7-11 row5
   - 局部特写，细节清晰

7. 头部结构 HEAD STRUCTURE (多角度)
   - 3/4 / Side / Up / Down / Back
   - 位置: cols0-4 rows6-7

8. 姿态变化 POSTURE VARIATIONS
   - Relaxed / Tense / Confident
   - 位置: cols5-7 rows6-7

9. 特写镜头 EMOTIONAL CLOSE-UP (1 张)
   - 胸部以上
   - 强情绪表达
   - 位置: cols8-11 rows6-7

10. 服装细节 COSTUME & DETAIL (4 张)
    - Hairstyle / Fabric / Accessory / Footwear
    - 位置: cols0-3 rows8-9
    - 材质真实可读

11. 手部动作 HAND REFERENCES
    - Relaxed / Tense / Pointing / Grasping / Touching Face
    - 位置: cols4-8 rows8-9

【一致性硬约束】
- 所有格子同一角色，脸/发型/比例/服装完全一致
- 不允许风格漂移、不允许换脸、不允许改服装主结构
- 主展示区域必须最大
- 皮肤/布料/金属等材质真实，4K 级细节
- 无水印、无多余文字块、无拼贴缝合痕迹
- 每个格子内容必须落在指定坐标内，便于程序按网格矩形裁切

【质量要求】
- Ultra high detail, production design bible quality
- Real materials (skin / fabric / metal as applicable)
- Cinematic soft studio lighting, clean contact sheet composition
- CHARACTER ID LOCK PRIORITY over aesthetics
- LAYOUT GRID LOCK PRIORITY over artistic rearrangement

Output: a single complete character master sheet image matching the LOCKED LAYOUT GRID above exactly.
`.trim();

export interface CharacterSheetPromptInput {
  characterName?: string;
  characterDescription?: string;
  styleMode?: CharacterSheetStyleMode;
  gender?: string;
  age?: string;
  bodyType?: string;
  styleKeywords?: string;
  role?: string;
  personality?: string;
  coreTheme?: string;
  costumeLock?: string;
  appearanceLock?: string;
  forbidden?: string;
  /** 若有参考图，强调必须继承身份 */
  hasReferenceImage?: boolean;
}

export function buildCharacterMasterSheetPrompt(input: CharacterSheetPromptInput): string {
  const styleMode = input.styleMode ?? 'semi-realistic';
  const lockedLayout = buildCharacterSheetLockedLayoutPrompt();
  const filled = CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE
    .replace('{styleLabel}', CHARACTER_SHEET_STYLE_LABELS[styleMode] || styleMode)
    .replace('{characterDescription}', input.characterDescription?.trim() || 'Use the provided character description and reference identity.')
    .replace('{gender}', input.gender?.trim() || 'as specified by character design')
    .replace('{age}', input.age?.trim() || 'as specified')
    .replace('{bodyType}', input.bodyType?.trim() || 'natural proportional body')
    .replace('{styleKeywords}', input.styleKeywords?.trim() || 'premium, cinematic, production reference, identity-locked')
    .replace('{characterName}', input.characterName?.trim() || 'UNNAMED')
    .replace('{role}', input.role?.trim() || 'as specified')
    .replace('{personality}', input.personality?.trim() || 'consistent with character bible')
    .replace('{coreTheme}', input.coreTheme?.trim() || 'Identity-locked character master reference for production continuity.')
    .replace('{costumeLock}', input.costumeLock?.trim() || 'keep outfit landmarks fixed across all panels')
    .replace('{appearanceLock}', input.appearanceLock?.trim() || 'keep face, hairline, body proportion and signature marks fixed')
    .replace('{forbidden}', input.forbidden?.trim() || 'no face morph, no wardrobe swap, no new character, no watermark')
    .replace('{lockedLayout}', lockedLayout);

  const refRule = input.hasReferenceImage
    ? '\n【参考图规则】Must match the uploaded reference identity exactly. Do not redesign the face. Treat reference as absolute character ID lock.'
    : '';

  return `${filled}${refRule}`;
}

/** 归一化矩形 → 像素裁切框（略内缩，避开格子白边） */
export function panelRectToPixels(
  rect: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  insetRatio = 0.04,
): { x: number; y: number; w: number; h: number } {
  const [nx, ny, nw, nh] = rect;
  const insetX = nw * insetRatio;
  const insetY = nh * insetRatio;
  const x = Math.max(0, Math.floor((nx + insetX) * imageWidth));
  const y = Math.max(0, Math.floor((ny + insetY) * imageHeight));
  const w = Math.max(1, Math.floor((nw - insetX * 2) * imageWidth));
  const h = Math.max(1, Math.floor((nh - insetY * 2) * imageHeight));
  return {
    x: Math.min(x, Math.max(0, imageWidth - 1)),
    y: Math.min(y, Math.max(0, imageHeight - 1)),
    w: Math.min(w, imageWidth - x),
    h: Math.min(h, imageHeight - y),
  };
}

export function groupCharacterSheetPanels(): Record<string, CharacterSheetPanelLayout[]> {
  const groups: Record<string, CharacterSheetPanelLayout[]> = {};
  for (const panelItem of CHARACTER_SHEET_PANEL_LAYOUT) {
    (groups[panelItem.group] ??= []).push(panelItem);
  }
  return groups;
}

/** 供调试/文档：导出人类可读网格说明 */
export function describeCharacterSheetGrid(): string {
  return buildCharacterSheetLockedLayoutPrompt();
}

// 避免未使用告警（header 常量保留语义）
void GRID_HEADER_ROWS;
