import type { FlowExecuteDeps } from './types';
import { mergePromptBatchItems, promptItemsToBatch } from '@nx9/shared';

export async function executeBaseOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'passthrough' || kind === 'memo') {
    updateNodeData(block.id, {
      upstream,
      status: 'success',
      content: (d.content as string) ?? prompt,
    });
    return;
  }

  if (kind === 'prompt') {
    const existing = (d.promptItems as { id: string; text: string; imageUrl?: string; note?: string }[]) ?? [];
    const merged = mergePromptBatchItems(existing, upstream.pictures, upstream.prompts);
    const mode = (d.promptMode as 'batch' | 'single' | 'broadcast') ?? 'batch';
    const globalPrompt = (d.globalPrompt as string) ?? '';
    const composeAction = (d.composeAction as 'generate' | 'merge' | 'merge-then-generate') ?? 'generate';
    const { jobs, dispatch } = promptItemsToBatch(merged, mode, globalPrompt, composeAction);
    updateNodeData(block.id, {
      status: 'success',
      promptItems: merged,
      promptBatch: jobs,
      promptDispatch: dispatch,
      content:
        globalPrompt.trim() ||
        merged.map((i) => i.text).filter(Boolean).join('\n\n') ||
        merged[0]?.text ||
        '',
      output: jobs.map((b) => b.prompt).join('\n\n'),
      batchCount: jobs.length,
    });
    return;
  }

  if (kind === 'script-desk' || kind === 'dialogue-sheet') {
    const {
      readScriptDeskPackage,
      extractBibleFromPackage,
      ingestScreenplayText,
      persistScriptDeskPackage,
      packageSummaryLine,
    } = await import('../script-desk-runner');
    const {
      isScreenplayPackage,
      screenplayFullText,
    } = await import('@nx9/shared');
    let pkg = isScreenplayPackage(d.package)
      ? d.package as import('@nx9/shared').ScreenplayPackage
      : readScriptDeskPackage(d);
    const source = screenplayFullText(pkg).trim() || ((d.sourceText as string) || prompt).trim();
    if (!source) throw new Error('编剧台缺少成稿文本');
    if (!screenplayFullText(pkg).trim()) {
      pkg = ingestScreenplayText(pkg, source, 'pasted');
    }
    // 主路径：抽取 Bible；不再调用 productionScriptBreakdown
    pkg = await extractBibleFromPackage(pkg);
    persistScriptDeskPackage(updateNodeData, block.id, pkg, {
      status: 'success',
      content: packageSummaryLine(pkg),
      output: screenplayFullText(pkg),
      legacyScriptBreakdown:
        d.legacyScriptBreakdown
        ?? (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined),
    });
    return;
  }

  if (kind === 'picture-gen') {
    // PG-01: 唯一实现收敛到 executors/picture-gen-executor（含 F-017/F-024/F-032、
    // 环境注入、usedAssetIds 回流、全景守卫、AbortSignal）
    const { runPictureGenExecutor } = await import('../executors');
    await runPictureGenExecutor({
      block,
      prompt,
      upstream: {
        prompts: upstream.prompts,
        pictures: upstream.pictures,
        clips: upstream.clips,
        sounds: upstream.sounds,
        promptBatch: upstream.promptBatch,
        promptDispatch: upstream.promptDispatch,
      },
      updateNodeData,
      nodes: ctx?.nodes as unknown as import('../executors/types').ExecutorGraphNode[],
      edges: ctx?.edges,
      abortSignal: ctx?.abortSignal,
    });
    return;
  }
}
