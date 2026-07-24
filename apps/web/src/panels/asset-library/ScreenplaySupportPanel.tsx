import { useMemo } from 'react';
import {
  extractScreenplayExcerpts,
  isScreenplayPackage,
  type ScreenplayCharacterDraft,
  type ScreenplayPackage,
  type ScreenplaySceneDraft,
} from '@nx9/shared';
import { useFlowRuntime } from '../../stores/flow-runtime';

function collectPackages(): ScreenplayPackage[] {
  const nodes = useFlowRuntime.getState().runtime?.getNodes() ?? [];
  const out: ScreenplayPackage[] = [];
  for (const node of nodes) {
    const data = node.data as Record<string, unknown> | undefined;
    if (isScreenplayPackage(data?.package)) out.push(data!.package as ScreenplayPackage);
  }
  return out;
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

/** 素材库详情：只读挂载编剧台 Bible + 成稿摘录 */
export function ScreenplaySupportPanel(props: {
  kind: 'character' | 'scene';
  name: string;
}) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const hit = useMemo(() => {
    void runtime;
    const packages = collectPackages();
    if (props.kind === 'character') return matchCharacter(packages, props.name);
    return matchScene(packages, props.name);
  }, [props.kind, props.name, runtime]);

  if (!hit) return null;

  const { pkg, draft } = hit;
  const aliases = props.kind === 'character'
    ? (draft as ScreenplayCharacterDraft).aliases ?? []
    : [];
  const excerpts = extractScreenplayExcerpts(pkg, props.name, aliases, 3, 160);
  const narrative = props.kind === 'character'
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
      ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-3 text-[11px] text-ink/70">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
        剧本支撑 · 编剧台 Bible draft（只读）
      </div>
      {narrative.length > 0 ? (
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
