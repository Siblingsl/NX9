import { useState } from 'react';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { listWorkflowTemplates, type WorkflowTemplate } from '@nx9/shared';
import {
  FIRST_LANE_TEMPLATE_IDS,
  filterTemplatesForFirstLane,
  isFirstLaneUnlocked,
  unlockFirstLane,
} from '../../first-lane';

function featuredRecipes(unlocked: boolean): WorkflowTemplate[] {
  const listed = listWorkflowTemplates();
  if (!unlocked) {
    const byId = new Map(listed.map((t) => [t.id, t]));
    return FIRST_LANE_TEMPLATE_IDS.map((id) => byId.get(id)).filter(Boolean) as WorkflowTemplate[];
  }
  const FEATURED = ['tpl-core-episode', 'tpl-ai-short-film', 'tpl-text-to-picture', 'tpl-image-to-clip'] as const;
  const byId = new Map(listed.map((t) => [t.id, t]));
  const featured = FEATURED.map((id) => byId.get(id)).filter(Boolean) as WorkflowTemplate[];
  return featured.length > 0 ? featured : filterTemplatesForFirstLane(listed).slice(0, 4);
}

interface RecipePickerOverlayProps {
  onPick: (templateId: string) => void;
  onBlank: () => void;
}

export function RecipePickerOverlay({ onPick, onBlank }: RecipePickerOverlayProps) {
  const [unlocked, setUnlocked] = useState(() => isFirstLaneUnlocked());
  const recipes = featuredRecipes(unlocked);

  return (
    <div className="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-2xl mx-4 rounded-2xl border border-line bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)] shadow-panel p-6"
        data-testid="recipe-picker"
        data-first-lane={unlocked ? 'off' : 'on'}
      >
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">
              {unlocked ? '选择制作起点' : '从核心流程开始'}
            </h2>
            <p className="text-sm text-ink/55 mt-0.5">
              {unlocked
                ? '推荐核心剧集或短片流程；需要自由搭节点时选空白画布'
                : '首用只保留「AI 漫剧核心流程」一条路，完成导出或点下方可解锁全部配方'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {recipes.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onPick(tpl.id)}
              className="text-left rounded-xl border border-line px-3 py-2.5 hover:border-brand/40 hover:bg-surface transition-colors"
              data-testid={`recipe-pick-${tpl.id}`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <LayoutTemplate size={14} className="text-brand shrink-0" />
                {tpl.label}
              </span>
              <span className="block text-[11px] text-ink/50 mt-1 line-clamp-2">{tpl.description}</span>
            </button>
          ))}
        </div>

        {!unlocked && (
          <button
            type="button"
            data-testid="recipe-unlock-all"
            onClick={() => {
              unlockFirstLane();
              setUnlocked(true);
            }}
            className="w-full mb-2 rounded-xl border border-line py-2 text-xs text-ink/70 hover:border-brand/30 hover:text-ink"
          >
            查看全部配方（进阶）
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            unlockFirstLane();
            onBlank();
          }}
          className="w-full rounded-xl border border-dashed border-line py-2 text-xs text-ink/60 hover:border-brand/30 hover:text-ink"
        >
          空白画布 — 自行拖入模块搭建
        </button>
      </div>
    </div>
  );
}
