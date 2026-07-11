import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { lookupBlock } from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { AssetMentionInput } from '../../asset-mention/AssetMentionInput';
import { ComposerWorkspaceShell, COMPOSER_PROMPT_TEXTAREA_CLASS } from '../composer/ComposerWorkspaceShell';
import { useWorkspaceAiLog } from '../composer/useWorkspaceAiLog';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { usePromptHistory } from '../../../stores/prompt-history';
import { useAttachedNodeData } from './use-attached-node-data';
import { useLocalNodePrompt } from './use-local-node-prompt';

const EMPTY_HISTORY: { id: string; blockId: string; text: string; savedAt: number }[] = [];

export interface GenerationWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function GenerationWorkspace({ blockId, kind, onCollapse }: GenerationWorkspaceProps) {
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const handleAiAction = useWorkspaceAiLog();

  const meta = lookupBlock(kind);
  const data = useAttachedNodeData(blockId);

  const history = useMemo(
    () => (promptEntries ?? EMPTY_HISTORY).filter((e) => e.blockId === blockId).slice(0, 20),
    [promptEntries, blockId],
  );

  const pushHistoryDebounced = useCallback(
    (text: string) => pushHistory(blockId, text),
    [blockId, pushHistory],
  );

  const { draft, onChange, onFocus, onBlur, applyText, flushNow } = useLocalNodePrompt({
    blockId,
    data,
    updateNodeData,
    onHistoryPush: pushHistoryDebounced,
  });

  const assetKinds: AssetLibraryKind[] =
    kind === 'sound-gen' ? ['character', 'sound'] : ['character', 'scene'];

  const status = (data.status as string) ?? 'idle';

  useEffect(() => {
    const ta = promptContainerRef.current?.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;
    try {
      const { runCascadeFromBlock } = await import('../../../execution/cascade-runner');
      await runCascadeFromBlock({
        blockId,
        nodes: runtime.getNodes(),
        edges: runtime.getEdges(),
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            runtime.setEdges(updater(runtime.getEdges()));
          }
        },
        updateNodeData: (id, patch) => runtime.updateNodeData(id, patch),
      });
      appendLog(`运行 · ${meta?.label ?? kind}`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [blockId, runtime, meta, kind, appendLog, flushNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      const ta = promptContainerRef.current?.querySelector('textarea');
      if (document.activeElement !== ta) return;
      e.preventDefault();
      void handleRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun]);

  const handleCollapse = useCallback(() => {
    flushNow();
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse, flushNow]);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      running={data.status === 'running'}
      showAdvanced={false}
      promptContainerRef={promptContainerRef}
    >
      <AssetMentionInput
        as="textarea"
        value={draft}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={meta ? `${meta.label} Prompt… 输入 @ 引用` : '输入 Prompt… 输入 @ 引用'}
        kinds={assetKinds}
        className={COMPOSER_PROMPT_TEXTAREA_CLASS}
      />
    </ComposerWorkspaceShell>
  );
}
