// ===== §2.1 用户与工作区 =====
export const FIXTURE_USER = {
  id: 'user-fixture-001',
  name: '测试用户',
  email: 'fixture@nx9.test',
};

export const FIXTURE_WS = {
  title: '【测试】短剧 Demo 工作区',
  ownerId: 'user-fixture-001',
};

export const FIXTURE_WS_IMPORT = {
  version: 3,
  blocks: [
    {
      id: 'blk-prompt-001',
      type: 'prompt',
      position: { x: 100, y: 100 },
      data: { blockIndex: 1, status: 'idle', content: 'FIXTURE: cinematic coffee shop, morning golden light, young woman' },
    },
    {
      id: 'blk-pic-001',
      type: 'picture-gen',
      position: { x: 400, y: 100 },
      data: { blockIndex: 2, status: 'idle', model: 'dall-e-3', size: '1024x1024', quality: 'auto', imageCount: 1 },
    },
    {
      id: 'blk-clip-001',
      type: 'clip-gen',
      position: { x: 700, y: 100 },
      data: { blockIndex: 3, status: 'idle', model: 'veo', aspect: '16:9', durationSec: 6, resolution: '720' },
    },
    {
      id: 'blk-sound-001',
      type: 'sound-gen',
      position: { x: 100, y: 280 },
      data: { blockIndex: 4, status: 'idle', provider: 'cloud', voice: 'alloy', audioFormat: 'mp3', speechRate: 1, text: 'FIXTURE 欢迎来到 NX9 测试。' },
    },
    {
      id: 'blk-shot-script-001',
      type: 'shot-script',
      position: { x: 100, y: 450 },
      data: {
        blockIndex: 5, status: 'idle', novelText: 'FIXTURE 见 FIXTURE_AG_SHOT',
        scriptRows: [
          { id: 'row-1', durationSec: 4, shotType: 'WS', dialogue: '', action: '咖啡馆外景' },
          { id: 'row-2', durationSec: 3, shotType: 'MS', dialogue: '一杯美式', action: '吧台点单' },
        ],
      },
    },
    {
      id: 'blk-review-gate-001',
      type: 'review-gate',
      position: { x: 400, y: 450 },
      data: { blockIndex: 6, status: 'idle' },
    },
  ],
  links: [
    { id: 'e-001', source: 'blk-prompt-001', target: 'blk-pic-001' },
    { id: 'e-002', source: 'blk-pic-001', target: 'blk-clip-001' },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
  nextBlockIndex: 7,
  storyboard: { version: 1, title: 'FIXTURE 测试集', reviewMode: 'manual', shots: [] },
  voice: {
    version: 1,
    profiles: [{ id: 'vp-fix-001', name: '林晓', provider: 'openai-compatible', voiceId: 'nova' }],
    lines: [{ id: 'vl-fix-001', shotId: 'shot-fix-002', speaker: '林晓', text: 'FIXTURE 一杯美式，谢谢。', voiceProfileId: 'vp-fix-001', status: 'pending' }],
  },
  viewMode: 'explore',
  canvasAppearance: { theme: 'dark', gridStyle: 'dots', backgroundImageUrl: null, backgroundImageOpacity: 0.35 },
};

// ===== §2.2 故事板镜头 =====
export const FIXTURE_SHOTS = [
  { id: 'shot-fix-001', index: 1, durationSec: 4, shotType: 'wide', descriptionZh: '咖啡馆外景，清晨，女主推门进入', promptEn: 'wide shot, young woman entering coffee shop, morning golden light', status: 'draft', characterIds: [], linkedBlockId: null },
  { id: 'shot-fix-002', index: 2, durationSec: 3, shotType: 'medium', descriptionZh: '吧台点单，女主微笑', promptEn: 'medium shot, woman ordering at counter', status: 'review', firstFrameAssetId: '/media/images/fixture-shot-002.png', linkedBlockId: null },
  { id: 'shot-fix-003', index: 3, durationSec: 5, shotType: 'close', descriptionZh: '特写：咖啡拉花', promptEn: 'close-up, latte art, steam rising', status: 'approved', linkedBlockId: 'blk-pic-001' },
];

// ===== §2.3 Gateway 请求体 =====
export const FIXTURE_GW_IMAGE = { prompt: 'FIXTURE red apple on white background', model: 'dall-e-3', size: '1024x1024', quality: 'high', n: 2 };
export const FIXTURE_GW_VIDEO = { prompt: 'FIXTURE woman walking in rain, cinematic', model: 'veo', duration: 10, aspect_ratio: '9:16', resolution: '720', size: '720x1280' };
export const FIXTURE_GW_TTS = { input: 'FIXTURE 这是 NX9 配音测试句。', voice: 'alloy', response_format: 'wav', speed: 1.25 };
export const FIXTURE_GW_LLM = { model: 'gpt-4o-mini', messages: [{ role: 'system', content: '你是分镜助手，输出 Markdown 表格。' }, { role: 'user', content: 'FIXTURE 把以下故事拆成 3 镜：林晓进咖啡馆，点单，特写咖啡。' }] };

// ===== §2.4 Agent / 编剧 =====
export const FIXTURE_AG_SHOT = { text: `FIXTURE 小说章节：

林晓推开咖啡馆的玻璃门，风铃叮当作响。清晨的阳光斜照进来，在木质地板上拉出长长的影子。她点了一杯美式，找了个靠窗的位置坐下。

突然，手机震动。听筒里传来男声："你还记得三年前的那个雨夜吗？"

窗外，一个撑黑伞的男人正抬头看向二楼窗户。` };

export const FIXTURE_AG_DIALOGUE = { text: `林晓：一杯美式，谢谢。
店员：好的，请稍等。
林晓：（独白）三年前的雨夜，原来还没结束。` };

export const FIXTURE_AG_MATERIALIZE = {
  table: [
    { id: 'row-fix-001', group: 'G1', shotSize: 'WS', cameraMove: 'static', durationSec: 4, descriptionZh: '雨夜街道 establishing', dialogue: '', sfx: '雨声', videoDesc: 'slow push in', associateAssetIds: [] },
    { id: 'row-fix-002', group: 'G1', shotSize: 'MS', cameraMove: 'pan', durationSec: 3, descriptionZh: '男主撑伞', dialogue: '', sfx: '', videoDesc: 'follow walk', associateAssetIds: [] },
  ],
};

export const FIXTURE_STORYBOARD_MARKDOWN = `| 镜号 | 景别 | 画面描述 | 英文提示词 | 时长 | 备注 |
|------|------|----------|------------|------|------|
| 1 | 远景 | FIXTURE 咖啡馆外景 | wide shot coffee shop exterior morning | 4 | |
| 2 | 中景 | FIXTURE 女主点单 | medium shot woman at counter | 3 | |
| 3 | 特写 | FIXTURE 咖啡拉花 | close-up latte art | 3 | |`;

// ===== §2.5 Grid / 线稿 =====
export const FIXTURE_GRID_GENERATE = { prompt: 'FIXTURE storyboard contact sheet, young woman in coffee shop', rows: 3, cols: 3, style: 'line-art' };
export const FIXTURE_GRID_SPLIT = { sourceUrl: '/media/images/fixture-grid-3x3.png', rows: 3, cols: 3 };
export const FIXTURE_SHOT_SKETCH = { descriptionZh: 'FIXTURE 咖啡馆特写，女主惊讶', promptEn: 'close-up surprised woman in coffee shop', shotType: 'CU' };

// ===== §2.6 Tools / Montage =====
export const FIXTURE_LINK_PARSE = { url: 'https://www.example.com/video/fixture-demo-001' };
export const FIXTURE_PROXY_DOWNLOAD = { url: 'https://cdn.example.com/fixture-external-image.png' };
export const FIXTURE_MONTAGE_CONTACT = { shots: FIXTURE_SHOTS, cols: 3 };
export const FIXTURE_MONTAGE_CONCAT = { shots: FIXTURE_SHOTS.filter((s) => s.status === 'approved'), title: 'FIXTURE 测试集', requireApproved: true };

// ===== §2.7 角色库 =====
export const FIXTURE_CHARACTER = { id: 'char-fix-001', name: '林晓', tagline: 'FIXTURE 女主，25岁，黑长发', referenceImageUrl: '/media/images/fixture-char-linxiao.png', layers: { identity: 'young Chinese woman, long black hair', wardrobe: 'beige coat, white shirt' } };

// ===== §2.9 Playbook / 编排 =====
export const FIXTURE_PLAYBOOK_SESSION_LINE_ART = {
  playbookId: 'pb-line-art-episode',
  startedAt: '2026-07-09T12:00:00Z',
  currentStepId: 'line-art',
  completedStepIds: ['input', 'skeleton-table'],
};

export const FIXTURE_STORYBOARD_WITH_SKETCHES = [
  { id: 'shot-sk-1', index: 0, status: 'pending', firstFrameAssetId: '/media/images/fixture-sketch-1.png' },
  { id: 'shot-sk-2', index: 1, status: 'pending', firstFrameAssetId: '/media/images/fixture-sketch-2.png' },
  { id: 'shot-sk-3', index: 2, status: 'pending' },
];

export const FIXTURE_PLAYBOOK_CTX = {
  storyboard: { shots: FIXTURE_STORYBOARD_WITH_SKETCHES },
  voice: { lines: [] },
  nodes: [
    { id: 'node-ss-1', type: 'shot-script', data: { status: 'done' } },
    { id: 'node-sg-1', type: 'story-grid', data: { status: 'idle' } },
  ],
};

// ===== §2.10 13-Step Pipeline fixtures =====
export const FIXTURE_NOVEL_500 = `《测试剧》大纲：讲述小明和小红在都市中的相遇与成长。
第 1 集
1-1 日 内 咖啡厅
人物：小明
小明坐在窗边，看着窗外的人群。他点了一杯美式咖啡。
1-2 夜 外 街道
人物：小明 小红
小红在街上奔跑，撞到了小明。两人都倒在地上。
"对不起！"小红急忙站起来。
"没关系。"小明笑了笑。
1-3 夜 外 屋顶
人物：小明
小明独自站在屋顶，看着城市的夜景。他拿出手机，犹豫着要不要打电话。
"我喜欢你。"最终他鼓起勇气说了出来。`;

export const FIXTURE_SCENE_SPLIT_3: import('@nx9/shared').SceneSplitRecord[] = [
  { id: 'sc-1', sceneCode: '1-1', episode: 1, location: '咖啡厅', interior: '内', timeOfDay: '日', characters: ['小明'], summary: '相遇' },
  { id: 'sc-2', sceneCode: '1-2', episode: 1, location: '街道', interior: '外', timeOfDay: '夜', characters: ['小明','小红'], summary: '追逐' },
  { id: 'sc-3', sceneCode: '1-3', episode: 1, location: '屋顶', interior: '外', timeOfDay: '夜', characters: ['小明'], summary: '告白' },
];

export const FIXTURE_ENV_PROFILE: import('@nx9/shared').EnvironmentProfile = {
  id: 'env-1', sceneCode: '1-1', name: '咖啡厅', descriptionZh: '复古木质装修',
  lighting: '暖色窗光', props: ['咖啡杯','笔记本'],
};

// ===== §2.8 Mock 响应 =====
export const MOCK_GW_IMAGE_RES = { ok: true, url: '/media/images/fixture-mock-gen.png', urls: ['/media/images/fixture-mock-gen-a.png', '/media/images/fixture-mock-gen-b.png'] };
export const MOCK_GW_VIDEO_RES = { ok: true, status: 'success', url: '/media/videos/fixture-6s.mp4', taskId: 'task-fix-video-001' };
export const MOCK_GW_TTS_RES = { ok: true, url: '/media/audio/fixture-tts.wav', bytes: 8192, provider: 'openai-compatible' };
