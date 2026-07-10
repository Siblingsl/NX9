import { memo, useCallback, useEffect } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { enrichPromptWithCharacters, resolveBlockCharacters, defaultBridge } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { CharacterBadge } from '../shared/CharacterSelect';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';
import { api } from '../../api/client';

function DirectorDeskBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);

  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const linkedShot = shots.find((s) => s.id === linkedShotId || s.linkedBlockId === props.id);
  const status = props.data?.status as string | undefined;
  const previewUrl = props.data?.previewUrl as string | undefined;

  useEffect(() => {
    if (linkedShot && linkedShot.linkedBlockId !== props.id) {
      updateShot(linkedShot.id, { linkedBlockId: props.id });
    }
  }, [linkedShot, props.id, updateShot]);

  const linkShot = useCallback(
    (shotId: string) => {
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) return;
      if (shot.linkedBlockId && shot.linkedBlockId !== props.id) {
        appendLog(`镜头 #${shot.index} 已关联其他模块`);
        return;
      }
      updateShot(shotId, { linkedBlockId: props.id });
      updateNodeData(props.id, {
        linkedShotId: shotId,
        content: shot.promptEn || shot.descriptionZh,
      });
      selectShot(shotId);
      setStoryboardOpen(true);
      appendLog(`导演台已关联镜头 #${shot.index}`);
    },
    [shots, props.id, updateShot, updateNodeData, selectShot, setStoryboardOpen, appendLog],
  );

  const run = useCallback(async () => {
    const shot = linkedShot;
    const base =
      shot?.promptEn ||
      shot?.descriptionZh ||
      (props.data?.content as string) ||
      'cinematic medium shot';
    const activeCharacters = resolveBlockCharacters(
      props.data as Record<string, unknown>,
      shot,
      characters,
    );
    const prompt = enrichPromptWithCharacters(base, activeCharacters);
    updateNodeData(props.id, { status: 'running' });
    if (shot) updateShot(shot.id, { status: 'generating' });
    appendLog(`导演台生成首帧 · 镜头 #${shot?.index ?? '?'}`);

    try {
      const res = await api.proxyImage({ prompt, model: 'dall-e-3' }) as {
        ok?: boolean;
        url?: string;
      };
      if (!res.url) throw new Error('图像生成未返回 URL');
      const bridges: import('@nx9/shared').BridgeShotMeta[] = [];
      if (shot) {
        const allShots = useWorkspaceDocument.getState().storyboard.shots;
        const idx = allShots.findIndex((s) => s.id === shot.id);
        const next = idx >= 0 && idx < allShots.length - 1 ? allShots[idx + 1] : undefined;
        if (next) bridges.push(defaultBridge(shot.id, next.id));
      }
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        content: prompt,
        characterInjected: activeCharacters.map((c) => c.id),
        lastResult: res,
        meta: { bridges },
        bridgeRefs: bridges.length ? bridges.flatMap((b) => b.refImageIds) : undefined,
      });
      if (shot) {
        const reviewMode = useWorkspaceDocument.getState().storyboard.reviewMode;
        updateShot(shot.id, {
          status: reviewMode === 'manual' ? 'review' : 'approved',
          firstFrameAssetId: res.url ?? null,
        });
      }
      appendLog(`导演台首帧完成 · ${props.id}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      if (shot) updateShot(shot.id, { status: 'failed' });
      appendLog(`导演台生成失败 · ${props.id}`);
    }
  }, [linkedShot, props.data, props.id, updateNodeData, updateShot, appendLog, characters]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <select
          value={linkedShot?.id ?? ''}
          onChange={(e) => linkShot(e.target.value)}
          className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
        >
          <option value="">选择关联镜头…</option>
          {shots.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.index} {s.descriptionZh || s.promptEn || '未命名'}
            </option>
          ))}
        </select>
        {linkedShot && (
          <p className="text-[10px] text-ink/50">
            {linkedShot.durationSec}s · {linkedShot.shotType} · {linkedShot.status}
          </p>
        )}
        <CharacterBadge
          names={resolveBlockCharacters(
            props.data as Record<string, unknown>,
            linkedShot,
            characters,
          ).map((c) => c.name)}
        />
        {status === 'running' && (
          <div className="w-full bg-line/30 rounded-full h-1.5 overflow-hidden">
            <div className="bg-brand h-full rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            className="w-full rounded-lg border border-line object-cover max-h-36"
          />
        )}
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-brand text-white text-sm py-2 hover:bg-brand/90 disabled:opacity-50"
        >
          {status === 'running' ? '生成中…' : '生成首帧'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(DirectorDeskBlock);
