import { memo, useCallback, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import type { ScriptBreakdownPayload } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { inspectBreakdownAssets, syncBreakdownAssets } from '../../engine/asset-gate-runner';
import './asset-gate.css';

/** 总览 · 角色清单 · 场景清单 */
type StudioTab = 'overview' | 'characters' | 'scenes';

function compact(text: string, max = 28) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = getEdges().filter((edge) => edge.target === blockId);
    for (const edge of incoming) {
      const payload = (byId.get(edge.source)?.data as Record<string, unknown> | undefined)
        ?.scriptBreakdown as ScriptBreakdownPayload | undefined;
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
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = upstream ?? local;
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const liveReport = useMemo(() => (payload ? inspectBreakdownAssets(payload) : null), [payload]);
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
  const passed = hasChecked && missC === 0 && missS === 0 && Boolean(payload);
  const syncedC = lastGate?.syncedCharacters ?? 0;
  const syncedS = lastGate?.syncedScenes ?? 0;

  const runCheck = useCallback(() => {
    if (!payload) {
      updateNodeData(props.id, { status: 'error', error: '请先连接剧本拆分节点' });
      appendLog('设定检查：缺少剧本拆分数据');
      return;
    }
    updateNodeData(props.id, { status: 'running', error: undefined });
    const result = syncBreakdownAssets(props.id, payload);
    updateNodeData(props.id, {
      status: 'success',
      scriptBreakdown: payload,
      assetGate: {
        missingCharacters: result.missingCharacters,
        missingScenes: result.missingScenes,
        requiredCharacters: result.requiredCharacters,
        requiredScenes: result.requiredScenes,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
        checkedAt: new Date().toISOString(),
      },
      content: `设定检查完成 · 角色 ${result.requiredCharacters.length} / 场景 ${result.requiredScenes.length}`,
      output: payload.episodes
        .flatMap((episode) => episode.shots.map((shot) => shot.imagePrompt))
        .join('\n\n'),
      meta: {
        requiredCharacters: result.requiredCharacters.length,
        requiredScenes: result.requiredScenes.length,
        missingCharacters: result.missingCharacters.length,
        missingScenes: result.missingScenes.length,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
      },
    });
    appendLog(`设定检查完成 · 新角色 ${result.syncedCharacters} / 新场景 ${result.syncedScenes}`);
    setStudioTab(result.missingCharacters.length ? 'characters'
      : result.missingScenes.length ? 'scenes'
        : 'overview');
    setStudioOpen(true);
  }, [appendLog, payload, props.id, updateNodeData]);

  const openStudio = useCallback(() => {
    setStudioOpen(true);
    if (!payload) setStudioTab('overview');
  }, [payload]);

  const cardStatusText = !payload
    ? '待接拆分'
    : status === 'running'
      ? '检查中'
      : passed
        ? '可放行'
        : hasChecked
          ? `缺口 ${missC + missS}`
          : '待检查';
  const cardStatusClass = !payload
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
            {payload ? (
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
                          : '连接剧本拆分后运行检查，识别角色/场景需求与缺口。'}
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
                  <span><b>{passed ? '放行' : hasChecked ? '阻断' : '待检'}</b> 门禁</span>
                </div>
                <div className="ag-summary-card__chips">
                  {([
                    ...(missingCharacters.length ? missingCharacters : requiredCharacters).slice(0, 2),
                    ...(missingScenes.length ? missingScenes : requiredScenes).slice(0, 1),
                  ].filter(Boolean).length
                    ? [
                        ...(missingCharacters.length ? missingCharacters : requiredCharacters).slice(0, 2),
                        ...(missingScenes.length ? missingScenes : requiredScenes).slice(0, 1),
                      ]
                    : ['角色需求', '场景需求', '同步入库']
                  ).slice(0, 4).map((label) => (
                    <span key={String(label)}>{compact(String(label), 10)}</span>
                  ))}
                </div>
                <div className="ag-summary-card__trail">
                  {syncedC || syncedS
                    ? `已同步入库 角色 ${syncedC} / 场景 ${syncedS}`
                    : hasChecked
                      ? (passed ? '点击查看门禁报告' : '点击开台补齐缺口')
                      : '点击开台或运行检查'}
                </div>
              </>
            ) : (
              <>
                <div className="ag-summary-card__hero is-empty">
                  <div>
                    <span className="ag-summary-card__eyebrow">等待上游</span>
                    <strong>连接剧本拆分</strong>
                    <p>接入拆分结果后检查角色 / 场景缺口，并可一键同步入库。</p>
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
                  连接剧本拆分节点后运行检查
                </div>
              </>
            )}
          </button>

          {payload && (missC > 0 || missS > 0) ? (
            <p className="ag-card__hint is-warn">
              {missC > 0 ? `缺 ${missC} 角色` : ''}
              {missC > 0 && missS > 0 ? ' · ' : ''}
              {missS > 0 ? `缺 ${missS} 场景` : ''}
              {' · 检查并同步可入库'}
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
              disabled={status === 'running' || !payload}
              onClick={(e) => {
                e.stopPropagation();
                runCheck();
              }}
            >
              {status === 'running' ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> 检查中
                </>
              ) : payload ? (
                '检查'
              ) : (
                '等待拆分'
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

            {!payload && (
              <p className="ag-warn">
                请先连接上游「剧本拆分」节点（需已有拆分结果），再运行检查。
              </p>
            )}

            {payload && hasChecked && passed && (
              <p className="ag-session-bar" style={{ borderColor: 'rgba(143,184,154,0.35)' }}>
                <ShieldCheck size={14} style={{ color: 'var(--ag-ok)' }} />
                门禁通过 · 角色 / 场景已齐，可放行分镜网格
                {syncedC || syncedS
                  ? ` · 本轮同步 角色 ${syncedC} / 场景 ${syncedS}`
                  : ''}
              </p>
            )}

            {payload && (missC > 0 || missS > 0) && (
              <p className="ag-warn">
                存在资产缺口。点「检查并同步」可将拆分候选写入角色库 / 场景库。
              </p>
            )}

            {studioTab === 'overview' && (
              <>
                <div className="ag-panel">
                  <div className="ag-panel__head">
                    <h3 className="ag-panel__title">门禁摘要</h3>
                    <span className="ag-panel__meta">
                      {payload?.title ? compact(payload.title, 24) : '无拆分标题'}
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
                  </div>
                </div>

                {(missC > 0 || missS > 0) && (
                  <div className="ag-panel">
                    <div className="ag-panel__head">
                      <h3 className="ag-panel__title">当前缺口速览</h3>
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
                    {payload ? '拆分结果中未识别到角色' : '等待剧本拆分'}
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
                          <span className={`ag-mini__badge is-${row.tone}`}>{row.status}</span>
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
                    {payload ? '拆分结果中未识别到场景' : '等待剧本拆分'}
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
                          <span className={`ag-mini__badge is-${row.tone}`}>{row.status}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="ag-studio__foot">
            <p className="ag-studio__foot-hint">
              {!payload
                ? '连接剧本拆分后，可核对角色 / 场景是否入库'
                : passed
                  ? '门禁通过 · 可进入分镜网格生产'
                  : `角色缺口 ${missC} · 场景缺口 ${missS} · 同步后写入库`}
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
                disabled={status === 'running' || !payload}
                onClick={runCheck}
              >
                {status === 'running' ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> 检查中
                  </>
                ) : (
                  <>
                    <ShieldCheck size={13} /> 检查并同步
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </ScreenModal>
    </div>
  );
}

export default memo(AssetGateBlock);
