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

/* ── 增量追加：推演 / 设定表分组 ─────────────────────────────────────────────
 * 多格推演（multi-grid）与角色设定表（character-sheet-desk）是本会话新增的
 * 「一键拉起」入口。上面既有 FEATURED 推荐位顺序不变，这里只**追加**一个分组，
 * 保证新模板在空白画布的模板选择器里也能被看到（不止命令面板可搜）。
 * 未解锁首用单车道时不投放：与既有「首用只保留核心流程」口径一致。
 * 索引见 docs/NX9-NEW-CAPABILITY-ENTRYPOINTS.md。
 * ─────────────────────────────────────────────────────────────────────────── */
const DEDUCTION_RECIPE_IDS = [
  'tpl-multigrid-multicam',
  'tpl-multigrid-story',
  'tpl-multigrid-frame',
  'tpl-character-sheet-desk',
  'tpl-bgm-beat-camera',
] as const;

function deductionRecipes(unlocked: boolean): WorkflowTemplate[] {
  if (!unlocked) return [];
  const byId = new Map(listWorkflowTemplates().map((t) => [t.id, t]));
  return DEDUCTION_RECIPE_IDS.map((id) => byId.get(id)).filter(Boolean) as WorkflowTemplate[];
}

function RecipeButton({ tpl, onPick }: { tpl: WorkflowTemplate; onPick: (id: string) => void }) {
  return (
    <button
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
  );
}

export function RecipePickerOverlay({ onPick, onBlank }: RecipePickerOverlayProps) {
  const [unlocked, setUnlocked] = useState(() => isFirstLaneUnlocked());
  const recipes = featuredRecipes(unlocked);
  const deduction = deductionRecipes(unlocked);

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

        {deduction.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-ink/50 mb-2">
              推演与设定表 — 多格推演 / 角色设定表 / BGM 节拍运镜
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[26vh] overflow-y-auto nx9-scroll">
              {deduction.map((tpl) => (
                <RecipeButton key={tpl.id} tpl={tpl} onPick={onPick} />
              ))}
            </div>
          </div>
        )}

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
