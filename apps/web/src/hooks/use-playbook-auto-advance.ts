import { useEffect, useRef } from 'react';
import {
  PLAYBOOK_DEFINITIONS,
  type PlaybookReadinessContext,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useContextRailUi } from '../engine/stage-deck/stores/context-rail-ui';
import { useToast } from '../stores/toast';

export function usePlaybookAutoAdvance() {
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const environments = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters);
  const advance = useWorkspaceDocument((s) => s.advancePlaybookStep);
  const runtime = useFlowRuntime((s) => s.runtime);
  const requestRailTab = useContextRailUi((s) => s.requestTab);
  const pushToast = useToast((s) => s.push);
  const prevStepRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session || session.dismissed) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const prevId = prevStepRef.current;
      const curId = session.currentStepId;
      const ctx: PlaybookReadinessContext = {
        storyboard: {
          title: storyboard.title,
          shots: storyboard.shots.map((sh) => ({
            id: sh.id,
            status: sh.status as string,
            firstFrameAssetId: sh.firstFrameAssetId ?? undefined,
            keyframeStatus: sh.keyframeStatus,
            videoStatus: sh.videoStatus,
            linkedBlockId: sh.linkedBlockId ?? undefined,
          })),
        },
        voice,
        nodes: (runtime?.getNodes() ?? []).map((n) => ({
          id: n.id,
          type: n.type ?? 'unknown',
          data: (n.data ?? {}) as Record<string, unknown>,
        })),
        scriptPlan: scriptPlan ?? undefined,
        environments: environments?.environments ?? undefined,
        characters: characters.characters.map((c) => ({
          name: c.name,
          appearance: (c as any).bible?.appearance,
          consistencyPrompt: c.consistencyPrompt,
          referenceImageUrl: c.referenceImageUrl ?? undefined,
        })),
        playbookSession: session,
      };

      const prevSession = { ...session };
      advance(ctx);
      prevStepRef.current = curId;

      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
      if (def) {
        const oldIdx = def.steps.findIndex((s) => s.id === prevId);
        const newIdx = def.steps.findIndex((s) => s.id === curId);
        if (newIdx > oldIdx && oldIdx >= 0) {
          const completed = def.steps[oldIdx];
          if (completed) {
            const milestoneSteps = [3, 6, 8, 12]; // ④⑦⑨⑬ (0-indexed)
            const isMilestone = milestoneSteps.includes(oldIdx);
            let message = `第 ${oldIdx + 1} 步 ${completed.shortLabel || completed.label} 已完成`;
            if (isMilestone) {
              const celebrations: Record<number, string> = {
                3: '🎭 角色设定完成 — 人物墙已就绪',
                6: '🎨 关键帧全部生成 — 缩略图瀑布流',
                8: '🎬 视频已就绪 — 第一镜自动播放',
                12: '🏆 导出完成 — 全屏庆祝！下载你的成片',
              };
              message = celebrations[oldIdx] ?? `🎉 第 ${oldIdx + 1} 步里程碑达成！`;
            }
            pushToast({ message, variant: 'success' });
          }
          const nextStep = def.steps[newIdx];
          if (nextStep && nextStep.primaryAction.type === 'open_rail') {
            requestRailTab(nextStep.primaryAction.tab, nextStep.primaryAction.sub
              ? { librarySub: nextStep.primaryAction.sub as any }
              : undefined);
          }
        }
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session, storyboard, voice, scriptPlan, environments, characters, runtime, advance, requestRailTab, pushToast]);
}
