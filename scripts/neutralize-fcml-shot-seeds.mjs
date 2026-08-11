/**
 * FCML → NX9 中立镜头种子（中英对照）
 * 输入：docs/fcml-yunjing-prompts.json
 * 输出：docs/nx9-shot-seeds-neutral.{json,md,tsv}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABEL_EN, LOGIC_EN, PURPOSE_EN } from './data/fcml-shot-en.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'fcml-yunjing-prompts.json'), 'utf8'),
);

/** @typedef {'static'|'dolly'|'pan_tilt'|'track'|'crane'|'orbit'|'special'} MoveFamily */

const CATEGORY_FAMILY = /** @type {Record<string, MoveFamily>} */ ({
  基础推拉变焦运镜: 'dolly',
  角色定位构图运镜: 'static',
  障碍物与环境互动运镜: 'track',
  焦点与镜头操控运镜: 'special',
  三脚架固定基础运镜: 'pan_tilt',
  滑轨横向运镜: 'track',
  环绕运镜: 'orbit',
  垂直升降运镜: 'crane',
  光学镜头特效运镜: 'dolly',
  '无人机 / 航拍专属运镜': 'special',
  风格化动态运镜: 'special',
  主体追踪运镜: 'track',
  时间与速度操控运镜: 'special',
  极端定向与透视运镜: 'special',
  空间物理规则突破类运镜: 'special',
  时间维度全操控类运镜: 'special',
  光学与透视极限突破类运镜: 'special',
  '运镜 + 转场一体化无缝运镜': 'special',
  强情绪与叙事适配专属运镜: 'special',
  'AI/CG 独有的维度与空间逻辑突破运镜': 'special',
  '叙事向玄幻 / 动画专属定制运镜': 'special',
  '国漫玄幻打斗专属・极致爽感运镜合集': 'special',
});

const NAME_FAMILY_OVERRIDE = /** @type {Record<string, MoveFamily>} */ ({
  过肩镜头: 'static',
  正反打镜头: 'static',
  '鱼眼 / 窥视镜镜头': 'special',
  上摇镜头: 'pan_tilt',
  下摇镜头: 'pan_tilt',
  '水平摇镜（左右摇镜）': 'pan_tilt',
  '遮蔽物后揭示（擦拭式运镜）': 'track',
  '穿行镜头（飞越空隙）': 'track',
  前景遮挡转场运镜: 'track',
  缝隙窥视推进运镜: 'dolly',
  台座上升: 'crane',
  台座下降: 'crane',
  '吊臂上升（俯角揭示）': 'crane',
  '吊臂下降（着陆运镜）': 'crane',
  '垂直升降 + 俯仰联动运镜': 'crane',
  '180 度环绕运镜': 'orbit',
  '360 度环绕运镜': 'orbit',
  慢速电影弧线运镜: 'orbit',
  变速环绕运镜: 'orbit',
  '快速摇镜（甩镜）': 'special',
  手持纪实风格运镜: 'special',
  '荷兰角（滚转倾斜）运镜': 'special',
  震动冲击运镜: 'special',
  '引领镜头（反向追踪）': 'track',
  '跟随镜头（正向追踪）': 'track',
  平行侧跟运镜: 'track',
  第一人称行走运镜: 'special',
  超高速运动锁定跟拍: 'track',
  'FPV 无人机俯冲（瀑布俯冲）运镜': 'special',
  无人机飞越运镜: 'special',
  史诗级无人机上升揭示运镜: 'crane',
  大规模无人机环绕运镜: 'orbit',
  垂直俯拍上帝视角运镜: 'crane',
  鹰眼极端俯角运镜: 'crane',
});

/** @type {Array<[RegExp, string]>} */
const ZH_RULES = [
  [/玉佩的龙纹纹理特写/g, '主体细节特写'],
  [/玉佩龙纹的微观纹理细节/g, '主体微观纹理细节'],
  [/玉佩龙纹特写/g, '主体细节特写'],
  [/玉佩龙纹纹理/g, '主体细节纹理'],
  [/玉佩龙纹/g, '主体细节'],
  [/玉佩整体特写/g, '主体特写'],
  [/玉佩特写/g, '主体特写'],
  [/雕刻龙纹的圆形玉佩/g, '主体'],
  [/圆形玉佩/g, '主体'],
  [/玉佩/g, '主体'],
  [/龙纹纹理/g, '细节纹理'],
  [/龙纹/g, '细节纹理'],
  [/带盖白瓷茶杯/g, '次要道具'],
  [/白瓷茶杯/g, '次要道具'],
  [/茶杯/g, '次要道具'],
  [/少年的面部特写/g, '人物面部特写'],
  [/少年面部特写/g, '人物面部特写'],
  [/少年的面部/g, '人物面部'],
  [/少年面部/g, '人物面部'],
  [/少年左肩后方/g, '近景人物左肩后方'],
  [/少年左肩/g, '近景人物左肩'],
  [/少年右肩/g, '近景人物右肩'],
  [/少年全身/g, '人物全身'],
  [/少年侧面全景/g, '人物侧面全景'],
  [/少年正面中景/g, '人物正面中景'],
  [/少年正面/g, '人物正面'],
  [/少年侧面/g, '人物侧面'],
  [/少年端坐书桌前手持毛笔/g, '人物处于场景中'],
  [/少年端坐于书桌前/g, '人物处于场景中'],
  [/少年端坐书桌前/g, '人物处于场景中'],
  [/少年端坐/g, '人物'],
  [/少年持剑站在庭院中央/g, '人物处于场景中央'],
  [/少年持剑/g, '人物'],
  [/少年御剑飞行于云海之上/g, '主体在开阔空间中运动'],
  [/少年御剑/g, '主体'],
  [/少年佩剑的微观金属纹理/g, '关键道具的微观金属纹理'],
  [/少年佩剑/g, '关键道具'],
  [/庭院中的少年/g, '场景中的人物'],
  [/书桌前的少年/g, '场景中的人物'],
  [/书房内的少年/g, '场景中的人物'],
  [/少年/g, '人物'],
  [/完整桌面全景/g, '场景全景'],
  [/桌面全景/g, '场景全景'],
  [/起始全景/g, '场景全景'],
  [/中式实木桌面/g, '场景台面'],
  [/实木桌面/g, '场景台面'],
  [/桌面物件/g, '台面物件'],
  [/桌面/g, '场景台面'],
  [/新中式古风书房/g, '室内场景'],
  [/古风书房/g, '室内场景'],
  [/书房门外/g, '场景入口外'],
  [/书房木门/g, '场景门'],
  [/书房/g, '室内场景'],
  [/博古架木格/g, '前景遮挡物'],
  [/博古架立柱/g, '前景遮挡立柱'],
  [/博古架后方/g, '前景遮挡物后方'],
  [/博古架/g, '前景遮挡物'],
  [/木格窗与窗外竹影/g, '窗景'],
  [/窗外竹影/g, '窗外景致'],
  [/木格窗/g, '窗户'],
  [/宣纸、砚台、书卷/g, '台面物件'],
  [/宣纸、砚台/g, '台面物件'],
  [/宣纸、毛笔/g, '台面物件'],
  [/宣纸/g, '台面物件'],
  [/空座椅/g, '对面座位'],
  [/对面座椅肩后/g, '对面人物肩后'],
  [/对面的空座椅/g, '对面座位'],
  [/对面的对面座位/g, '对面座位'],
  [/前景的前景遮挡物/g, '前景遮挡物'],
  [/前景的前景遮挡立柱/g, '前景遮挡立柱'],
  [/古风城市全景/g, '城市全景'],
  [/古风城市/g, '城市'],
  [/古风庭院/g, '场景空间'],
  [/中式庭院/g, '场景空间'],
  [/庭院门口/g, '场景入口'],
  [/庭院入口/g, '场景入口'],
  [/庭院中央/g, '场景中央'],
  [/庭院后方/g, '场景后方'],
  [/庭院两侧/g, '场景两侧'],
  [/庭院另一侧/g, '场景另一侧'],
  [/庭院全景/g, '场景全景'],
  [/月下庭院/g, '月下场景'],
  [/庭院中的/g, '场景中的'],
  [/庭院内/g, '场景内'],
  [/庭院/g, '场景空间'],
  [/连绵青山与云海/g, '远山与开阔远景'],
  [/青山云海/g, '远山与开阔远景'],
  [/青山峡谷/g, '峡谷'],
  [/远处的连绵青山/g, '远处山脉'],
  [/连绵青山/g, '山脉'],
  [/青山星河/g, '远山与星空'],
  [/背景青山/g, '背景远山'],
  [/青山/g, '远山'],
  [/云海全景/g, '开阔远景全景'],
  [/云海之上/g, '开阔远景之上'],
  [/云海/g, '开阔远景'],
  [/星河宇宙/g, '宇宙尺度远景'],
  [/星河全景/g, '星空全景'],
  [/远景星河/g, '远景星空'],
  [/星河/g, '星空'],
  [/地球全景/g, '行星尺度全景'],
  [/古建筑群/g, '建筑群'],
  [/古风建筑/g, '建筑'],
  [/古建筑/g, '建筑'],
  [/古风山水/g, '山水景致'],
  [/古风回廊/g, '回廊'],
  [/古风写意水墨/g, '平面写意画风'],
  [/2D 平面国风写意水墨/g, '2D 平面写意画风'],
  [/2D 国风动画/g, '2D 平面动画'],
  [/国风动画/g, '平面动画'],
  [/国风/g, ''],
  [/水墨开阔远景/g, '画风化开阔远景'],
  [/水墨庭院/g, '画风化场景'],
  [/水墨/g, '平面画风'],
  [/桃花花瓣/g, '环境飘落物'],
  [/飘落桃花/g, '环境飘落物'],
  [/桃花/g, '环境飘落物'],
  [/假山/g, '场景另一侧目标'],
  [/木桩/g, '撞击目标'],
  [/握剑的手部/g, '人物持物手部'],
  [/握笔的手部/g, '人物手部'],
  [/挥剑击中/g, '攻击动作击中'],
  [/挥剑出剑气/g, '释放远程攻击特效'],
  [/挥剑出拳/g, '完成一组攻击动作'],
  [/挥剑的动作/g, '攻击动作'],
  [/挥剑动作/g, '攻击动作'],
  [/极速挥剑/g, '极速攻击'],
  [/完成挥剑/g, '完成攻击'],
  [/挥剑释放/g, '释放'],
  [/挥剑/g, '攻击'],
  [/出剑气/g, '释放远程攻击特效'],
  [/剑气光晕/g, '攻击光效'],
  [/金色光晕/g, '光效覆盖'],
  [/剑气/g, '远程攻击特效'],
  [/剑身内部纹路/g, '道具内部纹路'],
  [/剑身内部/g, '道具内部'],
  [/剑身特写/g, '武器特写'],
  [/剑身/g, '武器本体'],
  [/剑刃/g, '武器刃面'],
  [/剑尖/g, '武器尖端'],
  [/长剑/g, '武器'],
  [/佩剑的内部/g, '关键道具内部'],
  [/佩剑/g, '关键道具'],
  [/收剑/g, '收势'],
  [/御剑飞行的人物/g, '空中运动的人物'],
  [/御剑人物/g, '空中运动的人物'],
  [/反向御剑后退/g, '人物反向空中后退'],
  [/开阔远景御剑的人物/g, '开阔远景中运动的人物'],
  [/御剑/g, '空中运动'],
  [/练字/g, '日常练习'],
  [/练剑/g, '动作练习'],
  [/书桌前人物/g, '场景中的人物'],
  [/书桌上打开的画卷/g, '场景中的画框/嵌套画面'],
  [/画卷内的山水/g, '嵌套画面中的景观'],
  [/画卷内是山水画面/g, '嵌套画面为另一景观'],
  [/画卷/g, '嵌套画框'],
  [/宗门/g, '势力据点'],
  [/妖兽/g, '敌对生物'],
  [/反派/g, '对手'],
  [/配角/g, '其他角色'],
  [/功法/g, '技能特效'],
  [/大招/g, '高潮技能'],
  [/连招/g, '连续动作'],
  [/神识/g, '精神视角'],
  [/念力/g, '意念'],
  [/威压感/g, '压迫感'],
  [/国漫打斗/g, '高速打斗'],
  [/国漫/g, ''],
  [/玄幻/g, ''],
  [/法宝/g, '关键道具'],
  [/机甲/g, '机械载具'],
];

function neutralizeZh(text) {
  let s = String(text ?? '').trim();
  for (const [re, rep] of ZH_RULES) s = s.replace(re, rep);
  s = s
    .replace(/对面的对面座位/g, '对面座位')
    .replace(/前景的前景遮挡/g, '前景遮挡')
    .replace(/技能特效特效/g, '技能特效')
    .replace(/连续动作动作/g, '连续动作')
    .replace(/，{2,}/g, '，')
    .replace(/、{2,}/g, '、')
    .replace(/\s{2,}/g, ' ')
    .replace(/。，/g, '。')
    .replace(/，。/g, '。')
    .replace(/全程无停顿。，/g, '全程无停顿，')
    .replace(/^\s*，/g, '')
    .replace(/写实的/g, '')
    .trim();
  return s;
}

function neutralizePurpose(effect) {
  let s = neutralizeZh(effect);
  s = s
    .replace(/^掌握[^，]+，/, '')
    .replace(/最基础的叙事运镜/g, '基础叙事运镜')
    .replace(/新手友好度极高/g, '易用')
    .replace(/影视叙事核心运镜/g, '对话叙事核心运镜')
    .replace(/是\s*打斗核心运镜/g, '高速打斗常用运镜')
    .replace(/电影级宏大叙事核心运镜/g, '宏大叙事常用运镜')
    .trim();
  return s;
}

function inferShotSize(name, logic) {
  const t = name + logic;
  if (/微距|纹理特写|面部特写|瞳孔|特写/.test(t) && /全景|远景|宇宙|城市/.test(t)) return '全景→特写';
  if (/微距|瞳孔|纹理特写|特写/.test(t)) return '特写';
  if (/远景|上帝|城市|宇宙|航拍|飞越|史诗/.test(t)) return '远景';
  if (/全景|揭示|建立/.test(t)) return '全景';
  if (/过肩|中景|对话|群像/.test(t)) return '中景';
  if (/近景|跟拍|行走|POV/.test(t)) return '近景';
  return '中景';
}

function inferCameraMove(name, family) {
  if (/推进|推镜|冲击推进|变焦推进/.test(name)) return '推';
  if (/拉出|拉镜|变焦拉出/.test(name)) return '拉';
  if (/上摇/.test(name)) return '上摇';
  if (/下摇/.test(name)) return '下摇';
  if (/摇镜|甩镜|左右摇/.test(name)) return '摇';
  if (/左横移/.test(name)) return '左移';
  if (/右横移|横移/.test(name)) return '横移';
  if (/环绕|弧线/.test(name)) return '环绕';
  if (/上升|升起|吊臂上升|台座上升/.test(name)) return '升';
  if (/下降|降落|着陆|台座下降|吊臂下降|俯冲/.test(name)) return '降';
  if (/跟|追踪|侧跟/.test(name)) return '跟';
  if (/手持/.test(name)) return '手持';
  if (/POV|第一人称|主观|神识|灵魂|视线/.test(name)) return 'POV';
  if (family === 'static') return '固定';
  if (family === 'orbit') return '环绕';
  if (family === 'crane') return '升';
  if (family === 'dolly') return '推';
  if (family === 'track') return '跟';
  if (family === 'pan_tilt') return '摇';
  return '特殊';
}

function extractDurationSec(logic) {
  if (/10\s*秒/.test(logic)) return 10;
  if (/5\s*秒/.test(logic)) return 5;
  return 10;
}

const FOOTER_ZH =
  '机位与运动逻辑优先；主体与环境由当帧角色/场景/风格库注入，本条目不绑定固定教具场景或美学风格。';
const FOOTER_EN =
  'Prioritize camera motion; inject subject/environment/style from the active frame assets—this entry binds no fixed prop kit or look.';

const seeds = [];
const missingEn = [];

for (const system of src.systems) {
  for (const cat of system.categories) {
    const defaultFamily = CATEGORY_FAMILY[cat.name] || 'special';
    for (const item of cat.items) {
      const family = NAME_FAMILY_OVERRIDE[item.name] || defaultFamily;
      const purposeZh = neutralizePurpose(item.effect);
      const logicZh = neutralizeZh(item.logic);
      const labelEn = LABEL_EN[item.id] || LABEL_EN[item.name] || item.name;
      const logicEn = LOGIC_EN[item.id];
      const purposeEn = PURPOSE_EN[item.id] || purposeZh;
      if (!logicEn) missingEn.push(item.id);

      const promptZh = `${logicZh.replace(/。$/, '')}。${FOOTER_ZH}`;
      const promptEn = logicEn
        ? `${logicEn} ${FOOTER_EN}`
        : `${labelEn}. Neutral camera move (~${extractDurationSec(item.logic)}s). ${FOOTER_EN}`;

      seeds.push({
        id: `shot-fcml-${item.id}`,
        sourceId: item.id,
        label: item.name,
        labelEn,
        systemId: system.id,
        system: system.name,
        category: cat.name,
        moveFamily: family,
        cameraMove: inferCameraMove(item.name, family),
        shotSize: inferShotSize(item.name, item.logic),
        durationSec: extractDurationSec(item.logic),
        purposeZh,
        purposeEn,
        logicZh,
        logicEn: logicEn || '',
        promptZh,
        promptEn,
        note: 'Neutralized draft from FCML teaching kit. Review before promoting to builtin templates.',
      });
    }
  }
}

if (missingEn.length) {
  console.error('Missing LOGIC_EN for:', missingEn.join(', '));
  process.exit(1);
}

const scrapedAt = new Date().toISOString();
const outJson = {
  meta: {
    title: 'NX9 中立镜头种子（中英对照）',
    source: 'https://fcml.infission.com/ (scraped → neutralized)',
    sourceDoc: 'docs/fcml-yunjing-prompts.json',
    generatedAt: scrapedAt,
    count: seeds.length,
    status: 'draft — not yet wired into BUILTIN_BACKLOT_TEMPLATES',
    rules: [
      'Strip teaching-kit entities → subject / character / scene placeholders',
      'Strip 4K/HDR/guofeng/no-字幕 delivery boilerplate',
      'Keep motion timing, path, and dramatic purpose',
      'Bilingual fields: label/labelEn, purposeZh/purposeEn, logicZh/logicEn, promptZh/promptEn',
    ],
  },
  seeds,
};

fs.writeFileSync(
  path.join(root, 'docs', 'nx9-shot-seeds-neutral.json'),
  JSON.stringify(outJson, null, 2),
  'utf8',
);

const lines = [];
lines.push('# NX9 中立镜头种子（中英对照）');
lines.push('');
lines.push(`> 来源教具站：[fcml.infission.com](https://fcml.infission.com/)（已中立化，**非**原文入库）`);
lines.push(`> 生成时间：${scrapedAt}`);
lines.push(`> 条目：**${seeds.length}** · 状态：草稿（尚未写入内置模板）`);
lines.push('');
lines.push('## 改写原则');
lines.push('');
lines.push('| 保留 | 去掉 |');
lines.push('| --- | --- |');
lines.push('| 运镜路径、速度、起幅/落幅、焦点/透视行为 | 玉佩/茶杯/古风少年等教具专名 |');
lines.push('| 戏剧用途（purpose） | 4K、HDR、国风、无字幕等成片套话 |');
lines.push('| 中英对照可复用 Prompt | 固定统一场景整段粘贴 |');
lines.push('');
lines.push('## 目录');
lines.push('');
lines.push('| # | 中文名 | English | 运镜族 | 分类 |');
lines.push('| ---: | --- | --- | --- | --- |');
seeds.forEach((s, i) => {
  lines.push(`| ${i + 1} | ${s.label} | ${s.labelEn} | \`${s.moveFamily}\` | ${s.category} |`);
});
lines.push('');

let curSys = '';
let curCat = '';
for (const [i, s] of seeds.entries()) {
  if (s.system !== curSys) {
    curSys = s.system;
    lines.push('---');
    lines.push('');
    lines.push(`# ${curSys}`);
    lines.push('');
  }
  if (s.category !== curCat) {
    curCat = s.category;
    lines.push(`## ${curCat}`);
    lines.push('');
  }

  lines.push(`### ${i + 1}. ${s.label} / ${s.labelEn}`);
  lines.push('');
  lines.push(
    `- ID：\`${s.id}\` ← \`${s.sourceId}\` · \`${s.moveFamily}\` · ${s.cameraMove} · ${s.shotSize} · ${s.durationSec}s`,
  );
  lines.push('');
  lines.push('| 字段 | 中文 | English |');
  lines.push('| --- | --- | --- |');
  lines.push(`| **名称** | ${s.label} | ${s.labelEn} |`);
  lines.push(`| **用途** | ${s.purposeZh} | ${s.purposeEn} |`);
  lines.push(`| **运动逻辑** | ${s.logicZh} | ${s.logicEn} |`);
  lines.push('');
  lines.push('<details><summary>入库 Prompt（ZH / EN）</summary>');
  lines.push('');
  lines.push('**Prompt ZH**');
  lines.push('');
  lines.push('```');
  lines.push(s.promptZh);
  lines.push('```');
  lines.push('');
  lines.push('**Prompt EN**');
  lines.push('');
  lines.push('```');
  lines.push(s.promptEn);
  lines.push('```');
  lines.push('');
  lines.push('</details>');
  lines.push('');
}

fs.writeFileSync(path.join(root, 'docs', 'nx9-shot-seeds-neutral.md'), lines.join('\n'), 'utf8');

const tsv = [
  'id\tsourceId\tlabel\tlabelEn\tmoveFamily\tcameraMove\tshotSize\tdurationSec\tcategory\tpurposeZh\tpurposeEn\tlogicZh\tlogicEn\tpromptZh\tpromptEn',
];
for (const s of seeds) {
  const esc = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  tsv.push(
    [
      s.id,
      s.sourceId,
      s.label,
      s.labelEn,
      s.moveFamily,
      s.cameraMove,
      s.shotSize,
      s.durationSec,
      s.category,
      esc(s.purposeZh),
      esc(s.purposeEn),
      esc(s.logicZh),
      esc(s.logicEn),
      esc(s.promptZh),
      esc(s.promptEn),
    ].join('\t'),
  );
}
fs.writeFileSync(path.join(root, 'docs', 'nx9-shot-seeds-neutral.tsv'), tsv.join('\n'), 'utf8');

// cleanup temp dump if present
const dump = path.join(root, 'docs', '_neutral-logic-dump.json');
if (fs.existsSync(dump)) fs.unlinkSync(dump);

console.log(`wrote ${seeds.length} bilingual neutral seeds`);
console.log('docs/nx9-shot-seeds-neutral.{json,md,tsv}');
