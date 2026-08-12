/**

 * OL-10：镜头库字段 → 分镜台本地枚举（景别 / 运镜）映射。

 * 词典自由文案与 SHOT_SIZES / CAMERA_MOVES 双轨时，点选库条尽量回填枚举。

 */



export const DESK_SHOT_SIZES = ['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS'] as const;

export type DeskShotSize = (typeof DESK_SHOT_SIZES)[number];



export const DESK_CAMERA_MOVES = ['固定', '推', '拉', '摇', '移', '跟', '手持'] as const;

export type DeskCameraMove = (typeof DESK_CAMERA_MOVES)[number];



function norm(value: string | null | undefined): string {

  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

}



const SIZE_ALIASES: Array<{ enum: DeskShotSize; keys: string[] }> = [

  { enum: 'ECU', keys: ['ecu', 'extreme close', '大特写', '极特写', 'extreme close-up', 'extreme closeup'] },

  { enum: 'CU', keys: ['cu', 'close-up', 'closeup', 'close up', '特写', '近景特写'] },

  { enum: 'MS', keys: ['ms', 'medium', 'medium shot', '中景', '中全'] },

  { enum: 'FS', keys: ['fs', 'full', 'full shot', '全景', '全身'] },

  { enum: 'WS', keys: ['ws', 'wide', 'wide shot', '远景', '大远景', 'establishing'] },

  { enum: 'OTS', keys: ['ots', 'over the shoulder', 'over-the-shoulder', '过肩', '过肩镜头'] },

];



const MOVE_ALIASES: Array<{ enum: DeskCameraMove; keys: string[] }> = [

  { enum: '固定', keys: ['固定', 'static', 'locked', 'lock off', 'still', 'stationary', '定镜'] },

  { enum: '推', keys: ['推', 'push in', 'dolly in', 'track in', 'push', '推进'] },

  { enum: '拉', keys: ['拉', 'pull out', 'dolly out', 'track out', 'pull', '拉远'] },

  { enum: '摇', keys: ['摇', 'pan', 'tilt', '摇镜', 'pan left', 'pan right'] },

  { enum: '移', keys: ['移', 'truck', 'track', 'lateral', '横移', 'slide'] },

  { enum: '跟', keys: ['跟', 'follow', 'tracking', '跟随', '跟拍'] },

  { enum: '手持', keys: ['手持', 'handheld', 'hand-held', 'hand held', '晃动'] },

];



export function mapShotSizeToDeskEnum(raw?: string | null): DeskShotSize | null {

  const t = (raw ?? '').trim();

  if (!t) return null;

  if ((DESK_SHOT_SIZES as readonly string[]).includes(t)) return t as DeskShotSize;

  const key = norm(t);

  // 直接匹配枚举小写

  for (const s of DESK_SHOT_SIZES) {

    if (key === s.toLowerCase()) return s;

  }

  for (const row of SIZE_ALIASES) {

    if (row.keys.some((k) => key === k || key.includes(k))) return row.enum;

  }

  return null;

}



export function mapCameraMoveToDeskEnum(raw?: string | null): DeskCameraMove | null {

  const t = (raw ?? '').trim();

  if (!t) return null;

  if ((DESK_CAMERA_MOVES as readonly string[]).includes(t)) return t as DeskCameraMove;

  const key = norm(t);

  for (const row of MOVE_ALIASES) {

    if (row.keys.some((k) => key === k || key.includes(k))) return row.enum;

  }

  return null;

}



/** 点选镜头库时一次性回填景别 + 运镜（能映射的才写） */

export function mapShotLexiconToDeskEnums(input: {

  shotSize?: string | null;

  cameraMove?: string | null;

}): { shotSize?: DeskShotSize; cameraMove?: DeskCameraMove } {

  const shotSize = mapShotSizeToDeskEnum(input.shotSize);

  const cameraMove = mapCameraMoveToDeskEnum(input.cameraMove);

  return {

    ...(shotSize ? { shotSize } : {}),

    ...(cameraMove ? { cameraMove } : {}),

  };

}


