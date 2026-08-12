import { useMemo, useState } from 'react';
import {
  extractScreenplayExcerpts,
  formatAssetMention,
  isScreenplayPackage,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type ScreenplayCharacterDraft,
  type ScreenplayPackage,
  type ScreenplaySceneDraft,
} from '@nx9/shared';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { useFlowGraphMirror } from '../../stores/flow-graph-mirror';
import { toastSuccess, toastError } from '../../stores/toast';
import { persistScriptDeskPackage } from '../../engine/script-desk-runner';
import {
  diffCharacterBiblePush,
  diffSceneBiblePush,
  pushCharacterToBiblePackage,
  pushSceneToBiblePackage,
  type BibleFieldDiff,
  type BiblePushMode,
} from '../../engine/bible-library-sync';

function getFlowUpdate() {
  const runtime = useFlowRuntime.getState().runtime;
  if (runtime) {
    return {
      nodes: runtime.getNodes(),
      updateNodeData: runtime.updateNodeData,
    };
  }
  const mirror = useFlowGraphMirror.getState();
  return {
    nodes: mirror.nodes,
    updateNodeData: mirror.updateNodeData,
  };
}

function collectScriptDeskNodes() {
  const { nodes } = getFlowUpdate();
  return nodes.filter((node) => {
    const data = node.data as Record<string, unknown> | undefined;
    return isScreenplayPackage(data?.package);
  });
}

function collectPackages(): ScreenplayPackage[] {
  return collectScriptDeskNodes().map(
    (node) => (node.data as { package: ScreenplayPackage }).package,
  );
}

function matchCharacter(
  packages: ScreenplayPackage[],
  name: string,
): { pkg: ScreenplayPackage; draft: ScreenplayCharacterDraft } | null {
  const key = name.trim();
  if (!key) return null;
  for (const pkg of packages) {
    const draft = pkg.bible.characters.find(
      (c) => c.name === key || c.aliases?.includes(key),
    );
    if (draft) return { pkg, draft };
  }
  return null;
}

function matchScene(
  packages: ScreenplayPackage[],
  name: string,
): { pkg: ScreenplayPackage; draft: ScreenplaySceneDraft } | null {
  const key = name.trim();
  if (!key) return null;
  for (const pkg of packages) {
    const draft = pkg.bible.scenes.find(
      (s) => s.name === key || s.location === key || s.code === key,
    );
    if (draft) return { pkg, draft };
  }
  return null;
}

function applyPackageToAllDesks(nextPkg: ScreenplayPackage, preferId?: string) {
  const { nodes, updateNodeData } = getFlowUpdate();
  const desks = nodes.filter((node) => {
    const data = node.data as Record<string, unknown> | undefined;
    return isScreenplayPackage(data?.package);
  });
  if (desks.length === 0) return false;
  const target = preferId
    ? desks.find((d) => d.id === preferId) ?? desks[0]
    : desks[0];
  persistScriptDeskPackage(updateNodeData, target.id, nextPkg);
  return true;
}

function DiffList({ diffs }: { diffs: BibleFieldDiff[] }) {
  if (diffs.length === 0) {
    return <p className="text-[10px] text-ink/40">无字段差异，覆盖也不会改文案。</p>;
  }
  return (
    <ul className="max-h-40 space-y-1.5 overflow-y-auto nx9-scroll rounded-lg border border-line bg-bg/60 p-2">
      {diffs.map((d) => (
        <li key={d.field} className="text-[10px] leading-relaxed">
          <span className="font-medium text-ink/70">{d.label}</span>
          <div className="mt-0.5 grid gap-0.5 text-ink/45">
            <span className="line-through decoration-ink/25">
              {d.before || '（空）'}
            </span>
            <span className="text-brand">{d.after || '（空）'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 素材库详情：挂载编剧台 Bible + 成稿摘录；支持 C-02 推送回写 + OL-07 字段 diff */
export function ScreenplaySupportPanel(props: {
  kind: 'character' | 'scene';
  name: string;
  character?: CharacterProfile;
  sceneItem?: BacklotWorkspaceItem;
  canWrite?: boolean;
}) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const mirrorRev = useFlowGraphMirror((s) => s.revision);
  const [busy, setBusy] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const hit = useMemo(() => {
    void runtime;
    void mirrorRev;
    const packages = collectPackages();
    if (props.kind === 'character') return matchCharacter(packages, props.name);
    return matchScene(packages, props.name);
  }, [props.kind, props.name, runtime, mirrorRev]);

  const hasDesk = useMemo(() => {
    void runtime;
    void mirrorRev;
    return collectScriptDeskNodes().length > 0;
  }, [runtime, mirrorRev]);

  const fieldDiffs = useMemo(() => {
    void runtime;
    void mirrorRev;
    const packages = collectPackages();
    const pkg = packages[0];
    if (!pkg) return [] as BibleFieldDiff[];
    if (props.kind === 'character' && props.character) {
      return diffCharacterBiblePush(pkg, props.character);
    }
    if (props.kind === 'scene' && props.sceneItem) {
      return diffSceneBiblePush(pkg, props.sceneItem);
    }
    return [];
  }, [props.kind, props.character, props.sceneItem, runtime, mirrorRev]);

  const push = (mode: BiblePushMode) => {
    if (!hasDesk) {
      toastError('画布上未找到编剧台，无法回写 Bible');
      return;
    }
    setBusy(true);
    try {
      const desks = collectScriptDeskNodes();
      const first = desks[0];
      const pkg = (first.data as { package: ScreenplayPackage }).package;
      const result =
        props.kind === 'character' && props.character
          ? pushCharacterToBiblePackage(pkg, props.character, mode)
          : props.kind === 'scene' && props.sceneItem
            ? pushSceneToBiblePackage(pkg, props.sceneItem, mode)
            : null;
      if (!result) {
        toastError('缺少可推送的库条目');
        return;
      }
      if (result.action === 'unchanged') {
        toastSuccess('Bible 已是最新，无需回写');
        setDiffOpen(false);
        return;
      }
      applyPackageToAllDesks(result.package, first.id);
      const label =
        result.action === 'created'
          ? '已新建 Bible 草稿'
          : result.action === 'overwritten'
            ? `已覆盖写入 Bible（${fieldDiffs.length} 字段）`
            : '已补全 Bible 空字段';
      toastSuccess(label);
      setDiffOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!hit && !hasDesk) return null;

  const draft = hit?.draft;
  const pkg = hit?.pkg;
  const aliases = props.kind === 'character' && draft
    ? (draft as ScreenplayCharacterDraft).aliases ?? []
    : [];
  const excerpts = pkg
    ? extractScreenplayExcerpts(pkg, props.name, aliases, 3, 160)
    : [];
  const narrative = draft
    ? props.kind === 'character'
      ? [
          (draft as ScreenplayCharacterDraft).identity,
          (draft as ScreenplayCharacterDraft).personality,
          (draft as ScreenplayCharacterDraft).appearance,
          (draft as ScreenplayCharacterDraft).relationships,
          (draft as ScreenplayCharacterDraft).goal,
        ].filter(Boolean)
      : [
          (draft as ScreenplaySceneDraft).code,
          (draft as ScreenplaySceneDraft).location,
          (draft as ScreenplaySceneDraft).summary,
          (draft as ScreenplaySceneDraft).dramaticFunction,
          (draft as ScreenplaySceneDraft).era,
        ].filter(Boolean)
    : [];

  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-3 text-[11px] text-ink/70">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
          剧本支撑 · Bible draft
        </span>
        {props.canWrite !== false && hasDesk && (props.character || props.sceneItem) && (
          <div className="ml-auto flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => push('fill-empty')}
              className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[10px] text-ink/65 hover:border-brand/40 disabled:opacity-45"
              title="只补全 Bible 空字段，不覆盖已有文案"
            >
              推送到 Bible（补空）
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDiffOpen((v) => !v)}
              className="rounded-lg border border-line px-2 py-0.5 text-[10px] text-ink/45 hover:border-amber-400/50 disabled:opacity-45"
              title="先看字段差异再决定是否覆盖"
            >
              {diffOpen ? '收起对比' : `对比后覆盖${fieldDiffs.length ? `（${fieldDiffs.length}）` : ''}`}
            </button>
          </div>
        )}
      </div>
      {diffOpen ? (
        <div className="mb-2 space-y-2">
          <DiffList diffs={fieldDiffs} />
          <button
            type="button"
            disabled={busy || fieldDiffs.length === 0}
            onClick={() => push('overwrite')}
            className="rounded-lg bg-amber-500/90 px-2.5 py-1 text-[10px] text-white hover:bg-amber-500 disabled:opacity-45"
          >
            确认覆盖写入 Bible
          </button>
        </div>
      ) : null}
      {!hit ? (
        <p className="mb-2 text-ink/40">
          编剧台尚无同名 draft。可「推送到 Bible」新建草稿，避免库与剧本两套真相长期漂移。
          {props.name ? (
            <>
              {' '}引用 {formatAssetMention(props.kind === 'character' ? 'character' : 'scene', props.name)}
            </>
          ) : null}
        </p>
      ) : narrative.length > 0 ? (
        <p className="mb-2 leading-relaxed">{narrative.join(' · ')}</p>
      ) : (
        <p className="mb-2 text-ink/40">有匹配 draft，暂无叙事字段</p>
      )}
      {excerpts.length > 0 ? (
        <ul className="space-y-1 border-t border-line/60 pt-2">
          {excerpts.map((ex) => (
            <li key={ex} className="leading-relaxed text-ink/55">
              「{ex}」
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
