import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  flattenScriptBreakdownShots,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  type ScriptBreakdownDialogueLine,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { applyScriptBreakdownPayload } from '../../../../script-breakdown-runner';

type Tab = 'overview' | 'edit' | 'characters' | 'scenes';

export interface StoryGridWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function clonePayload(payload: ScriptBreakdownPayload): ScriptBreakdownPayload {
  return JSON.parse(JSON.stringify(payload)) as ScriptBreakdownPayload;
}

function dialogueToText(lines: ScriptBreakdownDialogueLine[]): string {
  return lines.map((line) => `${line.speaker}｜${line.emotion ?? ''}｜${line.text}`).join('\n');
}

function textToDialogue(value: string): ScriptBreakdownDialogueLine[] {
  return value.split('\n').map((line) => {
    const [speaker = '', emotion = '', ...rest] = line.split('｜');
    return {
      speaker: speaker.trim(),
      emotion: emotion.trim() || undefined,
      text: rest.join('｜').trim(),
    };
  }).filter((line) => line.speaker && line.text).slice(0, 12);
}

function namesToText(names: string[]): string {
  return names.join('、');
}

function textToNames(value: string): string[] {
  return value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function findShot(payload: ScriptBreakdownPayload | undefined, shotId: string | null): ScriptBreakdownShot | undefined {
  if (!payload || !shotId) return undefined;
  return flattenScriptBreakdownShots(payload).find((shot) => shot.id === shotId);
}

function displayCharacterMeta(character: CharacterProfile): string {
  return [character.bible?.identity, character.descriptionZh, character.creative?.nickname]
    .filter(Boolean)
    .join(' · ');
}

function scenePresetName(item: EnvironmentProfile | BacklotWorkspaceItem): string {
  if ('name' in item) return item.name;
  return item.label;
}

export function StoryGridWorkspace({ blockId, kind, onCollapse }: StoryGridWorkspaceProps) {
  const data = useAttachedNodeData(blockId);
  const { getEdges, getNodes } = useReactFlow();
  const appendLog = useActivityLog((state) => state.append);
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
  const [tab, setTab] = useState<Tab>('edit');
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScriptBreakdownPayload | undefined>(() => data.scriptBreakdown as ScriptBreakdownPayload | undefined);

  const upstream = useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = getEdges().filter((edge) => edge.target === blockId);
    for (const edge of incoming) {
      const payload = (byId.get(edge.source)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);

  useEffect(() => {
    const next = (data.scriptBreakdown as ScriptBreakdownPayload | undefined) ?? upstream;
    if (next) setDraft(clonePayload(next));
  }, [data.scriptBreakdown, upstream]);

  const shots = useMemo(() => flattenScriptBreakdownShots(draft), [draft]);
  const currentEpisode = useMemo(() => {
    if (!draft) return undefined;
    return draft.episodes.find((episode) => episode.id === activeEpisodeId) ?? draft.episodes[0];
  }, [activeEpisodeId, draft]);
  const visibleShots = currentEpisode?.shots ?? [];
  const selected = findShot(draft, selectedShotId) ?? visibleShots[0] ?? shots[0];
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
  const characterNames = useMemo(() => characters.map((character) => character.name.trim()).filter(Boolean), [characters]);

  useEffect(() => {
    if (!selectedShotId && selected?.id) setSelectedShotId(selected.id);
  }, [selected?.id, selectedShotId]);

  const patchShot = useCallback((shotId: string, patch: Partial<ScriptBreakdownShot>) => {
    setDraft((current) => {
      if (!current) return current;
      const next = clonePayload(current);
      for (const episode of next.episodes) {
        episode.shots = episode.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot);
        episode.scenes = episode.scenes?.map((scene) => ({
          ...scene,
          shots: scene.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot),
        }));
      }
      return next;
    });
  }, []);

  const save = useCallback(() => {
    if (!draft) return;
    applyScriptBreakdownPayload(blockId, {
      ...draft,
      generatedAt: new Date().toISOString(),
      promptVersion: draft.promptVersion ?? 'story-grid-edited',
    });
    appendLog(`分镜网格修改已保存 · ${draft.episodes.length} 集 / ${shots.length} 镜`);
  }, [appendLog, blockId, draft, shots.length]);

  const toggleShotCharacter = useCallback((shot: ScriptBreakdownShot, name: string) => {
    const exists = shot.characters.some((item) => item.trim() === name);
    patchShot(shot.id, {
      characters: exists
        ? shot.characters.filter((item) => item.trim() !== name)
        : [...shot.characters, name],
    });
  }, [patchShot]);

  const syncFromUpstream = useCallback(() => {
    if (!upstream) return;
    const next = clonePayload(upstream);
    setDraft(next);
    applyScriptBreakdownPayload(blockId, next);
    appendLog(`已从剧本拆分同步到分镜网格 · ${next.episodes.length} 集`);
  }, [appendLog, blockId, upstream]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: '总览' },
    { id: 'edit', label: '镜头编辑' },
    { id: 'characters', label: '角色设定' },
    { id: 'scenes', label: '场景设定' },
  ];

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={(data.status as any) ?? 'idle'}
      onCollapse={onCollapse}
      onRun={save}
      runLabel="保存分镜修改"
      runDisabled={!draft}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-[min(720px,76vh)] max-h-[760px]"
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      topSlot={(
        <div className="flex items-center gap-1 border-b border-line/25 px-3 py-1.5">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-md px-2 py-1 text-[9px] ${tab === item.id ? 'bg-brand text-white' : 'text-ink/45 hover:bg-surface'}`}>{item.label}</button>
          ))}
          <button type="button" disabled={!upstream} onClick={syncFromUpstream} className="ml-auto rounded border border-line px-2 py-1 text-[8px] text-ink/55 disabled:opacity-35">从剧本拆分同步</button>
        </div>
      )}
    >
      {!draft ? (
        <div className="grid flex-1 place-items-center text-[11px] text-ink/40">请先连接剧本拆分节点，或点击画布上的同步。</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'overview' && (
            <div className="h-full overflow-y-auto nx9-scroll p-3 space-y-2">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{draft.episodes.length}</p><p className="text-[8px] text-ink/35">分集</p></div>
                <div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{draft.episodes.reduce((sum, ep) => sum + (ep.scenes?.length ?? 0), 0)}</p><p className="text-[8px] text-ink/35">场景</p></div>
                <div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{shots.length}</p><p className="text-[8px] text-ink/35">镜头</p></div>
                <div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{draft.characters?.length ?? 0}</p><p className="text-[8px] text-ink/35">角色</p></div>
              </div>
              {draft.storyAnalysis && (
                <div className="rounded-xl border border-line/40 bg-white p-3">
                  <p className="text-[11px] font-semibold text-ink/70">{draft.storyAnalysis.genre || '故事分析'}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink/55">{[draft.storyAnalysis.coreTheme, draft.storyAnalysis.visualStyle].filter(Boolean).join(' · ')}</p>
                </div>
              )}
              {draft.acts?.map((act) => (
                <div key={`${act.name}-${act.title ?? ''}`} className="rounded-xl border border-line/40 bg-white p-3">
                  <p className="text-[11px] font-semibold text-ink/70">{act.name}{act.title ? ` · ${act.title}` : ''}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink/55">{[act.storyGoal, act.conflict, act.emotionalShift].filter(Boolean).join(' · ')}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 'edit' && (
            <div className="grid h-full grid-cols-[230px_minmax(0,1fr)] gap-0">
              <div className="min-h-0 border-r border-line/30 bg-surface/25 p-2">
                {draft.episodes.length > 1 && (
                  <select value={currentEpisode?.id ?? ''} onChange={(event) => { setActiveEpisodeId(event.target.value || null); setSelectedShotId(null); }} className="mb-2 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[10px]">
                    {draft.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
                  </select>
                )}
                <div className="max-h-full overflow-y-auto nx9-scroll space-y-1">
                  {visibleShots.map((shot) => (
                    <button key={shot.id} type="button" onClick={() => setSelectedShotId(shot.id)} className={`w-full rounded-lg border px-2 py-1.5 text-left ${selected?.id === shot.id ? 'border-brand/45 bg-brand/10' : 'border-line/35 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-brand">{shot.sceneCode}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink/75">{shot.title}</span>
                        <span className="text-[8px] text-ink/35">{shot.durationSec}s</span>
                      </div>
                      <p className="mt-0.5 truncate text-[9px] text-ink/40">{shot.scene}</p>
                    </button>
                  ))}
                </div>
              </div>
              {selected && (
                <div className="min-h-0 overflow-y-auto nx9-scroll p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <label className="col-span-2 space-y-1"><span className="text-[9px] text-ink/45">镜头标题</span><input value={selected.title} onChange={(e) => patchShot(selected.id, { title: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">时长</span><input type="number" value={selected.durationSec} onChange={(e) => patchShot(selected.id, { durationSec: Number(e.target.value) || 1 })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1">
                      <span className="flex items-center justify-between text-[9px] text-ink/45">
                        场景预设
                        {selected.scene && !scenePresets.some((scene) => scene.label === selected.scene) && <span className="text-warn">未入库</span>}
                      </span>
                      <select
                        value={scenePresets.some((scene) => scene.label === selected.scene) ? selected.scene : ''}
                        onChange={(e) => patchShot(selected.id, { scene: e.target.value || selected.scene })}
                        className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-[11px]"
                      >
                        <option value="">{selected.scene || '选择场景预设'}</option>
                        {scenePresets.map((scene) => (
                          <option key={scene.id} value={scene.label}>{scene.label} · {scene.source}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="flex items-center justify-between text-[9px] text-ink/45">
                        角色预设
                        {selected.characters.some((name) => !characterNames.includes(name)) && <span className="text-warn">含未入库角色</span>}
                      </span>
                      <input value={namesToText(selected.characters)} onChange={(e) => patchShot(selected.id, { characters: textToNames(e.target.value) })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" />
                    </label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">镜头目的</span><input value={selected.purpose ?? ''} onChange={(e) => patchShot(selected.id, { purpose: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">角度</span><input value={selected.cameraAngle ?? ''} onChange={(e) => patchShot(selected.id, { cameraAngle: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">运动</span><input value={selected.cameraMove ?? ''} onChange={(e) => patchShot(selected.id, { cameraMove: e.target.value as ScriptBreakdownShot['cameraMove'] })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">焦距</span><input value={selected.cameraLens ?? ''} onChange={(e) => patchShot(selected.id, { cameraLens: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line/50 bg-surface/20 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-ink/60">可用角色</p>
                        <p className="text-[9px] text-ink/35">{characters.length} 个</p>
                      </div>
                      {characters.length === 0 ? (
                        <p className="text-[9px] text-warn">还没有角色预设，请先经过角色设定节点或素材库新增。</p>
                      ) : (
                        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto nx9-scroll">
                          {characters.map((character) => {
                            const active = selected.characters.includes(character.name);
                            return (
                              <button
                                key={character.id}
                                type="button"
                                onClick={() => toggleShotCharacter(selected, character.name)}
                                title={displayCharacterMeta(character)}
                                className={`rounded-full border px-2 py-0.5 text-[9px] ${active ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-white text-ink/55 hover:border-brand/35'}`}
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
                        <p className="text-[10px] font-semibold text-ink/60">可用场景</p>
                        <p className="text-[9px] text-ink/35">{scenePresets.length} 个</p>
                      </div>
                      {scenePresets.length === 0 ? (
                        <p className="text-[9px] text-warn">还没有场景预设，请先经过场景设定节点或素材库新增。</p>
                      ) : (
                        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto nx9-scroll">
                          {scenePresets.map((scene) => {
                            const active = selected.scene === scene.label;
                            return (
                              <button
                                key={scene.id}
                                type="button"
                                onClick={() => patchShot(selected.id, { scene: scene.label })}
                                title={scene.description}
                                className={`rounded-full border px-2 py-0.5 text-[9px] ${active ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-white text-ink/55 hover:border-brand/35'}`}
                              >
                                {scene.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">剧本 / 文案</span><textarea rows={5} value={selected.scriptText} onChange={(e) => patchShot(selected.id, { scriptText: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">对白（角色｜情绪｜内容）</span><textarea rows={5} value={dialogueToText(selected.dialogue)} onChange={(e) => patchShot(selected.id, { dialogue: textToDialogue(e.target.value) })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">电影级画面</span><textarea rows={5} value={selected.visual ?? ''} onChange={(e) => patchShot(selected.id, { visual: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">动作设计</span><textarea rows={5} value={selected.action ?? ''} onChange={(e) => patchShot(selected.id, { action: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">旁白</span><textarea rows={3} value={selected.narration ?? ''} onChange={(e) => patchShot(selected.id, { narration: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">声音设计</span><textarea rows={3} value={selected.sound ?? ''} onChange={(e) => patchShot(selected.id, { sound: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">AI 图片 Prompt（可 @人物 @场景）</span><textarea rows={6} value={selected.imagePrompt} onChange={(e) => patchShot(selected.id, { imagePrompt: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                    <label className="space-y-1"><span className="text-[9px] text-ink/45">AI 视频 Prompt（可 @人物 @场景 @声音）</span><textarea rows={6} value={selected.videoPrompt} onChange={(e) => patchShot(selected.id, { videoPrompt: e.target.value })} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-[11px]" /></label>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'characters' && (
            <div className="h-full overflow-y-auto nx9-scroll p-3 grid grid-cols-2 gap-2 content-start">
              {(draft.characters ?? []).map((character) => (
                <div key={character.name} className="rounded-xl border border-line/40 bg-white p-3">
                  <p className="text-[11px] font-semibold text-ink/75">{character.name}</p>
                  <p className="mt-1 text-[9px] text-ink/45">{[character.identity, character.age, character.personality].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-ink/55">{character.appearance}</p>
                  <p className="mt-1 text-[8px] leading-relaxed text-brand">{character.fixedVisualKeywords}</p>
                </div>
              ))}
            </div>
          )}
          {tab === 'scenes' && (
            <div className="h-full overflow-y-auto nx9-scroll p-3 grid grid-cols-2 gap-2 content-start">
              {draft.episodes.flatMap((episode) => episode.scenes ?? []).map((scene) => (
                <div key={scene.id} className="rounded-xl border border-line/40 bg-white p-3">
                  <p className="text-[11px] font-semibold text-ink/75">{scene.code} · {scene.location}</p>
                  <p className="mt-1 text-[9px] text-ink/45">{scene.timeOfDay} · {scene.interiorExterior}</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-ink/55">{scene.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ComposerWorkspaceShell>
  );
}
