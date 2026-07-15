import { LayoutTemplate, Sparkles } from 'lucide-react';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@nx9/shared';

const FEATURED_RECIPE_IDS = [
  'tpl-core-episode',
  'tpl-text-to-picture',
  'tpl-image-to-clip',
] as const;

function featuredRecipes(): WorkflowTemplate[] {
  const byId = new Map(WORKFLOW_TEMPLATES.map((t) => [t.id, t]));
  return FEATURED_RECIPE_IDS.map((id) => byId.get(id)).filter(Boolean) as WorkflowTemplate[];
}

interface RecipePickerOverlayProps {
  onPick: (templateId: string) => void;
  onBlank: () => void;
}

export function RecipePickerOverlay({ onPick, onBlank }: RecipePickerOverlayProps) {
  const recipes = featuredRecipes();

  return (
    <div className="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-2xl mx-4 rounded-2xl border border-line bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)] shadow-panel p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">从配方开始</h2>
            <p className="text-sm text-ink/55 mt-0.5">
              空画布默认入口 — 选一条生产链，或从空白模块自行搭建
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {recipes.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onPick(tpl.id)}
              className="text-left rounded-xl border border-line px-3 py-2.5 hover:border-brand/40 hover:bg-white transition-colors"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <LayoutTemplate size={14} className="text-brand shrink-0" />
                {tpl.label}
              </span>
              <span className="block text-[11px] text-ink/50 mt-1 line-clamp-2">{tpl.description}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onBlank}
          className="w-full rounded-xl border border-dashed border-line py-2 text-xs text-ink/60 hover:border-brand/30 hover:text-ink"
        >
          空白画布 — 从左侧 Dock 拖入模块
        </button>
      </div>
    </div>
  );
}
