/**
 * NX9「大师运镜库」—— 结构化影视运镜词库。
 *
 * 只描述 NX9 自身的运镜能力：一套可检索、可多选、可拼装进图片/视频提示词的
 * 经典镜头语言词表。它是对既有 `CAMERA_PROMPT_PRESETS`（8 条轻量运镜）与
 * 3D 导演台 `CameraMoveId`（15 个机械枚举）的**补强**，不替换二者。
 *
 * 诚实约定：
 * - 每条运镜给出中英双语可直接拼进提示词的片段与中文说明；
 * - `durationHintSec` 是「成片时长」的经验提示区间，**不是**硬性参数，
 *   生成模型与具体叙事会自行决定，请勿当作事实数值引用；
 * - `shotSizes` 是「通常适配的景别」建议（沿用 NX9 景别词表 ECU/CU/MS/FS/WS/OTS），
 *   不是强约束。
 */

import type { PromptPreset } from './prompt-presets';

/** 运镜家族（与既有「推/拉/摇/移/跟/升降/环绕/变焦/手持/航拍/特殊」词表对齐并扩展） */
export type CameraMoveFamily =
  | 'static'
  | 'push'
  | 'pull'
  | 'pan'
  | 'tilt'
  | 'track'
  | 'crane'
  | 'orbit'
  | 'zoom'
  | 'handheld'
  | 'aerial'
  | 'special';

export interface CameraMoveDef {
  /** 词库内唯一 id（kebab-case，作为多选去重键） */
  id: string;
  /** 中文可读名 */
  labelZh: string;
  /** 英文可读名 */
  labelEn: string;
  /** 中文说明：这条运镜做什么、常见用途 */
  descZh: string;
  /** 中文提示词片段（可直接拼进生成提示词） */
  promptZh: string;
  /** 英文提示词片段（可直接拼进生成提示词） */
  promptEn: string;
  family: CameraMoveFamily;
  /** 通常适配的景别（沿用 NX9 景别词表，仅建议） */
  shotSizes?: string[];
  /** 成片时长经验区间（秒）；仅提示，不写死 */
  durationHintSec?: [number, number];
  difficulty?: 'basic' | 'advanced' | 'pro';
  tags?: string[];
}

export const CAMERA_MOVE_FAMILY_ORDER: CameraMoveFamily[] = [
  'static',
  'push',
  'pull',
  'pan',
  'tilt',
  'track',
  'crane',
  'orbit',
  'zoom',
  'handheld',
  'aerial',
  'special',
];

export const CAMERA_MOVE_FAMILY_LABELS: Record<CameraMoveFamily, string> = {
  static: '固定',
  push: '推镜',
  pull: '拉镜',
  pan: '摇镜',
  tilt: '俯仰',
  track: '移镜',
  crane: '升降',
  orbit: '环绕',
  zoom: '变焦',
  handheld: '手持',
  aerial: '航拍',
  special: '特殊',
};

export const CAMERA_MOVE_LIBRARY: CameraMoveDef[] = [
  // ── 固定 ──
  {
    id: 'static-locked-off',
    labelZh: '固定锁机',
    labelEn: 'Locked-off Shot',
    descZh: '三脚架完全固定，画面不动，让动作在画框内自行展开，强调构图与静默的戏剧张力。',
    promptZh: '固定机位静止不动，动作在画框内自然展开，强调构图与静默张力',
    promptEn: 'locked-off static camera, tripod-fixed, action unfolds within a fixed frame, tableau composition',
    family: 'static',
    shotSizes: ['WS', 'FS', 'MS'],
    durationHintSec: [4, 15],
    difficulty: 'basic',
    tags: ['构图', '静默', '长镜头'],
  },
  {
    id: 'static-tableau',
    labelZh: '静态群像',
    labelEn: 'Tableau Staging',
    descZh: '固定广角拉开人物关系与空间纵深，适合多人场面、舞台式群像与开场建置。',
    promptZh: '固定广角全景，人物分前中后景错落站位，画面稳定如舞台构图',
    promptEn: 'static wide shot, deep staging with foreground midground background, tableau blocking, stable composition',
    family: 'static',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [4, 12],
    difficulty: 'basic',
    tags: ['群像', '建置', '纵深'],
  },
  {
    id: 'static-foreground-frame',
    labelZh: '前景框定',
    labelEn: 'Foreground Framing',
    descZh: '借门框、窗沿、人物肩部作前景遮挡，机位固定，制造窥视与层次感。',
    promptZh: '固定机位，前景用门框或物件遮挡构图，形成层次与窥视感',
    promptEn: 'locked-off camera with foreground frame, doorway or window occlusion, layered depth, voyeuristic framing',
    family: 'static',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [3, 10],
    difficulty: 'basic',
    tags: ['前景遮挡', '窥视', '层次'],
  },

  // ── 推镜 ──
  {
    id: 'push-slow',
    labelZh: '缓推',
    labelEn: 'Slow Push-In',
    descZh: '相机沿光轴缓慢前移贴近主体，情绪随距离收紧，常用于强调与压迫感累积。',
    promptZh: '缓慢推镜靠近主体，主体逐渐放大，亲密感与压迫感同步增强',
    promptEn: 'slow dolly push-in toward the subject, subject grows in frame, increasing intimacy and tension',
    family: 'push',
    shotSizes: ['MS', 'CU', 'ECU'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['情绪收紧', '强调', '常用'],
  },
  {
    id: 'push-fast',
    labelZh: '快推',
    labelEn: 'Fast Push-In',
    descZh: '快速前推冲向主体，制造突然的注意力聚焦与冲击，常用于危险揭示或情绪爆发。',
    promptZh: '快速推镜冲向主体，景别骤变，制造瞬间聚焦与冲击感',
    promptEn: 'fast push-in toward the subject, abrupt framing shift, sudden focus and impact',
    family: 'push',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [1, 3],
    difficulty: 'advanced',
    tags: ['冲击', '聚焦', '危机'],
  },
  {
    id: 'push-through',
    labelZh: '推穿空间',
    labelEn: 'Push-Through',
    descZh: '镜头穿门缝、车窗或狭缝进入新空间，用遮挡物切换场景，带入感强。',
    promptZh: '镜头穿过门缝或狭缝向前推进，遮挡物擦过画面进入新空间',
    promptEn: 'camera pushes through a narrow opening into a new space, passing foreground occlusion, immersive transition',
    family: 'push',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [2, 6],
    difficulty: 'advanced',
    tags: ['转场', '带入感', '遮挡'],
  },
  {
    id: 'push-to-closeup',
    labelZh: '推至特写',
    labelEn: 'Push to Close-Up',
    descZh: '从环境一路推进到人物面部或道具细节，把注意力强制压缩到单点。',
    promptZh: '从环境逐渐推近至面部特写，视点收窄，聚焦细微情绪与细节',
    promptEn: 'continuous push from wide toward a tight close-up, narrowing focus to the subject detail',
    family: 'push',
    shotSizes: ['WS', 'MS', 'CU', 'ECU'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['特写', '聚焦', '情绪'],
  },
  {
    id: 'push-past-foreground',
    labelZh: '擦过前景推进',
    labelEn: 'Foreground Wipe Push',
    descZh: '前进途中被前景人物或物件短暂遮挡再让出主体，制造层次与遮挡节奏。',
    promptZh: '推镜前进时前景物体短暂遮挡又让开主体，产生层次与遮挡节奏',
    promptEn: 'push-in with a foreground object crossing the frame to briefly occlude then reveal the subject',
    family: 'push',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 6],
    difficulty: 'advanced',
    tags: ['遮挡', '节奏', '层次'],
  },

  // ── 拉镜 ──
  {
    id: 'pull-slow',
    labelZh: '缓拉',
    labelEn: 'Slow Pull-Back',
    descZh: '相机缓慢后移远离主体，逐步展现环境与人物处境，情绪由聚焦转向疏离。',
    promptZh: '缓慢拉镜远离主体，环境逐步显现，人物在画面中变小，情绪转向疏离',
    promptEn: 'slow dolly pull-back, subject shrinks in frame, environment gradually revealed, emotional distance',
    family: 'pull',
    shotSizes: ['MS', 'WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['疏离', '揭示', '常用'],
  },
  {
    id: 'pull-reveal',
    labelZh: '拉出揭示',
    labelEn: 'Pull-Back Reveal',
    descZh: '从细节后拉，揭示更大空间、人物关系或反转信息，制造恍然大悟。',
    promptZh: '镜头从细节向后拉出，揭示更大的空间与人物关系，制造恍然大悟的转折',
    promptEn: 'pull-back reveal, camera retreats to expose the wider context and relationships, surprising turn',
    family: 'pull',
    shotSizes: ['CU', 'MS', 'WS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['揭示', '反转', '环境'],
  },
  {
    id: 'pull-isolate',
    labelZh: '拉远孤立',
    labelEn: 'Pull Out to Isolate',
    descZh: '后退拉开距离，让人物被空旷环境包围，突出渺小与孤独。',
    promptZh: '拉镜后退至大远景，人物被空旷环境包围，突出渺小与孤独',
    promptEn: 'pull out to an extreme wide, lone subject surrounded by vast empty space, isolation and smallness',
    family: 'pull',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['孤独', '渺小', '大远景'],
  },
  {
    id: 'pull-through-frames',
    labelZh: '后退穿越',
    labelEn: 'Retreat Through Frames',
    descZh: '后退时连续穿过门框、窗棂等多层遮挡，形成层层退出的空间纵深。',
    promptZh: '镜头后退连续穿过多层门框与遮挡，层层退出，空间纵深清晰',
    promptEn: 'retreating camera passing through layered frames and doorways, deep spatial recession',
    family: 'pull',
    shotSizes: ['MS', 'WS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['纵深', '退场', '遮挡'],
  },

  // ── 摇镜 ──
  {
    id: 'pan-slow',
    labelZh: '慢摇',
    labelEn: 'Slow Pan',
    descZh: '机位固定，水平缓慢扫视，连接画面左右信息，常用于风光交代与空间扫描。',
    promptZh: '机位固定，镜头水平缓慢摇动扫视环境，平稳交代空间',
    promptEn: 'slow horizontal pan, fixed camera position, smooth steady sweep across the space',
    family: 'pan',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['扫视', '交代', '风光'],
  },
  {
    id: 'pan-fast',
    labelZh: '快摇',
    labelEn: 'Fast Pan',
    descZh: '水平快速扫过，制造动感与运动模糊，常用于反应镜头与快速交代。',
    promptZh: '镜头水平快速扫过，带运动模糊，制造动感与紧迫',
    promptEn: 'fast horizontal pan with motion blur, energetic sweeping camera move',
    family: 'pan',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [1, 3],
    difficulty: 'advanced',
    tags: ['动感', '运动模糊', '紧迫'],
  },
  {
    id: 'pan-follow',
    labelZh: '跟摇',
    labelEn: 'Pan Following Action',
    descZh: '镜头跟随运动主体水平摇动，主体稳定居中，背景流动。',
    promptZh: '镜头跟随运动主体水平摇动，主体稳定，背景流动拉出速度感',
    promptEn: 'pan following the moving subject, subject held stable while background flows past',
    family: 'pan',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['跟拍', '速度感', '居中'],
  },
  {
    id: 'pan-reveal',
    labelZh: '摇镜揭示',
    labelEn: 'Pan Reveal',
    descZh: '从一处平滑摇向关键对象或场景，形成延迟揭示的悬念。',
    promptZh: '镜头平滑摇向关键对象，延迟揭示，制造悬念',
    promptEn: 'smooth pan revealing a key object, delayed reveal with suspense',
    family: 'pan',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['揭示', '悬念'],
  },

  // ── 俯仰 ──
  {
    id: 'tilt-up',
    labelZh: '上摇',
    labelEn: 'Tilt Up',
    descZh: '机位固定垂直上摇，从低处抬向高处，表现仰视、规模与威压。',
    promptZh: '机位固定，镜头垂直向上摇起，从低处抬向高处，表现仰视与规模',
    promptEn: 'tilt up, fixed camera, vertical rise from low to high, conveying scale and grandeur',
    family: 'tilt',
    shotSizes: ['FS', 'WS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['仰视', '规模', '威压'],
  },
  {
    id: 'tilt-down',
    labelZh: '下摇',
    labelEn: 'Tilt Down',
    descZh: '机位固定垂直下摇，从高处落向低处，表现俯视、坠落与压倒。',
    promptZh: '机位固定，镜头垂直向下摇落，从高处落向低处，表现俯视与压倒',
    promptEn: 'tilt down, fixed camera, vertical descend from high to low, conveying dominance',
    family: 'tilt',
    shotSizes: ['FS', 'WS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['俯视', '压倒', '下落'],
  },
  {
    id: 'tilt-reveal-vertical',
    labelZh: '竖摇揭示',
    labelEn: 'Vertical Reveal',
    descZh: '从脚到头或从头到脚沿主体垂直扫过，逐段揭示全貌与细节，常见于人物登场。',
    promptZh: '镜头沿主体从上到下或从下到上垂直扫过，逐段揭示全貌',
    promptEn: 'vertical tilt scanning the subject from head to toe, revealing the full figure in stages',
    family: 'tilt',
    shotSizes: ['FS', 'MS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['登场', '全貌', '扫视'],
  },

  // ── 移镜 ──
  {
    id: 'truck-left',
    labelZh: '左横移',
    labelEn: 'Truck Left',
    descZh: '相机沿水平轨道向左平移，与主体成直角，适合跟随横向运动或交代空间。',
    promptZh: '相机沿轨道水平向左平移，背景横向掠过，主体相对稳定',
    promptEn: 'truck left, lateral camera movement on a dolly, background slides sideways while subject stays steady',
    family: 'track',
    shotSizes: ['MS', 'FS', 'WS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['横向', '交代', '平移'],
  },
  {
    id: 'truck-right',
    labelZh: '右横移',
    labelEn: 'Truck Right',
    descZh: '相机沿水平轨道向右平移，与主体成直角，适合跟随横向运动或交代空间。',
    promptZh: '相机沿轨道水平向右平移，背景横向掠过，主体相对稳定',
    promptEn: 'truck right, lateral camera movement on a dolly, background slides sideways while subject stays steady',
    family: 'track',
    shotSizes: ['MS', 'FS', 'WS'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['横向', '交代', '平移'],
  },
  {
    id: 'track-follow',
    labelZh: '跟拍主体',
    labelEn: 'Tracking Follow',
    descZh: '相机与被摄主体同速前进或后退，保持相对距离不变，节奏连贯。',
    promptZh: '相机与主体同速运动保持相对距离，主体稳定，背景随运动流动',
    promptEn: 'tracking shot following the subject at matching speed, stable subject, flowing background',
    family: 'track',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [3, 10],
    difficulty: 'basic',
    tags: ['跟拍', '连贯', '常用'],
  },
  {
    id: 'track-side-profile',
    labelZh: '侧面平行跟移',
    labelEn: 'Lateral Profile Track',
    descZh: '从侧面与行进主体平行移动，突出轮廓与速度，常用于行走、奔跑、车行。',
    promptZh: '相机从侧面与行进主体平行移动，突出轮廓与速度感',
    promptEn: 'side-profile tracking shot moving parallel to the subject, emphasizing silhouette and speed',
    family: 'track',
    shotSizes: ['FS', 'MS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['侧面', '速度', '轮廓'],
  },
  {
    id: 'track-walk-talk',
    labelZh: '边走边谈跟移',
    labelEn: 'Walk-and-Talk Track',
    descZh: '正面或前侧跟随交谈中的人物前进，保持对话双方同框，叙事连贯。',
    promptZh: '镜头在人物前方倒退跟拍交谈双方，保持同框，对话与行走连贯',
    promptEn: 'walk-and-talk tracking shot, camera leads the conversing characters, both kept in frame',
    family: 'track',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [4, 12],
    difficulty: 'advanced',
    tags: ['对话', '跟拍', '叙事'],
  },

  // ── 升降 ──
  {
    id: 'crane-up',
    labelZh: '升镜',
    labelEn: 'Crane Up',
    descZh: '摇臂或无人机抬升机位，视野从近景拉开到全景，交代环境与格局。',
    promptZh: '机位抬升，视野从近景拉开至全景，交代环境格局',
    promptEn: 'crane up, camera rises to reveal a wider landscape and establish the environment',
    family: 'crane',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['建置', '格局', '全景'],
  },
  {
    id: 'crane-down',
    labelZh: '降镜',
    labelEn: 'Crane Down',
    descZh: '机位下降，从高处落回地面或人物近景，收束空间与情绪。',
    promptZh: '机位下降，从高处落回地面或人物近景，收束空间与情绪',
    promptEn: 'crane down, camera descends from height toward the ground or a closer framing',
    family: 'crane',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [3, 8],
    difficulty: 'basic',
    tags: ['收束', '下降', '落地'],
  },
  {
    id: 'crane-reveal',
    labelZh: '升降揭示',
    labelEn: 'Crane Reveal',
    descZh: '升或降越过前景遮挡物，逐步露出被遮住的主体或场景，制造揭示。',
    promptZh: '机位升降越过前景遮挡物，逐步露出被遮住的主体，制造揭示',
    promptEn: 'crane reveal, camera rises over an obstruction to expose the hidden subject or scene',
    family: 'crane',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['揭示', '遮挡', '摇臂'],
  },
  {
    id: 'jib-arc',
    labelZh: '摇臂弧线',
    labelEn: 'Jib Arc',
    descZh: '摇臂以弧线运动升降并改变朝向，轨迹流畅，适合华丽的机位转场。',
    promptZh: '摇臂沿弧线运动同时升降并改变朝向，轨迹流畅华丽',
    promptEn: 'jib arm sweeping in a smooth arc, simultaneous rise and reorientation, fluid camera path',
    family: 'crane',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['弧线', '华丽', '转场'],
  },

  // ── 环绕 ──
  {
    id: 'orbit-90',
    labelZh: '四分之一环绕',
    labelEn: 'Quarter Orbit',
    descZh: '围绕主体做约 90° 弧线移动，改变观察角度，带出空间关系与视差。',
    promptZh: '相机围绕主体做约四分之一圈弧线移动，视差明显，角度变化',
    promptEn: 'arc shot around the subject through about a quarter circle, visible parallax, changing angle',
    family: 'orbit',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['弧线', '视差', '角度'],
  },
  {
    id: 'orbit-180',
    labelZh: '半环绕',
    labelEn: 'Half Orbit',
    descZh: '围绕主体做约 180° 环绕，完整改变视线朝向，景深与视差层次丰富。',
    promptZh: '相机围绕主体做半圈环绕，视线朝向反转，视差与景深层次丰富',
    promptEn: '180-degree orbit around the subject, parallax depth, reversed sightline, consistent eye line',
    family: 'orbit',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['环绕', '视差', '层次'],
  },
  {
    id: 'orbit-360',
    labelZh: '全环绕',
    labelEn: 'Full Orbit',
    descZh: '围绕主体完整转一圈，全面交代人物与空间，常用于高光时刻。',
    promptZh: '相机围绕主体完整旋转一圈，全面交代人物与环境，高光时刻感',
    promptEn: 'full 360-degree orbit around the subject, complete rotation, hero moment reveal',
    family: 'orbit',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [4, 12],
    difficulty: 'pro',
    tags: ['高光', '全环绕', '英雄时刻'],
  },
  {
    id: 'orbit-arc-in',
    labelZh: '弧线推进',
    labelEn: 'Arc Push-In',
    descZh: '环绕的同时逐渐靠近主体，弧线与推近叠加，能量持续增强。',
    promptZh: '相机环绕主体同时逐渐靠近，弧线与推近叠加，能量持续增强',
    promptEn: 'arcing camera move that also pushes closer to the subject, spiraling in, rising energy',
    family: 'orbit',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [3, 8],
    difficulty: 'pro',
    tags: ['弧线', '推近', '螺旋'],
  },
  {
    id: 'orbit-spiral-up',
    labelZh: '螺旋上升环绕',
    labelEn: 'Spiral Rise Orbit',
    descZh: '环绕同时抬升机位，形成螺旋轨迹，气势上扬，适合史诗或胜利时刻。',
    promptZh: '相机环绕主体并同步抬升，形成螺旋上升轨迹，气势上扬',
    promptEn: 'spiraling orbit that rises around the subject, ascending spiral, epic uplifting energy',
    family: 'orbit',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [4, 10],
    difficulty: 'pro',
    tags: ['螺旋', '史诗', '上升'],
  },

  // ── 变焦 ──
  {
    id: 'zoom-in',
    labelZh: '变焦推近',
    labelEn: 'Zoom In',
    descZh: '变焦镜头放大画面，机位不动，快速压缩视点聚焦到主体或细节。',
    promptZh: '变焦镜头放大画面，机位不动，视点快速聚焦到主体',
    promptEn: 'zoom in, camera position fixed, focal length increases to focus tightly on the subject',
    family: 'zoom',
    shotSizes: ['MS', 'CU', 'ECU'],
    durationHintSec: [1, 4],
    difficulty: 'basic',
    tags: ['聚焦', '变焦', '压缩'],
  },
  {
    id: 'zoom-out',
    labelZh: '变焦拉远',
    labelEn: 'Zoom Out',
    descZh: '变焦镜头缩小画面，机位不动，从细节快速拉出到更大环境。',
    promptZh: '变焦镜头缩小画面，机位不动，从细节快速拉出到更大环境',
    promptEn: 'zoom out, camera position fixed, focal length decreases to reveal the wider context',
    family: 'zoom',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [1, 4],
    difficulty: 'basic',
    tags: ['拉远', '变焦', '环境'],
  },
  {
    id: 'snap-zoom',
    labelZh: '急推变焦',
    labelEn: 'Snap Zoom',
    descZh: '变焦瞬间快速推近，干净利落，常用于强调、惊吓与喜剧节奏。',
    promptZh: '变焦瞬间快速推近，干净利落，制造强调与突发感',
    promptEn: 'snap zoom, quick clean push of focal length for emphasis, abrupt attention grab',
    family: 'zoom',
    shotSizes: ['CU', 'ECU'],
    durationHintSec: [1, 2],
    difficulty: 'advanced',
    tags: ['强调', '突发', '节奏'],
  },
  {
    id: 'crash-zoom',
    labelZh: '猛推变焦',
    labelEn: 'Crash Zoom',
    descZh: '变焦猛烈砸近，带轻微失稳与颗粒感，表达震惊、疯狂与失控。',
    promptZh: '变焦猛烈砸近，画面轻微失稳，表达震惊与失控',
    promptEn: 'crash zoom, violent rapid zoom with slight instability, shock and frenzy',
    family: 'zoom',
    shotSizes: ['CU', 'ECU'],
    durationHintSec: [1, 2],
    difficulty: 'advanced',
    tags: ['震惊', '失控', '失稳'],
  },
  {
    id: 'dolly-zoom',
    labelZh: '滑动变焦',
    labelEn: 'Dolly Zoom',
    descZh: '推轨与变焦反向同步，主体大小不变而背景剧烈压缩或扩张，制造眩晕与不安（希区柯克变焦）。',
    promptZh: '推轨前进同时变焦后拉，主体大小不变而背景剧烈变化，眩晕不安',
    promptEn: 'dolly zoom, dolly in while zooming out, subject size constant while background distorts, vertigo effect',
    family: 'zoom',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 5],
    difficulty: 'pro',
    tags: ['希区柯克', '眩晕', '不安'],
  },

  // ── 手持 ──
  {
    id: 'handheld-follow',
    labelZh: '手持跟拍',
    labelEn: 'Handheld Follow',
    descZh: '手持摄影机跟随主体，轻微晃动保留纪实呼吸感，临场真实。',
    promptZh: '手持跟拍主体，轻微自然晃动，纪实呼吸感，临场真实',
    promptEn: 'handheld camera following the subject, subtle natural shake, documentary realism',
    family: 'handheld',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [3, 10],
    difficulty: 'basic',
    tags: ['纪实', '临场', '呼吸感'],
  },
  {
    id: 'handheld-verite',
    labelZh: '肩扛纪实',
    labelEn: 'Shoulder Verité',
    descZh: '肩扛机位跟随抓拍，晃动明显但不失控，强调真实事件与观察视角。',
    promptZh: '肩扛机位抓拍，晃动明显但可控，强调真实事件与观察视角',
    promptEn: 'shoulder-mounted verité camera, visible but controlled shake, observational documentary feel',
    family: 'handheld',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [3, 12],
    difficulty: 'advanced',
    tags: ['纪实', '观察', '肩扛'],
  },
  {
    id: 'handheld-tense',
    labelZh: '紧张手持',
    labelEn: 'Tense Handheld',
    descZh: '手持晃动更强烈急促，镜头游移不定，传递紧张、追逐与慌乱。',
    promptZh: '手持晃动强烈急促，镜头游移，传递紧张与追逐的慌乱',
    promptEn: 'tense handheld camera, erratic nervous shake, restless framing, chase and anxiety',
    family: 'handheld',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 8],
    difficulty: 'advanced',
    tags: ['紧张', '追逐', '慌乱'],
  },
  {
    id: 'handheld-push-in',
    labelZh: '手持推近',
    labelEn: 'Handheld Push-In',
    descZh: '手持向前推进贴近主体，呼吸晃动叠加靠近感，主观而亲密。',
    promptZh: '手持向前推进贴近主体，轻微晃动叠加靠近感，主观亲密',
    promptEn: 'handheld push-in toward the subject, gentle bob combining with closeness, subjective intimacy',
    family: 'handheld',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 6],
    difficulty: 'basic',
    tags: ['主观', '亲密', '推近'],
  },

  // ── 航拍 ──
  {
    id: 'drone-pullback',
    labelZh: '航拍拉远',
    labelEn: 'Drone Pullback',
    descZh: '无人机后退抬升，主体越缩越小，展现宏大地貌与孤独。',
    promptZh: '无人机后退抬升，主体逐渐缩小，展现宏大地貌与孤独感',
    promptEn: 'drone pullback, camera rises and retreats, subject shrinking into a vast landscape',
    family: 'aerial',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [4, 12],
    difficulty: 'advanced',
    tags: ['航拍', '宏大', '孤独'],
  },
  {
    id: 'drone-forward-fly',
    labelZh: '航拍前飞',
    labelEn: 'Drone Forward Fly',
    descZh: '无人机低空向前飞行，掠过地表与障碍，速度感与行进感强烈。',
    promptZh: '无人机低空向前飞行，掠过地表，速度感与行进感强烈',
    promptEn: 'drone flying forward at low altitude, skimming over terrain, strong sense of speed',
    family: 'aerial',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [4, 12],
    difficulty: 'advanced',
    tags: ['前飞', '速度', '低空'],
  },
  {
    id: 'drone-orbit',
    labelZh: '航拍环绕',
    labelEn: 'Drone Orbit',
    descZh: '无人机高空环绕主体或地标，展现全貌与几何布局。',
    promptZh: '无人机高空环绕主体，完整展现全貌与几何布局',
    promptEn: 'aerial drone orbit around the subject, revealing the full layout from above',
    family: 'aerial',
    shotSizes: ['WS'],
    durationHintSec: [5, 15],
    difficulty: 'advanced',
    tags: ['环绕', '俯瞰', '地标'],
  },
  {
    id: 'drone-top-down',
    labelZh: '俯冲下降',
    labelEn: 'Drone Top-Down Dive',
    descZh: '无人机从垂直俯视位下降逼近地面目标，视角压迫而震撼。',
    promptZh: '无人机从垂直俯视位下降逼近地面目标，视角压迫震撼',
    promptEn: 'top-down drone dive, camera descends vertically toward the ground target, imposing viewpoint',
    family: 'aerial',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'advanced',
    tags: ['俯冲', '俯视', '压迫'],
  },
  {
    id: 'drone-rise-reveal',
    labelZh: '升起揭示',
    labelEn: 'Drone Rise Reveal',
    descZh: '无人机垂直升起并越过遮挡，逐步揭开宏大场景全貌。',
    promptZh: '无人机垂直升起越过遮挡，逐步揭开宏大场景全貌',
    promptEn: 'drone rising over an obstruction to unveil the grand scene, ascending reveal',
    family: 'aerial',
    shotSizes: ['WS'],
    durationHintSec: [4, 10],
    difficulty: 'advanced',
    tags: ['升起', '揭示', '全貌'],
  },
  {
    id: 'fpv-flythrough',
    labelZh: 'FPV 穿越',
    labelEn: 'FPV Flythrough',
    descZh: '第一视角穿越镜头，敏捷穿行于门窗、建筑或树林，沉浸与速度并重。',
    promptZh: '第一视角穿越镜头，敏捷穿行于门窗与障碍之间，沉浸速度并重',
    promptEn: 'FPV drone flythrough, agile first-person flight weaving through gaps and obstacles',
    family: 'aerial',
    shotSizes: ['WS'],
    durationHintSec: [3, 10],
    difficulty: 'pro',
    tags: ['FPV', '穿越', '沉浸'],
  },

  // ── 特殊 ──
  {
    id: 'whip-pan',
    labelZh: '甩镜',
    labelEn: 'Whip Pan',
    descZh: '镜头急速水平甩动，带明显运动模糊，用作转场或制造能量的方向变化。',
    promptZh: '镜头急速甩动带运动模糊，制造转场与方向骤变',
    promptEn: 'whip pan, rapid horizontal swing with heavy motion blur, energetic direction change',
    family: 'special',
    shotSizes: ['WS', 'MS'],
    durationHintSec: [1, 2],
    difficulty: 'advanced',
    tags: ['转场', '甩动', '运动模糊'],
  },
  {
    id: 'whip-tilt',
    labelZh: '上下甩摇',
    labelEn: 'Whip Tilt',
    descZh: '镜头急速垂直甩动，从地面甩向天空或反向，制造强烈节奏与转场。',
    promptZh: '镜头急速垂直甩动，从地面甩向天空或反向，制造强烈节奏与转场',
    promptEn: 'whip tilt, rapid vertical swing with motion blur, aggressive rhythm transition',
    family: 'special',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [1, 2],
    difficulty: 'advanced',
    tags: ['转场', '甩动', '节奏'],
  },
  {
    id: 'rack-focus',
    labelZh: '跟焦转移',
    labelEn: 'Rack Focus',
    descZh: '焦点从前景平滑切到后景（或反向），引导注意力转移，机位不动。',
    promptZh: '焦点从前景平滑转移到后景，注意力随之转移，机位不动',
    promptEn: 'rack focus, focus shifts smoothly from foreground to background, guiding attention',
    family: 'special',
    shotSizes: ['CU', 'MS'],
    durationHintSec: [2, 5],
    difficulty: 'advanced',
    tags: ['对焦', '注意力', '景深'],
  },
  {
    id: 'parallax-slide',
    labelZh: '视差滑动',
    labelEn: 'Parallax Slide',
    descZh: '相机横向移动时前景与后景以不同速度掠过，强化三维纵深与运动层次。',
    promptZh: '相机横向移动，前景与后景以不同速度掠过，强化纵深与运动层次',
    promptEn: 'parallax slide, lateral move where foreground and background layers drift at different speeds, strong depth',
    family: 'special',
    shotSizes: ['WS', 'FS'],
    durationHintSec: [3, 8],
    difficulty: 'pro',
    tags: ['视差', '纵深', '层次'],
  },
  {
    id: 'dutch-roll',
    labelZh: '滚转倾斜',
    labelEn: 'Dutch Roll',
    descZh: '镜头绕光轴滚转，画面由正转斜，表达失衡、晕眩与超现实。',
    promptZh: '镜头绕光轴滚转，画面由正转斜，表达失衡与晕眩',
    promptEn: 'camera roll around the lens axis, dutch angle rotation, disequilibrium and disorientation',
    family: 'special',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [2, 6],
    difficulty: 'pro',
    tags: ['荷兰角', '失衡', '晕眩'],
  },
  {
    id: 'snorricam',
    labelZh: '人体固定机位',
    labelEn: 'Snorricam',
    descZh: '机位固定于人物身上的支架，人物静止而背景剧烈运动，表现迷失与抽离。',
    promptZh: '机位固定于人物身上，人物静止而背景剧烈运动，表现迷失与抽离',
    promptEn: 'snorricam, camera rigged to the subject, subject fixed while background churns, dissociation',
    family: 'special',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [2, 6],
    difficulty: 'pro',
    tags: ['抽离', '迷失', '机械臂'],
  },
  {
    id: 'bullet-time',
    labelZh: '时间切片',
    labelEn: 'Bullet Time',
    descZh: '机位在极慢动作中环绕主体运动，时间近乎凝固，定格关键瞬间。',
    promptZh: '极慢动作中机位环绕主体运动，时间近乎凝固，定格关键瞬间',
    promptEn: 'bullet time, extreme slow motion with camera arcing around the frozen subject',
    family: 'special',
    shotSizes: ['MS', 'FS'],
    durationHintSec: [2, 6],
    difficulty: 'pro',
    tags: ['慢动作', '环绕', '定格'],
  },
  {
    id: 'impact-shake',
    labelZh: '撞击震机',
    labelEn: 'Impact Shake',
    descZh: '瞬间的剧烈画面震动模拟撞击或爆炸，增强物理冲击的体感。',
    promptZh: '瞬间剧烈画面震动，模拟撞击或爆炸，增强物理冲击体感',
    promptEn: 'sudden camera shake on impact, explosive jolt, physical impact sensation',
    family: 'special',
    shotSizes: ['MS', 'CU'],
    durationHintSec: [1, 2],
    difficulty: 'basic',
    tags: ['冲击', '震动', '爆炸'],
  },
];

export const CAMERA_MOVE_FAMILY_SET: ReadonlySet<string> = new Set(
  CAMERA_MOVE_FAMILY_ORDER,
);

const BY_ID = new Map<string, CameraMoveDef>();
const BY_LABEL = new Map<string, CameraMoveDef>();
for (const def of CAMERA_MOVE_LIBRARY) {
  BY_ID.set(def.id, def);
  BY_LABEL.set(def.labelZh.trim().toLowerCase(), def);
  BY_LABEL.set(def.labelEn.trim().toLowerCase(), def);
}

/** 按 id（忽略首尾空白与大小写）或中/英文名精确匹配；未命中返回 undefined。 */
export function lookupCameraMove(id: string | undefined | null): CameraMoveDef | undefined {
  if (!id) return undefined;
  const key = String(id).trim();
  if (!key) return undefined;
  return BY_ID.get(key.toLowerCase()) ?? BY_LABEL.get(key.toLowerCase());
}

/** 返回指定家族的全部运镜（保持词库顺序）；非法家族返回空数组。 */
export function cameraMovesByFamily(family: CameraMoveFamily | string): CameraMoveDef[] {
  return CAMERA_MOVE_LIBRARY.filter((m) => m.family === family);
}

export interface CameraMoveSearchOptions {
  /** 是否匹配标签（默认 true） */
  includeTags?: boolean;
  /** 是否匹配中文说明（默认 true） */
  includeDesc?: boolean;
}

/** 简单检索：按 id / 中英文名 / 中英文提示词 / 标签 / 说明 模糊匹配，保持词库顺序。 */
export function searchCameraMoves(
  query: string | undefined | null,
  opts: CameraMoveSearchOptions = {},
): CameraMoveDef[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [...CAMERA_MOVE_LIBRARY];
  const includeTags = opts.includeTags ?? true;
  const includeDesc = opts.includeDesc ?? true;
  return CAMERA_MOVE_LIBRARY.filter((m) => {
    if (m.id.toLowerCase().includes(q)) return true;
    if (m.labelZh.toLowerCase().includes(q)) return true;
    if (m.labelEn.toLowerCase().includes(q)) return true;
    if (m.promptZh.toLowerCase().includes(q)) return true;
    if (m.promptEn.toLowerCase().includes(q)) return true;
    if (includeTags && m.tags?.some((t) => t.toLowerCase().includes(q))) return true;
    if (includeDesc && m.descZh.toLowerCase().includes(q)) return true;
    return false;
  });
}

export interface BuildCameraMovePromptOptions {
  /** 输出语言：英文片段（默认）/ 中文片段 / 中英并排 */
  lang?: 'en' | 'zh' | 'both';
  /** 片段间分隔符；按语言有默认值（英文 ', '，中文 '、'） */
  separator?: string;
  /** 遇到未知 id 时的行为：skip 忽略（默认），throw 抛错 */
  onUnknown?: 'skip' | 'throw';
}

const DEFAULT_SEPARATOR: Record<'en' | 'zh' | 'both', string> = {
  en: ', ',
  zh: '、',
  both: ' / ',
};

function phraseOf(def: CameraMoveDef, lang: 'en' | 'zh' | 'both'): string {
  if (lang === 'zh') return def.promptZh;
  if (lang === 'both') return `${def.promptEn} / ${def.promptZh}`;
  return def.promptEn;
}

/**
 * 把若干运镜拼成一段提示词片段：按传入顺序、去重、跳过未知 id。
 * 空输入 / 全部未知时返回空字符串。
 */
export function buildCameraMovePrompt(
  ids: Array<string | null | undefined> | string | null | undefined,
  opts: BuildCameraMovePromptOptions = {},
): string {
  const lang = opts.lang ?? 'en';
  const onUnknown = opts.onUnknown ?? 'skip';
  const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const raw of list) {
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key) continue;
    const def = lookupCameraMove(key);
    if (!def) {
      if (onUnknown === 'throw') throw new Error(`未知运镜 id: ${raw}`);
      continue;
    }
    const norm = def.id.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    phrases.push(phraseOf(def, lang));
  }
  if (phrases.length === 0) return '';
  return phrases.join(opts.separator ?? DEFAULT_SEPARATOR[lang]);
}

/** 提示词片段前缀（用于注入既有提示词时的成行识别与替换）。 */
export const CAMERA_MOVE_PROMPT_PREFIX_EN = 'camera movement:';
export const CAMERA_MOVE_PROMPT_PREFIX_ZH = '运镜：';

/**
 * 把运镜片段注入既有提示词文本：
 * - 追加为独立一行（英文以 `camera movement: ` 前缀、中文以 `运镜：` 前缀）；
 * - 若已存在运镜行则**替换**（按语言前缀识别），避免反复点击堆叠；
 * - ids 为空时移除已注入的运镜行，其余内容原样保留。
 */
export function withCameraMovePrompt(
  existing: string | undefined | null,
  ids: Array<string | null | undefined> | string | null | undefined,
  opts: BuildCameraMovePromptOptions = {},
): string {
  const lang = opts.lang ?? 'en';
  const prefix = lang === 'zh' ? CAMERA_MOVE_PROMPT_PREFIX_ZH : CAMERA_MOVE_PROMPT_PREFIX_EN;
  const enPrefix = CAMERA_MOVE_PROMPT_PREFIX_EN.toLowerCase();
  const lines = (existing ?? '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    const tl = t.toLowerCase();
    if (tl.startsWith(enPrefix) || t.startsWith(CAMERA_MOVE_PROMPT_PREFIX_ZH)) continue;
    kept.push(line);
  }
  // 去掉结尾空行，避免反复点击累积空行
  while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop();
  const fragment = buildCameraMovePrompt(ids, opts);
  if (!fragment) return kept.join('\n');
  kept.push(lang === 'zh' ? `${prefix}${fragment}` : `${prefix} ${fragment}`);
  return kept.join('\n');
}

// ── 兼容适配器（不替换既有数组） ──

/** 运镜家族 → 既有 `PromptPreset.group` 的中文分组名（与 CAMERA_PROMPT_PRESETS 词表对齐）。 */
export function cameraMoveFamilyGroup(family: CameraMoveFamily | string): string {
  return CAMERA_MOVE_FAMILY_LABELS[family as CameraMoveFamily] ?? String(family);
}

/** 把一条运镜映射到既有 `PromptPreset` 形状，供既有消费方复用。 */
export function cameraMoveToPromptPreset(def: CameraMoveDef): PromptPreset {
  return {
    id: def.id,
    label: def.labelZh,
    text: def.promptEn,
    group: cameraMoveFamilyGroup(def.family),
  };
}

/** 把整库（或子集）映射为 `PromptPreset` 形状数组；缺省返回全库。 */
export function cameraMovePromptPresets(
  defs: CameraMoveDef[] = CAMERA_MOVE_LIBRARY,
): PromptPreset[] {
  return defs.map(cameraMoveToPromptPreset);
}

/**
 * 既有轻量 `CAMERA_PROMPT_PRESETS` 的 8 个 id → 运镜库 id。
 * 供既有消费方在「需要更完整运镜」时按 id 升级到本库，不替换既有数组。
 */
export const LEGACY_CAMERA_PRESET_TO_MOVE: Record<string, string> = {
  'cam-dolly-in': 'push-slow',
  'cam-dolly-out': 'pull-slow',
  'cam-orbit': 'orbit-180',
  'cam-crane-up': 'crane-up',
  'cam-tracking': 'track-follow',
  'cam-whip-pan': 'whip-pan',
  'cam-fpv': 'fpv-flythrough',
  'cam-static': 'static-locked-off',
};

/** 按既有 `CAMERA_PROMPT_PRESETS` 的 id 解析到运镜库条目；未命中返回 undefined。 */
export function cameraMoveFromLegacyPresetId(
  legacyId: string | undefined | null,
): CameraMoveDef | undefined {
  if (!legacyId) return undefined;
  const moveId = LEGACY_CAMERA_PRESET_TO_MOVE[legacyId];
  return moveId ? lookupCameraMove(moveId) : undefined;
}

/**
 * 3D 导演台 `CameraMoveId` 的 15 个枚举值 → 运镜库 id。
 * 供导演台/提交适配器在需要完整运镜短语时升级复用，不替换 `MOVE_PHRASE`。
 */
export const DIRECTOR_CAMERA_MOVE_TO_MOVE: Record<string, string> = {
  static: 'static-locked-off',
  'dolly-in': 'push-slow',
  'dolly-out': 'pull-slow',
  'truck-left': 'truck-left',
  'truck-right': 'truck-right',
  'pedestal-up': 'crane-up',
  'pedestal-down': 'crane-down',
  'pan-left': 'pan-slow',
  'pan-right': 'pan-slow',
  'tilt-up': 'tilt-up',
  'tilt-down': 'tilt-down',
  orbit: 'orbit-180',
  'crane-up': 'crane-up',
  'crane-down': 'crane-down',
  handheld: 'handheld-follow',
};

/** 按 3D 导演台 `CameraMoveId` 解析到运镜库条目；未命中返回 undefined。 */
export function cameraMoveFromDirectorMoveId(
  moveId: string | undefined | null,
): CameraMoveDef | undefined {
  if (!moveId) return undefined;
  const key = DIRECTOR_CAMERA_MOVE_TO_MOVE[moveId] ?? moveId;
  return lookupCameraMove(key);
}
