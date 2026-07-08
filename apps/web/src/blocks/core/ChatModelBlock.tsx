import { memo, useCallback, useEffect } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { DoubleClickText } from '../shared/DoubleClickText';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useSkillVault } from '../../stores/skill-vault';
import { parseStoryboardMarkdown } from '@nx9/shared';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useStoryboardUi } from '../../stores/flow-runtime';

function ChatModelBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const skills = useSkillVault((s) => s.items);
  const fetchSkills = useSkillVault((s) => s.fetchAll);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);

  const reply = (props.data?.reply as string) ?? '';
  const lastReply = (props.data?.lastReply as string) ?? reply;
  const editedReply = (props.data?.editedReply as string) ?? '';
  const displayReply = editedReply || reply;
  const prompt = (props.data?.prompt as string) ?? '';
  const skillId = (props.data?.skillId as string) ?? '';

  // Lazily load skills once for the selector. The vault is shared across blocks,
  // so this populates the options for every ChatModel instance.
  useEffect(() => {
    if (skills.length === 0) void fetchSkills();
  }, [skills.length, fetchSkills]);

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      // If a skill is selected, inject its SKILL.md body as the system prompt.
      let messages: { role: string; content: string }[];
      if (skillId) {
        const skill = await api.readSkill(skillId);
        messages = [
          { role: 'system', content: skill.content },
          { role: 'user', content: prompt || 'Hello' },
        ];
        appendLog(`LLM 启动 · 技能「${skill.name}」· ${props.id}`);
      } else {
        messages = [{ role: 'user', content: prompt || 'Hello' }];
        appendLog(`LLM 启动 · ${props.id}`);
      }

      const res = (await api.proxyLlm({ messages })) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = res.choices?.[0]?.message?.content ?? '(无响应)';
      updateNodeData(props.id, {
        status: 'success',
        reply: text,
        output: text,
        content: text,
        lastReply: text,
        editedReply: '',
      });
      appendLog(`LLM 完成 · ${props.id}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`LLM 失败 · ${props.id}`);
    }
  }, [appendLog, prompt, props.id, skillId, updateNodeData]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-ink/70">
          技能
          <select
            value={skillId}
            onChange={(e) => updateNodeData(props.id, { skillId: e.target.value })}
            className="flex-1 rounded-lg border border-line bg-white px-2 py-1 text-xs"
          >
            <option value="">无（普通对话）</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id} title={s.description}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(props.id, { prompt: e.target.value })}
          placeholder="对话输入…"
          className="w-full min-h-[64px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm"
        />
        {displayReply && (
          <>
            <DoubleClickText
              value={displayReply}
              edited={Boolean(editedReply)}
              onSave={(text) => updateNodeData(props.id, { editedReply: text, reply: text, output: text })}
              onRestore={() =>
                updateNodeData(props.id, {
                  editedReply: '',
                  reply: lastReply,
                  output: lastReply,
                })
              }
              maxHeight={160}
            />
            {parseStoryboardMarkdown(displayReply).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const shots = parseStoryboardMarkdown(displayReply);
                  addShots(shots, 'append');
                  setStoryboardOpen(true);
                  appendLog(`从 LLM 导入 ${shots.length} 个镜头到故事板`);
                }}
                className="w-full text-xs rounded-lg border border-brand text-brand py-1.5 hover:bg-brand/5"
              >
                导入故事板 ({parseStoryboardMarkdown(displayReply).length} 镜)
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={run}
          className="w-full rounded-xl bg-accent text-white text-sm py-2 hover:bg-accent/90"
        >
          发送
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ChatModelBlock);
