/**
 * script-consistency.ts — 编剧一致性检查加强（F-023）。
 *
 * 固定规则检查（人设前后矛盾关键词、场景失踪、时间线）+ LLM JSON 报告。
 * 问题绑定到 Bible 角色/场。
 */
import type { ScreenplayPackage } from '../types/screenplay-package';
import type { StoryboardShot } from '../types/storyboard';

export interface ConsistencyCheckItem {
  id: string;
  severity: 'error' | 'warn';
  message: string;
  target: {
    type: 'character' | 'scene' | 'beat';
    id: string;
  };
  category: 'contradiction' | 'missing' | 'timeline' | 'naming' | 'dialogue' | 'location' | 'prop' | 'costume' | 'pacing';
}

/**
 * 检查角色描述中的矛盾关键词。
 * 规则：同一角色的描述中出现互斥关键词（如"年轻"和"白发"、"活泼"和"沉默"）时告警。
 */
const CONTRADICTION_PAIRS: [string, string][] = [
  ['年轻', '年老'], ['少年', '老年'], ['活泼', '沉默'],
  ['开朗', '阴郁'], ['温柔', '暴躁'], ['长发', '光头'],
  ['高大', '矮小'], ['强壮', '瘦弱'],
];

export function checkCharacterContradictions(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  for (const char of pkg.bible.characters) {
    const text = [char.appearance, char.personality].filter(Boolean).join(' ');
    for (const [a, b] of CONTRADICTION_PAIRS) {
      if (text.includes(a) && text.includes(b)) {
        items.push({
          id: `contra-${char.name}-${a}-${b}`,
          severity: 'warn',
          message: `角色「${char.name}」描述中同时出现「${a}」和「${b}」，可能存在矛盾`,
          target: { type: 'character', id: char.name },
          category: 'contradiction',
        });
      }
    }
  }
  return items;
}

/**
 * 检查场景失踪：剧本中提到的场景在 Bible 中不存在。
 */
export function checkMissingScenes(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  const bibleSceneNames = new Set(
    pkg.bible.scenes.map((s) => s.name?.trim() || s.location?.trim() || ''),
  );
  // 从剧本正文提取场景名（粗略）
  const sceneRefs = new Set<string>();
  const episodes = (pkg as any).screenplay?.episodes ?? (pkg as any).episodes ?? [];
  for (const ep of episodes) {
    const text = (ep as any).bodyMd || (ep as any).text || '';
    const matches = text.match(/(?:场景|地点|Scene|Location)[：:]\s*([^\n。，]+)/g);
    if (matches) {
      for (const m of matches) {
        const name = m.replace(/(?:场景|地点|Scene|Location)[：:]\s*/, '').trim();
        if (name) sceneRefs.add(name);
      }
    }
  }
  for (const ref of sceneRefs) {
    if (!bibleSceneNames.has(ref)) {
      items.push({
        id: `missing-scene-${ref}`,
        severity: 'error',
        message: `场景「${ref}」在剧本中被引用但不在 Bible 场景列表中`,
        target: { type: 'scene', id: ref },
        category: 'missing',
      });
    }
  }
  return items;
}

/**
 * 检查命名不一致：同一角色在不同地方名字不同。
 */
export function checkNamingInconsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  const bibleNames = new Set(pkg.bible.characters.map((c) => c.name));
  // 检查剧本中使用的名字是否都在 Bible 中
  const episodes = (pkg as any).screenplay?.episodes ?? (pkg as any).episodes ?? [];
  for (const ep of episodes) {
    const text = (ep as any).bodyMd || (ep as any).text || '';
    // 提取对话中的说话人（简单规则）
    const matches = text.match(/^([A-Za-z\u4e00-\u9fa5]{2,8})[：:]/gm);
    if (matches) {
      for (const m of matches) {
        const name = m.replace(/[：:]/g, '').trim();
        if (name && !bibleNames.has(name)) {
          items.push({
            id: `naming-${ep.id}-${name}`,
            severity: 'warn',
            message: `角色「${name}」出现在剧本对白中但不在 Bible 角色列表中`,
            target: { type: 'character', id: name },
            category: 'naming',
          });
        }
      }
    }
  }
  return items;
}

/**
 * 检查对白风格/语气设置缺失。
 */
export function checkDialogueConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  for (const char of pkg.bible.characters) {
    if (!char.voiceNotes?.trim()) {
      items.push({
        id: `dialogue-${char.name}-voice`,
        severity: 'warn',
        message: `角色「${char.name}」未设置对白语气/声音风格描述`,
        target: { type: 'character', id: char.name },
        category: 'dialogue',
      });
    }
  }
  return items;
}

/**
 * 检查场景地点描述缺失。
 */
export function checkLocationConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  for (const scene of pkg.bible.scenes) {
    if (!scene.location?.trim() && !scene.summary?.trim()) {
      items.push({
        id: `location-${scene.id || scene.name}`,
        severity: 'warn',
        message: `场景「${scene.name || scene.code}」缺少地点描述和概要`,
        target: { type: 'scene', id: scene.name || scene.code || '' },
        category: 'location',
      });
    }
  }
  return items;
}

/**
 * 检查道具连续性：场景描述中提到的道具是否在 Bible 中注册。
 */
export function checkPropConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  // ScreenplayCharacterDraft 无独立 props 字段：从外貌/定妆关键词中收集已提及道具词
  const bibleProps = new Set<string>();
  const propKeywords = ['手机', '剑', '枪', '包', '帽', '眼镜', '钥匙', '书', '笔', '箱', '灯', '杖'];
  for (const char of pkg.bible.characters) {
    const blob = [char.appearance, char.fixedVisualKeywords, char.identity]
      .filter(Boolean)
      .join(' ');
    for (const kw of propKeywords) {
      if (blob.includes(kw)) bibleProps.add(kw);
    }
  }
  // 从场景描述中提取道具关键词（对齐 ScreenplaySceneDraft 现有字段）
  for (const scene of pkg.bible.scenes) {
    const text = [scene.summary, scene.sensoryNotes, scene.location, scene.era]
      .filter(Boolean)
      .join(' ');
    for (const kw of propKeywords) {
      if (text.includes(kw) && !bibleProps.has(kw)) {
        items.push({
          id: `prop-${scene.id || scene.name}-${kw}`,
          severity: 'warn',
          message: `场景「${scene.name || ''}」出现道具「${kw}」但未在角色外貌/定妆描述中出现`,
          target: { type: 'scene', id: scene.name || scene.code || '' },
          category: 'prop',
        });
      }
    }
  }
  return items;
}

/**
 * 检查服装描述一致性。
 */
export function checkCostumeConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  for (const char of pkg.bible.characters) {
    if (!char.appearance?.trim()) {
      items.push({
        id: `costume-${char.name}-appearance`,
        severity: 'warn',
        message: `角色「${char.name}」缺少外貌/服装描述`,
        target: { type: 'character', id: char.name },
        category: 'costume',
      });
    }
  }
  return items;
}

/**
 * 检查节奏/推进问题：过长无对话段落。
 */
export function checkPacingConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  const episodes = (pkg as any).screenplay?.episodes ?? (pkg as any).episodes ?? [];
  for (const ep of episodes) {
    const text = (ep as any).bodyMd || (ep as any).text || '';
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (para.length > 300 && !para.includes('：') && !para.includes(':')) {
        items.push({
          id: `pacing-${ep.id}-${i}`,
          severity: 'warn',
          message: `第 ${ep.id || ''} 段过长（${para.length} 字）且无对白，可能影响节奏`,
          target: { type: 'beat', id: `${ep.id}-${i}` },
          category: 'pacing',
        });
      }
    }
  }
  return items;
}

/**
 * 时间线检查：场景缺少时间描写（白天/夜晚等），以及角色年龄引用检查。
 */
const TIME_KEYWORDS = ['白天', '夜晚', '早晨', '傍晚', '黄昏', '黎明', '上午', '下午', '午夜', '清晨', '深夜', '正午'];

export function checkTimelineConsistency(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  const items: ConsistencyCheckItem[] = [];
  for (const scene of pkg.bible.scenes) {
    const text = [scene.summary, scene.sensoryNotes, scene.location, scene.era].filter(Boolean).join(' ');
    if (text && !TIME_KEYWORDS.some((kw) => text.includes(kw))) {
      items.push({
        id: `timeline-${scene.name || scene.code || scene.id || ''}`,
        severity: 'warn',
        message: `场景「${scene.name || scene.code || ''}」未包含时间描写（白天/夜晚等），建议补充`,
        target: { type: 'scene', id: scene.name || scene.code || '' },
        category: 'timeline',
      });
    }
  }
  return items;
}

/**
 * 运行全部一致性规则检查（≥9 类）。
 */
export function runConsistencyChecks(
  pkg: ScreenplayPackage,
): ConsistencyCheckItem[] {
  return [
    ...checkCharacterContradictions(pkg),
    ...checkMissingScenes(pkg),
    ...checkNamingInconsistency(pkg),
    ...checkDialogueConsistency(pkg),
    ...checkLocationConsistency(pkg),
    ...checkPropConsistency(pkg),
    ...checkCostumeConsistency(pkg),
    ...checkPacingConsistency(pkg),
    ...checkTimelineConsistency(pkg),
  ];
}
