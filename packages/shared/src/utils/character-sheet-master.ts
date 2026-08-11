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

/** 设定板面板 id — 完整设定板与五类分类原图可各自使用，互不迁就 */
export type CharacterSheetPanelId =
  // —— 完整设定板（ID 圣经，不用于五类裁切）——
  | 'master-color-ref'
  | 'master-id-notes'
  | 'master-body-front'
  | 'master-body-side'
  | 'master-body-back'
  | 'master-face-front'
  | 'master-face-left'
  | 'master-face-right'
  | 'master-face-three-left'
  | 'master-face-three-right'
  | 'master-face-back'
  | 'master-expr-normal'
  | 'master-expr-smile'
  | 'master-expr-serious'
  | 'master-expr-surprised'
  | 'master-expr-shy'
  | 'master-expr-thinking'
  | 'master-expr-troubled'
  | 'master-expr-sad'
  | 'master-expr-calm'
  | 'master-detail-left-eye'
  | 'master-detail-right-eye'
  | 'master-detail-brow'
  | 'master-detail-nose'
  | 'master-detail-lips'
  | 'master-detail-ear'
  | 'master-detail-jaw'
  | 'master-detail-skin'
  | 'master-detail-bangs'
  | 'master-detail-side-hair'
  | 'master-detail-back-hair'
  | 'master-detail-hand'
  // —— 五类分类原图（生产裁切）——
  | 'main-front'
  | 'main-three-quarter'
  | 'main-side'
  | 'main-back'
  | 'silhouette-front'
  | 'silhouette-side'
  | 'face-lock'
  | 'expr-neutral'
  | 'expr-smile'
  | 'expr-angry'
  | 'expr-tense'
  | 'expr-surprised'
  | 'expr-afraid'
  | 'expr-sad'
  | 'expr-determined'
  | 'micro-eye-tension'
  | 'micro-slight-smile'
  | 'micro-mouth-tension'
  | 'micro-micro-fear'
  | 'micro-breath-control'
  | 'micro-lip-bite'
  | 'head-three-quarter'
  | 'head-side'
  | 'head-up'
  | 'head-down'
  | 'head-back'
  | 'pose-relaxed'
  | 'pose-tense'
  | 'pose-confident'
  | 'detail-hairstyle'
  | 'detail-fabric'
  | 'detail-accessory'
  | 'detail-footwear'
  | 'hand-relaxed'
  | 'hand-tense'
  | 'hand-pointing'
  | 'hand-grasping'
  | 'hand-touching-face';

export type CharacterSheetCategoryId =
  | 'identity'
  | 'expressions'
  | 'micro-expressions'
  | 'head-and-posture'
  | 'costume-and-hands';

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
/** 生成器与裁剪器共同遵守的母板尺寸；实际图片必须保持相同 4:3 比例。 */
export const CHARACTER_SHEET_CANVAS_WIDTH = 1536;
export const CHARACTER_SHEET_CANVAS_HEIGHT = 1152;
/** 分类母图顶部标题条占比；内容网格从该线以下按 cols×rows 等分（裁切与提示词共用）。 */
export const CHARACTER_SHEET_CATEGORY_HEADER_RATIO = 0.08;

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
 * 面板元数据。
 * masterGrid 有值 = 出现在「角色完整设定板」（ID 圣经，只读，不裁切生产槽）；
 * 无值 = 仅五类分类原图展开。
 *
 * 完整设定板锁定排版（12×10，与五类完全脱钩）：
 * Row0:     顶栏
 * Row1-3:   色彩参考 | 全身三视图 | （右侧表情矩阵上半）
 * Row4-6:   身份锁要点 | 脸部六角 | （右侧表情矩阵下半）
 * Row7-9:   细节特征 12 格（五官/肤/发/手）
 */
export interface CharacterSheetPanelDef {
  id: CharacterSheetPanelId;
  label: string;
  group: string;
  enLabel: string;
  fill: CharacterSheetPanelLayout['fill'];
  /** 完整设定板上的固定网格；缺省表示仅分类原图使用 */
  masterGrid?: { col: number; row: number; colSpan: number; rowSpan: number };
}

const masterOnlyFill = { kind: 'field' as const, field: 'fullSheetUrl' };

export const CHARACTER_SHEET_PANEL_DEFS: CharacterSheetPanelDef[] = [
  {
    id: 'master-color-ref',
    label: '色彩参考',
    enLabel: 'COLOR REF',
    group: 'master-bible',
    masterGrid: { col: 0, row: 1, colSpan: 3, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-id-notes',
    label: '身份锁要点',
    enLabel: 'ID NOTES',
    group: 'master-bible',
    masterGrid: { col: 0, row: 4, colSpan: 3, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-body-front',
    label: '全身正面',
    enLabel: 'BODY FRONT',
    group: 'master-body',
    masterGrid: { col: 3, row: 1, colSpan: 2, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-body-side',
    label: '全身侧面',
    enLabel: 'BODY SIDE',
    group: 'master-body',
    masterGrid: { col: 5, row: 1, colSpan: 2, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-body-back',
    label: '全身背面',
    enLabel: 'BODY BACK',
    group: 'master-body',
    masterGrid: { col: 7, row: 1, colSpan: 2, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-front',
    label: '脸部正面',
    enLabel: 'FACE FRONT',
    group: 'master-face',
    masterGrid: { col: 3, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-left',
    label: '侧脸左',
    enLabel: 'FACE LEFT',
    group: 'master-face',
    masterGrid: { col: 4, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-right',
    label: '侧脸右',
    enLabel: 'FACE RIGHT',
    group: 'master-face',
    masterGrid: { col: 5, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-three-left',
    label: '斜左',
    enLabel: 'FACE 3/4 L',
    group: 'master-face',
    masterGrid: { col: 6, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-three-right',
    label: '斜右',
    enLabel: 'FACE 3/4 R',
    group: 'master-face',
    masterGrid: { col: 7, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-face-back',
    label: '后脑勺',
    enLabel: 'FACE BACK',
    group: 'master-face',
    masterGrid: { col: 8, row: 4, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-normal',
    label: '通常',
    enLabel: 'EXPR NORMAL',
    group: 'master-expr',
    masterGrid: { col: 9, row: 1, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-smile',
    label: '微笑',
    enLabel: 'EXPR SMILE',
    group: 'master-expr',
    masterGrid: { col: 10, row: 1, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-serious',
    label: '认真',
    enLabel: 'EXPR SERIOUS',
    group: 'master-expr',
    masterGrid: { col: 11, row: 1, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-surprised',
    label: '惊讶',
    enLabel: 'EXPR SURPRISED',
    group: 'master-expr',
    masterGrid: { col: 9, row: 3, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-shy',
    label: '害羞',
    enLabel: 'EXPR SHY',
    group: 'master-expr',
    masterGrid: { col: 10, row: 3, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-thinking',
    label: '思考',
    enLabel: 'EXPR THINKING',
    group: 'master-expr',
    masterGrid: { col: 11, row: 3, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-troubled',
    label: '困扰',
    enLabel: 'EXPR TROUBLED',
    group: 'master-expr',
    masterGrid: { col: 9, row: 5, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-sad',
    label: '悲伤',
    enLabel: 'EXPR SAD',
    group: 'master-expr',
    masterGrid: { col: 10, row: 5, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-expr-calm',
    label: '平静',
    enLabel: 'EXPR CALM',
    group: 'master-expr',
    masterGrid: { col: 11, row: 5, colSpan: 1, rowSpan: 2 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-left-eye',
    label: '左眼',
    enLabel: 'DETAIL L EYE',
    group: 'master-detail',
    masterGrid: { col: 0, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-right-eye',
    label: '右眼',
    enLabel: 'DETAIL R EYE',
    group: 'master-detail',
    masterGrid: { col: 1, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-brow',
    label: '眉毛',
    enLabel: 'DETAIL BROW',
    group: 'master-detail',
    masterGrid: { col: 2, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-nose',
    label: '鼻子',
    enLabel: 'DETAIL NOSE',
    group: 'master-detail',
    masterGrid: { col: 3, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-lips',
    label: '嘴唇',
    enLabel: 'DETAIL LIPS',
    group: 'master-detail',
    masterGrid: { col: 4, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-ear',
    label: '耳朵',
    enLabel: 'DETAIL EAR',
    group: 'master-detail',
    masterGrid: { col: 5, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-jaw',
    label: '下颌',
    enLabel: 'DETAIL JAW',
    group: 'master-detail',
    masterGrid: { col: 6, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-skin',
    label: '皮肤',
    enLabel: 'DETAIL SKIN',
    group: 'master-detail',
    masterGrid: { col: 7, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-bangs',
    label: '刘海',
    enLabel: 'DETAIL BANGS',
    group: 'master-detail',
    masterGrid: { col: 8, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-side-hair',
    label: '侧发',
    enLabel: 'DETAIL SIDE HAIR',
    group: 'master-detail',
    masterGrid: { col: 9, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-back-hair',
    label: '后发',
    enLabel: 'DETAIL BACK HAIR',
    group: 'master-detail',
    masterGrid: { col: 10, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },
  {
    id: 'master-detail-hand',
    label: '手部',
    enLabel: 'DETAIL HAND',
    group: 'master-detail',
    masterGrid: { col: 11, row: 7, colSpan: 1, rowSpan: 3 },
    fill: masterOnlyFill,
  },

  // —— 以下仅五类分类原图（无 masterGrid）——
  {
    id: 'silhouette-front',
    label: '剪影·正面',
    enLabel: 'SILHOUETTE FRONT',
    group: 'silhouette',
    fill: { kind: 'field', field: 'silhouetteFrontUrl' },
  },
  {
    id: 'silhouette-side',
    label: '剪影·侧面',
    enLabel: 'SILHOUETTE SIDE',
    group: 'silhouette',
    fill: { kind: 'field', field: 'silhouetteSideUrl' },
  },
  {
    id: 'main-front',
    label: '主身份·正面',
    enLabel: 'MAIN FRONT',
    group: 'main-identity',
    fill: { kind: 'field', field: 'frontViewUrl' },
  },
  {
    id: 'main-three-quarter',
    label: '主身份·3/4',
    enLabel: 'MAIN 3/4',
    group: 'main-identity',
    fill: { kind: 'field', field: 'threeQuarterViewUrl' },
  },
  {
    id: 'main-side',
    label: '主身份·侧面',
    enLabel: 'MAIN SIDE',
    group: 'main-identity',
    fill: { kind: 'field', field: 'sideViewUrl' },
  },
  {
    id: 'main-back',
    label: '主身份·背面',
    enLabel: 'MAIN BACK',
    group: 'main-identity',
    fill: { kind: 'field', field: 'backViewUrl' },
  },
  {
    id: 'face-lock',
    label: '定妆头像',
    enLabel: 'FACE LOCK',
    group: 'face-lock',
    fill: { kind: 'field', field: 'faceLockUrl' },
  },
  {
    id: 'expr-neutral',
    label: '表情·平静',
    enLabel: 'EXPR NEUTRAL',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'neutral', label: '平静' },
  },
  {
    id: 'expr-smile',
    label: '表情·微笑',
    enLabel: 'EXPR SMILE',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'smile', label: '微笑' },
  },
  {
    id: 'expr-angry',
    label: '表情·愤怒',
    enLabel: 'EXPR ANGRY',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'angry', label: '愤怒' },
  },
  {
    id: 'expr-tense',
    label: '表情·紧张',
    enLabel: 'EXPR TENSE',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'tense', label: '紧张' },
  },
  {
    id: 'expr-surprised',
    label: '表情·惊讶',
    enLabel: 'EXPR SURPRISED',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'surprised', label: '惊讶' },
  },
  {
    id: 'expr-afraid',
    label: '表情·害怕',
    enLabel: 'EXPR AFRAID',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'afraid', label: '害怕' },
  },
  {
    id: 'expr-sad',
    label: '表情·悲伤',
    enLabel: 'EXPR SAD',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'sad', label: '悲伤' },
  },
  {
    id: 'expr-determined',
    label: '表情·坚定',
    enLabel: 'EXPR DETERMINED',
    group: 'expressions',
    fill: { kind: 'variant', group: 'expressions', id: 'determined', label: '坚定' },
  },
  {
    id: 'micro-eye-tension',
    label: '微表情·眼部紧张',
    enLabel: 'MICRO EYE TENSION',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'eye-tension', label: '眼部紧张' },
  },
  {
    id: 'micro-slight-smile',
    label: '微表情·微笑',
    enLabel: 'MICRO SLIGHT SMILE',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'slight-smile', label: '微笑' },
  },
  {
    id: 'micro-mouth-tension',
    label: '微表情·嘴部用力',
    enLabel: 'MICRO MOUTH TENSION',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'mouth-tension', label: '嘴部用力' },
  },
  {
    id: 'micro-micro-fear',
    label: '微表情·微恐惧',
    enLabel: 'MICRO FEAR',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'micro-fear', label: '微恐惧' },
  },
  {
    id: 'micro-breath-control',
    label: '微表情·呼吸控制',
    enLabel: 'MICRO BREATH CONTROL',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'breath-control', label: '呼吸控制' },
  },
  {
    id: 'micro-lip-bite',
    label: '微表情·咬唇',
    enLabel: 'MICRO LIP BITE',
    group: 'micro',
    fill: { kind: 'variant', group: 'microExpressions', id: 'lip-bite', label: '咬唇' },
  },
  {
    id: 'head-three-quarter',
    label: '头部·3/4',
    enLabel: 'HEAD 3/4',
    group: 'head',
    fill: { kind: 'variant', group: 'angles', id: 'head-three-quarter', label: '3/4' },
  },
  {
    id: 'head-side',
    label: '头部·侧面',
    enLabel: 'HEAD SIDE',
    group: 'head',
    fill: { kind: 'variant', group: 'angles', id: 'head-side', label: '侧面' },
  },
  {
    id: 'head-up',
    label: '头部·仰视',
    enLabel: 'HEAD UP',
    group: 'head',
    fill: { kind: 'variant', group: 'angles', id: 'head-up', label: '仰视' },
  },
  {
    id: 'head-down',
    label: '头部·俯视',
    enLabel: 'HEAD DOWN',
    group: 'head',
    fill: { kind: 'variant', group: 'angles', id: 'head-down', label: '俯视' },
  },
  {
    id: 'head-back',
    label: '头部·背面',
    enLabel: 'HEAD BACK',
    group: 'head',
    fill: { kind: 'variant', group: 'angles', id: 'head-back', label: '背面' },
  },
  {
    id: 'pose-relaxed',
    label: '姿态·放松',
    enLabel: 'POSE RELAXED',
    group: 'posture',
    fill: { kind: 'variant', group: 'poses', id: 'relaxed', label: '放松' },
  },
  {
    id: 'pose-tense',
    label: '姿态·紧张',
    enLabel: 'POSE TENSE',
    group: 'posture',
    fill: { kind: 'variant', group: 'poses', id: 'tense', label: '紧张' },
  },
  {
    id: 'pose-confident',
    label: '姿态·自信',
    enLabel: 'POSE CONFIDENT',
    group: 'posture',
    fill: { kind: 'variant', group: 'poses', id: 'confident', label: '自信' },
  },
  {
    id: 'detail-hairstyle',
    label: '细节·发型',
    enLabel: 'DETAIL HAIRSTYLE',
    group: 'costume-detail',
    fill: { kind: 'variant', group: 'costumeDetails', id: 'hairstyle', label: '发型' },
  },
  {
    id: 'detail-fabric',
    label: '细节·材质',
    enLabel: 'DETAIL FABRIC',
    group: 'costume-detail',
    fill: { kind: 'variant', group: 'costumeDetails', id: 'fabric', label: '材质' },
  },
  {
    id: 'detail-accessory',
    label: '细节·配饰',
    enLabel: 'DETAIL ACCESSORY',
    group: 'costume-detail',
    fill: { kind: 'variant', group: 'costumeDetails', id: 'accessory', label: '配饰' },
  },
  {
    id: 'detail-footwear',
    label: '细节·鞋',
    enLabel: 'DETAIL FOOTWEAR',
    group: 'costume-detail',
    fill: { kind: 'variant', group: 'costumeDetails', id: 'footwear', label: '鞋' },
  },
  {
    id: 'hand-relaxed',
    label: '手部·放松',
    enLabel: 'HAND RELAXED',
    group: 'hands',
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-relaxed', label: '放松' },
  },
  {
    id: 'hand-tense',
    label: '手部·紧张',
    enLabel: 'HAND TENSE',
    group: 'hands',
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-tense', label: '紧张' },
  },
  {
    id: 'hand-pointing',
    label: '手部·指向',
    enLabel: 'HAND POINTING',
    group: 'hands',
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-pointing', label: '指向' },
  },
  {
    id: 'hand-grasping',
    label: '手部·抓握',
    enLabel: 'HAND GRASPING',
    group: 'hands',
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-grasping', label: '抓握' },
  },
  {
    id: 'hand-touching-face',
    label: '手部·触脸',
    enLabel: 'HAND TOUCHING FACE',
    group: 'hands',
    fill: { kind: 'variant', group: 'handRefs', id: 'hand-touching-face', label: '触脸' },
  },
];

/** 完整设定板面板（仅含 masterGrid）；分类原图从 DEFS 取元数据后覆写局部坐标 */
export const CHARACTER_SHEET_PANEL_LAYOUT: CharacterSheetPanelLayout[] = CHARACTER_SHEET_PANEL_DEFS
  .filter((def): def is CharacterSheetPanelDef & { masterGrid: NonNullable<CharacterSheetPanelDef['masterGrid']> } => Boolean(def.masterGrid))
  .map((def) => panel({
    id: def.id,
    label: def.label,
    enLabel: def.enLabel,
    group: def.group,
    grid: def.masterGrid,
    fill: def.fill,
  }));

function panelDefStub(def: CharacterSheetPanelDef): CharacterSheetPanelLayout {
  return panel({
    id: def.id,
    label: def.label,
    enLabel: def.enLabel,
    group: def.group,
    grid: def.masterGrid ?? { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
    fill: def.fill,
  });
}

export interface CharacterSheetCategoryLayout {
  id: CharacterSheetCategoryId;
  label: string;
  description: string;
  cols: number;
  rows: number;
  panels: CharacterSheetPanelLayout[];
}

/** 分类母图局部归一化矩形（含顶部标题条）。 */
function categoryCellRect(
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  cols: number,
  rows: number,
): [number, number, number, number] {
  const header = CHARACTER_SHEET_CATEGORY_HEADER_RATIO;
  const contentH = 1 - header;
  const x = col / cols;
  const y = header + (row / rows) * contentH;
  const w = colSpan / cols;
  const h = (rowSpan / rows) * contentH;
  return [
    Number(x.toFixed(6)),
    Number(y.toFixed(6)),
    Number(w.toFixed(6)),
    Number(h.toFixed(6)),
  ];
}

function categoryPanelFromSource(
  source: CharacterSheetPanelLayout,
  grid: { col: number; row: number; colSpan: number; rowSpan: number },
  cols: number,
  rows: number,
): CharacterSheetPanelLayout {
  return {
    ...source,
    grid,
    rect: categoryCellRect(grid.col, grid.row, grid.colSpan, grid.rowSpan, cols, rows),
  };
}

function categoryLayout(
  id: CharacterSheetCategoryId,
  label: string,
  description: string,
  cols: number,
  rows: number,
  panelIds: CharacterSheetPanelId[],
): CharacterSheetCategoryLayout {
  const source = new Map(CHARACTER_SHEET_PANEL_DEFS.map((item) => [item.id, item]));
  const panels = panelIds.map((panelId, index) => {
    const def = source.get(panelId);
    if (!def) throw new Error(`角色设定板面板不存在: ${panelId}`);
    const col = index % cols;
    const row = Math.floor(index / cols);
    return categoryPanelFromSource(panelDefStub(def), { col, row, colSpan: 1, rowSpan: 1 }, cols, rows);
  });
  return { id, label, description, cols, rows, panels };
}

function categoryLayoutExplicit(
  id: CharacterSheetCategoryId,
  label: string,
  description: string,
  cols: number,
  rows: number,
  placements: Array<{
    id: CharacterSheetPanelId;
    col: number;
    row: number;
    colSpan?: number;
    rowSpan?: number;
  }>,
): CharacterSheetCategoryLayout {
  const source = new Map(CHARACTER_SHEET_PANEL_DEFS.map((item) => [item.id, item]));
  const panels = placements.map((placement) => {
    const def = source.get(placement.id);
    if (!def) throw new Error(`角色设定板面板不存在: ${placement.id}`);
    return categoryPanelFromSource(
      panelDefStub(def),
      {
        col: placement.col,
        row: placement.row,
        colSpan: placement.colSpan ?? 1,
        rowSpan: placement.rowSpan ?? 1,
      },
      cols,
      rows,
    );
  });
  return { id, label, description, cols, rows, panels };
}

/**
 * 五张独立分类母图的局部坐标。每张图只负责自己的内容，避免跨区域裁切漂移。
 *
 * identity：3×2 — 两行各 3 个全身格（剪影 + 主身份四视图）；禁止情绪特写与表情墙。
 * expressions：筛选后的 8 表情，保持 4×2，避免合并后拥挤。
 * micro-expressions：6 格 3×2，单格接近方形，避免 5×1 竖条切片。
 * head-and-posture：上排 5 头 + 下排 3 姿（下排更宽），禁止 8×1 混排竖条。
 * costume-and-hands：上排 4 细节 + 下排 5 手部，禁止 9×1 混排竖条。
 */
export const CHARACTER_SHEET_CATEGORY_LAYOUTS: CharacterSheetCategoryLayout[] = [
  categoryLayoutExplicit(
    'identity',
    '主身份 / 剪影',
    '正侧剪影 + 主身份四视图（2×3）。禁止情绪特写与表情墙。',
    3,
    2,
    [
      { id: 'silhouette-front', col: 0, row: 0 },
      { id: 'silhouette-side', col: 1, row: 0 },
      { id: 'main-front', col: 2, row: 0 },
      { id: 'main-three-quarter', col: 0, row: 1 },
      { id: 'main-side', col: 1, row: 1 },
      { id: 'main-back', col: 2, row: 1 },
    ],
  ),
  categoryLayout(
    'expressions',
    '表情系统（8）',
    '筛选八表情：平静/微笑/愤怒/紧张/惊讶/害怕/悲伤/坚定',
    4,
    2,
    [
      'expr-neutral',
      'expr-smile',
      'expr-angry',
      'expr-tense',
      'expr-surprised',
      'expr-afraid',
      'expr-sad',
      'expr-determined',
    ],
  ),
  categoryLayout(
    'micro-expressions',
    '微表情（6）',
    '六种微表情局部高清特写：3×2 近方形网格，避免细长竖条半脸切片',
    3,
    2,
    [
      'micro-eye-tension',
      'micro-slight-smile',
      'micro-mouth-tension',
      'micro-micro-fear',
      'micro-breath-control',
      'micro-lip-bite',
    ],
  ),
  categoryLayoutExplicit(
    'head-and-posture',
    '头部结构 / 姿态',
    '上排头部五角度；下排三种全身姿态（每格更宽，避免与头像同宽竖条）',
    15,
    2,
    [
      { id: 'head-three-quarter', col: 0, row: 0, colSpan: 3 },
      { id: 'head-side', col: 3, row: 0, colSpan: 3 },
      { id: 'head-up', col: 6, row: 0, colSpan: 3 },
      { id: 'head-down', col: 9, row: 0, colSpan: 3 },
      { id: 'head-back', col: 12, row: 0, colSpan: 3 },
      { id: 'pose-relaxed', col: 0, row: 1, colSpan: 5 },
      { id: 'pose-tense', col: 5, row: 1, colSpan: 5 },
      { id: 'pose-confident', col: 10, row: 1, colSpan: 5 },
    ],
  ),
  categoryLayoutExplicit(
    'costume-and-hands',
    '服装细节 / 手部动作',
    '上排服装细节四格；下排五种手部动作（禁止 9×1 等宽细竖条）',
    20,
    2,
    [
      { id: 'detail-hairstyle', col: 0, row: 0, colSpan: 5 },
      { id: 'detail-fabric', col: 5, row: 0, colSpan: 5 },
      { id: 'detail-accessory', col: 10, row: 0, colSpan: 5 },
      { id: 'detail-footwear', col: 15, row: 0, colSpan: 5 },
      { id: 'hand-relaxed', col: 0, row: 1, colSpan: 4 },
      { id: 'hand-tense', col: 4, row: 1, colSpan: 4 },
      { id: 'hand-pointing', col: 8, row: 1, colSpan: 4 },
      { id: 'hand-grasping', col: 12, row: 1, colSpan: 4 },
      { id: 'hand-touching-face', col: 16, row: 1, colSpan: 4 },
    ],
  ),
];

export function getCharacterSheetCategoryLayout(id: CharacterSheetCategoryId): CharacterSheetCategoryLayout {
  const layout = CHARACTER_SHEET_CATEGORY_LAYOUTS.find((item) => item.id === id);
  if (!layout) throw new Error(`角色设定板分类不存在: ${id}`);
  return layout;
}

/** 每个子格的明确画面契约，避免模型只按抽象分类自由发挥。 */
export const CHARACTER_SHEET_PANEL_CONTENT: Record<CharacterSheetPanelId, string> = {
  'master-color-ref': '色彩参考模块：竖排或两列排列 7 个纯色色块，每个色块旁必须用清晰可读的简体中文标注——发色、瞳色、肤色、眉色、服装色、阴影色、基调色；禁止英文、禁止乱码、禁止伪文字；色值必须取自本角色真实配色',
  'master-id-notes': '身份锁要点文字模块：用简体中文竖排列出 8 条——脸型固定、眼周固定、鼻形固定、嘴唇固定、刘海固定、体型固定、服装统一、同一角色优先；字迹清晰工整，禁止英文、乱码、伪文字；本格不得画人物',
  'master-body-front': '全身正面标准站姿；头到脚完整入画并留安全边距；锁定体型、服装与脸；禁止贴边裁切与横向压扁',
  'master-body-side': '全身严格侧面标准站姿；头到脚完整入画；锁定侧面轮廓、胸背厚度与服装侧面',
  'master-body-back': '全身背面标准站姿；头到脚完整入画；锁定后脑、肩背、后衣身与鞋履',
  'master-face-front': '脸部正面头肩特写；中性平静表情；发际线、五官、肤色锐利锁定；禁止全身',
  'master-face-left': '左侧脸头肩特写；清楚显示额头、鼻梁、嘴唇、下颌与耳部；同一身份',
  'master-face-right': '右侧脸头肩特写；与左侧镜像角度对应；五官结构与正面完全一致',
  'master-face-three-left': '斜左四分之三脸部特写；展示立体结构；禁止换脸',
  'master-face-three-right': '斜右四分之三脸部特写；与斜左对称；同一发型与妆造',
  'master-face-back': '后脑勺/后侧发型特写；锁定发量、发线与后发层次；可带少许颈肩',
  'master-expr-normal': '胸部以上通常表情；作为表情矩阵基准；脸部锐利；同一头型发型',
  'master-expr-smile': '胸部以上微笑；嘴角自然上扬，不变成大笑；身份不变',
  'master-expr-serious': '胸部以上认真表情；眉眼收紧、嘴唇闭合；身份不变',
  'master-expr-surprised': '胸部以上惊讶；眉抬眼睁口微张；身份不变',
  'master-expr-shy': '胸部以上害羞；眼神略躲、嘴角轻抿；身份不变',
  'master-expr-thinking': '胸部以上思考；目光微偏、眉眼轻收；身份不变',
  'master-expr-troubled': '胸部以上困扰；眉心微蹙、嘴角紧张；身份不变',
  'master-expr-sad': '胸部以上悲伤；眉尾下垂、嘴角向下；身份不变',
  'master-expr-calm': '胸部以上平静；放松眉眼与嘴唇；与通常区分在更松弛；身份不变',
  'master-detail-left-eye': '左眼局部高清特写；瞳色、眼形、睫毛与眼周结构清楚；禁止半脸竖条',
  'master-detail-right-eye': '右眼局部高清特写；与左眼同一瞳色与眼形；禁止半脸竖条',
  'master-detail-brow': '眉毛局部高清特写；眉形、眉色与密度清楚',
  'master-detail-nose': '鼻子正面或近正面局部高清特写；鼻梁、鼻翼结构清楚',
  'master-detail-lips': '嘴唇局部高清特写；唇形、唇色清楚；中性闭合或微松',
  'master-detail-ear': '耳朵局部高清特写；耳廓结构清楚',
  'master-detail-jaw': '下颌轮廓局部高清特写；下颌线与颊侧清楚',
  'master-detail-skin': '皮肤质感局部高清特写；毛孔/细纹理可读但不脏污夸张',
  'master-detail-bangs': '刘海结构局部高清特写；发丝走向与分缝清楚',
  'master-detail-side-hair': '侧发结构局部高清特写；耳侧发量与层次清楚',
  'master-detail-back-hair': '后发结构局部高清特写；后脑发层与发尾清楚',
  'master-detail-hand': '手部特写；手指结构清楚，若有手套则手套一致；可双手交叠或单手',
  'silhouette-front': '全身正面纯黑剪影，站直；头到脚完整入画，四周留安全边距；完整显示头肩、躯干、四肢和标志性轮廓，禁止贴边裁切',
  'silhouette-side': '全身侧面纯黑剪影，站直；头到脚完整入画，四周留安全边距；清楚显示鼻梁、背部、腿部和道具轮廓，禁止贴边裁切',
  'main-front': '角色全身正面标准站姿；头到脚完整入画，四周留 8%–12% 安全边距；手臂自然下垂且不贴左右边框；体型偏宽时仍保持真实比例与完整外轮廓，禁止横向压扁；脸部五官锐利清晰',
  'main-three-quarter': '角色全身四分之三正面标准站姿；头到脚完整入画并留安全边距；展示脸部立体结构与服装前侧层次；禁止裁切肩臂与脚底；脸部锐利',
  'main-side': '角色全身严格侧面标准站姿；头到脚完整入画并留安全边距；展示脸部侧面、胸背厚度和服装侧面轮廓；禁止贴边裁切；脸部锐利',
  'main-back': '角色全身背面标准站姿；头到脚完整入画并留安全边距；展示后脑、肩背、后衣身、裤装和鞋履结构；禁止截断头顶或脚底',
  'face-lock': '定妆头像（脸锁）：胸部以上正面中性平静表情特写；脸部占格面积极大且锐利；锁定发际线、五官、肤色与妆造；禁止夸张表情、禁止全身',
  'expr-neutral': '胸部以上正面平静表情，嘴唇放松，眉眼自然，脸部占格面积极大且锐利，作为其他表情的基准',
  'expr-smile': '胸部以上正面微笑表情，嘴角自然上扬，眼神柔和，不变成大笑；脸部清晰锐利',
  'expr-angry': '胸部以上正面愤怒表情，眉头紧锁，眼神凌厉，嘴角下压或咬肌紧张；脸部清晰锐利',
  'expr-tense': '胸部以上正面紧张表情，眉眼收紧，嘴角绷住，下颌有压力感；脸部清晰锐利',
  'expr-surprised': '胸部以上正面惊讶表情，双眉抬高，眼睛睁大，嘴巴自然张开；脸部清晰锐利',
  'expr-afraid': '胸部以上正面害怕表情，眼神受惊，眉心上提，嘴唇颤抖但不夸张；脸部清晰锐利',
  'expr-sad': '胸部以上正面悲伤表情，眉尾下垂，眼眶湿润，嘴角向下；脸部清晰锐利',
  'expr-determined': '胸部以上正面坚定表情，眼神锐利，眉眼稳定，嘴唇紧闭；脸部清晰锐利',
  'micro-eye-tension': '眉眼局部特写：眼轮匝肌收紧、眉眼紧张；构图接近方形，主体居中并留安全边距；只画眉眼区域，禁止半脸竖条切片，禁止大面积嘴部入画',
  'micro-slight-smile': '眼角与嘴角局部特写：嘴角极轻微上扬的克制微笑；构图接近方形，主体居中；清楚看到眼角与嘴角联动，不变成大笑，禁止半脸竖条',
  'micro-mouth-tension': '嘴部与下颌局部特写：嘴唇收紧、下颌用力；构图接近方形，口鼻区居中；表现压抑情绪，禁止只剩一条窄竖缝',
  'micro-micro-fear': '双眼与口鼻局部特写：极轻微恐惧，眼神闪动、嘴唇微紧；构图接近方形，脸部关键区域居中且锐利，禁止半脸竖条',
  'micro-breath-control': '鼻口与下颌局部特写：控制呼吸的细微变化；构图接近方形，口鼻居中；嘴唇与下颌克制，禁止裁成过窄竖条',
  'micro-lip-bite': '唇部局部特写：上齿或下齿轻咬唇缘；构图接近方形，嘴唇居中且锐利；与“嘴部用力”区分——是咬住而非抿紧，禁止半脸竖条',
  'head-three-quarter': '头肩四分之三角度肖像；脸部居中且锐利，清楚显示发际线、鼻梁和下颌；构图接近竖方，四周留安全边距；禁止全身、禁止裁成过窄竖条',
  'head-side': '头肩严格侧面角度肖像；脸部居中且锐利，清楚显示额头、鼻梁、嘴唇、下颌和耳部；构图接近竖方，留安全边距；禁止全身、禁止过窄竖条',
  'head-up': '头肩仰视角度肖像；视线略向上，清楚展示下颌线与颈部连接；脸部锐利居中，构图接近竖方并留边距；禁止全身、禁止过窄竖条',
  'head-down': '头肩俯视角度肖像；视线略向下，清楚展示眉骨、眼睑和头顶发型；脸部锐利居中，构图接近竖方并留边距；禁止全身、禁止过窄竖条',
  'head-back': '头肩背面角度肖像；清楚展示后脑形状、发型后部和颈部连接；主体居中，构图接近竖方并留边距；禁止全身、禁止过窄竖条',
  'pose-relaxed': '全身放松姿态：双肩下沉、重心自然略偏、双臂完全自然下垂、双手手指松开；头到脚完整入画并留 8%–12% 安全边距；与“紧张/自信”必须一眼可辨；禁止横向压扁',
  'pose-tense': '全身紧张戒备姿态：双肩明显上提收紧、躯干略前倾或重心压低、双手半握拳贴近身侧或抬至腰际戒备位；与“放松”手臂自然下垂必须明显不同；头到脚完整入画并留安全边距；禁止横向压扁',
  'pose-confident': '全身自信姿态：双手叉腰或一叉腰、胸腔打开、肩背挺直、双腿站稳；头到脚完整入画并留安全边距；与放松/紧张一眼可辨；禁止横向压扁、禁止截断头顶或脚底',
  'detail-hairstyle': '发型局部高清特写：以发丝走向、发际线、层次与固定方式为主体居中；构图接近方形并留安全边距；配饰仅作陪衬，不得抢过发型本身；禁止半身大肖像、禁止过窄竖条',
  'detail-fabric': '服装面料局部高清特写：织物纹理、缝线、褶皱、磨损与真实材质反光清楚可读；构图接近方形，主体居中留边距；禁止整件服装全身、禁止过窄竖条',
  'detail-accessory': '服装配饰局部高清特写：标志物形状、材质、颜色、连接方式与磨损清楚；构图接近方形，配饰居中；禁止半身大肖像抢戏、禁止过窄竖条',
  'detail-footwear': '鞋履局部高清特写：鞋型、鞋面材质、鞋底、绑带与使用痕迹清楚；鞋整体入画并留安全边距，构图接近竖方；禁止只裁一条细竖缝、禁止全身站姿',
  'hand-relaxed': '单手放松动作特写：手指自然弯曲松开，掌心与指节清楚；手腕至指尖完整入画并留边距；若有手套须看清结构；禁止半身、禁止过窄竖条',
  'hand-tense': '单手紧张动作特写：握拳或手指明显收紧、指节突出，与放松一眼可辨；手腕至指尖完整入画；禁止畸形手指、禁止半身、禁止过窄竖条',
  'hand-pointing': '单手指向动作特写：食指明确伸出，其余手指自然收拢；手腕至指尖完整入画；结构清楚；禁止半身、禁止过窄竖条',
  'hand-grasping': '单手抓握动作特写：手指包住抽象握持位或简单圆柱握柄，展示指节与掌指关系；手腕至指尖完整入画；禁止半身、禁止过窄竖条',
  'hand-touching-face': '手触脸关系特写：手套/手轻触脸颊或下颌，手与脸接触关系清楚；以手+接触点为主，脸部只作必要语境，禁止半身大肖像占满格子；构图接近方形并留边距',
};

export const CHARACTER_SHEET_STYLE_LABELS: Record<CharacterSheetStyleMode, string> = {
  'photoreal-3d': '写实3D / Photoreal 3D',
  'stylized-3d': '风格化3D / Stylized 3D',
  anime: '动漫 / Anime',
  'semi-realistic': '半写实 / Semi-realistic',
  'ip-design': 'IP设计 / IP Design',
};

/** 把网格坐标转成提示词可执行描述（图片标签只用简体中文 label） */
export function formatPanelGridSpec(p: CharacterSheetPanelLayout): string {
  const { col, row, colSpan, rowSpan } = p.grid;
  const colEnd = col + colSpan - 1;
  const rowEnd = row + rowSpan - 1;
  const content = CHARACTER_SHEET_PANEL_CONTENT[p.id] || p.label;
  return `画面标注“${p.label}” | 网格列 ${col}-${colEnd}，行 ${row}-${rowEnd} | 只填此格 | ${content}`;
}

/** 生成「锁定排版」段落，供模型严格按格子出图 */
export function buildCharacterSheetLockedLayoutPrompt(): string {
  const lines: string[] = [
    '【固定版式网格——最高优先级，必须严格遵守】',
    `只生成一张 ${CHARACTER_SHEET_CANVAS_WIDTH}×${CHARACTER_SHEET_CANVAS_HEIGHT} 像素、4:3 横版「角色完整设定板」；不得改成其他比例、尺寸或构图。`,
    `将整张图永久划分为固定 ${CHARACTER_SHEET_GRID_COLS} 列 × ${CHARACTER_SHEET_GRID_ROWS} 行网格；列号 0..${CHARACTER_SHEET_GRID_COLS - 1} 从左到右，行号 0..${CHARACTER_SHEET_GRID_ROWS - 1} 从上到下。`,
    '所有网格线、面板边框和留白宽度必须固定；不得自动排版、不得根据内容调整大小、不得移动面板、不得合并面板、不得留下空格、不得图片漂移。',
    '每格只绘制指定内容，主体居中并留出固定窄边距；不得跨格、重叠或把内容绘制到相邻格。',
    '图片内所有可见文字必须使用简体中文；禁止英文标题、英文标签、乱码、伪文字、拉丁字母拼贴。',
    '本图是角色 ID 圣经：版式对所有角色必须完全相同；只允许角色外观内容变化；不要求与后续五类分类原图版式相同。',
    '',
    '顶部信息栏（第 0 行，列 0-11）：标题必须写“角色完整设定板”+ 名字 + 身份 + 年龄 + 3 个性关键词；只用简体中文；字迹清晰，禁止乱码。',
    '',
    '区域顺序固定（与五类原图脱钩）：',
    '1) 左上「色彩参考」：7 色块 + 简体中文标签（发色/瞳色/肤色/眉色/服装色/阴影色/基调色）',
    '2) 左中「身份锁要点」：8 条简体中文固定要点（本格不画人）',
    '3) 中上「全身三视图」：正面 / 侧面 / 背面',
    '4) 中下「脸部六角」：脸部正面 / 侧脸左 / 侧脸右 / 斜左 / 斜右 / 后脑勺',
    '5) 右侧「表情矩阵 3×3」：通常/微笑/认真；惊讶/害羞/思考；困扰/悲伤/平静',
    '6) 底部「细节特征 12 格」：左眼/右眼/眉毛/鼻子/嘴唇/耳朵/下颌/皮肤/刘海/侧发/后发/手部',
    '',
    '面板坐标表（版式锁定，不得改变）：',
  ];

  for (const p of CHARACTER_SHEET_PANEL_LAYOUT) {
    lines.push(`- ${formatPanelGridSpec(p)}`);
  }

  lines.push(
    '',
    '人物一致性硬约束：全图同一张脸、同一发型发际线、同一体型比例、同一服装主结构与同一配色；禁止换脸、禁止风格漂移、禁止各格变成不同角色。',
    '格子边框标签必须是简体中文短词，且与格子内容一一对应；禁止英文标签出现在画面上。',
  );

  return lines.join('\n');
}

/**
 * 生产级「角色完整设定板」主提示词（ID LOCK + LAYOUT LOCK）。
 */
export const CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE = `
【任务】
基于角色描述生成一张高精度「角色完整设定板」（角色 ID 圣经）。
锁定角色身份，不允许生成新角色；所有格子必须是同一人物。
本图版式独立，不需要迁就后续五类分类原图的布局。

【CHARACTER ID LOCK PRIORITY — 最高优先级】
- Never reinterpret the character.
- Never invent a new face, body, hairstyle, outfit, palette, or silhouette.
- All panels must share identical facial identity, bone structure, hairline, body proportion, clothing landmarks, materials and color palette.
- Maximum character consistency. Production reference quality.
- 禁止图片漂移：人物不得在格与格之间换成另一人，五官比例不得漂移。

【LAYOUT GRID LOCK PRIORITY — 与 ID LOCK 同级】
- Every character must use the exact same layout grid and panel coordinates.
- Do not invent, omit, merge, resize, reorder, or freely rearrange panels.
- Do not copy the five category-sheet layouts onto this master sheet.

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
- 画布: 固定 1536×1152 像素，4:3 横版；每次生成必须使用完全相同的画布比例与网格坐标
- 背景: 浅灰 / 米白 / 极简无环境杂物
- UI: 干净技术排版，无 logo，无水印，无二维码
- 文字: 所有可见文字必须是简体中文；禁止英文标题、英文标签、乱码和伪文字
- 光照: 柔和摄影棚均匀光，真实皮肤与布料材质，影视级细节

{lockedLayout}

【必须包含模块 — 不得省略，且必须落在上述坐标格子内】
1. 顶部信息栏 (row 0)
  - 标题“角色完整设定板”、名字、身份、年龄、性格关键词（3 个），全部简体中文，字迹清晰

2. 色彩参考 (rows1-3, cols0-2)
  - 7 个纯色块 + 简体中文标签：发色、瞳色、肤色、眉色、服装色、阴影色、基调色

3. 身份锁要点 (rows4-6, cols0-2)
  - 仅文字：脸型固定、眼周固定、鼻形固定、嘴唇固定、刘海固定、体型固定、服装统一、同一角色优先
  - 本格禁止画人物

4. 全身三视图 (rows1-3, cols3-8)
  - 全身正面 / 全身侧面 / 全身背面

5. 脸部六角 (rows4-6, cols3-8)
  - 脸部正面 / 侧脸左 / 侧脸右 / 斜左 / 斜右 / 后脑勺

6. 表情矩阵 3×3 (rows1-6, cols9-11)
  - 通常 / 微笑 / 认真
  - 惊讶 / 害羞 / 思考
  - 困扰 / 悲伤 / 平静

7. 细节特征 12 格 (rows7-9, cols0-11)
  - 左眼 / 右眼 / 眉毛 / 鼻子 / 嘴唇 / 耳朵 / 下颌 / 皮肤 / 刘海 / 侧发 / 后发 / 手部

【明确不包含 — 禁止画进本图】
- 不要改成五类分类原图的版式
- 不要自由拼贴或额外 invent 格子
- 不要剪影墙、身高比例尺通栏、姿态三态墙、服装地标四格（那些属于分类原图职责）

【一致性硬约束】
- 固定 1536×1152 像素 4:3 画布与固定 12×10 网格；不得改变比例、边距、分隔线、面板顺序或任何面板坐标
- 生成前先建立完整空白网格，再按坐标逐格填充；不得自由排版、重排、合并、跨格或补充未定义区域
- 所有可见文字必须使用简体中文；禁止英文标题、英文标签、乱码和伪文字
- 所有格子同一角色，脸/发型/比例/服装完全一致；禁止图片漂移
- 不允许风格漂移、不允许换脸、不允许改服装主结构
- 皮肤/布料/金属等材质真实，4K 级细节
- 无水印、无多余文字块、无拼贴缝合痕迹

【质量要求】
- Ultra high detail, character ID bible quality
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

export function buildCharacterMasterSheetPrompt(
  input: CharacterSheetPromptInput,
  pack?: import('./gen-skill-pack').GenPromptPack | null,
): string {
  const styleMode = input.styleMode ?? 'semi-realistic';
  const lockedLayout = buildCharacterSheetLockedLayoutPrompt();
  const masterTpl = pack?.template?.trim() || CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE;
  const filled = masterTpl
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
  let out = `${filled}${refRule}`.trim();
  if (pack?.quality?.trim()) out = `${pack.quality.trim()}\n${out}`;
  if (pack?.constraints?.trim()) out = `${out}\n${pack.constraints.trim()}`;
  if (pack?.overlay?.trim()) out = `${out}\n${pack.overlay.trim()}`;
  return out;
}

function formatCategoryPanelLine(item: CharacterSheetPanelLayout, index: number): string {
  const { col, row, colSpan, rowSpan } = item.grid;
  const rowLabel = rowSpan > 1 ? `第${row + 1}-${row + rowSpan}行` : `第${row + 1}行`;
  const colLabel = colSpan > 1 ? `第${col + 1}-${col + colSpan}列通栏` : `第${col + 1}列`;
  return `${index + 1}. ${rowLabel}${colLabel}：画面标注“${item.label}”；生成内容：${CHARACTER_SHEET_PANEL_CONTENT[item.id]}`;
}

function buildCategorySpecificRules(categoryId: CharacterSheetCategoryId, category: CharacterSheetCategoryLayout): string[] {
  if (categoryId === 'identity') {
    return [
      '【本分类硬规则 · 主身份 / 剪影】',
      `- 顶部标题条下方，内容区严格为 ${category.cols} 列 × ${category.rows} 行：两行各 3 个全身格（剪影正/侧 + 主身份正/3/4/侧/背）。`,
      '- 绝对禁止情绪特写通栏：不得在本图底部或第三行生成胸部以上情绪大特写。',
      '- 绝对禁止表情墙：不得在本图出现平静/微笑/愤怒/悲伤/惊讶/害怕/坚定/紧张/好奇/放松等表情头像。',
      '- 表情系统只属于另一张「表情系统（8）」分类图；本图不得生成任何表情系统格子或情绪特写。',
      '- 六个全身格必须头到脚完整入画，四周留 8%–12% 安全边距；禁止贴边、左右裁切肩臂、截断头顶或脚底。',
      '- 体型偏宽/偏胖时仍保持真实比例与完整外轮廓，禁止为塞满格子而横向压扁角色，禁止把人物挤成细长条。',
      '- 面部五官必须锐利高清（眼睛、鼻翼、嘴唇边缘清楚）；禁止糊脸、涂抹感、过度压缩和低分辨率。',
    ];
  }
  if (categoryId === 'expressions') {
    return [
      '【本分类硬规则 · 表情系统（8）】',
      '- 仅生成筛选后的 8 个表情：平静、微笑、愤怒、紧张、惊讶、害怕、悲伤、坚定；不得增加第9格，不得用好奇/放松等替换。',
      `- 严格 ${category.cols} 列 × ${category.rows} 行头肩像网格；每格胸部以上正面，脸部占格面积极大且锐利清晰。`,
      '- 同一脸型、发型、五官、妆造与服装领口；只改变表情肌，不改变身份。',
      '- 禁止全身站姿、禁止剪影、禁止主身份四视图、禁止微表情局部格。',
      '- 本分类承接原「主身份图第二排表情」的职责，因此必须完整覆盖上述 8 表情，且保持不拥挤、不糊脸。',
    ];
  }
  if (categoryId === 'micro-expressions') {
    return [
      '【本分类硬规则 · 微表情（6）】',
      '- 仅生成 6 个微表情：眼部紧张、微笑、嘴部用力、微恐惧、呼吸控制、咬唇；不得增减，标签必须写「微表情·xxx」。',
      `- 严格 ${category.cols} 列 × ${category.rows} 行（上排 3 + 下排 3）；每格接近方形，主体居中并留安全边距。`,
      '- 每格只放大对应局部（眉眼 / 眼角嘴角 / 口鼻 / 唇部），禁止把整张脸竖切成半脸细条。',
      '- 禁止 5×1 横排细长竖条构图；禁止全身、头肩标准表情墙、剪影、主身份四视图。',
      '- 同一身份与妆造；只改变局部微表情肌，皮肤纹理与五官锐利高清；底部标签禁止错字（如「用表情」）。',
    ];
  }
  if (categoryId === 'head-and-posture') {
    return [
      '【本分类硬规则 · 头部结构 / 姿态】',
      '- 禁止 8×1 单行混排：不得把头像与全身姿态挤在同一行等宽细竖条里。',
      '- 标题条下方固定两行：第1行等分 5 个头部格（3/4、侧面、仰视、俯视、背面）；第2行等分 3 个全身姿态格（放松、紧张、自信），下排单格明显宽于上排单格。',
      '- 上排只画头肩肖像，脸部居中锐利，构图接近竖方并留安全边距；禁止全身、禁止表情墙、禁止微表情局部格。',
      '- 下排只画全身站姿，头到脚完整入画并留 8%–12% 安全边距；禁止横向压扁偏宽体型，禁止截断头顶或脚底。',
      '- 三种姿态必须高区分度：放松=双肩下沉+手臂自然完全下垂；紧张=肩上提收紧+半握拳戒备（绝不能与放松几乎相同）；自信=叉腰/打开胸腔。',
      '- 正面头像基准由「主身份 / 表情系统」承接；本图不新增第6个头部正视格，也不得 invent 额外格子。',
      '- 同一身份、发型、服装与体型；只改变头部角度或全身姿态。',
    ];
  }
  if (categoryId === 'costume-and-hands') {
    return [
      '【本分类硬规则 · 服装细节 / 手部动作】',
      '- 禁止 9×1 单行混排：不得把服装细节与手部动作挤在同一行等宽细竖条里。',
      '- 标题条下方固定两行：第1行等分 4 个细节格（发型、材质、配饰、鞋）；第2行等分 5 个手部格（放松、紧张、指向、抓握、触脸）。',
      '- 上排只画局部高清细节，构图接近方形，主体居中并留安全边距；发型格以发丝/发际线为主，配饰不得抢戏。',
      '- 下排只画单手动作特写，手腕至指尖完整入画；放松/紧张/指向/抓握必须一眼可辨；若角色有手套则手套结构一致。',
      '- 「触脸」以手与脸的接触关系为主，禁止半身大肖像占满格子；禁止表情墙、全身站姿、主身份四视图。',
      '- 同一身份、服装与材质；不得 invent 第10格或改标签。',
    ];
  }
  return [];
}

/** 五张分类母图提示词：每张图使用自己的规则和局部网格，不复用整板坐标。 */
export function buildCharacterSheetCategoryPrompt(
  input: CharacterSheetPromptInput,
  categoryId: CharacterSheetCategoryId,
  pack?: import('./gen-skill-pack').GenPromptPack | null,
): string {
  const category = getCharacterSheetCategoryLayout(categoryId);
  const styleMode = input.styleMode ?? 'semi-realistic';
  const panelLines = category.panels.map((item, index) => formatCategoryPanelLine(item, index));
  const headerPct = Math.round(CHARACTER_SHEET_CATEGORY_HEADER_RATIO * 100);
  const base = [
    '任务：生成一张高分辨率角色分类设定图。',
    `分类：${category.label}。${category.description}。`,
    `角色名：${input.characterName?.trim() || '未命名角色'}。`,
    `角色描述：${input.characterDescription?.trim() || '严格依据参考图保持角色身份一致'}。`,
    `风格：${CHARACTER_SHEET_STYLE_LABELS[styleMode] || styleMode}。性别：${input.gender?.trim() || '按参考图'}。年龄：${input.age?.trim() || '按参考图'}。体型：${input.bodyType?.trim() || '按参考图'}。`,
    `身份：${input.role?.trim() || '按角色设定'}。性格：${input.personality?.trim() || '按角色设定'}。核心主题：${input.coreTheme?.trim() || '角色身份连续性'}。`,
    `服装锁定：${input.costumeLock?.trim() || '服装版型、颜色、材质和配饰保持不变'}。`,
    `外貌锁定：${input.appearanceLock?.trim() || '脸型、五官、发际线、发型、肤色和体型保持不变'}。`,
    `禁止修改：${input.forbidden?.trim() || '换脸、换发型、换服装、改变年龄、低清晰度、模糊脸、额外肢体'}。`,
    categoryId === 'identity'
      ? '本图是五类分类图中的「主身份 / 剪影」：必须严格复制用户已确认的「角色完整设定板」中的同一角色，不得重新设计。'
      : '本图属于分类展开图：绝对禁止重新设计角色，必须严格复制「角色完整设定板」中的同一角色；脸型、五官、发型、肤色、年龄感、体型、服装、配饰和色板必须逐项一致。',
    categoryId === 'head-and-posture'
      ? `画布严格为 4:3 横版，按 ${CHARACTER_SHEET_CANVAS_WIDTH}×${CHARACTER_SHEET_CANVAS_HEIGHT} 基准坐标构图；顶部约 ${headerPct}% 为分类标题条；标题条下方为两行：上排等分 5 个头部格、下排等分 3 个全身姿态格（下排单格更宽）；输出至少 2K，优先 4K。`
      : categoryId === 'costume-and-hands'
        ? `画布严格为 4:3 横版，按 ${CHARACTER_SHEET_CANVAS_WIDTH}×${CHARACTER_SHEET_CANVAS_HEIGHT} 基准坐标构图；顶部约 ${headerPct}% 为分类标题条；标题条下方为两行：上排等分 4 个服装细节格、下排等分 5 个手部动作格；输出至少 2K，优先 4K。`
        : `画布严格为 4:3 横版，按 ${CHARACTER_SHEET_CANVAS_WIDTH}×${CHARACTER_SHEET_CANVAS_HEIGHT} 基准坐标构图；顶部约 ${headerPct}% 为分类标题条，其余区域按 ${category.cols} 列 × ${category.rows} 行等分；输出至少 2K，优先 4K。`,
    '每个格子只绘制指定内容，主体居中，格子之间留出清晰窄分隔；不得跨格、重叠、合并、交换位置，也不得在空余区域 invent 额外格子。',
    '所有格子必须是同一个角色，脸部身份、骨骼比例、发型、服装和材质完全一致。',
    '所有分类图中的人物必须来自「角色完整设定板」，不得因为表情、姿态、角度或局部细节而产生第二个脸、第二套服装或第二种画风。',
    '整张分类图顶部必须标注分类名称；每个格子的底部必须使用清晰、短小、准确的简体中文标注对应子项，例如“剪影·正面”“主身份·正面”“表情·愤怒”。禁止英文、乱码、伪文字、水印、二维码和标尺。',
    '标注只允许出现在每格预留的窄标题带中，人物和细节主体区域不得出现文字；标注不得遮挡主体，必须与相邻格清楚对应。',
    '使用高质量摄影棚光线、清晰边缘、真实皮肤和布料纹理；脸部和眼睛必须锐利，禁止糊脸、过度压缩、涂抹感和低分辨率。',
    '输出干净的分类参考图，不要环境杂物，不要拼贴缝合痕迹。',
    ...buildCategorySpecificRules(categoryId, category),
    '固定格子内容：',
    ...panelLines,
  ];
  const quality = pack?.quality?.trim();
  const constraints = pack?.constraints?.trim();
  return [quality, base.join('\n'), constraints].filter(Boolean).join('\n').trim();
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
