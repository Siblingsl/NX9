import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  flattenScriptBreakdownShots,
  storyboardShotsFromScriptBreakdown,
  bindStoryboardShotAssets,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { applyScriptBreakdownPayload } from '../../engine/script-breakdown-runner';
import { AssetMentionInput } from '../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';

function compact(text: string, max = 68) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = getEdges().filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function clonePayload(payload: ScriptBreakdownPayload): ScriptBreakdownPayload {
  return JSON.parse(JSON.stringify(payload)) as ScriptBreakdownPayload;
}

function namesToText(names: string[]): string {
  return names.join('、');
}

function textToNames(value: string): string[] {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim().replace(/^@角色:/, ''))
    .filter(Boolean)
    .slice(0, 20);
}

function stripMentionToken(value: string): string {
  return value.trim().replace(/^@(角色|场景|镜头|情绪|钩子|声音):/, '');
}

function scenePresetName(item: EnvironmentProfile | BacklotWorkspaceItem): string {
  if ('name' in item) return item.name;
  return item.label;
}

function characterMeta(character: CharacterProfile): string {
  return [character.bible?.identity, character.descriptionZh, character.creative?.nickname]
    .filter(Boolean)
    .join(' · ');
}

const GLOBAL_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'shot', 'emotion', 'hook', 'sound'];
const CHARACTER_MENTION_KINDS: AssetLibraryKind[] = ['character'];
const SCENE_MENTION_KINDS: AssetLibraryKind[] = ['scene'];

function patchShotInPayload(
  payload: ScriptBreakdownPayload,
  shotId: string,
  patch: Partial<ScriptBreakdownShot>,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  for (const episode of next.episodes) {
    episode.shots = episode.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot);
    episode.scenes = episode.scenes?.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot),
    }));
  }
  return next;
}

type ShotEditDraft = Pick<ScriptBreakdownShot,
  'title' | 'durationSec' | 'scene' | 'characters' | 'purpose' | 'scriptText' | 'imagePrompt' | 'videoPrompt'
>;

function createShotEditDraft(shot: ScriptBreakdownShot): ShotEditDraft {
  return {
    title: shot.title,
    durationSec: shot.durationSec,
    scene: shot.scene,
    characters: shot.characters,
    purpose: shot.purpose,
    scriptText: shot.scriptText,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt,
  };
}

function StoryGridBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = local ?? upstream;
  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const activeEpisodeId = useWorkspaceDocument((state) => state.storyboard.activeEpisodeId);
  const setActiveEpisodeId = useWorkspaceDocument((state) => state.setActiveEpisodeId);
  const characters = useWorkspaceDocument((state) => state.characters.characters);
  const environmentLibrary = useWorkspaceDocument((state) => state.environments);
  const workspaceItems = useWorkspaceDocument((state) => state.backlotWorkspace.items);
  const environments = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
  const workspaceScenes = useMemo(
    () => workspaceItems.filter((item) => item.kind === 'scene'),
    [workspaceItems],
  );
  const currentEpisodeId = activeEpisodeId ?? payload?.episodes[0]?.id ?? null;
  const confirmedEpisodeIds = Array.isArray(props.data?.confirmedEpisodeIds)
    ? (props.data.confirmedEpisodeIds as string[])
    : [];
  const currentEpisodeConfirmed = Boolean(
    currentEpisodeId && confirmedEpisodeIds.includes(currentEpisodeId),
  );
  const visibleEpisodes = useMemo(() => {
    if (!payload) return [];
    const active = activeEpisodeId
      ? payload.episodes.find((episode) => episode.id === activeEpisodeId)
      : payload.episodes[0];
    return active ? [active] : payload.episodes;
  }, [activeEpisodeId, payload]);
  const visibleShots = useMemo(
    () => visibleEpisodes.flatMap((episode) => episode.shots),
    [visibleEpisodes],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = visibleShots.find((shot) => shot.id === selectedId) ?? visibleShots[0];
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const editingShot = visibleShots.find((shot) => shot.id === editingShotId) ?? null;
  const [editDraft, setEditDraft] = useState<ShotEditDraft | null>(null);
  const scenePresets = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; label: string; description?: string; source: '场景设定' | '场景库' }> = [];
    for (const env of environments) {
      const label = scenePresetName(env).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: env.id, label, description: env.descriptionZh, source: '场景设定' });
    }
    for (const item of workspaceScenes) {
      const label = scenePresetName(item).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: item.id, label, description: item.promptZh || item.promptEn, source: '场景库' });
    }
    return result;
  }, [environments, workspaceScenes]);
  const characterNameSet = useMemo(
    () => new Set(characters.map((character) => character.name.trim()).filter(Boolean)),
    [characters],
  );

  useEffect(() => {
    setEditDraft(editingShot ? createShotEditDraft(editingShot) : null);
  }, [editingShot]);

  const sync = useCallback(() => {
    if (!upstream) return;
    const flat = flattenScriptBreakdownShots(upstream);
    const doc = useWorkspaceDocument.getState();
    const previousById = new Map(doc.storyboard.shots.map((shot) => [shot.id, shot]));
    const rawStoryboardShots = storyboardShotsFromScriptBreakdown(upstream).map((base) => ({
      ...base,
      ...(previousById.get(base.id) ?? {}),
      episodeId: base.episodeId,
      episodeIndex: base.episodeIndex,
      episodeTitle: base.episodeTitle,
      index: base.index,
      durationSec: base.durationSec,
      descriptionZh: base.descriptionZh,
      promptEn: base.promptEn,
      videoPromptEn: base.videoPromptEn,
      characterNames: base.characterNames,
      sceneName: base.sceneName,
    }));
    const storyboardShots = bindStoryboardShotAssets(
      rawStoryboardShots,
      doc.characters.characters,
      doc.environments?.environments ?? [],
    );
    const episodeIds = new Set(storyboardShots.map((shot) => shot.episodeId).filter(Boolean));
    const activeEpisodeId =
      doc.storyboard.activeEpisodeId && episodeIds.has(doc.storyboard.activeEpisodeId)
        ? doc.storyboard.activeEpisodeId
        : storyboardShots.find((shot) => shot.episodeId)?.episodeId ?? null;
    doc.setStoryboard({
      ...doc.storyboard,
      version: 3,
      title: upstream.title,
      activeEpisodeId,
      shots: storyboardShots,
    });
    updateNodeData(props.id, {
      status: 'success',
      scriptBreakdown: upstream,
      gridConfirmed: false,
      confirmedEpisodeIds: [],
      content: `${upstream.title} · ${upstream.episodes.length} 集 · ${flat.length} 个分镜`,
      output: flat.map((shot) => shot.imagePrompt).join('\n\n'),
      meta: { episodeCount: upstream.episodes.length, shotCount: flat.length },
    });
    appendLog(`分镜网格已同步 · ${upstream.episodes.length} 集 / ${flat.length} 个分镜`);
  }, [appendLog, props.id, updateNodeData, upstream]);

  const confirmCurrentEpisode = useCallback(() => {
    if (!currentEpisodeId || visibleShots.length === 0) return;
    updateNodeData(props.id, {
      status: 'success',
      gridConfirmed: true,
      confirmedEpisodeIds: [...new Set([...confirmedEpisodeIds, currentEpisodeId])],
      confirmedAt: new Date().toISOString(),
    });
    appendLog(
      `分镜网格已确认 · ${visibleEpisodes[0]?.title ?? currentEpisodeId} / ${visibleShots.length} 镜`,
    );
  }, [
    appendLog,
    confirmedEpisodeIds,
    currentEpisodeId,
    props.id,
    updateNodeData,
    visibleEpisodes,
    visibleShots.length,
  ]);

  const saveShotEdit = useCallback(() => {
    if (!payload || !editingShot || !editDraft) return;
    const next = patchShotInPayload(payload, editingShot.id, {
      ...editDraft,
      scene: stripMentionToken(editDraft.scene),
      durationSec: Math.max(1, Math.round(Number(editDraft.durationSec) || editingShot.durationSec || 5)),
    });
    applyScriptBreakdownPayload(props.id, next);
    setEditingShotId(null);
    appendLog(`已修改分镜 · ${editingShot.sceneCode} ${editDraft.title}`);
  }, [appendLog, editDraft, editingShot, payload, props.id]);

  const toggleDraftCharacter = useCallback((name: string) => {
    setEditDraft((current) => {
      if (!current) return current;
      const exists = current.characters.some((item) => item.trim() === name);
      return {
        ...current,
        characters: exists
          ? current.characters.filter((item) => item.trim() !== name)
          : [...current.characters, name],
      };
    });
  }, []);

  return (
    <div className="relative">
    <BlockShell {...props}>
      <div className="w-[300px] nodrag nopan text-xs">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">分镜网格</p>
            <p className="text-[10px] text-ink/40 truncate">
              {payload ? `${payload.title} · ${payload.episodes.length} 集 · ${shots.length} 镜` : '连接剧本拆分节点后展示'}
            </p>
          </div>
          {upstream && (
            <button
              type="button"
              onClick={sync}
              className="px-2 py-1 rounded-lg border border-line/60 bg-white text-[10px] text-ink/55 hover:text-brand"
            >
              同步
            </button>
          )}
          {payload && payload.episodes.length > 1 && (
            <select
              value={activeEpisodeId ?? payload.episodes[0]?.id ?? ''}
              onChange={(event) => {
                setActiveEpisodeId(event.target.value || null);
                setSelectedId(null);
              }}
              className="max-w-36 rounded-lg border border-line/60 bg-white px-2 py-1 text-[10px] text-ink/60"
              aria-label="当前制作分集"
            >
              {payload.episodes.map((episode) => (
                <option key={episode.id} value={episode.id}>{episode.title}</option>
              ))}
            </select>
          )}
          {payload && (
            <button
              type="button"
              disabled={currentEpisodeConfirmed || visibleShots.length === 0}
              onClick={confirmCurrentEpisode}
              className="px-2 py-1 rounded-lg bg-brand text-white text-[10px] disabled:bg-ok/10 disabled:text-ok"
            >
              {currentEpisodeConfirmed ? '本集已确认' : '确认本集分镜'}
            </button>
          )}
        </div>

        {!payload ? (
          <div className="h-32 rounded-xl border border-dashed border-line/70 bg-surface/30 grid place-items-center text-ink/35">
            等待剧本拆分数据
          </div>
        ) : (
          <div className="space-y-2">
            {(payload.storyAnalysis || (payload.characters?.length ?? 0) > 0) && (
              <div className="rounded-xl border border-line/40 bg-surface/25 px-2.5 py-2">
                <p className="text-[10px] font-semibold text-ink/65 truncate">
                  {payload.storyAnalysis?.genre || '故事'} · {payload.storyAnalysis?.visualStyle || '专业影视分镜'}
                </p>
                <p className="mt-0.5 text-[9px] text-ink/40 line-clamp-2">
                  {payload.storyAnalysis?.coreTheme || payload.characters?.map((item) => item.name).join('、')}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg bg-surface/60 px-2 py-1.5"><p className="text-[13px] font-semibold text-ink/75">{payload.episodes.length}</p><p className="text-[8px] text-ink/35">集</p></div>
              <div className="rounded-lg bg-surface/60 px-2 py-1.5"><p className="text-[13px] font-semibold text-ink/75">{payload.episodes.reduce((sum, episode) => sum + (episode.scenes?.length ?? 0), 0)}</p><p className="text-[8px] text-ink/35">场</p></div>
              <div className="rounded-lg bg-surface/60 px-2 py-1.5"><p className="text-[13px] font-semibold text-ink/75">{shots.length}</p><p className="text-[8px] text-ink/35">镜</p></div>
            </div>
            <div className="max-h-48 overflow-y-auto nx9-scroll rounded-xl border border-line/50 bg-surface/20 p-1.5">
              {visibleEpisodes.map((episode) => (
                <div key={episode.id} className="mb-1.5 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-semibold text-ink/55">
                    {episode.title}
                  </div>
                  <div className="space-y-1">
                    {episode.shots.map((shot) => {
                      const active = selected?.id === shot.id;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(shot.id);
                            setEditingShotId((current) => current === shot.id ? null : shot.id);
                          }}
                          className={`w-full text-left rounded-lg border px-2 py-1.5 transition-colors ${
                            active || editingShotId === shot.id
                              ? 'border-brand/45 bg-brand/10'
                              : 'border-line/30 bg-white hover:border-line/60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-6 text-[10px] font-medium text-brand">{shot.sceneCode}</span>
                            <span className="min-w-0 flex-1 text-[11px] text-ink truncate">{shot.title}</span>
                            <ChevronRight size={11} className="text-ink/25" />
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-ink/40">
                            <Clock size={9} />
                            <span>{shot.durationSec}s</span>
                            <span className="truncate">{compact(shot.scene, 18)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BlockShell>
    {editingShot && editDraft && (
      <div
        className="absolute left-[calc(100%+10px)] top-28 z-50 w-[360px] rounded-2xl border border-brand/25 bg-white p-3 text-xs shadow-[0_18px_48px_rgba(15,15,15,0.18)] nodrag nopan"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-start gap-2">
          <div className="grid h-8 w-9 place-items-center rounded-lg bg-brand/10 text-[11px] font-semibold text-brand">{editingShot.sceneCode}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-ink">编辑分镜</p>
            <p className="truncate text-[9px] text-ink/40">可直接改文案 / Prompt，也可写 @人物 @场景</p>
          </div>
          <button type="button" onClick={() => setEditingShotId(null)} className="rounded-md px-2 py-1 text-[10px] text-ink/40 hover:bg-surface">关闭</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 space-y-1">
            <span className="text-[9px] text-ink/45">标题</span>
            <input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] text-ink/45">时长</span>
            <input type="number" value={editDraft.durationSec} onChange={(event) => setEditDraft({ ...editDraft, durationSec: Number(event.target.value) || 1 })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" />
          </label>
          <label className="space-y-1">
            <span className="flex items-center justify-between text-[9px] text-ink/45">
              场景
              {editDraft.scene && !scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene)) && (
                <span className="text-warn">未入库</span>
              )}
            </span>
            <select
              value={scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene)) ? stripMentionToken(editDraft.scene) : ''}
              onChange={(event) => {
                const next = event.target.value;
                if (next) setEditDraft({ ...editDraft, scene: next });
              }}
              className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[11px]"
            >
              <option value="">{editDraft.scene ? `当前：${stripMentionToken(editDraft.scene)}` : '选择场景预设'}</option>
              {scenePresets.map((scene) => (
                <option key={scene.id} value={scene.label}>{scene.label} · {scene.source}</option>
              ))}
            </select>
            <AssetMentionInput
              value={editDraft.scene}
              onChange={(next) => setEditDraft({ ...editDraft, scene: next })}
              kinds={SCENE_MENTION_KINDS}
              placeholder="输入场景，或 @场景"
              className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
          <label className="space-y-1">
            <span className="flex items-center justify-between text-[9px] text-ink/45">
              角色
              {editDraft.characters.some((name) => !characterNameSet.has(stripMentionToken(name))) && (
                <span className="text-warn">含未入库</span>
              )}
            </span>
            <AssetMentionInput
              value={namesToText(editDraft.characters)}
              onChange={(next) => setEditDraft({ ...editDraft, characters: textToNames(next) })}
              kinds={CHARACTER_MENTION_KINDS}
              placeholder="输入角色，或 @角色"
              className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] text-ink/45">镜头目的</span>
            <AssetMentionInput
              value={editDraft.purpose ?? ''}
              onChange={(next) => setEditDraft({ ...editDraft, purpose: next })}
              kinds={GLOBAL_MENTION_KINDS}
              placeholder="镜头目的… 可 @情绪 @镜头"
              className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line/50 bg-surface/20 p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-ink/60">角色预选</p>
              <p className="text-[9px] text-ink/35">{characters.length} 个</p>
            </div>
            {characters.length === 0 ? (
              <p className="text-[9px] leading-relaxed text-warn">暂无角色预设，先通过角色设定节点或素材库新增。</p>
            ) : (
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto nx9-scroll">
                {characters.map((character) => {
                  const active = editDraft.characters.includes(character.name);
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => toggleDraftCharacter(character.name)}
                      title={characterMeta(character)}
                      className={`rounded-full border px-2 py-0.5 text-[9px] ${
                        active
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-line bg-white text-ink/55 hover:border-brand/35'
                      }`}
                    >
                      {character.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-line/50 bg-surface/20 p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-ink/60">场景预选</p>
              <p className="text-[9px] text-ink/35">{scenePresets.length} 个</p>
            </div>
            {scenePresets.length === 0 ? (
              <p className="text-[9px] leading-relaxed text-warn">暂无场景预设，先通过场景设定节点或素材库新增。</p>
            ) : (
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto nx9-scroll">
                {scenePresets.map((scene) => {
                  const active = stripMentionToken(editDraft.scene) === scene.label;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setEditDraft({ ...editDraft, scene: scene.label })}
                      title={scene.description}
                      className={`rounded-full border px-2 py-0.5 text-[9px] ${
                        active
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-line bg-white text-ink/55 hover:border-brand/35'
                      }`}
                    >
                      {scene.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 space-y-2">
          <label className="block space-y-1">
            <span className="text-[9px] text-ink/45">分镜剧本 / 文案</span>
            <AssetMentionInput
              as="textarea"
              rows={3}
              value={editDraft.scriptText}
              onChange={(next) => setEditDraft({ ...editDraft, scriptText: next })}
              kinds={GLOBAL_MENTION_KINDS}
              placeholder="修改文案… 输入 @ 引用角色、场景、镜头、情绪、声音"
              className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] text-ink/45">AI 图片 Prompt</span>
            <AssetMentionInput
              as="textarea"
              rows={4}
              value={editDraft.imagePrompt}
              onChange={(next) => setEditDraft({ ...editDraft, imagePrompt: next })}
              kinds={GLOBAL_MENTION_KINDS}
              placeholder="图片 Prompt… 输入 @ 引用角色、场景、镜头、情绪"
              className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] text-ink/45">AI 视频 Prompt</span>
            <AssetMentionInput
              as="textarea"
              rows={4}
              value={editDraft.videoPrompt}
              onChange={(next) => setEditDraft({ ...editDraft, videoPrompt: next })}
              kinds={GLOBAL_MENTION_KINDS}
              placeholder="视频 Prompt… 输入 @ 引用角色、场景、镜头、情绪、声音"
              className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setEditingShotId(null)} className="rounded-lg border border-line px-3 py-1.5 text-[10px] text-ink/55">取消</button>
          <button type="button" onClick={saveShotEdit} className="rounded-lg bg-brand px-3 py-1.5 text-[10px] font-medium text-white">保存修改</button>
        </div>
      </div>
    )}
    </div>
  );
}

export default memo(StoryGridBlock);
