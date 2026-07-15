import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { has_environment_bibles, has_character_bibles, has_source_text, has_storyboard_shots, has_camera_blocks } from '@nx9/shared';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { useContextRailUi } from '../../stores/context-rail-ui';

interface InspectionItem {
  label: string;
  ok: boolean;
  hint: string;
  action?: () => void;
}

export function InspectionPanel() {
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const environments = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters);
  const runtime = useFlowRuntime((s) => s.runtime);
  const requestRailTab = useContextRailUi((s) => s.requestTab);

  const ctx = useMemo(() => ({
    storyboard: {
      title: storyboard.title,
      activeEpisodeId: storyboard.activeEpisodeId,
      shots: storyboard.shots.map((sh) => ({
        id: sh.id,
        episodeId: sh.episodeId,
        status: sh.status as string,
        firstFrameAssetId: sh.firstFrameAssetId ?? undefined,
        videoAssetId: sh.videoAssetId ?? undefined,
        keyframeStatus: sh.keyframeStatus,
        videoStatus: sh.videoStatus,
        linkedBlockId: sh.linkedBlockId ?? undefined,
      })),
    },
    voice,
    nodes: (runtime?.getNodes() ?? []).map((n) => ({ id: n.id, type: n.type ?? '', data: n.data as Record<string, unknown> })),
    scriptPlan: scriptPlan ?? undefined,
    environments: environments?.environments ?? undefined,
    characters: characters.characters.map((c) => ({ name: c.name, appearance: (c as any).bible?.appearance, consistencyPrompt: c.consistencyPrompt, referenceImageUrl: c.referenceImageUrl ?? undefined })),
  }), [storyboard, voice, scriptPlan, environments, characters, runtime]);

  const nodes = runtime?.getNodes() ?? [];
  const shots = storyboard.shots;

  const items: InspectionItem[] = useMemo(() => {
    const unlinkedShots = shots.filter((s) => !s.linkedBlockId);
    const noKeyframeShots = shots.filter((s) => !s.firstFrameAssetId);
    const failedVideos = shots.filter((s) => (s.videoStatus as string) === 'error');
    const failedNodes = nodes.filter((n) => (n.data as Record<string, unknown>)?.status === 'error');

    return [
      {
        label: '剧本',
        ok: has_source_text(ctx),
        hint: '粘贴小说或剧本到 Script Studio',
        action: () => requestRailTab('script'),
      },
      {
        label: '场次拆分',
        ok: (scriptPlan?.scenes?.length ?? 0) >= 1,
        hint: 'AI 拆分为场次',
        action: () => requestRailTab('script', { librarySub: 'scene-split' as any }),
      },
      {
        label: '分镜表',
        ok: has_storyboard_shots(ctx),
        hint: '生成故事板镜头',
        action: () => requestRailTab('storyboard'),
      },
      {
        label: '角色设定 + 参考图',
        ok: has_character_bibles(ctx),
        hint: '提取角色，填写设定 + 参考图',
        action: () => requestRailTab('library', { librarySub: 'character' as any }),
      },
      {
        label: '环境卡 + 参考图',
        ok: has_environment_bibles(ctx),
        hint: '生成环境卡，上传至少 1 张参考图',
        action: () => requestRailTab('library', { librarySub: 'templates' as any }),
      },
      {
        label: '镜头关联机位',
        ok: has_camera_blocks(ctx),
        hint: '为镜头关联导演台/3D 机位模块',
        action: () => requestRailTab('storyboard'),
      },
      ...(unlinkedShots.length > 0
        ? [{
            label: `未绑定模块（${unlinkedShots.length} 镜）`,
            ok: false,
            hint: '有镜头未关联画布模块',
            action: () => requestRailTab('storyboard'),
          } as InspectionItem]
        : []),
      ...(noKeyframeShots.length > 0 && noKeyframeShots.length < shots.length
        ? [{
            label: `缺失关键帧（${noKeyframeShots.length} 镜）`,
            ok: false,
            hint: '运行 picture-gen 批量生成',
            action: () => requestRailTab('inspector'),
          } as InspectionItem]
        : []),
      ...(failedVideos.length > 0
        ? [{
            label: `视频生成失败（${failedVideos.length} 镜）`,
            ok: false,
            hint: '点击重试或换模型',
            action: () => requestRailTab('inspector'),
          } as InspectionItem]
        : []),
      ...(failedNodes.length > 0
        ? [{
            label: `模块运行失败（${failedNodes.length} 个）`,
            ok: false,
            hint: '查看节点错误信息后重试',
            action: () => requestRailTab('inspector'),
          } as InspectionItem]
        : []),
    ];
  }, [ctx, scriptPlan, requestRailTab, shots, nodes]);

  const warnings = items.filter((i) => !i.ok);
  const okCount = items.filter((i) => i.ok).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">检查中心</span>
        <span className="text-[10px] text-ink/40">{okCount}/{items.length} 就绪</span>
      </div>
      {warnings.length === 0 ? (
        <p className="text-[11px] text-ok flex items-center gap-1">
          <CheckCircle size={14} /> 所有检查项通过
        </p>
      ) : (
        <div className="space-y-1">
          {warnings.map((item) => (
            <div key={item.label} className="flex items-start gap-2 rounded-lg bg-warn/5 border border-warn/20 p-2">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-ink/80">{item.label}</p>
                <p className="text-[10px] text-ink/50">{item.hint}</p>
              </div>
              {item.action && (
                <button
                  type="button"
                  onClick={item.action}
                  className="shrink-0 rounded-lg bg-brand text-white px-2 py-1 text-[10px] flex items-center gap-0.5"
                >
                  去修复 <ArrowRight size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
