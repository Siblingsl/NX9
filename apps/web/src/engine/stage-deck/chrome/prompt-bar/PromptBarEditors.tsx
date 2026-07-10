import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { PromptComposer } from './PromptComposer';
import type { AssetLibraryKind } from '@nx9/shared';

export interface PromptBarEditorProps {
  blockId: string;
  kind: string;
}

function useNodeData(blockId: string) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const patch = useCallback(
    (next: Record<string, unknown>) => updateNodeData(blockId, next),
    [blockId, updateNodeData],
  );
  return { data, patch };
}

function resolvePromptValue(data: Record<string, unknown>): { key: string; value: string } {
  if (typeof data.globalPrompt === 'string' && data.globalPrompt) {
    return { key: 'globalPrompt', value: data.globalPrompt };
  }
  if (typeof data.content === 'string') {
    return { key: 'content', value: data.content };
  }
  if (typeof data.prompt === 'string') {
    return { key: 'prompt', value: data.prompt };
  }
  return { key: 'content', value: '' };
}

export function GenericPromptEditor({ blockId, kind }: PromptBarEditorProps) {
  const { data, patch } = useNodeData(blockId);
  const { key, value } = resolvePromptValue(data);

  return (
    <PromptComposer
      blockId={blockId}
      kind={kind}
      value={value}
      onChange={(next) => patch({ [key]: next })}
      data={data}
      onPatch={patch}
    />
  );
}

export function PromptBlockEditor({ blockId, kind }: PromptBarEditorProps) {
  const { data, patch } = useNodeData(blockId);
  const globalPrompt = (data.globalPrompt as string) ?? '';
  const content = (data.content as string) ?? '';
  const primary = globalPrompt || content;

  const setPrimary = useCallback(
    (next: string) => {
      const key = globalPrompt !== '' || content === '' ? 'globalPrompt' : 'content';
      patch({ [key]: next, content: key === 'globalPrompt' ? content : next });
    },
    [content, globalPrompt, patch],
  );

  return (
    <PromptComposer
      blockId={blockId}
      kind={kind}
      value={primary}
      onChange={setPrimary}
      placeholder="主提示词 — 支持批量模式与上游素材配对"
      data={data}
      onPatch={patch}
    />
  );
}

export function GenBlockEditor({ blockId, kind }: PromptBarEditorProps) {
  const { data, patch } = useNodeData(blockId);
  const localContent = (data.content as string) ?? '';
  const upstreamPrompt = (data.upstreamPrompt as string) ?? '';
  const value = localContent || upstreamPrompt;

  const label =
    kind === 'clip-gen' ? '视频' : kind === 'sound-gen' ? '配音' : '图像';

  const assetKinds: AssetLibraryKind[] =
    kind === 'sound-gen' ? ['character', 'sound'] : ['character', 'scene'];

  return (
    <div className="space-y-1">
      <PromptComposer
        blockId={blockId}
        kind={kind}
        value={value}
        onChange={(next) => patch({ content: next })}
        placeholder={`${label}生成 Prompt…`}
        data={data}
        onPatch={patch}
        assetKinds={assetKinds}
      />
      {upstreamPrompt && localContent !== upstreamPrompt && (
        <p className="text-[10px] text-ink/40 px-1">上游 Prompt 已注入，编辑后将覆盖本地内容</p>
      )}
    </div>
  );
}
