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
import { MapPin, Plus, ShieldCheck } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import ImageUploadSlot from '../shared/ImageUploadSlot';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { toastSuccess } from '../../stores/toast';
import './scene-sheet.css';

/** 库 →（选中后）设定 → 参考 — 对齐角色设定 */
type StudioTab = 'library' | 'profile' | 'refs';

type RosterRow = {
  key: string;
  name: string;
  code: string;
  summary: string;
  status: string;
  tone: 'ok' | 'warn' | 'todo';
  hasRef: boolean;
  hasAnchor: boolean;
  env?: EnvironmentProfile;
  backlot?: BacklotWorkspaceItem;
};

function splitList(value: string): string[] {
  return value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function line(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((part) => part && String(part).trim()).join('\n');
}

function compact(text: string, max = 36) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
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
    'Production location bible: stable vanishing lines, fixed prop anchors, coherent time-of-day lighting, no watermark, no UI chrome.',
  );
}

function envRosterStatus(env: EnvironmentProfile): Pick<RosterRow, 'status' | 'tone' | 'hasRef' | 'hasAnchor'> {
  const hasRef = Boolean(env.referenceUrls?.length || env.referenceImageUrl);
  const hasAnchor = Boolean(env.descriptionZh?.trim() || env.consistencyPrompt?.trim());
  if (hasAnchor && hasRef) return { status: '齐备', tone: 'ok', hasRef, hasAnchor };
  if (!hasAnchor) return { status: '缺锚点', tone: 'todo', hasRef, hasAnchor };
  if (!hasRef) return { status: '缺参考', tone: 'warn', hasRef, hasAnchor };
  return { status: '可入库', tone: 'warn', hasRef, hasAnchor };
}

function backlotRosterStatus(item: BacklotWorkspaceItem): Pick<RosterRow, 'status' | 'tone' | 'hasRef' | 'hasAnchor'> {
  const creative = (item.creative ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(creative.referenceUrls)
    ? (creative.referenceUrls.filter(Boolean) as string[])
    : [];
  const hasRef = refs.length > 0;
  const hasAnchor = Boolean(
    (creative.description as string | undefined)?.trim()
    || item.promptZh?.trim()
    || item.promptEn?.trim(),
  );
  const locked = Boolean(creative.locked);
  if (locked && hasAnchor && hasRef) return { status: '齐备', tone: 'ok', hasRef, hasAnchor };
  if (locked) return { status: '已锁', tone: 'ok', hasRef, hasAnchor };
  if (!hasAnchor) return { status: '缺锚点', tone: 'todo', hasRef, hasAnchor };
  if (!hasRef) return { status: '缺参考', tone: 'warn', hasRef, hasAnchor };
  return { status: '可入库', tone: 'warn', hasRef, hasAnchor };
}

function SceneCardBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('library');
  /** 本轮打开后点选库内场景 / 新建，才可进设定·参考 */
  const [sessionPicked, setSessionPicked] = useState(false);
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
  const propsText = Array.isArray(data.props)
    ? (data.props as string[]).join('、')
    : ((data.props as string | undefined) ?? '');
  const forbidden = (data.forbiddenSceneDrift as string | undefined) ?? '';
  const referenceUrls = ((data.referenceUrls as string[] | undefined) ?? [])
    .filter(Boolean)
    .slice(0, MAX_ENV_REFERENCE_IMAGES);
  const locked = Boolean(data.assetLocked);
  const propsArr = useMemo(() => splitList(propsText), [propsText]);
  const prompt = useMemo(
    () => buildSceneConsistencyPrompt({
      sceneName, description, era, weather, lighting, colorTone, props: propsArr, forbidden,
    }),
    [colorTone, description, era, forbidden, lighting, propsArr, sceneName, weather],
  );
  const duplicate = useMemo(
    () => environments.some((env) => env.name.trim() === sceneName.trim() && env.id !== data.sceneAssetId),
    [data.sceneAssetId, environments, sceneName],
  );
  const health = [
    sceneName.trim(),
    description.trim(),
    lighting.trim() || era.trim(),
    prompt.trim(),
    referenceUrls[0],
  ].filter(Boolean).length;
  const refCount = referenceUrls.length;
  const canEditTabs = sessionPicked;

  /** 场记表：环境库 + 仅存在于 backlot 的场景条目 */
  const roster = useMemo((): RosterRow[] => {
    const rows: RosterRow[] = [];
    const envNames = new Set<string>();
    for (const env of environments) {
      const st = envRosterStatus(env);
      envNames.add(env.name.trim().toLowerCase());
      rows.push({
        key: `env-${env.id}`,
        name: env.name,
        code: env.sceneCode || '—',
        summary: compact(env.descriptionZh || env.era || env.lighting || '—', 24),
        ...st,
        env,
      });
    }
    for (const item of workspaceItems.filter((i) => i.kind === 'scene')) {
      if (envNames.has(item.label.trim().toLowerCase())) continue;
      const st = backlotRosterStatus(item);
      const creative = (item.creative ?? {}) as Record<string, unknown>;
      rows.push({
        key: `bl-${item.id}`,
        name: item.label,
        code: '—',
        summary: compact(
          (creative.description as string)
          || item.promptZh
          || item.promptEn
          || '—',
          24,
        ),
        ...st,
        backlot: item,
      });
    }
    return rows;
  }, [environments, workspaceItems]);

  const rosterStats = useMemo(() => {
    let ready = 0;
    let needAnchor = 0;
    let needRef = 0;
    for (const r of roster) {
      if (r.tone === 'ok' && r.hasAnchor && r.hasRef) ready += 1;
      if (!r.hasAnchor) needAnchor += 1;
      else if (!r.hasRef) needRef += 1;
    }
    return {
      total: roster.length,
      ready,
      needAnchor,
      needRef,
      pending: Math.max(0, roster.length - ready),
    };
  }, [roster]);

  const rosterPreview = useMemo(() => roster.slice(0, 4), [roster]);

  const cardStatusText = rosterStats.total === 0
    ? '待建库'
    : rosterStats.pending === 0
      ? '场记齐备'
      : `待补 ${rosterStats.pending}`;
  const cardStatusClass = rosterStats.total === 0
    ? ''
    : rosterStats.pending === 0
      ? 'is-ready'
      : 'is-warn';

  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...data, ...patch };
      const nextProps = Array.isArray(next.props)
        ? (next.props as string[])
        : splitList((next.props as string | undefined) ?? '');
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

  const openStudio = useCallback(() => {
    setSessionPicked(false);
    setStudioTab('library');
    setStudioOpen(true);
  }, []);

  const closeStudio = useCallback(() => {
    setStudioOpen(false);
    setSessionPicked(false);
    setStudioTab('library');
  }, []);

  const tryOpenTab = useCallback((tab: StudioTab) => {
    if (tab !== 'library' && !sessionPicked) {
      appendLog('场景设定：请先在「库」中选择场景或新建，再进入设定 / 参考');
      setStudioTab('library');
      return;
    }
    setStudioTab(tab);
  }, [appendLog, sessionPicked]);

  const addRef = useCallback(
    (url: string) => commit({
      referenceUrls: [...new Set([url, ...referenceUrls])].slice(0, MAX_ENV_REFERENCE_IMAGES),
    }),
    [commit, referenceUrls],
  );

  const fillFromUpstream = useCallback(() => {
    const pics = upstream?.pictures ?? [];
    if (pics.length === 0) {
      appendLog('场景设定：没有上游图片。请连接图像生成节点或上传场景参考图。');
      return;
    }
    commit({
      referenceUrls: [...new Set([...pics, ...referenceUrls])].slice(0, MAX_ENV_REFERENCE_IMAGES),
    });
    appendLog(`场景设定已引用上游图片 · ${Math.min(pics.length, MAX_ENV_REFERENCE_IMAGES)} 张`);
    setStudioTab('refs');
  }, [appendLog, commit, referenceUrls, upstream?.pictures]);

  const loadEnvironment = useCallback((env: EnvironmentProfile) => {
    const lightingParts = (env.lighting ?? '').split(/[·,，]/).map((s) => s.trim()).filter(Boolean);
    commit({
      sceneAssetId: env.id,
      sceneLibraryId: undefined,
      sceneName: env.name,
      sceneCode: env.sceneCode ?? '',
      description: env.descriptionZh ?? '',
      era: env.era ?? '',
      weather: lightingParts[1] ?? '',
      lighting: lightingParts[0] ?? env.lighting ?? '',
      colorTone: lightingParts[2] ?? '',
      props: env.props ?? [],
      forbiddenSceneDrift: '',
      referenceUrls: env.referenceUrls ?? (env.referenceImageUrl ? [env.referenceImageUrl] : []),
      assetLocked: false,
    });
    setSessionPicked(true);
    setStudioTab('profile');
    appendLog(`已选中场景：${env.name} · 可编辑设定与参考`);
  }, [appendLog, commit]);

  const loadBacklotScene = useCallback((item: BacklotWorkspaceItem) => {
    const creative = (item.creative ?? {}) as Record<string, unknown>;
    const refs = Array.isArray(creative.referenceUrls)
      ? (creative.referenceUrls.filter(Boolean) as string[])
      : [];
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
    setSessionPicked(true);
    setStudioTab('profile');
    appendLog(`已选中场景：${item.label} · 可编辑设定与参考`);
  }, [appendLog, commit]);

  const loadRosterRow = useCallback((row: RosterRow) => {
    if (row.env) loadEnvironment(row.env);
    else if (row.backlot) loadBacklotScene(row.backlot);
  }, [loadBacklotScene, loadEnvironment]);

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
    setSessionPicked(true);
    setStudioTab('profile');
    appendLog('已新建空白场景 · 填写后保存入库');
  }, [appendLog, commit]);

  const saveToLibraries = useCallback(() => {
    if (!sessionPicked) {
      appendLog('场景设定：请先在库中选择场景');
      setStudioTab('library');
      return;
    }
    const finalName = sceneName.trim();
    if (!finalName || !description.trim()) {
      appendLog('场景设定：请至少填写场景名和空间锚点');
      setStudioTab('profile');
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
    setEnvironments({
      version: 1,
      environments: [...environments.filter((item) => item.id !== envId), env],
    });

    const existingScene = workspaceItems.find(
      (item) => item.kind === 'scene' && (item.id === data.sceneLibraryId || item.label === finalName),
    );
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
        prompts: (existingScene?.creative as { prompts?: unknown } | undefined)?.prompts,
        locked,
        forbiddenDrift: forbidden,
        props: propsArr,
      } as unknown as BacklotWorkspaceItem['creative'],
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
  }, [
    appendLog, colorTone, data.sceneAssetId, data.sceneLibraryId, description, environments,
    era, forbidden, lighting, locked, prompt, props.id, propsArr, referenceUrls, sceneCode,
    sceneName, sessionPicked, setEnvironments, updateNodeData, upsertBacklotWorkspace,
    weather, workspaceItems,
  ]);

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="ss ss-card nodrag nopan">
          <div className="ss-card__toolbar">
            <span className={`ss-card__status ${cardStatusClass}`}>{cardStatusText}</span>
            <span className="ss-card__counts">
              库 <b>{rosterStats.total}</b>
              {' · '}
              齐备 <b>{rosterStats.ready}</b>
            </span>
          </div>

          {/* 画布摘要卡：场景库状态，详表仅在场记台 */}
          <button
            type="button"
            className="ss-summary-card"
            onClick={openStudio}
            title="打开场景场记台 · 从库选场景再编辑"
          >
            {rosterStats.total > 0 ? (
              <>
                <div className="ss-summary-card__hero">
                  <div>
                    <span className="ss-summary-card__eyebrow">场景场记</span>
                    <strong>
                      {rosterStats.pending === 0
                        ? '场记齐备，可进分镜'
                        : `${rosterStats.pending} 场待补设定`}
                    </strong>
                    <p>
                      {rosterPreview[0]
                        ? `代表：${compact(rosterPreview[0].name, 12)} · ${compact(rosterPreview[0].summary, 22)}`
                        : '打开后维护环境锚点、光影与参考图'}
                    </p>
                  </div>
                  <span className="ss-summary-card__metric">
                    {rosterStats.total}
                    <small>场</small>
                  </span>
                </div>
                <div className="ss-summary-card__stats" aria-label="场景库摘要">
                  <span><b>{rosterStats.ready}</b> 齐备</span>
                  <span><b>{rosterStats.needRef}</b> 缺图</span>
                  <span><b>{rosterStats.needAnchor}</b> 缺锚</span>
                </div>
                <div className="ss-summary-card__chips">
                  {(rosterPreview.length
                    ? rosterPreview.map((r) => r.name)
                    : ['场景库']
                  ).map((label) => (
                    <span key={label}>{compact(label, 10)}</span>
                  ))}
                </div>
                <div className="ss-summary-card__trail">
                  {rosterStats.pending === 0
                    ? '点击进入场记台 · 维护环境一致性'
                    : `待补 ${rosterStats.pending} · 点击开表补齐锚点/参考`}
                </div>
              </>
            ) : (
              <>
                <div className="ss-summary-card__hero is-empty">
                  <div>
                    <span className="ss-summary-card__eyebrow">准备中</span>
                    <strong>建立场景场记</strong>
                    <p>开表新建，或由剧本拆分 / 设定检查同步场景候选后再编辑。</p>
                  </div>
                  <span className="ss-summary-card__metric">
                    0
                    <small>场</small>
                  </span>
                </div>
                <div className="ss-summary-card__stats" aria-label="空库状态">
                  <span><b>0</b> 齐备</span>
                  <span><b>—</b> 参考</span>
                  <span><b>—</b> 光影</span>
                </div>
                <div className="ss-summary-card__chips">
                  <span>环境锚点</span>
                  <span>设定图</span>
                  <span>氛围</span>
                </div>
                <div className="ss-summary-card__trail">
                  点击进入场景场记台
                </div>
              </>
            )}
          </button>

          {rosterStats.needAnchor > 0 || rosterStats.needRef > 0 ? (
            <p className="ss-card__hint is-warn">
              {rosterStats.needAnchor > 0 ? `${rosterStats.needAnchor} 场缺锚点` : ''}
              {rosterStats.needAnchor > 0 && rosterStats.needRef > 0 ? ' · ' : ''}
              {rosterStats.needRef > 0 ? `${rosterStats.needRef} 场缺参考图` : ''}
            </p>
          ) : null}

          <div className="ss-card__actions">
            <button
              type="button"
              className="ss-btn ss-btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
            >
              开表
            </button>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={closeStudio}
        title="场景设定 · 场记台"
        subtitle="先从库选场景 · 再改设定与参考"
        width={920}
        variant="default"
        className="ss-modal"
      >
        <div className="ss ss-studio">
          <div className="ss-studio__tabs" role="tablist">
            {(
              [
                { id: 'library' as const, label: '库' },
                { id: 'profile' as const, label: '设定' },
                { id: 'refs' as const, label: '参考' },
              ] as const
            ).map((tab) => {
              const lockedTab = tab.id !== 'library' && !canEditTabs;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  disabled={lockedTab}
                  className={`ss-studio__tab ${studioTab === tab.id ? 'is-on' : ''} ${lockedTab ? 'is-dim' : ''}`}
                  onClick={() => tryOpenTab(tab.id)}
                  title={lockedTab ? '请先在库中选择场景或新建' : undefined}
                >
                  {tab.label}
                  {tab.id === 'library' ? ` · ${roster.length}` : ''}
                  {tab.id !== 'library' && lockedTab ? ' · 锁' : ''}
                  {tab.id === 'refs' && canEditTabs && refCount > 0 ? ` · ${refCount}` : ''}
                </button>
              );
            })}
          </div>

          <div className="ss-studio__body">
            <div className="ss-stats">
              <div className="ss-stats__cell">
                <span className="ss-stats__val">{rosterStats.total}</span>
                <span className="ss-stats__lab">库内场景</span>
              </div>
              <div className="ss-stats__cell">
                <span className="ss-stats__val">{rosterStats.ready}</span>
                <span className="ss-stats__lab">齐备</span>
              </div>
              <div className="ss-stats__cell">
                <span className="ss-stats__val">{rosterStats.needAnchor}</span>
                <span className="ss-stats__lab">缺锚点</span>
              </div>
              <div className="ss-stats__cell">
                <span className="ss-stats__val">{rosterStats.needRef}</span>
                <span className="ss-stats__lab">缺参考</span>
              </div>
            </div>

            {!canEditTabs && studioTab === 'library' && (
              <p className="ss-warn">
                请先点选下方库内场景，或「新建空白」，再进入设定 / 参考。
              </p>
            )}

            {canEditTabs && duplicate && (
              <p className="ss-warn">场景名与库内已有场景重复，保存会覆盖同 id 或产生歧义，请核对。</p>
            )}

            {canEditTabs && (
              <div className="ss-session-bar">
                当前编辑：
                <b>{sceneName.trim() || '（未命名新建）'}</b>
                {sceneCode.trim() ? ` · ${sceneCode.trim()}` : ''}
                <button
                  type="button"
                  className="ss-btn ss-btn--ghost ss-btn--sm"
                  onClick={() => {
                    setSessionPicked(false);
                    setStudioTab('library');
                  }}
                >
                  重选
                </button>
              </div>
            )}

            {studioTab === 'library' && (
              <>
                <div className="ss-panel__head" style={{ marginBottom: 10 }}>
                  <h3 className="ss-panel__title">场景场记</h3>
                  <button type="button" className="ss-btn ss-btn--soft ss-btn--sm" onClick={createScene}>
                    <Plus size={12} /> 新建空白
                  </button>
                </div>
                {roster.length === 0 ? (
                  <div className="ss-empty">
                    暂无场景。可新建，或由剧本拆分 / 设定检查补入后再选。
                  </div>
                ) : (
                  <ul className="ss-lib-list">
                    {roster.map((row) => {
                      const thumb =
                        row.env?.referenceUrls?.[0]
                        || row.env?.referenceImageUrl
                        || (() => {
                          const c = (row.backlot?.creative ?? {}) as Record<string, unknown>;
                          const refs = Array.isArray(c.referenceUrls)
                            ? (c.referenceUrls.filter(Boolean) as string[])
                            : [];
                          return refs[0];
                        })();
                      const active = canEditTabs && (
                        row.env?.id === data.sceneAssetId
                        || row.backlot?.id === data.sceneLibraryId
                        || row.name.trim() === sceneName.trim()
                      );
                      return (
                        <li key={row.key}>
                          <button
                            type="button"
                            className={`ss-lib-item ${active ? 'is-on' : ''}`}
                            onClick={() => loadRosterRow(row)}
                          >
                            {thumb ? (
                              <img src={thumb} alt="" className="ss-lib-thumb" style={{ width: 48, height: 32 }} />
                            ) : (
                              <span className="ss-lib-thumb is-empty" style={{ width: 48, height: 32 }}>
                                <MapPin size={14} />
                              </span>
                            )}
                            <span className="ss-lib-body">
                              <span className="ss-lib-name">{row.name}</span>
                              <span className="ss-lib-meta">
                                {row.code !== '—' ? `${row.code} · ` : ''}
                                {row.summary}
                              </span>
                            </span>
                            <span className={`ss-mini__badge is-${row.tone}`}>{row.status}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {studioTab === 'profile' && canEditTabs && (
              <>
                <div className="ss-panel">
                  <div className="ss-panel__head">
                    <h3 className="ss-panel__title">资产关联</h3>
                    <span className="ss-panel__meta">可选 · 链到场景库条目</span>
                  </div>
                  <AssetLinkField
                    kind="scene"
                    assetRef={assetRef}
                    onChange={(ref) => {
                      const patch = patchWithAssetRef(ref);
                      commit(ref
                        ? { ...patch, sceneLibraryId: ref.id, sceneName: ref.label }
                        : patch);
                    }}
                  />
                </div>

                <div className="ss-grid-2">
                  <label className="ss-field">
                    <span className="ss-label">场景名 <span className="is-req">必填</span></span>
                    <input
                      className="ss-input"
                      value={sceneName}
                      onChange={(e) => commit({ sceneName: e.target.value })}
                      placeholder="雨夜街道 / 咖啡馆内…"
                    />
                  </label>
                  <label className="ss-field">
                    <span className="ss-label">场景码</span>
                    <input
                      className="ss-input"
                      value={sceneCode}
                      onChange={(e) => commit({ sceneCode: e.target.value })}
                      placeholder="1-1 / S01"
                    />
                  </label>
                </div>

                <label className="ss-field">
                  <span className="ss-label">空间锚点 <span className="is-req">必填</span></span>
                  <textarea
                    className="ss-textarea"
                    value={description}
                    onChange={(e) => commit({ description: e.target.value })}
                    placeholder="空间布局、建筑结构、材质、固定标识物…（跨镜保持一致）"
                  />
                </label>

                <div className="ss-grid-2">
                  <label className="ss-field">
                    <span className="ss-label">时代 / 地域</span>
                    <input
                      className="ss-input"
                      value={era}
                      onChange={(e) => commit({ era: e.target.value })}
                      placeholder="现代都市 · 江南水乡"
                    />
                  </label>
                  <label className="ss-field">
                    <span className="ss-label">天气</span>
                    <input
                      className="ss-input"
                      value={weather}
                      onChange={(e) => commit({ weather: e.target.value })}
                      placeholder="阴雨 · 雾 · 晴"
                    />
                  </label>
                  <label className="ss-field">
                    <span className="ss-label">光线</span>
                    <input
                      className="ss-input"
                      value={lighting}
                      onChange={(e) => commit({ lighting: e.target.value })}
                      placeholder="霓虹侧光 · 窗光"
                    />
                  </label>
                  <label className="ss-field">
                    <span className="ss-label">色彩</span>
                    <input
                      className="ss-input"
                      value={colorTone}
                      onChange={(e) => commit({ colorTone: e.target.value })}
                      placeholder="青冷 · 暖琥珀"
                    />
                  </label>
                </div>

                <label className="ss-field">
                  <span className="ss-label">固定道具 / 建筑结构</span>
                  <input
                    className="ss-input"
                    value={propsText}
                    onChange={(e) => commit({ props: splitList(e.target.value) })}
                    placeholder="路灯、铁门、吧台…"
                  />
                </label>

                <label className="ss-field">
                  <span className="ss-label">禁改项 / 污染防护</span>
                  <input
                    className="ss-input"
                    value={forbidden}
                    onChange={(e) => commit({ forbiddenSceneDrift: e.target.value })}
                    placeholder="不可改变的建筑轮廓、主光源方向…"
                  />
                </label>
              </>
            )}

            {studioTab === 'refs' && canEditTabs && (
              <>
                <div className="ss-panel">
                  <div className="ss-panel__head">
                    <h3 className="ss-panel__title">
                      参考图
                      {' '}
                      <span className="ss-panel__meta">最多 {MAX_ENV_REFERENCE_IMAGES} 张</span>
                    </h3>
                    <button
                      type="button"
                      className="ss-btn ss-btn--ghost ss-btn--sm"
                      onClick={fillFromUpstream}
                    >
                      用上游图
                    </button>
                  </div>
                  <div className="ss-views" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                    <div className="ss-slot">
                      <ImageUploadSlot
                        url=""
                        label="上传参考"
                        compact
                        onUploaded={addRef}
                      />
                    </div>
                    {referenceUrls.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        className="ss-slot"
                        title="点击移除"
                        onClick={() =>
                          commit({
                            referenceUrls: referenceUrls.filter((_, i) => i !== index),
                          })
                        }
                        style={{
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          overflow: 'hidden',
                          padding: 0,
                          background: '#161719',
                          cursor: 'pointer',
                        }}
                      >
                        <img
                          src={url}
                          alt=""
                          style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ss-panel">
                  <div className="ss-panel__head">
                    <h3 className="ss-panel__title">一致性 Prompt</h3>
                    <span className="ss-panel__meta">自动生成 · 随设定更新</span>
                  </div>
                  <pre className="ss-prompt">{prompt || '填写场景名与空间锚点后生成'}</pre>
                </div>
              </>
            )}
          </div>

          <div className="ss-studio__foot">
            {canEditTabs ? (
              <label className="ss-check">
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => commit({ assetLocked: e.target.checked })}
                />
                锁定一致性
              </label>
            ) : (
              <span className="ss-check">先从库选场景</span>
            )}
            <p className="ss-studio__foot-hint">
              {canEditTabs
                ? `${sceneName.trim() || '未命名'} · 健康 ${health}/5 · 参考 ${refCount}/${MAX_ENV_REFERENCE_IMAGES}`
                : `场记 ${rosterStats.total} 场 · 齐备 ${rosterStats.ready} · 待补 ${rosterStats.pending}`}
            </p>
            <div className="ss-studio__foot-actions">
              {canEditTabs && studioTab !== 'refs' ? (
                <button
                  type="button"
                  className="ss-btn ss-btn--ghost"
                  onClick={() => setStudioTab(studioTab === 'library' ? 'profile' : 'refs')}
                >
                  下一步
                </button>
              ) : null}
              <button
                type="button"
                className="ss-btn ss-btn--primary"
                disabled={!canEditTabs}
                onClick={saveToLibraries}
              >
                <ShieldCheck size={13} /> 保存到场景库
              </button>
            </div>
          </div>
        </div>
      </ScreenModal>
    </div>
  );
}

export default memo(SceneCardBlock);
