import { useEffect, useMemo, useState } from 'react';
import type {
  AssetLibraryKind,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
} from '@nx9/shared';
import { AlertTriangle, Network, ShieldCheck, X } from 'lucide-react';
import { getAllChainShots } from '../../engine/chain-storyboard-aggregate';
import { collectNodeAssetUsages } from '../../engine/collect-node-asset-refs';
import {
  analyzeAssetLibraryHealth,
  type AssetHealthAnalysis,
  type HealthIssueKey,
  type ImpactShotRef,
} from '../../engine/asset-library-health';
import { rebindInvalidShotRefs, rebindInvalidIdRefs } from '../../engine/asset-ref-rebind';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { toastError, toastSuccess } from '../../stores/toast';
import type { ImpactIdRef } from '../../engine/asset-library-health';

export function useAssetHealthAnalysis(
  characters: CharacterProfile[],
  workspaceItems: BacklotWorkspaceItem[],
  sounds: SoundAssetProfile[],
  styles: import('@nx9/shared').StylePresetProfile[] = [],
): AssetHealthAnalysis {
  const runtime = useFlowRuntime((s) => s.runtime);
  const setAssetUsageIndex = useWorkspaceDocument((s) => s.setAssetUsageIndex);
  const analysis = useMemo(() => {
    const nodes = runtime?.getNodes() ?? [];
    const relationShots = getAllChainShots(nodes, {
      allowGlobalFallback: true,
    });
    const nodeUsages = collectNodeAssetUsages(nodes);
    const previewStyleRefs: import('../../engine/asset-library-health').PreviewStyleRefLike[] = [];
    const timelineSoundIds: string[] = [];
    for (const node of nodes) {
      if (node.type === 'storyboard-desk') {
        const preview = (node.data as { storyboardPreview?: { frames?: Array<{
          id: string;
          sourceShotId?: string;
          styleAssetId?: string | null;
          stylePreset?: string | null;
        }> } } | undefined)?.storyboardPreview;
        for (const frame of preview?.frames ?? []) {
          const styleAssetId = frame.styleAssetId?.trim();
          if (!styleAssetId) continue;
          previewStyleRefs.push({
            frameId: frame.id,
            shotId: frame.sourceShotId,
            styleAssetId,
            label: frame.stylePreset ?? undefined,
          });
        }
      }
      if (node.type === 'clip-editor' || node.type === 'montage') {
        const timeline = (node.data as {
          timeline?: { tracks?: Array<{ clips?: Array<{ soundAssetId?: string | null }> }> };
        } | undefined)?.timeline;
        for (const track of timeline?.tracks ?? []) {
          for (const clip of track.clips ?? []) {
            const sid = clip.soundAssetId?.trim();
            if (sid) timelineSoundIds.push(sid);
          }
        }
      }
    }
    return analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      styles,
      relationShots,
      nodeUsages,
      previewStyleRefs,
      timelineSoundIds,
    });
  }, [characters, workspaceItems, sounds, styles, runtime]);

  // OL-14：健康扫描结果落盘 usage 快照
  useEffect(() => {
    setAssetUsageIndex?.(analysis.usageIndex);
  }, [analysis.usageIndex, setAssetUsageIndex]);

  return analysis;
}

function InvalidRefRepairRow({
  kind,
  row,
  options,
  onRebind,
}: {
  kind: 'character' | 'scene';
  row: ImpactShotRef;
  options: Array<{ id: string; label: string }>;
  onRebind: (req: {
    kind: 'character' | 'scene';
    oldName: string;
    newId: string;
    newName: string;
    shotId?: string;
    scope: 'one' | 'all';
  }) => void;
}) {
  const oldName = row.names[0] ?? '';
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '');
  const selected = options.find((o) => o.id === selectedId);

  return (
    <li className="rounded-lg border border-line px-2 py-1.5 space-y-1.5">
      <p className="text-warn">{row.names.join('、')}</p>
      <p className="text-[10px] text-ink/40">{row.shotLabel}</p>
      {options.length === 0 ? (
        <p className="text-[10px] text-ink/45">库中暂无可用{kind === 'character' ? '角色' : '场景'}，请先新建后再重绑。</p>
      ) : (
        <>
          <select
            className="w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand hover:bg-brand/25"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onRebind({
                  kind,
                  oldName,
                  newId: selected.id,
                  newName: selected.label,
                  shotId: row.shotId,
                  scope: 'one',
                });
              }}
            >
              本镜重绑
            </button>
            <button
              type="button"
              className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/60 hover:text-brand hover:bg-brand/5"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onRebind({
                  kind,
                  oldName,
                  newId: selected.id,
                  newName: selected.label,
                  scope: 'all',
                });
              }}
            >
              同名全部重绑
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function InvalidIdRepairRow({
  kind,
  row,
  options,
  onRebind,
}: {
  kind: 'costume' | 'prop' | 'shot' | 'style' | 'sound';
  row: ImpactIdRef;
  options: Array<{ id: string; label: string }>;
  onRebind: (req: {
    kind: 'costume' | 'prop' | 'shot' | 'style' | 'sound';
    oldId: string;
    newId: string;
    newLabel: string;
    shotId?: string;
    ownerId?: string;
    scope: 'one' | 'all';
  }) => void;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '');
  const selected = options.find((o) => o.id === selectedId);
  const where =
    row.shotLabel
    || row.ownerLabel
    || row.context;
  const kindLabel =
    kind === 'costume' ? '服装'
      : kind === 'prop' ? '道具'
        : kind === 'shot' ? '镜头'
          : kind === 'style' ? '风格'
            : '声音';

  return (
    <li className="rounded-lg border border-line px-2 py-1.5 space-y-1.5">
      <p className="text-warn">
        {row.oldLabel || row.oldId.slice(0, 12)}
        <span className="text-ink/40"> · {row.context}</span>
      </p>
      <p className="text-[10px] text-ink/40">{where}</p>
      {options.length === 0 ? (
        <p className="text-[10px] text-ink/45">库中暂无可用{kindLabel}，请先新建。</p>
      ) : (
        <>
          <select
            className="w-full rounded border border-line bg-bg px-1.5 py-1 text-[10px] text-ink"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand hover:bg-brand/25"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onRebind({
                  kind,
                  oldId: row.oldId,
                  newId: selected.id,
                  newLabel: selected.label,
                  shotId: row.shotId,
                  ownerId: row.ownerId,
                  scope: 'one',
                });
              }}
            >
              本处重绑
            </button>
            <button
              type="button"
              className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/60 hover:text-brand hover:bg-brand/5"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onRebind({
                  kind,
                  oldId: row.oldId,
                  newId: selected.id,
                  newLabel: selected.label,
                  scope: 'all',
                });
              }}
            >
              同 id 全部重绑
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export function AssetHealthBar({
  tab,
  analysis,
  activeKey,
  onSelectIssue,
  onOpenItem,
  characters = [],
  workspaceItems = [],
  /** UX-R04：回收站打开时强制关闭影响抽屉 */
  externalDrawer = null,
  onImpactOpenChange,
}: {
  tab: AssetLibraryKind;
  analysis: AssetHealthAnalysis;
  activeKey: HealthIssueKey | null;
  onSelectIssue: (key: HealthIssueKey | null) => void;
  onOpenItem?: (itemId: string) => void;
  characters?: CharacterProfile[];
  workspaceItems?: BacklotWorkspaceItem[];
  externalDrawer?: 'trash' | null;
  onImpactOpenChange?: (open: boolean) => void;
}) {
  const [impactOpen, setImpactOpen] = useState(false);
  const setImpact = (open: boolean) => {
    setImpactOpen(open);
    onImpactOpenChange?.(open);
  };
  useEffect(() => {
    if (externalDrawer === 'trash' && impactOpen) setImpact(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在回收站打开时互斥关闭
  }, [externalDrawer]);
  const [chipsExpanded, setChipsExpanded] = useState(Boolean(activeKey));
  useEffect(() => {
    if (activeKey) setChipsExpanded(true);
  }, [activeKey]);
  const runtime = useFlowRuntime((s) => s.runtime);
  const issues = analysis.byTab[tab] ?? [];
  const bad = issues.reduce((sum, row) => sum + row.count, 0);
  const warnSummary = issues
    .filter((row) => row.count > 0)
    .slice(0, 3)
    .map((row) => `${row.label} ${row.count}`)
    .join(' · ');
  const clearFilterAction = activeKey
    ? { label: '清除过滤', onClick: () => onSelectIssue(null) }
    : undefined;
  const invalidRows =
    tab === 'character'
      ? analysis.invalidCharacterRefs
      : tab === 'scene'
        ? analysis.invalidSceneRefs
        : [];
  const invalidIdRows: ImpactIdRef[] =
    tab === 'costume'
      ? analysis.invalidCostumeRefs
      : tab === 'prop'
        ? analysis.invalidPropRefs
        : tab === 'shot'
          ? analysis.invalidShotRefs
          : tab === 'style'
            ? analysis.invalidStyleRefs
            : tab === 'sound'
              ? analysis.invalidSoundRefs
              : [];

  const characterOptions = useMemo(
    () => characters
      .filter((c) => !c.deletedAt && c.name.trim())
      .map((c) => ({ id: c.id, label: c.name.trim() })),
    [characters],
  );
  const sceneOptions = useMemo(
    () => workspaceItems
      .filter((i) => i.kind === 'scene' && !i.deletedAt && i.label.trim())
      .map((i) => ({ id: i.id, label: i.label.trim() })),
    [workspaceItems],
  );
  const costumeOptions = useMemo(
    () => workspaceItems
      .filter((i) => i.kind === 'costume' && !i.deletedAt && i.label.trim())
      .map((i) => ({ id: i.id, label: i.label.trim() })),
    [workspaceItems],
  );
  const propOptions = useMemo(
    () => workspaceItems
      .filter((i) => i.kind === 'prop' && !i.deletedAt && i.label.trim())
      .map((i) => ({ id: i.id, label: i.label.trim() })),
    [workspaceItems],
  );
  const shotOptions = useMemo(
    () => workspaceItems
      .filter((i) => i.kind === 'shot' && !i.deletedAt && i.label.trim())
      .map((i) => ({ id: i.id, label: i.label.trim() })),
    [workspaceItems],
  );
  const styleLibraryStyles = useWorkspaceDocument((s) => s.styleLibrary.styles);
  const soundLibrarySounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const styleOptions = useMemo(
    () =>
      (styleLibraryStyles ?? [])
        .filter((s) => !s.deletedAt && s.name.trim())
        .map((s) => ({ id: s.id, label: s.name.trim() })),
    [styleLibraryStyles],
  );
  const soundOptions = useMemo(
    () =>
      (soundLibrarySounds ?? [])
        .filter((s) => !s.deletedAt && s.name.trim())
        .map((s) => ({ id: s.id, label: s.name.trim() })),
    [soundLibrarySounds],
  );
  const costumeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of workspaceItems) {
      if (item.kind === 'costume') map.set(item.id, item.label);
    }
    return map;
  }, [workspaceItems]);

  const handleRebind = (req: {
    kind: 'character' | 'scene';
    oldName: string;
    newId: string;
    newName: string;
    shotId?: string;
    scope: 'one' | 'all';
  }) => {
    if (!runtime?.updateNodeData || !runtime.getNodes) {
      toastError('画布未就绪，无法写回分镜');
      return;
    }
    const n = rebindInvalidShotRefs(
      runtime.getNodes(),
      runtime.updateNodeData,
      {
        kind: req.kind,
        oldName: req.oldName,
        newId: req.newId,
        newName: req.newName,
        shotId: req.scope === 'one' ? req.shotId : undefined,
      },
    );
    if (n <= 0) {
      toastError('未找到可修复的镜表引用');
      return;
    }
    toastSuccess(
      req.scope === 'one'
        ? `已重绑本镜 → ${req.newName}`
        : `已重绑 ${n} 镜「${req.oldName}」→ ${req.newName}`,
      clearFilterAction,
    );
  };

  const handleIdRebind = (req: {
    kind: 'costume' | 'prop' | 'shot' | 'style' | 'sound';
    oldId: string;
    newId: string;
    newLabel: string;
    shotId?: string;
    ownerId?: string;
    scope: 'one' | 'all';
  }) => {
    if (!runtime?.updateNodeData || !runtime.getNodes) {
      toastError('画布未就绪，无法写回分镜');
      return;
    }
    const upsertCharacter = useWorkspaceDocument.getState().upsertCharacter;

    if (req.kind === 'sound') {
      let n = 0;
      for (const c of characters) {
        if (req.scope === 'one' && req.ownerId && c.id !== req.ownerId) continue;
        if (c.soundAssetId?.trim() !== req.oldId) continue;
        upsertCharacter({ ...c, soundAssetId: req.newId });
        n += 1;
      }
      if (n <= 0) {
        toastError('未找到可修复的声音引用');
        return;
      }
      toastSuccess(`已重绑声音 → ${req.newLabel}`, clearFilterAction);
      return;
    }

    if (req.kind === 'costume' || req.kind === 'prop' || req.kind === 'shot' || req.kind === 'style') {
      const n = rebindInvalidIdRefs(
        runtime.getNodes(),
        runtime.updateNodeData,
        {
          kind: req.kind,
          oldId: req.oldId,
          newId: req.newId,
          newLabel: req.newLabel,
          shotId: req.scope === 'one' ? req.shotId : undefined,
          ownerId: req.scope === 'one' ? req.ownerId : undefined,
        },
        (id, patch) => {
          const cur = characters.find((c) => c.id === id);
          if (cur) {
            upsertCharacter({
              ...cur,
              ...patch,
              creative: { ...cur.creative, ...patch.creative },
            });
          }
        },
        characters,
      );
      if (req.kind === 'prop') {
        const upsertItem = useWorkspaceDocument.getState().upsertBacklotWorkspace;
        const items = useWorkspaceDocument.getState().backlotWorkspace.items;
        for (const item of items) {
          if (item.kind !== 'scene') continue;
          if (req.scope === 'one' && req.ownerId && item.id !== req.ownerId) continue;
          const ext = (item.creative ?? {}) as { propIds?: string[] };
          const propIds = ext.propIds ?? [];
          if (!propIds.includes(req.oldId)) continue;
          upsertItem({
            ...item,
            creative: {
              ...ext,
              propIds: propIds.map((id) => (id === req.oldId ? req.newId : id)),
            },
          });
        }
      }
      if (n <= 0 && req.kind === 'costume') {
        toastError('未找到可修复的服装引用');
        return;
      }
      if (n <= 0 && (req.kind === 'shot' || req.kind === 'style')) {
        toastError('未找到可修复的引用');
        return;
      }
      toastSuccess(`已重绑 → ${req.newLabel}`, clearFilterAction);
    }
  };

  return (
    <>
      <div className="shrink-0 border-b border-line bg-surface/35 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className={`grid h-7 w-7 place-items-center rounded-lg ${bad ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
            {bad ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">
              本 Tab 健康
              <span className="ml-1.5 font-normal text-ink/45">
                {bad ? warnSummary || `${bad} 项` : '无问题指标'}
              </span>
            </p>
            <p className="truncate text-[10px] text-ink/45">
              顶栏「阻塞」是跨 Tab 总闸；此处是当前 Tab 细则。镜表 {analysis.relationCount} · 节点 {analysis.nodeRelationCount}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
            onClick={() => setChipsExpanded((v) => !v)}
          >
            {chipsExpanded ? '收起' : '展开细则'}
          </button>
          <button
            type="button"
            onClick={() => setImpact(true)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/55 hover:bg-brand/5 hover:text-brand"
          >
            <Network size={10} />
            影响
          </button>
          {activeKey ? (
            <button
              type="button"
              onClick={() => onSelectIssue(null)}
              className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45 hover:text-ink/70"
            >
              清除筛选
            </button>
          ) : null}
        </div>
        {chipsExpanded ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {issues.map((row) => (
              <button
                key={`${row.key}-${row.label}`}
                type="button"
                onClick={() => {
                  if (row.key === 'invalidRef' && row.count > 0) {
                    setImpact(true);
                    onSelectIssue(row.key);
                    return;
                  }
                  onSelectIssue(activeKey === row.key ? null : row.key);
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                  activeKey === row.key
                    ? 'bg-brand/15 text-brand ring-1 ring-brand/30'
                    : row.count
                      ? 'bg-warn/10 text-warn hover:bg-warn/15'
                      : 'bg-surface text-ink/40 hover:text-ink/60'
                }`}
                title={
                  row.key === 'unused'
                    ? (row.count
                      ? '未绑定到镜/帧/角色（或节点）— 点击过滤'
                      : '均已有绑定使用')
                    : row.count
                      ? `点击过滤「${row.label}」`
                      : `${row.label} 正常`
                }
              >
                {row.label} {row.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {impactOpen ? (
        <div className="absolute inset-y-0 right-0 z-20 flex w-[min(340px,92%)] flex-col border-l border-line bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Network size={14} className="text-brand" />
            <p className="flex-1 text-xs font-semibold text-ink">影响分析</p>
            <button type="button" className="rounded p-1 text-ink/40 hover:bg-surface hover:text-ink" onClick={() => setImpact(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto nx9-scroll p-3 space-y-3 text-[11px]">
            <section>
              <p className="mb-1 font-medium text-ink/70">分镜引用覆盖</p>
              <p className="text-ink/45">{analysis.relationCount} 个镜表条目参与关系统计</p>
            </section>

            <section>
              <p className="mb-1 font-medium text-ink/70">
                节点 AssetRef（{analysis.nodeRelationCount}）
              </p>
              {analysis.nodeAssetUsages.length === 0 ? (
                <p className="text-ink/40">画布节点暂无结构化素材引用</p>
              ) : (
                <ul className="space-y-1">
                  {analysis.nodeAssetUsages.slice(0, 24).map((row) => (
                    <li key={`${row.nodeId}-${row.kind}-${row.assetId ?? row.label}`} className="text-ink/60">
                      <span className="font-medium text-ink">{row.nodeLabel}</span>
                      <span className="text-ink/40">
                        {' '}· {row.kind}
                        {row.label ? `「${row.label}」` : ''}
                        {row.assetId ? ` · ${row.assetId.slice(0, 10)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {tab === 'character' && analysis.legacyBareMentions.length > 0 && (
              <section>
                <p className="mb-1 font-medium text-ink/70">
                  裸 @名待升级（{analysis.legacyBareMentions.length}）
                </p>
                <ul className="space-y-1">
                  {analysis.legacyBareMentions.slice(0, 16).map((row) => (
                    <li key={row.shotId} className="text-ink/60">
                      <span className="text-warn">@{row.labels.join('、@')}</span>
                      <span className="text-ink/40"> · {row.shotLabel}</span>
                      <p className="text-[10px] text-ink/35">请改为 @角色:名 / @场景:名</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(tab === 'character' || tab === 'scene') && (
              <section>
                <p className="mb-1 font-medium text-ink/70">
                  失效引用（{invalidRows.length}）
                </p>
                {invalidRows.length === 0 ? (
                  <p className="text-ink/40">无失效引用</p>
                ) : (
                  <ul className="space-y-1.5">
                    {invalidRows.slice(0, 40).map((row) => (
                      <InvalidRefRepairRow
                        key={`${row.shotId}-${row.names[0]}`}
                        kind={tab === 'character' ? 'character' : 'scene'}
                        row={row}
                        options={tab === 'character' ? characterOptions : sceneOptions}
                        onRebind={handleRebind}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {(tab === 'costume' || tab === 'prop' || tab === 'shot' || tab === 'style' || tab === 'sound') && (
              <section>
                <p className="mb-1 font-medium text-ink/70">
                  失效引用（{invalidIdRows.length}）
                </p>
                {invalidIdRows.length === 0 ? (
                  <p className="text-ink/40">无失效 id 引用</p>
                ) : (
                  <ul className="space-y-1.5">
                    {invalidIdRows.slice(0, 40).map((row) => (
                      <InvalidIdRepairRow
                        key={`${row.oldId}-${row.shotId ?? row.ownerId}-${row.context}`}
                        kind={
                          tab === 'costume' ? 'costume'
                            : tab === 'prop' ? 'prop'
                              : tab === 'shot' ? 'shot'
                                : tab === 'style' ? 'style'
                                  : 'sound'
                        }
                        row={row}
                        options={
                          tab === 'costume' ? costumeOptions
                            : tab === 'prop' ? propOptions
                              : tab === 'shot' ? shotOptions
                                : tab === 'style' ? styleOptions
                                  : soundOptions
                        }
                        onRebind={handleIdRebind}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'costume' && (
              <section>
                <p className="mb-1 font-medium text-ink/70">服装 → 角色绑定</p>
                {[...analysis.costumeBoundCharacters.entries()].length === 0 ? (
                  <p className="text-ink/40">尚无角色绑定服装</p>
                ) : (
                  <ul className="space-y-1">
                    {[...analysis.costumeBoundCharacters.entries()].map(([costumeId, names]) => (
                      <li key={costumeId}>
                        <button
                          type="button"
                          className="text-left text-brand hover:underline"
                          onClick={() => onOpenItem?.(costumeId)}
                        >
                          {costumeLabelById.get(costumeId) ?? costumeId.slice(0, 12)}
                        </button>
                        <span className="text-ink/45"> ← {names.join('、')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'character' && (
              <section>
                <p className="mb-1 font-medium text-ink/70">角色上镜（节选）</p>
                <ul className="space-y-1">
                  {[...analysis.characterUsage.entries()].slice(0, 12).map(([name, refs]) => (
                    <li key={name} className="text-ink/60">
                      <span className="font-medium text-ink">{name}</span>
                      <span className="text-ink/40"> · {refs.length} 镜</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tab === 'scene' && (
              <section>
                <p className="mb-1 font-medium text-ink/70">场景上镜（节选）</p>
                <ul className="space-y-1">
                  {[...analysis.sceneUsage.entries()].slice(0, 12).map(([name, refs]) => (
                    <li key={name} className="text-ink/60">
                      <span className="font-medium text-ink">{name}</span>
                      <span className="text-ink/40"> · {refs.length} 镜</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
