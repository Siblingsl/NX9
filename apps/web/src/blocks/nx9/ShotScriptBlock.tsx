import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { ShotType, StoryboardShot } from '@nx9/shared';
import { gatherUpstream } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useActivityLog } from '../../stores/activity-log';
import { useFlowCommands } from '../../stores/flow-commands';
import { useStoryboardUi } from '../../stores/flow-runtime';
import { useContextRailUi } from '../../engine/stage-deck/stores/context-rail-ui';
import { api } from '../../api/client';

export interface ShotScriptRow {
  id: string;
  durationSec: number;
  shotType: string;
  dialogue: string;
  action: string;
}

function newRow(): ShotScriptRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    durationSec: 3,
    shotType: 'MS',
    dialogue: '',
    action: '',
  };
}

function composeScript(rows: ShotScriptRow[]): string {
  return rows
    .map(
      (r, i) =>
        `[#${i + 1} ${r.durationSec}s ${r.shotType}] ${r.action}${r.dialogue ? ` | 对白: ${r.dialogue}` : ''}`,
    )
    .join('\n');
}

function mapShotType(code: string): ShotType {
  const table: Record<string, ShotType> = {
    ECU: 'close',
    CU: 'close',
    MS: 'medium',
    FS: 'wide',
    WS: 'extreme-wide',
    OTS: 'medium',
  };
  return table[code] ?? 'custom';
}

function rowToShot(
  row: ShotScriptRow,
  index: number,
  baseIndex: number,
  blockId?: string,
): StoryboardShot {
  const action = row.action.trim();
  const dialogue = row.dialogue.trim();
  return {
    id: `shot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
    index: baseIndex + index + 1,
    durationSec: row.durationSec,
    shotType: mapShotType(row.shotType),
    descriptionZh: action || dialogue,
    promptEn: action || dialogue,
    videoPromptEn: dialogue ? `${action}. Dialogue: ${dialogue}` : action,
    status: 'draft',
    linkedBlockId: blockId ?? null,
  };
}

function ShotScriptBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const rows = (props.data?.scriptRows as ShotScriptRow[] | undefined) ?? [newRow()];
  const content = (props.data?.content as string) ?? composeScript(rows);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const shotCount = useWorkspaceDocument((s) => s.storyboard.shots.length);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const requestRailTab = useContextRailUi((s) => s.requestTab);
  const [novelText, setNovelText] = useState((props.data?.novelText as string) ?? '');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const dialogueLines = useMemo(() => {
    const incoming = edges.filter((e) => e.target === props.id).map((e) => e.source);
    for (const srcId of incoming) {
      const src = nodes.find((n) => n.id === srcId);
      if (!src) continue;
      const lines = (src.data as Record<string, unknown>)?.lines as { speaker: string; text: string; emotion?: string }[] | undefined;
      if (Array.isArray(lines) && lines.length > 0) return lines;
    }
    return null;
  }, [edges, nodes, props.id]);

  const patchRows = useCallback(
    (next: ShotScriptRow[]) => {
      updateNodeData(props.id, {
        scriptRows: next,
        content: composeScript(next),
        meta: { shotCount: next.length, totalDurationSec: next.reduce((s, r) => s + r.durationSec, 0) },
      });
    },
    [props.id, updateNodeData],
  );

  const aiBreakdown = useCallback(async () => {
    const source = novelText.trim();
    if (source.length < 20) {
      setAiError('请输入至少 20 字的小说/章节文本');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await api.agentShotScript(source);
      if (!res.ok || res.rows.length === 0) {
        throw new Error('LLM 未返回可分镜内容');
      }
      const next = res.rows.map((r) => ({
        id: newRow().id,
        durationSec: r.durationSec,
        shotType: r.shotType,
        dialogue: r.dialogue,
        action: r.action,
      }));
      patchRows(next);
      updateNodeData(props.id, { novelText, aiError: undefined });
      appendLog(`AI 拆镜完成 · ${next.length} 行`);
    } catch (e) {
      const msg = String(e);
      setAiError(msg);
      updateNodeData(props.id, { aiError: msg });
      appendLog(`AI 拆镜失败: ${msg}`);
    } finally {
      setAiBusy(false);
    }
  }, [novelText, props.id, patchRows, updateNodeData, appendLog]);

  const pushToStoryboard = useCallback(() => {
    const shots = rows.map((row, i) => rowToShot(row, i, shotCount, props.id));
    addShots(shots, 'append');
  }, [rows, shotCount, addShots, props.id]);

  const startProduction = useCallback(() => {
    pushToStoryboard();
    requestSpawn('director-desk');
    setStoryboardOpen(true);
    requestRailTab('storyboard');
  }, [pushToStoryboard, requestSpawn, setStoryboardOpen, requestRailTab]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-h-72 overflow-y-auto nx9-scroll">
        <textarea
          value={novelText}
          onChange={(e) => setNovelText(e.target.value)}
          placeholder="粘贴小说 / 章节文本，AI 拆镜为分镜行"
          rows={3}
          className="w-full rounded-lg border border-line px-2 py-1 resize-y"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void aiBreakdown()}
            disabled={aiBusy}
            className="flex-1 rounded-xl bg-brand text-white py-1.5 text-[11px] disabled:opacity-50"
          >
            {aiBusy ? '拆镜中…' : 'AI 拆镜'}
          </button>
        </div>
        {aiError && <p className="text-[10px] text-red-600">{aiError}</p>}
        {dialogueLines && (
          <button
            type="button"
            onClick={() => {
              const next = dialogueLines.map((dl) => ({
                id: newRow().id,
                durationSec: 3,
                shotType: 'MS',
                dialogue: dl.text,
                action: dl.speaker ? `${dl.speaker}：` : '',
              }));
              patchRows(next);
              appendLog(`已从对白表导入 ${next.length} 行`);
            }}
            className="w-full flex items-center justify-center gap-1 rounded-xl border border-accent/30 bg-accent/5 text-accent py-1.5 text-[11px] hover:bg-accent/10"
          >
            导入对白（{dialogueLines.length} 行）
          </button>
        )}
        {rows.map((row, idx) => (
          <div key={row.id} className="rounded-xl border border-line p-2 space-y-1 bg-surface/50">
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-ink/40 w-5">#{idx + 1}</span>
              <input
                type="number"
                min={1}
                value={row.durationSec}
                onChange={(e) => {
                  const next = rows.map((r) =>
                    r.id === row.id ? { ...r, durationSec: Number(e.target.value) || 1 } : r,
                  );
                  patchRows(next);
                }}
                className="w-12 rounded border border-line px-1 py-0.5"
                title="时长(秒)"
              />
              <select
                value={row.shotType}
                onChange={(e) => {
                  const next = rows.map((r) =>
                    r.id === row.id ? { ...r, shotType: e.target.value } : r,
                  );
                  patchRows(next);
                }}
                className="flex-1 rounded border border-line px-1 py-0.5 bg-white text-[10px]"
              >
                {['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-ink/40 hover:text-red-500 px-1"
                onClick={() => patchRows(rows.filter((r) => r.id !== row.id))}
              >
                ×
              </button>
            </div>
            <input
              value={row.action}
              onChange={(e) => {
                const next = rows.map((r) => (r.id === row.id ? { ...r, action: e.target.value } : r));
                patchRows(next);
              }}
              placeholder="动作 / 画面描述"
              className="w-full rounded-lg border border-line px-2 py-1"
            />
            <input
              value={row.dialogue}
              onChange={(e) => {
                const next = rows.map((r) => (r.id === row.id ? { ...r, dialogue: e.target.value } : r));
                patchRows(next);
              }}
              placeholder="对白（可选）"
              className="w-full rounded-lg border border-line px-2 py-1"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => patchRows([...rows, newRow()])}
          className="w-full rounded-xl border border-dashed border-line py-1.5 text-ink/50 hover:border-brand/40"
        >
          + 添加镜头
        </button>
        <p className="text-[10px] font-mono text-ink/60 line-clamp-3 whitespace-pre-wrap">{content}</p>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={startProduction}
            className="w-full rounded-xl bg-brand text-white py-2 text-[11px] font-medium hover:bg-brand/90"
          >
            一键开拍 · 故事板 + 导演台
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={pushToStoryboard}
              className="flex-1 rounded-xl bg-accent/10 text-accent py-1.5 text-[10px]"
            >
              仅写入故事板
            </button>
            <button
              type="button"
              onClick={() => requestSpawn('director-desk')}
              className="flex-1 rounded-xl bg-brand/10 text-brand py-1.5 text-[10px]"
            >
              + 导演台
            </button>
          </div>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ShotScriptBlock);
