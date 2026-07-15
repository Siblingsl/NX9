import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  MAX_ENV_REFERENCE_IMAGES,
  compileScenePrompt,
  migrateEnvironmentProfile,
  newBacklotWorkspaceItem,
  refreshWorkspacePrompts,
  type BacklotWorkspaceItem,
  type EnvironmentProfile,
} from '@nx9/shared';
import { Lock, MapPin, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';

function splitList(value: string): string[] {
  return value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function line(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((part) => part && String(part).trim()).join('\n');
}

function buildSceneConsistencyPrompt(input: {
  sceneName: string;
  description: string;
  era: string;
  weather: string;
  lighting: string;
  colorTone: string;
  props: string[];
  forbidden: string;
}) {
  const base = compileScenePrompt({
    sceneName: input.sceneName,
    description: input.description,
    era: input.era,
    lighting: [input.lighting, input.colorTone, input.weather].filter(Boolean).join(', '),
    props: input.props,
    referenceUrls: [],
  });
  return line(
    base,
    input.forbidden ? `Never change scene anchors: ${input.forbidden}` : '',
    'Maintain the same spatial layout, architecture, material texture, lighting logic and color continuity across shots.',
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-medium text-ink/45">{children}</span>;
}

function SceneCardBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const appendLog = useActivityLog((s) => s.append);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const environments = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const data = props.data as Record<string, unknown>;
  const upstream = data.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const assetRef = assetRefFromData(data);

  const sceneName = (data.sceneName as string | undefined) ?? '';
  const sceneCode = (data.sceneCode as string | undefined) ?? '';
  const description = (data.description as string | undefined) ?? '';
  const era = (data.era as string | undefined) ?? '';
  const weather = (data.weather as string | undefined) ?? '';
  const lighting = (data.lighting as string | undefined) ?? '';
  const colorTone = (data.colorTone as string | undefined) ?? '';
  const propsText = Array.isArray(data.props) ? (data.props as string[]).join('、') : ((data.props as string | undefined) ?? '');
  const forbidden = (data.forbiddenSceneDrift as string | undefined) ?? '';
  const referenceUrls = ((data.referenceUrls as string[] | undefined) ?? []).filter(Boolean).slice(0, MAX_ENV_REFERENCE_IMAGES);
  const locked = Boolean(data.assetLocked);
  const syncedAt = data.backlotSyncedAt as string | undefined;
  const propsArr = useMemo(() => splitList(propsText), [propsText]);
  const prompt = useMemo(
    () => buildSceneConsistencyPrompt({ sceneName, description, era, weather, lighting, colorTone, props: propsArr, forbidden }),
    [colorTone, description, era, forbidden, lighting, propsArr, sceneName, weather],
  );
  const duplicate = useMemo(
    () => environments.some((env) => env.name.trim() === sceneName.trim() && env.id !== data.sceneAssetId),
    [data.sceneAssetId, environments, sceneName],
  );
  const health = [sceneName.trim(), description.trim(), lighting.trim() || era.trim(), prompt.trim(), referenceUrls[0]].filter(Boolean).length;

  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...data, ...patch };
      const nextProps = Array.isArray(next.props) ? (next.props as string[]) : splitList((next.props as string | undefined) ?? '');
      const nextPrompt = buildSceneConsistencyPrompt({
        sceneName: (next.sceneName as string | undefined) ?? '',
        description: (next.description as string | undefined) ?? '',
        era: (next.era as string | undefined) ?? '',
        weather: (next.weather as string | undefined) ?? '',
        lighting: (next.lighting as string | undefined) ?? '',
        colorTone: (next.colorTone as string | undefined) ?? '',
        props: nextProps,
        forbidden: (next.forbiddenSceneDrift as string | undefined) ?? '',
      });
      updateNodeData(props.id, {
        ...patch,
        content: nextPrompt,
        output: nextPrompt,
        consistencyPrompt: nextPrompt,
        meta: {
          kind: 'scene-consistency',
          locked: Boolean(next.assetLocked),
          hasReference: ((next.referenceUrls as string[] | undefined) ?? []).length > 0,
        },
      });
    },
    [data, props.id, updateNodeData],
  );

  const addRef = useCallback(
    (url: string) => commit({ referenceUrls: [...new Set([url, ...referenceUrls])].slice(0, MAX_ENV_REFERENCE_IMAGES) }),
    [commit, referenceUrls],
  );

  const fillFromUpstream = useCallback(() => {
    const pics = upstream?.pictures ?? [];
    if (pics.length === 0) {
      appendLog('场景设定：没有上游图片。请连接图像生成节点或上传场景参考图。');
      return;
    }
    commit({ referenceUrls: [...new Set([...pics, ...referenceUrls])].slice(0, MAX_ENV_REFERENCE_IMAGES) });
    appendLog(`场景设定已引用上游图片 · ${Math.min(pics.length, MAX_ENV_REFERENCE_IMAGES)} 张`);
  }, [appendLog, commit, referenceUrls, upstream?.pictures]);

  const loadScene = useCallback((item: BacklotWorkspaceItem) => {
    const creative = (item.creative ?? {}) as Record<string, unknown>;
    const refs = Array.isArray(creative.referenceUrls) ? creative.referenceUrls.filter(Boolean) as string[] : [];
    commit({
      sceneLibraryId: item.id,
      sceneName: item.label,
      description: (creative.description as string | undefined) ?? item.promptZh ?? item.promptEn ?? '',
      era: (creative.timeOfDay as string | undefined) ?? '',
      weather: (creative.weather as string | undefined) ?? '',
      lighting: (creative.lighting as string | undefined) ?? '',
      colorTone: (creative.colorTone as string | undefined) ?? '',
      props: Array.isArray(creative.props) ? creative.props : [],
      forbiddenSceneDrift: (creative.forbiddenDrift as string | undefined) ?? '',
      referenceUrls: refs,
      assetLocked: Boolean(creative.locked),
    });
    appendLog(`已载入场景设定：${item.label}`);
    setEditing(true);
  }, [appendLog, commit]);

  const createScene = useCallback(() => {
    commit({
      sceneAssetId: undefined,
      sceneLibraryId: undefined,
      sceneName: '',
      sceneCode: '',
      description: '',
      era: '',
      weather: '',
      lighting: '',
      colorTone: '',
      props: [],
      forbiddenSceneDrift: '',
      referenceUrls: [],
      assetLocked: true,
      backlotSyncedAt: undefined,
    });
    appendLog('已打开新增场景设定；可手动填写，或由设定检查/AI 拆分后自动补入。');
    setEditing(true);
  }, [appendLog, commit]);

  const saveToLibraries = useCallback(() => {
    const finalName = sceneName.trim();
    if (!finalName || !description.trim()) {
      appendLog('场景设定：请至少填写场景名和空间锚点');
      return;
    }
    const envId = (data.sceneAssetId as string | undefined) ?? `env-${props.id}`;
    const env: EnvironmentProfile = migrateEnvironmentProfile({
      id: envId,
      sceneCode: sceneCode || undefined,
      name: finalName,
      descriptionZh: description,
      consistencyPrompt: prompt,
      era: era || undefined,
      lighting: [lighting, weather, colorTone].filter(Boolean).join(' · ') || undefined,
      props: propsArr,
      referenceUrls,
      referenceImageUrl: referenceUrls[0] ?? null,
    });
    setEnvironments({ version: 1, environments: [...environments.filter((item) => item.id !== envId), env] });

    const existingScene = workspaceItems.find((item) => item.kind === 'scene' && (item.id === data.sceneLibraryId || item.label === finalName));
    const item: BacklotWorkspaceItem = refreshWorkspacePrompts({
      ...(existingScene ?? newBacklotWorkspaceItem('scene')),
      id: existingScene?.id ?? (data.sceneLibraryId as string | undefined) ?? `scene-${props.id}`,
      kind: 'scene',
      label: finalName,
      promptZh: description,
      promptEn: prompt,
      creative: {
        ...(existingScene?.creative ?? {}),
        description,
        referenceUrls,
        timeOfDay: era,
        weather,
        lighting,
        colorTone,
        tags: ['scene-consistency'],
        prompts: (existingScene?.creative as any)?.prompts,
        locked,
        forbiddenDrift: forbidden,
      } as any,
    });
    upsertBacklotWorkspace(item);
    updateNodeData(props.id, {
      sceneAssetId: envId,
      sceneLibraryId: item.id,
      backlotSyncedAt: new Date().toISOString(),
      status: 'success',
      content: prompt,
      output: prompt,
    });
    toastSuccess(`场景「${finalName}」已保存到场景库`);
    appendLog(`场景一致性资产已保存 · ${finalName}`);
    setEditing(false);
  }, [appendLog, colorTone, data.sceneAssetId, data.sceneLibraryId, description, environments, era, forbidden, lighting, locked, prompt, props.id, propsArr, referenceUrls, sceneCode, sceneName, setEnvironments, updateNodeData, upsertBacklotWorkspace, weather, workspaceItems]);

  return (
    <BlockShell {...props}>
      <div className="relative w-[300px] nodrag nopan text-xs text-ink">
        <div className="space-y-2">
          <div className="rounded-xl border border-line/60 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">场景设定库</p>
                <p className="text-[9px] text-ink/40">已有 {workspaceItems.filter((item) => item.kind === 'scene').length} 个场景 · 负责空间一致性</p>
              </div>
              {locked && <Lock size={12} className="text-brand" />}
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto nx9-scroll">
              {workspaceItems.filter((item) => item.kind === 'scene').length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-surface/40 px-2 py-3 text-center text-[10px] text-ink/45">
                  暂无场景。运行设定检查后可 AI 自动填入，也可以手动新增。
                </div>
              ) : workspaceItems.filter((item) => item.kind === 'scene').slice(0, 8).map((item) => {
                const creative = (item.creative ?? {}) as Record<string, unknown>;
                const refs = Array.isArray(creative.referenceUrls) ? creative.referenceUrls.filter(Boolean) as string[] : [];
                return (
                  <button key={item.id} type="button" onClick={() => loadScene(item)} className="flex w-full items-center gap-2 rounded-lg border border-line/45 bg-white px-2 py-1.5 text-left hover:border-brand/35 hover:bg-brand/5">
                    {refs[0] ? <img src={refs[0]} alt="" className="h-8 w-10 rounded border border-line object-cover" /> : <span className="grid h-8 w-10 place-items-center rounded border border-dashed border-line text-ink/25"><MapPin size={12} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink/75">{item.label}</span>
                      <span className="block truncate text-[9px] text-ink/40">{item.promptZh || item.promptEn || '未补空间锚点'}</span>
                    </span>
                    {Boolean(creative.locked) && <Lock size={11} className="text-brand" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-line/60 p-2">
              <p className="text-ink/35">当前编辑</p>
              <p className="mt-0.5 truncate font-medium">{sceneName || '未选择'}</p>
            </div>
            <div className="rounded-lg border border-line/60 p-2">
              <p className="text-ink/35">健康</p>
              <p className="mt-0.5 truncate font-medium">{health}/5{duplicate ? ' · 疑似重复' : syncedAt ? ' · 已入库' : ''}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={createScene}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[12px] font-medium text-white"
          >
            <Plus size={13} />
            新增场景设定
          </button>
          <p className="flex items-center justify-center gap-1 text-center text-[9px] text-ink/35"><Sparkles size={10} />可由设定检查/AI 自动填入；图片交给图像生成节点。</p>
        </div>

        {editing && (
          <div className="absolute left-[calc(100%+12px)] top-0 z-30 w-[360px] space-y-2 rounded-2xl border border-line bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">编辑场景一致性</p>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2 py-1 text-[11px] text-ink/45 hover:bg-surface">关闭</button>
            </div>
            <AssetLinkField
              kind="scene"
              assetRef={assetRef}
              onChange={(ref) => {
                const patch = patchWithAssetRef(ref);
                commit(ref ? { ...patch, sceneLibraryId: ref.id, sceneName: ref.label } : patch);
              }}
            />
            <div className="grid grid-cols-[1fr_76px] gap-2">
              <label><Label>场景名</Label><input value={sceneName} onChange={(e) => commit({ sceneName: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
              <label><Label>场景码</Label><input value={sceneCode} onChange={(e) => commit({ sceneCode: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            </div>
            <label><Label>空间锚点（必须）</Label><textarea value={description} onChange={(e) => commit({ description: e.target.value })} className="h-20 w-full resize-y rounded-xl border border-brand/25 bg-brand/[0.03] px-2 py-1.5" placeholder="空间布局、建筑结构、材质、固定标识物…" /></label>
            <div className="grid grid-cols-2 gap-2">
              <input value={era} onChange={(e) => commit({ era: e.target.value })} placeholder="时代/地域" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={weather} onChange={(e) => commit({ weather: e.target.value })} placeholder="天气" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={lighting} onChange={(e) => commit({ lighting: e.target.value })} placeholder="光线" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={colorTone} onChange={(e) => commit({ colorTone: e.target.value })} placeholder="色彩" className="rounded-lg border border-line px-2 py-1.5" />
            </div>
            <label><Label>固定道具/建筑结构</Label><input value={propsText} onChange={(e) => commit({ props: splitList(e.target.value) })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            <label><Label>禁改项 / 污染防护</Label><input value={forbidden} onChange={(e) => commit({ forbiddenSceneDrift: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1.5" /></label>
            <div className="rounded-xl border border-line/60 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-ink/50">参考图</span>
                <button type="button" onClick={fillFromUpstream} className="text-[10px] text-brand hover:underline">用上游图</button>
              </div>
              <ImageUploadSlot url="" label="上传参考" compact onUploaded={addRef} />
              {referenceUrls.length > 0 && (
                <div className="mt-1.5 grid grid-cols-6 gap-1">
                  {referenceUrls.map((url, index) => (
                    <button key={`${url}-${index}`} type="button" onClick={() => commit({ referenceUrls: referenceUrls.filter((_, i) => i !== index) })} title="点击移除">
                      <img src={url} alt="" className="aspect-square rounded border border-line object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <details className="rounded-xl border border-line/60 bg-surface/30">
              <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-medium text-ink/55">生成约束 Prompt</summary>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap px-2 pb-2 text-[10px] text-ink/65">{prompt}</pre>
            </details>
            <div className="flex gap-2">
              <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[10px] text-ink/55">
                <input type="checkbox" checked={locked} onChange={(e) => commit({ assetLocked: e.target.checked })} />
                锁定
              </label>
              <button type="button" onClick={saveToLibraries} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand px-2 py-1.5 text-[11px] font-medium text-white">
                <ShieldCheck size={13} />
                保存到场景库
              </button>
            </div>
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(SceneCardBlock);
