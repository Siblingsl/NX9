import { useCallback, useState } from 'react';
import { Sparkles, Save, X } from 'lucide-react';
import type { EnvironmentProfile, EnvironmentLibraryPayload } from '@nx9/shared';
import { compileScenePrompt, MAX_ENV_REFERENCE_IMAGES } from '@nx9/shared';
import { api } from '../../../../api/client';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useActivityLog } from '../../../../stores/activity-log';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { useToast } from '../../../../stores/toast';
import ImageUploadSlot from '../../../../blocks/shared/ImageUploadSlot';
import { EntityCard } from '../../../../components/EntityCard';

function handleAgentError(e: unknown, label: string): string {
  const raw = String(e);
  if (raw.includes('JSON') || e instanceof SyntaxError) {
    useToast.getState().push({ message: 'AI 返回格式异常，请重试', variant: 'error' });
    return `${label}失败：AI 返回格式异常，请重试`;
  }
  return `${label}失败: ${raw}`;
}

export function EnvironmentBiblePanel() {
  const [environments, setLocalEnvironments] = useState<EnvironmentProfile[]>(() => {
    return useWorkspaceDocument.getState().environments?.environments ?? [];
  });
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const scenes = useWorkspaceDocument((s) => s.scriptPlan?.scenes);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const advancePlaybookStep = useWorkspaceDocument((s) => s.advancePlaybookStep);
  const appendLog = useActivityLog((s) => s.append);
  const spawnBlockForShot = useFlowRuntime((s) => s.runtime?.spawnBlockForShot);

  const handleExtract = useCallback(async () => {
    if (!scenes || scenes.length === 0) {
      appendLog('没有场次数据，请先完成场次拆分');
      return;
    }
    setGenerating(true);
    try {
      const res = await api.extractEnvironments({ scenes });
      const envs = res.environments;
      setLocalEnvironments(envs);
      appendLog(`已生成 ${envs.length} 个环境卡`);
    } catch (e) {
      appendLog(handleAgentError(e, '环境卡生成'));
    } finally {
      setGenerating(false);
    }
  }, [scenes, appendLog]);

  const handleSave = useCallback(() => {
    const payload: EnvironmentLibraryPayload = { version: 1, environments };
    setEnvironments(payload);
    advancePlaybookStep();
    appendLog(`环境卡已保存 · ${environments.length} 条`);
  }, [environments, setEnvironments, advancePlaybookStep, appendLog]);

  const handleSpawnSceneCard = useCallback((env: EnvironmentProfile) => {
    if (!spawnBlockForShot) {
      appendLog('Canvas 运行时未就绪');
      return;
    }
    spawnBlockForShot(env.sceneCode ?? env.id, 'scene-card', {
      sceneName: env.name,
      description: env.descriptionZh,
      era: env.era ?? '',
      lighting: env.lighting ?? '',
      props: env.props ?? [],
      referenceUrls: env.referenceUrls ?? (env.referenceImageUrl ? [env.referenceImageUrl] : []),
    });
    appendLog(`已 spawn scene-card: ${env.name}`);
  }, [spawnBlockForShot, appendLog]);

  const handleUpdateEnv = useCallback((id: string, patch: Partial<EnvironmentProfile>) => {
    setLocalEnvironments((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const addEnvRef = useCallback((envId: string, url: string) => {
    setLocalEnvironments((prev) => prev.map((e) => {
      if (e.id !== envId) return e;
      const existing = e.referenceUrls ?? [];
      if (existing.includes(url) || existing.length >= MAX_ENV_REFERENCE_IMAGES) return e;
      return { ...e, referenceUrls: [...existing, url] };
    }));
  }, []);

  const removeEnvRef = useCallback((envId: string, idx: number) => {
    setLocalEnvironments((prev) => prev.map((e) => {
      if (e.id !== envId) return e;
      const updated = (e.referenceUrls ?? []).filter((_, i) => i !== idx);
      return { ...e, referenceUrls: updated };
    }));
  }, []);

  const hasScenes = scenes && scenes.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <span className="font-medium text-sm">环境设定库</span>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] text-ink/50">
          {hasScenes
            ? `从 ${scenes!.length} 个场次生成环境设定卡`
            : '请先完成场次拆分以获取场景列表'}
        </p>
        <button
          type="button"
          disabled={generating || !hasScenes}
          onClick={() => void handleExtract()}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
        >
          <Sparkles size={14} />
          {generating ? '生成中…' : '从场次生成环境卡'}
        </button>
      </div>

      {environments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">环境卡 · {environments.length}</p>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {environments.map((env) => {
              const isEditing = editingId === env.id;
              const showPreview = previewId === env.id;

              const cardData = {
                sceneName: env.name,
                description: env.descriptionZh,
                era: env.era ?? '',
                lighting: env.lighting ?? '',
                props: env.props ?? [],
                referenceUrls: env.referenceUrls ?? (env.referenceImageUrl ? [env.referenceImageUrl] : []),
              };
              const compiled = compileScenePrompt(cardData);

              const envLayers = [
                {
                  label: '场景描述',
                  content: isEditing ? (
                    <div className="space-y-2">
                      <input value={env.descriptionZh} onChange={(e) => handleUpdateEnv(env.id, { descriptionZh: e.target.value })} placeholder="场景描述" className="w-full rounded-lg border border-line bg-white px-2 py-1 text-xs" />
                      <input value={env.lighting ?? ''} onChange={(e) => handleUpdateEnv(env.id, { lighting: e.target.value })} placeholder="光线" className="w-full rounded-lg border border-line bg-white px-2 py-1 text-xs" />
                      <input value={(env.props ?? []).join(', ')} onChange={(e) => handleUpdateEnv(env.id, { props: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="道具（逗号分隔）" className="w-full rounded-lg border border-line bg-white px-2 py-1 text-xs" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-ink/70">{env.descriptionZh}</p>
                      {env.lighting && <p className="text-[11px] text-ink/50">光线：{env.lighting}</p>}
                      {env.props && env.props.length > 0 && <p className="text-[11px] text-ink/50">道具：{env.props.join('、')}</p>}
                    </div>
                  ),
                },
                {
                  label: `参考图（{(env.referenceUrls ?? []).length}/${MAX_ENV_REFERENCE_IMAGES}）`,
                  content: (
                    <div className="space-y-2">
                      {(env.referenceUrls ?? []).length < MAX_ENV_REFERENCE_IMAGES && (
                        <ImageUploadSlot url="" label="上传参考图" compact onUploaded={(url) => addEnvRef(env.id, url)} />
                      )}
                      {(env.referenceUrls ?? []).length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5">
                          {(env.referenceUrls ?? []).map((url, idx) => (
                            <div key={idx} className="relative group">
                              <img src={url} alt="" className="w-full aspect-square rounded-lg object-cover border border-line" />
                              <button type="button" onClick={() => removeEnvRef(env.id, idx)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-ink/60 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100"><X size={8} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  label: 'AI 描述预览',
                  content: (
                    <pre className="rounded-lg bg-ink/5 p-2 text-[10px] text-ink/70 whitespace-pre-wrap max-h-24 overflow-y-auto">{compiled}</pre>
                  ),
                },
              ];

              return (
                <EntityCard
                  title={env.name}
                  subtitle={env.descriptionZh}
                  layers={envLayers}
                  onOptimize={() => setEditingId(isEditing ? null : env.id)}
                  actions={
                    <button
                      type="button"
                      onClick={() => handleSpawnSceneCard(env)}
                      disabled={!spawnBlockForShot}
                      className="flex-1 rounded-xl bg-brand text-white py-1.5 text-[11px] disabled:opacity-50"
                    >
                      spawn scene-card 到画布
                    </button>
                  }
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
          >
            <Save size={14} />
            保存环境库
          </button>
        </div>
      )}
    </div>
  );
}
