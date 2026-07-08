import { useMemo, useState } from 'react';
import {
  BACKLOT_TEMPLATE_TABS,
  backlotTemplatePrompt,
  listBacklotTemplates,
  type BacklotTemplateKind,
} from '@nx9/shared';
import { Layers, Sparkles } from 'lucide-react';
import { useBacklotLibraryUi } from '../../../../stores/backlot-library-ui';
import { useStoryboardUi } from '../../../../stores/flow-runtime';
import { useBacklotApply } from '../../../../hooks/use-backlot-apply';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';

export function BacklotRailPanel() {
  const setBacklotOpen = useBacklotLibraryUi((s) => s.setOpen);
  const selectedShotId = useStoryboardUi((s) => s.selectedShotId);
  const backlotCustom = useWorkspaceDocument((s) => s.backlotCustom);
  const { applyTemplate } = useBacklotApply();
  const [tab, setTab] = useState<BacklotTemplateKind>('scene');

  const templates = useMemo(
    () => listBacklotTemplates(tab, backlotCustom.items),
    [tab, backlotCustom.items],
  );

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink/50 leading-relaxed">
        快速应用 Backlot 模板到选中模块或故事板镜头。Composer Deck「模板▾」针对当前生成节点。
      </p>

      <div className="flex flex-wrap gap-1">
        {BACKLOT_TEMPLATE_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-2 py-1 text-[10px] ${
              tab === key ? 'bg-brand/10 text-brand' : 'text-ink/50 hover:bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-1 max-h-52 overflow-y-auto nx9-scroll">
        {templates.slice(0, 12).map((tpl) => (
          <li
            key={tpl.id}
            className="rounded-lg border border-line p-2 hover:border-brand/30"
          >
            <p className="font-medium text-ink truncate">{tpl.label}</p>
            <p className="text-[10px] text-ink/40 line-clamp-2 mt-0.5">
              {backlotTemplatePrompt(tpl).slice(0, 80)}…
            </p>
            <div className="flex gap-1 mt-1.5">
              <button
                type="button"
                onClick={() =>
                  applyTemplate(
                    {
                      kind: tpl.kind,
                      label: tpl.label,
                      promptEn: backlotTemplatePrompt(tpl),
                      promptZh: tpl.promptZh,
                      defaultBlockType:
                        'defaultBlockType' in tpl ? tpl.defaultBlockType : undefined,
                      characterArchetype:
                        'characterArchetype' in tpl ? tpl.characterArchetype : undefined,
                      stageDeckScene:
                        'stageDeckScene' in tpl ? tpl.stageDeckScene : undefined,
                    },
                    'fill',
                  )
                }
                className="flex-1 rounded-lg bg-brand/10 text-brand py-1"
              >
                填入选中
              </button>
              {selectedShotId && tab !== 'character' && (
                <button
                  type="button"
                  onClick={() =>
                    applyTemplate(
                      {
                        kind: tpl.kind,
                        label: tpl.label,
                        promptEn: backlotTemplatePrompt(tpl),
                        promptZh: tpl.promptZh,
                      },
                      'shot',
                    )
                  }
                  className="flex-1 rounded-lg border border-line py-1"
                >
                  写入镜头
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setBacklotOpen(true)}
        className="w-full flex items-center justify-center gap-1 rounded-xl bg-accent/10 text-accent border border-accent/20 py-2 hover:bg-accent/15"
      >
        <Layers size={14} />
        打开完整 Backlot 库
      </button>

      {selectedShotId && (
        <p className="text-[10px] text-ink/40 flex items-center gap-1">
          <Sparkles size={10} />
          已选中故事板镜头 · 「写入镜头」可用
        </p>
      )}
    </div>
  );
}
