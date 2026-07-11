import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { lookupBlock } from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import {
  usePromptBatchNodeAdapter,
  usePromptBatchState,
} from '../../../../../blocks/shared/usePromptBatchState';
import { AssetMentionInput } from '../../asset-mention/AssetMentionInput';
import { ComposerWorkspaceShell, COMPOSER_PROMPT_TEXTAREA_CLASS } from '../composer/ComposerWorkspaceShell';
import { useWorkspaceAiLog } from '../composer/useWorkspaceAiLog';
import { PromptBatchPanel, type PromptMentionTarget } from './PromptBatchPanel';
import { PromptToolbarLeft } from './PromptToolbarLeft';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';

const PROMPT_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'shot', 'emotion', 'sound'];
const SYNC_MS = 280;

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PromptWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function PromptWorkspace({ blockId, kind, onCollapse }: PromptWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const { getNode } = useReactFlow();
  const { data, updateNode } = usePromptBatchNodeAdapter(blockId);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const [mentionTarget, setMentionTarget] = useState<PromptMentionTarget>('global');
  const handleAiAction = useWorkspaceAiLog();

  const batch = usePromptBatchState({ blockId, data, updateNode });
  const meta = lookupBlock(kind);
  const node = getNode(blockId);
  const status = ((node?.data ?? data).status as string) ?? 'idle';
  const canRun = batch.jobs.length > 0 || batch.simplePromptText.trim().length > 0;

  const [draft, setDraft] = useState(batch.simplePromptText);
  const draftRef = useRef(batch.simplePromptText);
  const focusedRef = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = batch.simplePromptText;
    setDraft(batch.simplePromptText);
    focusedRef.current = false;
  }, [blockId]);

  useEffect(() => {
    if (focusedRef.current || batch.useBatchWorkspace) return;
    if (batch.simplePromptText !== draftRef.current) {
      draftRef.current = batch.simplePromptText;
      setDraft(batch.simplePromptText);
    }
  }, [batch.simplePromptText, batch.useBatchWorkspace]);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const flushSimplePrompt = useCallback(
    (text: string) => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
        syncTimer.current = null;
      }
      batch.setSimplePrompt(text);
    },
    [batch],
  );

  const handleSimpleChange = useCallback(
    (next: string) => {
      setDraft(next);
      draftRef.current = next;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => flushSimplePrompt(next), SYNC_MS);
    },
    [flushSimplePrompt],
  );

  const handleRun = useCallback(async () => {
    if (!batch.useBatchWorkspace) flushSimplePrompt(draftRef.current);
    if (!runtime || !canRun) return;
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
      appendLog(`运行 · ${meta?.label ?? kind} · ${batch.jobs.length || 1} 项`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [appendLog, batch.jobs.length, batch.useBatchWorkspace, blockId, canRun, flushSimplePrompt, kind, meta, runtime]);

  const handleCollapse = useCallback(() => {
    if (!batch.useBatchWorkspace) flushSimplePrompt(draftRef.current);
    collapsePromptBar();
    onCollapse?.();
  }, [batch.useBatchWorkspace, collapsePromptBar, flushSimplePrompt, onCollapse]);

  useEffect(() => {
    if (batch.useBatchWorkspace || !promptContainerRef.current) return;
    const ta = promptContainerRef.current.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce, batch.useBatchWorkspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      void handleRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun]);

  const runLabel =
    batch.useBatchWorkspace && batch.jobs.length > 0 ? `运行 (${batch.jobs.length})` : '运行';

  const toolbarLeft = batch.useBatchWorkspace ? (
    <PromptToolbarLeft
      hasAssets={batch.hasAssets}
      hasUpstream={batch.hasUpstream}
      promptMode={batch.promptMode}
      composeAction={batch.composeAction}
      imageCount={batch.imageCount}
      items={batch.items}
      onPersist={batch.persistState}
      onManualSync={batch.handleManualSync}
    />
  ) : null;

  const topSlot =
    !batch.useBatchWorkspace && batch.hasUpstream && batch.imageCount === 1 && batch.items[0]?.imageUrl ? (
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line/25 bg-surface/20"
        onMouseDown={stop}
      >
        <img
          src={batch.items[0].imageUrl}
          alt=""
          className="w-10 h-10 rounded-md object-cover border border-line/60 shrink-0"
        />
        <span className="text-[10px] text-ink/40">上游素材已关联</span>
        <button
          type="button"
          onMouseDown={stop}
          onClick={batch.handleManualSync}
          className="text-[10px] text-brand ml-auto hover:underline nodrag nopan"
        >
          重新同步
        </button>
      </div>
    ) : undefined;

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      topSlot={topSlot}
      toolbarLeft={toolbarLeft}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      running={status === 'running'}
      runDisabled={!canRun}
      runLabel={runLabel}
      showAdvanced={false}
      showHistory={false}
      heightClass={
        batch.useBatchWorkspace ? 'h-[340px] max-h-[min(420px,50vh)]' : undefined
      }
      bodyClassName={
        batch.useBatchWorkspace
          ? 'flex-1 min-h-0 px-3 pt-2 pb-1 overflow-y-auto nowheel overscroll-contain'
          : undefined
      }
      promptContainerRef={promptContainerRef}
    >
      {batch.useBatchWorkspace ? (
        <PromptBatchPanel
          items={batch.items}
          promptMode={batch.promptMode}
          globalPrompt={batch.globalPrompt}
          composeAction={batch.composeAction}
          hasUpstream={batch.hasUpstream}
          hasAssets={batch.hasAssets}
          imageCount={batch.imageCount}
          jobsCount={batch.jobs.length}
          filledCount={batch.filledCount}
          mentionTarget={mentionTarget}
          onMentionTargetChange={setMentionTarget}
          onPersist={batch.persistState}
          onUpdateItem={batch.updateItem}
          onAddItem={batch.addItem}
          onRemoveItem={batch.removeItem}
          onManualSync={batch.handleManualSync}
          hideToolbar
        />
      ) : (
        <AssetMentionInput
          as="textarea"
          value={draft}
          onChange={handleSimpleChange}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            flushSimplePrompt(draftRef.current);
          }}
          placeholder={meta ? `${meta.label} Prompt… 输入 @ 引用角色、场景` : '输入 Prompt… 输入 @ 引用'}
          kinds={PROMPT_MENTION_KINDS}
          className={COMPOSER_PROMPT_TEXTAREA_CLASS}
        />
      )}
    </ComposerWorkspaceShell>
  );
}
