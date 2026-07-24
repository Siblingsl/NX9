import { memo, useCallback, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  isScreenplayPackage,
  type ScreenplayPackage,
  type ScriptBreakdownPayload,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useAssetLibraryModalUi } from '../../stores/asset-library-modal-ui';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  applyBibleDraftsToLibrary,
  checkAssetHealth,
  inspectBibleAssets,
  inspectBreakdownAssets,
  syncBibleAssets,
  syncBreakdownAssets,
} from '../../engine/asset-gate-runner';
import './asset-gate.css';

/** 总览 · 角色清单 · 场景清单 · 剧本支撑 */
type StudioTab = 'overview' | 'characters' | 'scenes' | 'bible-support';

function compact(text: string, max = 28) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function useUpstreamScreenplay(blockId: string): ScreenplayPackage | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = getEdges().filter((edge) => edge.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      if (isScreenplayPackage(data?.package)) return data!.package as ScreenplayPackage;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = getEdges().filter((edge) => edge.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = (
        data?.legacyScriptBreakdown
        ?? data?.scriptBreakdown
      ) as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function AssetGateBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((state) => state.append);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('overview');
  const openAssetAt = useAssetLibraryModalUi((s) => s.openAt);
  const upstreamPackage = useUpstreamScreenplay(props.id);
  const localPackage = isScreenplayPackage(props.data?.package)
    ? props.data!.package as ScreenplayPackage
    : undefined;
  const screenplayPkg = upstreamPackage ?? localPackage;
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = upstream ?? local;
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const liveReport = useMemo(() => {
    if (screenplayPkg) return inspectBibleAssets(screenplayPkg);
    if (payload) return inspectBreakdownAssets(payload);
    return null;
  }, [payload, screenplayPkg]);
  const lastGate = props.data?.assetGate as {
    missingCharacters?: string[];
    missingScenes?: string[];
    syncedCharacters?: number;
    syncedScenes?: number;
    checkedAt?: string;
    requiredCharacters?: string[];
    requiredScenes?: string[];
  } | undefined;

  const requiredCharacters = lastGate?.requiredCharacters
    ?? liveReport?.requiredCharacters
    ?? [];
  const requiredScenes = lastGate?.requiredScenes
    ?? liveReport?.requiredScenes
    ?? [];
  // 实时缺口优先用 live inspect，保证库变更后卡面立刻更新
  const missingCharacters = liveReport?.missingCharacters
    ?? lastGate?.missingCharacters
    ?? [];
  const missingScenes = liveReport?.missingScenes
    ?? lastGate?.missingScenes
    ?? [];
  const charN = requiredCharacters.length || (liveReport?.requiredCharacters.length ?? 0);
  const sceneN = requiredScenes.length || (liveReport?.requiredScenes.length ?? 0);
  const missC = missingCharacters.length;
  const missS = missingScenes.length;
  const hasChecked = Boolean(lastGate?.checkedAt) || status === 'success';
  const hasSource = Boolean(screenplayPkg || payload);
  const canSync = hasSource && hasChecked && (missC > 0 || missS > 0);
  const passed = hasChecked && missC === 0 && missS === 0 && hasSource;
  const syncedC = lastGate?.syncedCharacters ?? 0;
  const syncedS = lastGate?.syncedScenes ?? 0;
  const costItems = useWorkspaceDocument((s) => s.backlotWorkspace.items.filter((i: { kind: string }) => i.kind === 'costume'));
  const costumeReady = costItems.filter((i: { promptZh?: string; promptEn?: string }) => i.promptZh || i.promptEn).length;
  const costumeTotal = costItems.length;

  const charTotal = Math.max(1, requiredCharacters.length || 1);
  const readyRate = Math.round(((charTotal - missC) / charTotal) * 100);
  const sourceLabel = screenplayPkg ? 'Bible' : payload ? '旧镜表' : '—';
  const [syncing, setSyncing] = useState(false);

  const health = useMemo(() => screenplayPkg ? checkAssetHealth(screenplayPkg) : null, [screenplayPkg]);

  const runSync = useCallback(() => {
    if (!screenplayPkg) return;
    setSyncing(true);
    try {
      const result = syncBibleAssets(props.id, screenplayPkg, { autoIngest: true });
      updateNodeData(props.id, {
        status: 'success',
        package: screenplayPkg,
        assetGate: {
          missingCharacters: result.missingCharacters,
          missingScenes: result.missingScenes,
          requiredCharacters: result.requiredCharacters,
          requiredScenes: result.requiredScenes,
          syncedCharacters: result.syncedCharacters,
          syncedScenes: result.syncedScenes,
          checkedAt: new Date().toISOString(),
          source: result.source,
        },
      });
      appendLog(`设定检查 · 显式同步入库完成 · 角色 ${result.syncedCharacters} / 场景 ${result.syncedScenes}`);
    } catch (e) {
      appendLog(`同步入库失败：${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, [appendLog, props.id, screenplayPkg, updateNodeData]);

  const runAdoptDrafts = useCallback(() => {
    if (!screenplayPkg) return;
    const result = applyBibleDraftsToLibrary(screenplayPkg);
    appendLog(`设定检查 · 已采用 Bible draft 字段 · 角色 ${result.updatedCharacters} / 场景 ${result.updatedScenes}`);
  }, [appendLog, screenplayPkg]);

  const runCheck = useCallback(() => {
    if (!screenplayPkg && !payload) {
      updateNodeData(props.id, { status: 'error', error: '请先连接编剧台（Bible draft）' });
      appendLog('设定检查：缺少编剧台 Bible / 成稿数据');
      return;
    }
    updateNodeData(props.id, { status: 'running', error: undefined });
    // 默认不自动入库；仅对照报告（O-13 倾向关）
    const result = screenplayPkg
      ? syncBibleAssets(props.id, screenplayPkg, { autoIngest: false })
      : syncBreakdownAssets(props.id, payload!);
    updateNodeData(props.id, {
      status: 'success',
      ...(screenplayPkg ? { package: screenplayPkg } : { scriptBreakdown: payload }),
      assetGate: {
        missingCharacters: result.missingCharacters,
        missingScenes: result.missingScenes,
        requiredCharacters: result.requiredCharacters,
        requiredScenes: result.requiredScenes,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
        checkedAt: new Date().toISOString(),
        source: result.source,
      },
      content: `设定检查完成 · 角色 ${result.requiredCharacters.length} / 场景 ${result.requiredScenes.length}`,
      output: result.requiredCharacters.join('、'),
      meta: {
        requiredCharacters: result.requiredCharacters.length,
        requiredScenes: result.requiredScenes.length,
        missingCharacters: result.missingCharacters.length,
        missingScenes: result.missingScenes.length,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
      },
    });
    appendLog(
      screenplayPkg
        ? `设定检查完成（Bible）· 缺口角色 ${result.missingCharacters.length} / 场景 ${result.missingScenes.length}（未自动入库）`
        : `设定检查完成 · 新角色 ${result.syncedCharacters} / 新场景 ${result.syncedScenes}`,
    );
    setStudioTab(result.missingCharacters.length ? 'characters'
      : result.missingScenes.length ? 'scenes'
        : 'overview');
    setStudioOpen(true);
  }, [appendLog, payload, props.id, screenplayPkg, updateNodeData]);

  const openStudio = useCallback(() => {
    setStudioOpen(true);
    if (!hasSource) setStudioTab('overview');
  }, [hasSource]);

  const cardStatusText = !hasSource
    ? '待接编剧台'
    : status === 'running'
      ? '检查中'
      : passed
        ? '可放行'
        : hasChecked
          ? `缺口 ${missC + missS}`
          : '待检查';
  const cardStatusClass = !hasSource
    ? ''
    : status === 'running'
      ? 'is-run'
      : passed
        ? 'is-ready'
        : hasChecked
          ? 'is-warn'
          : '';


  const charRows = useMemo(() => {
    const names = requiredCharacters.length
      ? requiredCharacters
      : (liveReport?.requiredCharacters ?? []);
    const miss = new Set(missingCharacters);
    return names.map((name) => ({
      name,
      ok: !miss.has(name),
      status: miss.has(name) ? '缺口' : '已有',
      tone: (miss.has(name) ? 'warn' : 'ok') as 'warn' | 'ok',
    }));
  }, [liveReport?.requiredCharacters, missingCharacters, requiredCharacters]);

  const sceneRows = useMemo(() => {
    const names = requiredScenes.length
      ? requiredScenes
      : (liveReport?.requiredScenes ?? []);
    const miss = new Set(missingScenes);
    return names.map((name) => ({
      name,
      ok: !miss.has(name),
      status: miss.has(name) ? '缺口' : '已有',
      tone: (miss.has(name) ? 'warn' : 'ok') as 'warn' | 'ok',
    }));
  }, [liveReport?.requiredScenes, missingScenes, requiredScenes]);

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="ag ag-card nodrag nopan">
          <div className="ag-card__toolbar">
            <span className={`ag-card__status ${cardStatusClass}`}>{cardStatusText}</span>
            <span className="ag-card__counts">
              角 <b>{charN}</b>
              {' · '}
              场 <b>{sceneN}</b>
            </span>
          </div>

          <button
            type="button"
            className="ag-summary-card"
            onClick={openStudio}
            title="打开设定检查台"
          >
             {hasSource ? (
              <>
                <div className="ag-summary-card__hero">
                  <div>
                    <span className="ag-summary-card__eyebrow">设定门禁</span>
                    <strong>
                      {passed
                        ? '资产齐备，可放行分镜'
                        : hasChecked
                          ? (missC + missS > 0 ? `缺口 ${missC + missS} · 需补齐` : '已检查')
                          : '待运行检查'}
                    </strong>
                    <p>
                      {passed
                        ? '角色与场景库均覆盖剧本需求，可进入分镜台。'
                        : missC + missS > 0
                          ? `角色缺口 ${missC} · 场景缺口 ${missS}；检查后可同步入库。`
                          : '连接编剧台 Bible draft 后运行检查，识别角色/场景需求与缺口。'}
                    </p>
                  </div>
                  <span className="ag-summary-card__metric">
                    {missC + missS}
                    <small>缺</small>
                  </span>
                </div>
                <div className="ag-summary-card__stats" aria-label="设定检查摘要">
                  <span><b>{charN}</b> 角色</span>
                  <span><b>{sceneN}</b> 场景</span>
                  <span><b>{readyRate}%</b> 就绪</span>
                  <span><b>{passed ? '放行' : hasChecked ? '阻断' : '待检'}</b></span>
                </div>
                <div className="ag-summary-card__trail">
                  {canSync ? '检查并同步可入库（默认不自动入库）' : passed ? '放行后可进入分镜台' : '门禁：检查 → 补缺口 → 放行'}
                </div>
              </>
            ) : (
              <>
                <div className="ag-summary-card__hero is-empty">
                  <div>
                    <span className="ag-summary-card__eyebrow">等待上游</span>
                    <strong>连接编剧台</strong>
                    <p>接入 Bible draft 后检查角色 / 场景缺口（默认不自动入库）。</p>
                  </div>
                  <span className="ag-summary-card__metric">
                    —
                    <small>门</small>
                  </span>
                </div>
                <div className="ag-summary-card__stats" aria-label="等待状态">
                  <span><b>0</b> 角色</span>
                  <span><b>0</b> 场景</span>
                  <span><b>待接</b> 上游</span>
                </div>
                <div className="ag-summary-card__chips">
                  <span>角色需求</span>
                  <span>场景需求</span>
                  <span>同步入库</span>
                </div>
                <div className="ag-summary-card__trail">
                  连接编剧台后运行检查
                </div>
              </>
            )}
          </button>

          {hasSource && (missC > 0 || missS > 0) ? (
            <p className="ag-card__hint is-warn">
              {missC > 0 ? `缺 ${missC} 角色` : ''}
              {missC > 0 && missS > 0 ? ' · ' : ''}
              {missS > 0 ? `缺 ${missS} 场景` : ''}
              {' · 检查报告缺口（Bible 默认不自动入库）'}
            </p>
          ) : null}

          <div className="ag-card__actions">
            <button
              type="button"
              className="ag-btn ag-btn--ghost"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
            >
              报告
            </button>
            <button
              type="button"
              className="ag-btn ag-btn--primary"
              disabled={status === 'running' || !hasSource}
              onClick={(e) => {
                e.stopPropagation();
                runCheck();
              }}
            >
              {status === 'running' ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> 检查中
                </>
              ) : hasSource ? (
                '检查'
              ) : (
                '等待编剧台'
              )}
            </button>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="设定检查 · 门禁台"
        subtitle="角色 / 场景缺口 · 同步入库 · 放行分镜"
        width={920}
        variant="default"
        className="ag-modal"
      >
        <div className="ag ag-studio">
          <div className="ag-studio__tabs" role="tablist">
            {(
              [
                { id: 'overview' as const, label: '总览' },
                { id: 'characters' as const, label: '角色' },
                { id: 'scenes' as const, label: '场景' },
                { id: 'bible-support' as const, label: '剧本支撑' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`ag-studio__tab ${studioTab === tab.id ? 'is-on' : ''}`}
                onClick={() => setStudioTab(tab.id)}
              >
                {tab.label}
                {tab.id === 'characters' && charN ? ` · ${charN}` : ''}
                {tab.id === 'scenes' && sceneN ? ` · ${sceneN}` : ''}
                {tab.id === 'characters' && missC ? ` · 缺${missC}` : ''}
                {tab.id === 'scenes' && missS ? ` · 缺${missS}` : ''}
              </button>
            ))}
          </div>

          <div className="ag-studio__body">
            <div className="ag-stats">
              <div className="ag-stats__cell">
                <span className="ag-stats__val">{charN}</span>
                <span className="ag-stats__lab">角色需求</span>
              </div>
              <div className="ag-stats__cell">
                <span className="ag-stats__val" style={missC ? { color: 'var(--ag-warn)' } : undefined}>
                  {missC}
                </span>
                <span className="ag-stats__lab">角色缺口</span>
              </div>
              <div className="ag-stats__cell">
                <span className="ag-stats__val">{sceneN}</span>
                <span className="ag-stats__lab">场景需求</span>
              </div>
              <div className="ag-stats__cell">
                <span className="ag-stats__val" style={missS ? { color: 'var(--ag-warn)' } : undefined}>
                  {missS}
                </span>
                <span className="ag-stats__lab">场景缺口</span>
              </div>
            </div>

            {!hasSource && (
              <p className="ag-warn">
                请先连接上游「编剧台」节点（需有 Bible draft / 成稿），再运行检查。
              </p>
            )}

            {hasSource && hasChecked && passed && (
              <p className="ag-session-bar" style={{ borderColor: 'rgba(143,184,154,0.35)' }}>
                <ShieldCheck size={14} style={{ color: 'var(--ag-ok)' }} />
                门禁通过 · 角色 / 场景已齐，可放行分镜网格
                {syncedC || syncedS
                  ? ` · 本轮同步 角色 ${syncedC} / 场景 ${syncedS}`
                  : ''}
              </p>
            )}

            {hasSource && (missC > 0 || missS > 0) && (
              <p className="ag-warn">
                存在资产缺口。Bible 路径默认仅报告；迁移旧镜表路径仍可同步候选入库。
              </p>
            )}

            {studioTab === 'overview' && (
              <>
                <div className="ag-panel">
                  <div className="ag-panel__head">
                    <h3 className="ag-panel__title">门禁摘要</h3>
                    <span className="ag-panel__meta">
                      {screenplayPkg?.brief.title
                        || payload?.title
                        ? compact(String(screenplayPkg?.brief.title || payload?.title || ''), 24)
                        : '无标题'}
                    </span>
                  </div>
                  <div className="ag-mini" style={{ cursor: 'default' }}>
                    <div className="ag-mini__head ag-mini__head--roster">
                      <span>维度</span>
                      <span>需求</span>
                      <span>判定</span>
                    </div>
                    <div className="ag-mini__row ag-mini__row--roster">
                      <span className="is-title">角色库</span>
                      <span>{charN} 个</span>
                      <span className={`ag-mini__badge is-${missC ? 'warn' : charN ? 'ok' : 'todo'}`}>
                        {missC ? `缺 ${missC}` : charN ? '齐' : '—'}
                      </span>
                    </div>
                    <div className="ag-mini__row ag-mini__row--roster">
                      <span className="is-title">场景库</span>
                      <span>{sceneN} 个</span>
                      <span className={`ag-mini__badge is-${missS ? 'warn' : sceneN ? 'ok' : 'todo'}`}>
                        {missS ? `缺 ${missS}` : sceneN ? '齐' : '—'}
                      </span>
                    </div>
                    <div className="ag-mini__row ag-mini__row--roster">
                      <span className="is-title">分镜放行</span>
                      <span>{hasChecked ? '已检查' : '未检查'}</span>
                      <span className={`ag-mini__badge is-${passed ? 'ok' : hasChecked ? 'warn' : 'todo'}`}>
                        {passed ? '可放行' : hasChecked ? '阻断' : '待命'}
                      </span>
                    </div>
                    <div className="ag-mini__row ag-mini__row--roster">
                      <span className="is-title">服装道具</span>
                      <span>{costumeTotal} 项</span>
                      <span className={`ag-mini__badge is-${costumeReady === costumeTotal && costumeTotal > 0 ? 'ok' : costumeTotal > 0 ? 'warn' : 'todo'}`}>
                        {costumeTotal === 0 ? '待录入' : `${costumeReady}/${costumeTotal} 就绪`}
                      </span>
                    </div>
                  </div>
                </div>

                {(missC > 0 || missS > 0) && (
                  <div className="ag-panel">
                    <div className="ag-panel__head">
                      <h3 className="ag-panel__title">当前缺口速览</h3>
                      {screenplayPkg && (
                        <button
                          type="button"
                          className="ag-btn ag-btn--primary"
                          style={{ fontSize: 9, padding: '2px 8px', height: 24 }}
                          disabled={syncing}
                          onClick={runSync}
                        >
                          {syncing ? '同步中…' : '同步入库'}
                        </button>
                      )}
                    </div>
                    {missC > 0 && (
                      <p className="ag-lib-meta" style={{ marginBottom: 8 }}>
                        角色：{missingCharacters.slice(0, 8).join('、')}
                        {missC > 8 ? ` 等 ${missC} 人` : ''}
                      </p>
                    )}
                    {missS > 0 && (
                      <p className="ag-lib-meta">
                        场景：{missingScenes.slice(0, 8).join('、')}
                        {missS > 8 ? ` 等 ${missS} 场` : ''}
                      </p>
                    )}
                  </div>
                )}

                {health && (health.unhealthyCharacterNames.length > 0 || health.unhealthySceneNames.length > 0) && (
                  <div className="ag-panel" style={{ borderColor: 'var(--ag-warn)' }}>
                    <div className="ag-panel__head">
                      <h3 className="ag-panel__title" style={{ color: 'var(--ag-warn)' }}>健康度 · 需完善</h3>
                      <button
                        type="button"
                        className="ag-btn ag-btn--ghost"
                        style={{ fontSize: 9, padding: '2px 8px', height: 24 }}
                        onClick={runAdoptDrafts}
                      >
                        采用 draft 字段
                      </button>
                    </div>
                    {health.unhealthyCharacterNames.length > 0 && (
                      <p className="ag-lib-meta" style={{ marginBottom: 8 }}>
                        角色缺参考图/提示词：{health.unhealthyCharacterNames.join('、')}
                      </p>
                    )}
                    {health.unhealthySceneNames.length > 0 && (
                      <p className="ag-lib-meta">
                        场景缺参考图/描述：{health.unhealthySceneNames.join('、')}
                      </p>
                    )}
                  </div>
                )}

                {hasChecked && (
                  <div className="ag-panel">
                    <div className="ag-panel__head">
                      <h3 className="ag-panel__title">最近一次同步</h3>
                      <span className="ag-panel__meta">
                        {lastGate?.checkedAt
                          ? new Date(lastGate.checkedAt).toLocaleString()
                          : '—'}
                      </span>
                    </div>
                    <p className="ag-lib-meta">
                      新入库角色 {syncedC} · 新入库场景 {syncedS}
                    </p>
                  </div>
                )}
              </>
            )}

            {studioTab === 'characters' && (
              <>
                <div className="ag-panel__head" style={{ marginBottom: 10 }}>
                  <h3 className="ag-panel__title">角色清单</h3>
                  <span className="ag-panel__meta">
                    需求 {charRows.length} · 缺口 {missC}
                  </span>
                </div>
                {charRows.length === 0 ? (
                  <div className="ag-empty">
                    {hasSource ? 'Bible / 上游未识别到角色' : '等待编剧台'}
                  </div>
                ) : (
                  <ul className="ag-lib-list">
                    {charRows.map((row) => (
                      <li key={row.name}>
                        <div className={`ag-lib-item ${row.ok ? '' : 'is-on'}`} style={{ cursor: 'default' }}>
                          <span className="ag-lib-body">
                            <span className="ag-lib-name">{row.name}</span>
                            <span className="ag-lib-meta">
                              {row.ok ? '角色库已有 · 可跨镜保持一致' : '库内缺失 · 同步后可去角色设定完善'}
                            </span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button type="button" className="ag-btn ag-btn--ghost" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => openAssetAt({ tab: 'character', query: row.name, scope: 'private' })}>
                              在素材库打开
                            </button>
                            <span className={`ag-mini__badge is-${row.tone}`}>{row.status}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {studioTab === 'scenes' && (
              <>
                <div className="ag-panel__head" style={{ marginBottom: 10 }}>
                  <h3 className="ag-panel__title">场景清单</h3>
                  <span className="ag-panel__meta">
                    需求 {sceneRows.length} · 缺口 {missS}
                  </span>
                </div>
                {sceneRows.length === 0 ? (
                  <div className="ag-empty">
                    {hasSource ? 'Bible / 上游未识别到场景' : '等待编剧台'}
                  </div>
                ) : (
                  <ul className="ag-lib-list">
                    {sceneRows.map((row) => (
                      <li key={row.name}>
                        <div className={`ag-lib-item ${row.ok ? '' : 'is-on'}`} style={{ cursor: 'default' }}>
                          <span className="ag-lib-body">
                            <span className="ag-lib-name">{row.name}</span>
                            <span className="ag-lib-meta">
                              {row.ok ? '场景库已有 · 空间锚点可复用' : '库内缺失 · 同步后可去场景设定完善'}
                            </span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button type="button" className="ag-btn ag-btn--ghost" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => openAssetAt({ tab: 'scene', query: row.name, scope: 'private' })}>
                              在素材库打开
                            </button>
                            <span className={`ag-mini__badge is-${row.tone}`}>{row.status}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {studioTab === 'bible-support' && screenplayPkg && (
              <div className="space-y-3">
                <div className="ag-panel__head" style={{ marginBottom: 10 }}>
                  <h3 className="ag-panel__title">剧本支撑 · Bible draft（只读）</h3>
                  <span className="ag-panel__meta">来自编剧台 · 叙事层 draft</span>
                </div>
                <p className="text-[11px] text-ink/50 mb-2">下文是编剧台 Biography draft 中人物/场景的叙事字段，供对照参考。</p>
                <div className="sg-panel" style={{ padding: 8 }}>
                  <div className="sg-section-label" style={{ color: 'var(--ag-muted)', marginBottom: 8 }}>人物</div>
                  {screenplayPkg.bible.characters.length === 0 ? (
                    <div className="ag-empty">无人物 draft</div>
                  ) : (
                    <ul className="space-y-2">
                      {screenplayPkg.bible.characters.slice(0, 20).map((c) => (
                        <li key={c.id} className="border border-line rounded-lg p-2 text-[11px]">
                          <strong>{c.name}</strong>
                          {c.identity || c.personality ? ` · ${[c.identity, c.personality, c.appearance].filter(Boolean).join(' · ')}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="sg-section-label" style={{ color: 'var(--ag-muted)', margin: '12px 0 8px' }}>场景</div>
                  {screenplayPkg.bible.scenes.length === 0 ? (
                    <div className="ag-empty">无场景 draft</div>
                  ) : (
                    <ul className="space-y-2">
                      {screenplayPkg.bible.scenes.slice(0, 20).map((s) => (
                        <li key={s.id} className="border border-line rounded-lg p-2 text-[11px]">
                          <strong>{s.name}</strong>
                          {s.code ? ` (${s.code})` : ''}
                          {s.summary || s.location ? ` · ${s.summary || s.location}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="ag-studio__foot">
            <p className="ag-studio__foot-hint">
              {!hasSource
                ? '连接编剧台后，可核对角色 / 场景是否入库'
                : passed
                  ? '门禁通过 · 可进入分镜网格生产'
                  : `角色缺口 ${missC} · 场景缺口 ${missS}（Bible 默认不自动入库）`}
            </p>
            <div className="ag-studio__foot-actions">
              {studioTab === 'overview' && missC > 0 ? (
                <button
                  type="button"
                  className="ag-btn ag-btn--ghost"
                  onClick={() => setStudioTab('characters')}
                >
                  看角色
                </button>
              ) : null}
              {studioTab === 'overview' && missS > 0 ? (
                <button
                  type="button"
                  className="ag-btn ag-btn--ghost"
                  onClick={() => setStudioTab('scenes')}
                >
                  看场景
                </button>
              ) : null}
              <button
                type="button"
                className="ag-btn ag-btn--primary"
                disabled={status === 'running' || !hasSource}
                onClick={runCheck}
              >
                {status === 'running' ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> 检查中
                  </>
                ) : hasChecked ? (
                  <>
                    <ShieldCheck size={13} /> 重新检查
                  </>
                ) : (
                  <>
                    <ShieldCheck size={13} /> 检查
                  </>
                )}
              </button>
              {hasChecked && !passed && hasSource && (
                <button type="button" className="ag-btn ag-btn--ghost" onClick={() => { updateNodeData(props.id, { assetGate: { ...lastGate, passed: true, releasedAt: new Date().toISOString() }, meta: { type: 'asset-gate-passed', checkedAt: lastGate?.checkedAt, requiredCharacters: requiredCharacters.length, requiredScenes: requiredScenes.length, missingCharacters: missC, missingScenes: missS } }); appendLog('设定检查：已放行（可配置下游消费）'); }}>
                  放行（临时跳过缺口）
                </button>
              )}
            </div>
          </div>
        </div>
      </ScreenModal>
    </div>
  );
}

export default memo(AssetGateBlock);
