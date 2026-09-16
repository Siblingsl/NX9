/**
 * 运镜词法体系（shot-lexicon-taxonomy）· 从仓库权威数据真实推导
 *
 * 数据来源（非编造）：docs/nx9-shot-seeds-neutral.json（117 条种子的 systemId/system/category）
 * 交叉印证：packages/shared/src/data/shot-library-seeds.ts、types/creative-asset-center.ts 注释
 *   （system1 实拍 / system2 AI·CG）。
 *
 * 本文件曾因 .gitignore 的 data/ 规则丢失；本版由脚本按上述权威数据重建。
 */

export interface ShotLexiconSystem {
  id: string;
  /** 短标签（UI 展示用） */
  label: string;
  fullName: string;
  categories: readonly string[];
  /** 体系短语（英文提示词用），来自种子数据 */
  promptEn?: string;
}

export const SHOT_LEXICON_SYSTEMS: readonly ShotLexiconSystem[] = [
  {
    id: "system1",
    label: "实拍物理规则",
    fullName: "体系一：实拍物理规则内可实现",
    categories: [
      "基础推拉变焦运镜",
      "角色定位构图运镜",
      "障碍物与环境互动运镜",
      "焦点与镜头操控运镜",
      "三脚架固定基础运镜",
      "滑轨横向运镜",
      "环绕运镜",
      "垂直升降运镜",
      "光学镜头特效运镜",
      "无人机 / 航拍专属运镜",
      "风格化动态运镜",
      "主体追踪运镜",
      "时间与速度操控运镜",
      "极端定向与透视运镜",
    ],
  },
  {
    id: "system2",
    label: "AI/CG 突破物理",
    fullName: "体系二：AI/CG 专属・突破现实物理规则",
    categories: [
      "空间物理规则突破类运镜",
      "时间维度全操控类运镜",
      "光学与透视极限突破类运镜",
      "运镜 + 转场一体化无缝运镜",
      "强情绪与叙事适配专属运镜",
      "AI/CG 独有的维度与空间逻辑突破运镜",
      "叙事向玄幻 / 动画专属定制运镜",
      "国漫玄幻打斗专属・极致爽感运镜合集",
    ],
  },
] as const;

/** 兼容历史签名：未知体系返回 undefined（调用方已有 || ext.lexicon 兜底） */
export function shotLexiconSystemLabel(systemId: string | undefined | null): string | undefined {
  if (!systemId) return undefined;
  return SHOT_LEXICON_SYSTEMS.find((sys) => sys.id === systemId)?.fullName;
}

/** systemId 或 "all" -> 分类列表；all 为全部体系合并去重（保持体系顺序） */
export function listShotLexiconCategories(systemId: string | undefined | null): string[] {
  const out: string[] = [];
  for (const sys of SHOT_LEXICON_SYSTEMS) {
    if (systemId && systemId !== 'all' && sys.id !== systemId) continue;
    for (const cat of sys.categories) {
      if (!out.includes(cat)) out.push(cat);
    }
  }
  return out;
}

/** 长分类名做短语化展示（去尾部重复词、限量），未知原样返回 */
export function shortenShotLexiconCategory(cat: string | undefined | null): string {
  const raw = (cat ?? '').trim();
  if (!raw) return '';
  let t = raw.replace(/运镜\s*合集$/u,'').replace(/运镜$/u,'');
  t = t.replace(/专属・?/u,'').replace(/类$/u,'').trim();
  if (!t) return raw;
  return t.length <= 12 ? t : t.slice(0, 12);
}

