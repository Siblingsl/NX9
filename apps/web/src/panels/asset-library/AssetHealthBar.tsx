import { useMemo, useState } from 'react';
import type { AssetLibraryKind, BacklotWorkspaceItem, CharacterProfile, SoundAssetProfile } from '@nx9/shared';
import { AlertTriangle, Network, ShieldCheck, X } from 'lucide-react';
import { getAllChainShots } from '../../engine/chain-storyboard-aggregate';
import {
  analyzeAssetLibraryHealth,
  type AssetHealthAnalysis,
  type HealthIssueKey,
} from '../../engine/asset-library-health';
import { useFlowRuntime } from '../../stores/flow-runtime';

export function useAssetHealthAnalysis(
  characters: CharacterProfile[],
  workspaceItems: BacklotWorkspaceItem[],
  sounds: SoundAssetProfile[],
): AssetHealthAnalysis {
  const runtime = useFlowRuntime((s) => s.runtime);
  return useMemo(() => {
    const relationShots = getAllChainShots(runtime?.getNodes() ?? [], {
      allowGlobalFallback: true,
    });
    return analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      relationShots,
    });
  }, [characters, workspaceItems, sounds, runtime]);
}

export function AssetHealthBar({
  tab,
  analysis,
  activeKey,
  onSelectIssue,
  onOpenItem,
}: {
  tab: AssetLibraryKind;
  analysis: AssetHealthAnalysis;
  activeKey: HealthIssueKey | null;
  onSelectIssue: (key: HealthIssueKey | null) => void;
  onOpenItem?: (itemId: string) => void;
}) {
  const [impactOpen, setImpactOpen] = useState(false);
  const issues = analysis.byTab[tab] ?? [];
  const bad = issues.reduce((sum, row) => sum + row.count, 0);
  const invalidRows =
    tab === 'character'
      ? analysis.invalidCharacterRefs
      : tab === 'scene'
        ? analysis.invalidSceneRefs
        : [];

  return (
    <>
      <div className="shrink-0 border-b border-line bg-surface/35 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className={`grid h-7 w-7 place-items-center rounded-lg ${bad ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
            {bad ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink">素材健康检查</p>
            <p className="truncate text-[10px] text-ink/45">
              点击指标可过滤列表；影响分析查看分镜引用。当前覆盖 {analysis.relationCount} 个分镜引用。
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {issues.map((row) => (
              <button
                key={`${row.key}-${row.label}`}
                type="button"
                onClick={() => {
                  if (row.key === 'invalidRef' && row.count > 0) {
                    setImpactOpen(true);
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
                title={row.count ? `点击过滤「${row.label}」` : `${row.label} 正常`}
              >
                {row.label} {row.count}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setImpactOpen(true)}
              className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/55 hover:text-brand hover:bg-brand/5"
            >
              <Network size={10} />
              影响分析
            </button>
            {activeKey ? (
              <button
                type="button"
                onClick={() => onSelectIssue(null)}
                className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/45 hover:text-ink/70"
              >
                清除筛选
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {impactOpen ? (
        <div className="absolute inset-y-0 right-0 z-20 flex w-[min(320px,90%)] flex-col border-l border-line bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Network size={14} className="text-brand" />
            <p className="flex-1 text-xs font-semibold text-ink">影响分析</p>
            <button type="button" className="rounded p-1 text-ink/40 hover:bg-surface hover:text-ink" onClick={() => setImpactOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto nx9-scroll p-3 space-y-3 text-[11px]">
            <section>
              <p className="mb-1 font-medium text-ink/70">分镜引用覆盖</p>
              <p className="text-ink/45">{analysis.relationCount} 个镜表条目参与关系统计</p>
            </section>

            {(tab === 'character' || tab === 'scene') && (
              <section>
                <p className="mb-1 font-medium text-ink/70">
                  失效引用（{invalidRows.length}）
                </p>
                {invalidRows.length === 0 ? (
                  <p className="text-ink/40">无失效引用</p>
                ) : (
                  <ul className="space-y-1">
                    {invalidRows.slice(0, 40).map((row) => (
                      <li key={`${row.shotId}-${row.names[0]}`} className="rounded-lg border border-line px-2 py-1.5">
                        <p className="text-warn">{row.names.join('、')}</p>
                        <p className="text-[10px] text-ink/40">{row.shotLabel}</p>
                        <p className="mt-0.5 text-[10px] text-ink/45">
                          修复：在分镜编辑中改名，或新建同名素材后刷新。
                        </p>
                      </li>
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
                          {costumeId.slice(0, 12)}…
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
