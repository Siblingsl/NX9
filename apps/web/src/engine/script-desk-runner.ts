import {
  applyPackagePatch,
  bibleDraftsFromExtract,
  buildNarrativeConsistencyDiagnostics,
  buildScreenplayMeta,
  confirmScreenplayPackage,
  emptyScreenplayPackage,
  ingestTextToPackage,
  isScreenplayPackage,
  mergeCharacterDrafts,
  mergeSceneDrafts,
  migrateDialogueSheetDataToPackage,
  runConsistencyChecks,
  screenplayFullText,
  screenplayWordCount,
  touchScreenplayPackage,
  type ConsistencyCheckItem,
  type ScreenplayPackage,
  type ScriptDeskAgentMessage,
  type ScriptDeskAgentSession,
  type ScriptDeskSkillId,
} from '@nx9/shared';
import { api } from '../api/client';

export function readScriptDeskPackage(data: Record<string, unknown> | undefined | null): ScreenplayPackage {
  if (isScreenplayPackage(data?.package)) return data!.package as ScreenplayPackage;
  return migrateDialogueSheetDataToPackage(data ?? undefined);
}

export function packageSummaryLine(pkg: ScreenplayPackage): string {
  const title = pkg.brief.title || pkg.screenplay.episodes[0]?.title || '未命名剧本';
  const ep = pkg.screenplay.episodes.length;
  const chars = pkg.bible.characters.length;
  const scenes = pkg.bible.scenes.length;
  const words = screenplayWordCount(pkg);
  const status =
    pkg.status === 'confirmed' ? '成稿已确认'
      : pkg.status === 'drafting' ? '成稿草稿'
        : '待输入';
  return `${status} · ${title} · ${ep} 集 · ${chars} 角 · ${scenes} 场 · ${words} 字`;
}

export function persistScriptDeskPackage(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  blockId: string,
  pkg: ScreenplayPackage,
  extra: Record<string, unknown> = {},
) {
  updateNodeData(blockId, {
    package: pkg,
    content: packageSummaryLine(pkg),
    meta: buildScreenplayMeta(blockId, pkg),
    status: pkg.status === 'empty' ? 'idle' : 'success',
    error: undefined,
    ...extra,
  });
}

export function ingestScreenplayText(
  pkg: ScreenplayPackage,
  text: string,
  sourceType: 'uploaded' | 'pasted' = 'pasted',
): ScreenplayPackage {
  return ingestTextToPackage(pkg, text, { sourceType });
}

export async function extractBibleFromPackage(
  pkg: ScreenplayPackage,
): Promise<ScreenplayPackage> {
  const source = screenplayFullText(pkg).trim();
  if (!source) {
    return touchScreenplayPackage(pkg, {
      diagnostics: [
        ...(pkg.diagnostics ?? []).filter((d) => d.code !== 'extract-empty'),
        { level: 'error', code: 'extract-empty', message: '成稿为空，无法抽取 Bible' },
      ],
    });
  }
  const res = await api.extractAssets({ sourceText: source });
  const raw = res as Record<string, unknown>;
  const assets = (raw.assets as Record<string, unknown> | undefined) ?? raw;
  const characters = (assets.characters as Array<Record<string, unknown>> | undefined)
    ?? (raw.characters as Array<Record<string, unknown>> | undefined)
    ?? [];
  const locations = (assets.locations as string[] | undefined)
    ?? ((raw.scenes as Array<{ name?: string }> | undefined)?.map((s) => s.name ?? '') ?? []);
  const scenes = (raw.scenes as Array<Record<string, unknown>> | undefined) ?? [];
  const drafts = bibleDraftsFromExtract({ characters, locations, scenes });
  let next = touchScreenplayPackage(pkg, {
    bible: {
      world: pkg.bible.world,
      characters: mergeCharacterDrafts(pkg.bible.characters, drafts.characters),
      scenes: mergeSceneDrafts(pkg.bible.scenes, drafts.scenes),
    },
  });
  if (next.bible.characters.length === 0 && screenplayWordCount(next) > 200) {
    next = touchScreenplayPackage(next, {
      diagnostics: [
        ...(next.diagnostics ?? []).filter((d) => d.code !== 'bible-empty-characters'),
        {
          level: 'warning',
          code: 'bible-empty-characters',
          message: '抽取未得到人物 draft，可手工补全或重试',
        },
      ],
    });
  }
  return next;
}

export function confirmPackage(pkg: ScreenplayPackage): ScreenplayPackage {
  return confirmScreenplayPackage(pkg);
}

export function runConsistencyCheck(pkg: ScreenplayPackage): ScreenplayPackage {
  const narrativeDiags = buildNarrativeConsistencyDiagnostics(pkg);
  const checkItems = runConsistencyChecks(pkg);
  const merged = [...narrativeDiags];
  for (const item of checkItems) {
    const code = `consistency-${item.category}`;
    if (!merged.some((d) => d.code === code && d.message === item.message)) {
      merged.push({
        level: item.severity === 'error' ? 'error' : 'warning',
        code,
        message: item.message,
        entityId: item.target.id,
      });
    }
  }
  return touchScreenplayPackage(pkg, { diagnostics: merged });
}

export function applyConsistencyFixes(pkg: ScreenplayPackage): { package: ScreenplayPackage; fixedCount: number } {
  let fixedCount = 0;
  let nextChars = pkg.bible.characters.map((c) => {
    let char = c;
    if (!char.voiceNotes?.trim()) {
      char = { ...char, voiceNotes: '请补充对白语气描述' };
      fixedCount++;
    }
    if (!char.appearance?.trim()) {
      char = { ...char, appearance: '请补充外貌/服装描述' };
      fixedCount++;
    }
    return char;
  });
  let nextScenes = pkg.bible.scenes.map((s) => {
    if (!s.location?.trim() && !s.summary?.trim()) {
      fixedCount++;
      return { ...s, location: '请补充地点描述' };
    }
    return s;
  });
  const next = touchScreenplayPackage(pkg, {
    bible: { world: pkg.bible.world, characters: nextChars, scenes: nextScenes },
  });
  return { package: next, fixedCount };
}

function makeMsgId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function appendAgentMessage(
  session: ScriptDeskAgentSession | undefined,
  msg: Omit<ScriptDeskAgentMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): ScriptDeskAgentSession {
  const nextMsg: ScriptDeskAgentMessage = {
    id: msg.id ?? makeMsgId(),
    createdAt: msg.createdAt ?? new Date().toISOString(),
    role: msg.role,
    content: msg.content,
    skillId: msg.skillId,
    pendingPatch: msg.pendingPatch,
    applied: msg.applied,
  };
  const messages = [...(session?.messages ?? []), nextMsg].slice(-80);
  return {
    messages,
    activeSkillIds: session?.activeSkillIds,
    updatedAt: new Date().toISOString(),
  };
}

export function applyPendingMessagePatch(
  pkg: ScreenplayPackage,
  session: ScriptDeskAgentSession,
  messageId: string,
): { package: ScreenplayPackage; session: ScriptDeskAgentSession } {
  const messages = session.messages.map((m) => {
    if (m.id !== messageId) return m;
    return { ...m, applied: true, pendingPatch: undefined };
  });
  const target = session.messages.find((m) => m.id === messageId);
  if (!target?.pendingPatch) {
    return { package: pkg, session: { ...session, messages, updatedAt: new Date().toISOString() } };
  }
  const nextPkg = applyPackagePatch(pkg, target.pendingPatch);
  return {
    package: nextPkg,
    session: { ...session, messages, updatedAt: new Date().toISOString() },
  };
}

/** Agent 技能：生成/改写成稿（复用 screenplay API） */
export async function runGenerateScreenplaySkill(
  pkg: ScreenplayPackage,
  userInstruction: string,
  episodeIndex?: number,
): Promise<{ assistantText: string; patch: Partial<ScreenplayPackage> }> {
  const existingText = screenplayFullText(pkg);
  const context = [
    pkg.brief.title ? `标题：${pkg.brief.title}` : '',
    pkg.brief.logline ? `logline：${pkg.brief.logline}` : '',
    pkg.brief.plotOutline ? `大纲：${pkg.brief.plotOutline}` : '',
    pkg.bible.characters.length
      ? `人物：${pkg.bible.characters.map((c) => c.name).join('、')}`
      : '',
    userInstruction.trim() || (episodeIndex != null ? `请续写第${episodeIndex}集。` : '请根据以上信息生成分集剧本正文。'),
    episodeIndex != null
      ? pkg.screenplay.episodes[episodeIndex - 1]
        ? `续写目标（第${episodeIndex}集）：\n${pkg.screenplay.episodes[episodeIndex - 1].bodyMd.slice(0, 3000)}`
        : `该集暂无内容，请生成第${episodeIndex}集。`
      : existingText
        ? `现有成稿：\n${existingText.slice(0, 6000)}`
        : '',
  ].filter(Boolean).join('\n');

  const res = await api.scriptScreenplay({ sourceText: context });
  const raw = res as { screenplay?: string; script?: string };
  const text = String(raw.screenplay ?? raw.script ?? '').trim();
  if (!text) throw new Error('剧本生成未返回正文');

  if (episodeIndex != null) {
    const generated = ingestTextToPackage(emptyScreenplayPackage(), text, {
      sourceType: 'generated',
      title: pkg.brief.title,
      episodeCount: 1,
    });
    const replacement = generated.screenplay.episodes[0];
    if (!replacement) throw new Error('续写未返回有效集内容');
    const episodes = pkg.screenplay.episodes.map((ep) =>
      ep.index === episodeIndex
        ? { ...replacement, id: ep.id, index: ep.index, title: ep.title || replacement.title }
        : ep,
    );
    return {
      assistantText: `已续写第 ${episodeIndex} 集，请确认后点「应用此步产出」。`,
      patch: { screenplay: { ...pkg.screenplay, episodes } },
    };
  }

  const next = ingestTextToPackage(emptyScreenplayPackage(), text, {
    sourceType: 'generated',
    title: pkg.brief.title,
    episodeCount: pkg.brief.episodeCount,
  });
  return {
    assistantText: `已生成 ${next.screenplay.episodes.length} 集成稿草稿，请确认后点「应用此步产出」。`,
    patch: {
      brief: {
        ...pkg.brief,
        title: pkg.brief.title || next.brief.title,
        episodeCount: next.screenplay.episodes.length,
      },
      screenplay: next.screenplay,
    },
  };
}

/** Agent 技能：人物/场景 draft（复用 extractAssets） */
export async function runCharacterSceneSkill(
  pkg: ScreenplayPackage,
  userInstruction: string,
): Promise<{ assistantText: string; patch: Partial<ScreenplayPackage> }> {
  const source = [
    userInstruction.trim(),
    screenplayFullText(pkg),
    pkg.brief.plotOutline ?? '',
    pkg.brief.logline ?? '',
  ].filter(Boolean).join('\n\n').trim();
  if (!source) throw new Error('缺少可用于抽取人物/场景的文本');
  const tmp = await extractBibleFromPackage(
    source === screenplayFullText(pkg)
      ? pkg
      : ingestTextToPackage(pkg, source, { sourceType: 'mixed' }),
  );
  return {
    assistantText: `已抽取人物 ${tmp.bible.characters.length} · 场景 ${tmp.bible.scenes.length}，请确认后应用。`,
    patch: {
      bible: {
        world: tmp.bible.world ?? pkg.bible.world,
        characters: tmp.bible.characters,
        scenes: tmp.bible.scenes,
      },
    },
  };
}

/** 将 LLM skill 返回的 patch 合并为 ScreenplayPackage 局部更新 */
function coerceSkillPackagePatch(
  pkg: ScreenplayPackage,
  rawPatch: Record<string, unknown>,
): Partial<ScreenplayPackage> {
  const p = (
    rawPatch.patch && typeof rawPatch.patch === 'object'
      ? rawPatch.patch
      : rawPatch
  ) as Record<string, unknown>;

  const out: Partial<ScreenplayPackage> = {};

  if (p.brief && typeof p.brief === 'object') {
    out.brief = { ...pkg.brief, ...(p.brief as ScreenplayPackage['brief']) };
  } else {
    const flatBrief: Record<string, unknown> = {};
    for (const key of ['topic', 'logline', 'targetPlatforms', 'plotOutline', 'episodeCount', 'pacing', 'targetEpisodeDurationSec', 'hooks', 'title'] as const) {
      if (key in p) flatBrief[key] = p[key];
    }
    if (Object.keys(flatBrief).length > 0) {
      out.brief = { ...pkg.brief, ...flatBrief } as ScreenplayPackage['brief'];
    }
  }

  if (p.bible && typeof p.bible === 'object') {
    const b = p.bible as Record<string, unknown>;
    out.bible = {
      world: (b.world as ScreenplayPackage['bible']['world']) ?? pkg.bible.world,
      characters: Array.isArray(b.characters)
        ? (b.characters as ScreenplayPackage['bible']['characters'])
        : pkg.bible.characters,
      scenes: Array.isArray(b.scenes)
        ? (b.scenes as ScreenplayPackage['bible']['scenes'])
        : pkg.bible.scenes,
    };
  }

  if (p.screenplay && typeof p.screenplay === 'object') {
    out.screenplay = {
      ...pkg.screenplay,
      ...(p.screenplay as ScreenplayPackage['screenplay']),
    };
  }

  if (Array.isArray(p.diagnostics)) {
    out.diagnostics = p.diagnostics as ScreenplayPackage['diagnostics'];
  }

  return out;
}

export async function runScriptDeskSkill(
  skillId: ScriptDeskSkillId,
  pkg: ScreenplayPackage,
  userInstruction: string,
): Promise<{ assistantText: string; patch?: Partial<ScreenplayPackage> }> {
  try {
    const res = await api.scriptDeskChat({
      skillId,
      userInstruction: userInstruction.trim() || undefined,
      package: pkg as unknown as Record<string, unknown>,
    });
    const rawPatch = (res.patch ?? {}) as Record<string, unknown>;

    if (skillId === 'consistency') {
      const llmDiags = (rawPatch.diagnostics
        ?? (rawPatch as { patch?: { diagnostics?: unknown } }).patch?.diagnostics
        ?? rawPatch) as Array<Record<string, unknown>> | undefined;
      const localDiags = buildNarrativeConsistencyDiagnostics(pkg);
      const checkItems = runConsistencyChecks(pkg);
      const merged = [...localDiags];
      for (const item of checkItems) {
        const code = `consistency-${item.category}`;
        if (!merged.some((d) => d.code === code && d.message === item.message)) {
          merged.push({
            level: item.severity === 'error' ? 'error' : 'warning',
            code,
            message: item.message,
            entityId: item.target.id,
          });
        }
      }
      if (Array.isArray(llmDiags)) {
        for (const d of llmDiags) {
          if (d && typeof d === 'object' && 'message' in d && !merged.some((m) => m.code === d.code)) {
            merged.push(d as unknown as import('@nx9/shared').ScreenplayDiagnostic);
          }
        }
      }
      return {
        assistantText: res.explanation || `一致性检查完成（LLM + 规则 + 专检），诊断 ${merged.length} 条。`,
        patch: { diagnostics: merged },
      };
    }

    const patch = coerceSkillPackagePatch(pkg, rawPatch);
    return {
      assistantText: res.explanation || 'LLM 已生成补丁，请确认后应用。',
      patch: Object.keys(patch).length > 0 ? patch : undefined,
    };
  } catch (e) {
    const fallback = String(e);
    if (skillId === 'consistency') {
      const localDiags = buildNarrativeConsistencyDiagnostics(pkg);
      const checkItems = runConsistencyChecks(pkg);
      const merged = [...localDiags];
      for (const item of checkItems) {
        const code = `consistency-${item.category}`;
        if (!merged.some((d) => d.code === code && d.message === item.message)) {
          merged.push({
            level: item.severity === 'error' ? 'error' : 'warning',
            code,
            message: item.message,
            entityId: item.target.id,
          });
        }
      }
      return {
        assistantText: `LLM 一致性检查失败，已降级为规则+专检：${fallback}`,
        patch: { diagnostics: merged },
      };
    }

    // 生成类：旧路径兜底，避免完全不可用
    if (skillId === 'generate' || skillId === 'dialogue' || skillId === 'ingest') {
      try {
        const local = await runGenerateScreenplaySkill(pkg, userInstruction);
        return {
          assistantText: `Skill 通道失败，已降级为成稿生成：${fallback}\n${local.assistantText}`,
          patch: local.patch,
        };
      } catch {
        /* fall through */
      }
    }
    if (skillId === 'character' || skillId === 'world') {
      try {
        const local = await runCharacterSceneSkill(pkg, userInstruction);
        return {
          assistantText: `Skill 通道失败，已降级为资产抽取：${fallback}\n${local.assistantText}`,
          patch: local.patch,
        };
      } catch {
        /* fall through */
      }
    }

    return {
      assistantText: `LLM 调用失败，已降级为本地草稿：${fallback}`,
      patch: userInstruction.trim()
        ? {
          brief: {
            ...pkg.brief,
            topic: skillId === 'topic' ? userInstruction.trim() : pkg.brief.topic,
            plotOutline: skillId === 'plot' ? userInstruction.trim() : pkg.brief.plotOutline,
          },
        }
        : undefined,
    };
  }
}
