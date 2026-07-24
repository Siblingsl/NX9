import type { PlaybookStepDef, PlaybookDefinition } from '../data/playbook-definitions';
import type { PlaybookSession } from '../types/workspace';

export interface PlaybookReadinessContext {
  storyboard: {
    title?: string;
    activeEpisodeId?: string | null;
    shots: Array<{
      id: string;
      episodeId?: string | null;
      status: string;
      firstFrameAssetId?: string;
      videoAssetId?: string;
      keyframeStatus?: string;
      videoStatus?: string;
      linkedBlockId?: string;
    }>;
  };
  voice: { lines: unknown[] };
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  scriptPlan?: { sourceText?: string; scenes?: Array<{ characters: string[] }> };
  environments?: Array<{ descriptionZh?: string; referenceUrls?: string[]; referenceImageUrl?: string | null }>;
  characters?: Array<{ name: string; appearance?: string; consistencyPrompt?: string; referenceImageUrl?: string }>;
  playbookSession?: { completedStepIds: string[] } | null;
}

function scopedShots(ctx: PlaybookReadinessContext) {
  const activeEpisodeId = ctx.storyboard.activeEpisodeId;
  if (!activeEpisodeId) return ctx.storyboard.shots;
  const scoped = ctx.storyboard.shots.filter((shot) => shot.episodeId === activeEpisodeId);
  return scoped.length > 0 ? scoped : ctx.storyboard.shots;
}

export function has_source_text(ctx: PlaybookReadinessContext): boolean {
  return !!(
    ctx.scriptPlan?.sourceText?.trim() ||
    (ctx.storyboard as any)?.title?.trim() ||
    ctx.nodes.some((node) =>
      (node.type === 'dialogue-sheet' || node.type === 'script-desk') &&
      (Boolean((node.data?.sourceText as string | undefined)?.trim()) ||
        Boolean(node.data?.scriptBreakdown)),
    )
  );
}

export function has_storyboard_shots(ctx: PlaybookReadinessContext): boolean {
  // 核心路径：至少 1 镜即可继续；「全出」覆盖率在后续步骤强制
  return scopedShots(ctx).length >= 1;
}

export function story_grid_confirmed(ctx: PlaybookReadinessContext): boolean {
  const grid = ctx.nodes.find((node) => node.type === 'story-grid');
  if (!grid || scopedShots(ctx).length === 0) return false;
  const confirmedEpisodeIds = Array.isArray(grid.data?.confirmedEpisodeIds)
    ? (grid.data.confirmedEpisodeIds as string[])
    : [];
  const activeEpisodeId = ctx.storyboard.activeEpisodeId;
  return activeEpisodeId
    ? confirmedEpisodeIds.includes(activeEpisodeId)
    : grid.data?.gridConfirmed === true || confirmedEpisodeIds.length > 0;
}

export function has_line_art_thumbnails(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  if (shots.length === 0) return false;
  const withThumb = shots.filter(s => !!s.firstFrameAssetId).length;
  return withThumb / shots.length >= 0.5;
}

export function all_shots_approved(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  return shots.length > 0 && shots.every(s => s.status === 'approved');
}

export function all_keyframes_approved(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  return shots.length > 0 && shots.every(s => s.keyframeStatus === 'approved');
}

export function all_videos_approved(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  return shots.length > 0 && shots.every(s => s.videoStatus === 'approved');
}

export function has_video_takes(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  if (shots.length === 0) return false;
  // 以 Shot 视频资产为准（不再用节点 done 冒充）
  return shots.every((s) => !!s.videoAssetId);
}

export function has_video_assets(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  if (shots.length === 0) return false;
  // 核心路径：全部镜头必须有 videoAssetId（禁止节点 status 假阳性）
  return shots.every((s) => !!s.videoAssetId);
}

export function canvas_node_done(ctx: PlaybookReadinessContext, ...args: string[]): boolean {
  const kind = args[0];
  if (!kind) return false;
  return ctx.nodes.some(n => n.type === kind && (n.data?.status === 'done' || n.data?.status === 'success'));
}

export function review_gate_passed(ctx: PlaybookReadinessContext, ...args: string[]): boolean {
  const gateMode = args.length > 0 ? args[0] : undefined;
  // 审阅关卡节点已拆除：按镜头批准态判定（兼容旧 readinessKey）
  if (gateMode === 'video') return all_videos_approved(ctx);
  if (gateMode === 'keyframe') return all_keyframes_approved(ctx);
  return all_keyframes_approved(ctx) || all_videos_approved(ctx);
}

export function has_character_refs(ctx: PlaybookReadinessContext): boolean {
  return ctx.nodes.some(n => n.data?.characterId);
}

export function has_voice_lines(ctx: PlaybookReadinessContext): boolean {
  return ctx.voice.lines.length > 0;
}

export function has_generate_assets(ctx: PlaybookReadinessContext): boolean {
  return ctx.nodes.some(n =>
    (n.type === 'picture-gen' || n.type === 'clip-gen') &&
    (n.data?.status === 'done' || n.data?.status === 'success')
  );
}

export function has_scene_split(ctx: PlaybookReadinessContext): boolean {
  return (ctx.scriptPlan?.scenes?.length ?? 0) >= 1;
}

export function has_environment_bibles(ctx: PlaybookReadinessContext, ...args: string[]): boolean {
  const requireReferenceImages = args.length === 0 || args[0] !== 'soft';
  const envs = (ctx.environments ?? []) as Array<{ descriptionZh?: string; referenceUrls?: string[]; referenceImageUrl?: string }>;
  if (envs.length < 1) return false;
  return envs.some(
    (e) => (e.descriptionZh?.trim() ?? '') !== '' && (requireReferenceImages ? (e.referenceUrls?.length ?? 0) >= 1 : true),
  );
}

export function has_character_bibles(ctx: PlaybookReadinessContext): boolean {
  const chars = ctx.characters ?? [];
  if (chars.length === 0) return false;
  const scenes = (ctx as any).scriptPlan?.scenes as Array<{ characters: string[] }> | undefined;
  const characterSceneCount: Record<string, number> = {};
  if (scenes) {
    for (const s of scenes) {
      for (const c of s.characters ?? []) {
        characterSceneCount[c] = (characterSceneCount[c] ?? 0) + 1;
      }
    }
  }
  const mainCharNames = new Set(Object.entries(characterSceneCount).filter(([_, count]) => count >= 2).map(([name]) => name));
  const matching = chars.filter(c =>
    mainCharNames.size === 0 || mainCharNames.has(c.name)
  );
  const done = matching.filter(c =>
    ((c.appearance?.trim() ?? '') !== '' || (c as any).consistencyPrompt?.trim() !== '') &&
    (c.referenceImageUrl?.trim() ?? '') !== ''
  );
  return done.length >= 1;
}

export function has_camera_blocks(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  if (shots.length === 0) return false;
  const cameraKinds = new Set(['director-3d', 'director-desk', 'blocking-stage']);
  const withBlock = shots.filter(s => {
    if (!s.linkedBlockId) return false;
    const block = ctx.nodes.find(n => n.id === s.linkedBlockId);
    return block && cameraKinds.has(block.type);
  }).length;
  return withBlock / shots.length >= 0.5;
}

export function has_keyframes(ctx: PlaybookReadinessContext): boolean {
  const shots = scopedShots(ctx);
  if (shots.length === 0) return false;
  // 核心路径：全部镜头必须有 firstFrameAssetId（禁止节点 done 假阳性）
  return shots.every((s) => !!s.firstFrameAssetId);
}

export function consistency_resolved(ctx: PlaybookReadinessContext): boolean {
  const continuity = ctx.nodes.find(n => n.type === 'continuity-check');
  if (!continuity) return true;
  const issues = continuity.data?.issues as unknown[];
  if (!Array.isArray(issues)) return true;
  return issues.length === 0 || (continuity.data as any)?.skipped === true;
}

export function export_ready(ctx: PlaybookReadinessContext): boolean {
  return ctx.nodes.some(n =>
    n.type === 'export-pack' &&
    (n.data?.status === 'done' || n.data?.status === 'success')
  );
}

type ReadinessFn = (ctx: PlaybookReadinessContext, ...args: string[]) => boolean;

export const readinessRegistry: Record<string, ReadinessFn> = {
  has_source_text,
  has_storyboard_shots,
  story_grid_confirmed,
  has_line_art_thumbnails,
  all_shots_approved,
  all_keyframes_approved,
  all_videos_approved,
  has_video_takes,
  has_video_assets,
  canvas_node_done,
  review_gate_passed,
  has_character_refs,
  has_voice_lines,
  has_generate_assets,
  has_scene_split,
  has_environment_bibles,
  has_character_bibles,
  has_camera_blocks,
  has_keyframes,
  consistency_resolved,
  export_ready,
};

export function evaluatePlaybookStep(
  step: PlaybookStepDef,
  ctx: PlaybookReadinessContext,
): { ready: boolean; blockReason?: string } {
  const parts = step.readinessKey.split(/\s+/);
  const baseKey = parts[0];
  const args = parts.slice(1);
  const fn = readinessRegistry[baseKey];
  if (!fn) {
    return { ready: false, blockReason: `Unknown readiness key "${baseKey}"` };
  }
  const ready = fn(ctx, ...args);
  if (!ready) {
    return { ready: false, blockReason: `Step "${step.id}": condition "${step.readinessKey}" not met` };
  }
  return { ready: true };
}

export function resolveNextStep(
  playbook: PlaybookDefinition,
  session: PlaybookSession,
  ctx: PlaybookReadinessContext,
): { step: PlaybookStepDef; index: number; allDone: boolean } {
  const completed = new Set(session.completedStepIds);

  for (let i = 0; i < playbook.steps.length; i++) {
    const step = playbook.steps[i];
    if (completed.has(step.id)) continue;
    const { ready } = evaluatePlaybookStep(step, ctx);
    if (!ready) {
      if (step.optional) {
        completed.add(step.id);
        continue;
      }
      return { step, index: i, allDone: false };
    }
  }

  const last = playbook.steps[playbook.steps.length - 1];
  return { step: last, index: playbook.steps.length - 1, allDone: true };
}
