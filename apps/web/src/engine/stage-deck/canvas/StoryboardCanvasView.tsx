import { useMemo, useCallback } from 'react';
import { RefreshCw, Sparkles, Play } from 'lucide-react';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime } from '../../../stores/flow-runtime';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  review: '待审阅',
  approved: '已通过',
  failed: '失败',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-ink/10 text-ink/60',
  generating: 'bg-amber-100 text-amber-700',
  review: 'bg-brand/10 text-brand',
  approved: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

export function StoryboardCanvasView() {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const shots = storyboard.shots;
  const spawnBlockForShot = useFlowRuntime((s) => s.runtime?.spawnBlockForShot);

  const scenes = useMemo(() => {
    const sceneMap = new Map<string, typeof shots>();
    for (const shot of shots) {
      const code = shot.sceneCode ?? 'default';
      if (!sceneMap.has(code)) sceneMap.set(code, []);
      sceneMap.get(code)!.push(shot);
    }
    const result: Array<{ code: string; label: string; shots: typeof shots }> = [];
    for (const [code, sceneShots] of sceneMap) {
      const scene = scriptPlan?.scenes?.find((s) => s.sceneCode === code);
      result.push({
        code,
        label: scene?.summary ?? `场景 ${code}`,
        shots: sceneShots,
      });
    }
    result.sort((a, b) => a.code.localeCompare(b.code));
    return result;
  }, [shots, scriptPlan]);

  const handleQuickGenerate = useCallback((shotId: string) => {
    if (!spawnBlockForShot) return;
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    spawnBlockForShot(shotId, 'picture-gen', {
      linkedShotId: shotId,
      content: shot.promptEn || shot.descriptionZh,
    });
  }, [spawnBlockForShot, shots]);

  if (shots.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/40">
        暂无镜头数据
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto nx9-scroll p-6 space-y-6">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-ink/80">故事板 · {shots.length} 镜</span>
        <span className="text-[10px] text-ink/40">{scenes.length} 场</span>
      </div>
      {scenes.map((scene) => (
        <div key={scene.code} className="rounded-xl border border-line bg-white/60">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-surface/50 rounded-t-xl">
            <span className="text-xs font-semibold text-ink/70">{scene.label}</span>
            <span className="text-[10px] text-ink/40">{scene.code} · {scene.shots.length} 镜</span>
          </div>
          <div className="grid grid-cols-4 gap-3 p-4">
            {scene.shots.map((shot) => (
              <div key={shot.id} className="rounded-lg border border-line bg-white overflow-hidden">
                <div className="aspect-video bg-surface flex items-center justify-center">
                  {shot.firstFrameAssetId ? (
                    <img
                      src={shot.firstFrameAssetId}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-ink/30">待生成</span>
                  )}
                </div>
                <div className="p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-ink/70">#{shot.index}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[shot.status] ?? ''}`}>
                      {STATUS_LABEL[shot.status] ?? shot.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink/50 line-clamp-2">{shot.descriptionZh || shot.promptEn || ''}</p>
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleQuickGenerate(shot.id)}
                      className="flex-1 flex items-center justify-center gap-0.5 rounded-lg bg-brand/10 text-brand py-1 text-[9px]"
                      title="快捷生成"
                    >
                      <Sparkles size={10} /> 生成
                    </button>
                    {shot.firstFrameAssetId && (
                      <button
                        type="button"
                        className="flex items-center justify-center gap-0.5 rounded-lg border border-line px-1.5 py-1 text-[9px] text-ink/50"
                        title="播放"
                      >
                        <Play size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
