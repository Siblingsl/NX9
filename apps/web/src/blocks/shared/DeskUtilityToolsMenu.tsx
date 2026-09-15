import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { UTILITY_BLOCKS } from '@nx9/shared';
import { useFlowCommands } from '../../stores/flow-commands';

export interface DeskUtilityToolsMenuProps {
  deskId: string;
  /** 当前选中镜头；有则 spawn 时绑定 linkedShotId */
  shotId?: string | null;
  className?: string;
  buttonClassName?: string;
}

/**
 * F-036: 主链 Desk 工具菜单 — spawn 连贯性/字幕/局部重绘/宫格并自动连边。
 */
export function DeskUtilityToolsMenu({
  deskId,
  shotId,
  className,
  buttonClassName,
}: DeskUtilityToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const requestSpawnForShot = useFlowCommands((s) => s.requestSpawnForShot);

  const spawn = (kind: string) => {
    const data = { connectToSource: deskId };
    if (shotId) requestSpawnForShot(shotId, kind, undefined, data);
    else requestSpawn(kind, undefined, data);
    setOpen(false);
  };

  return (
    <div className={className ?? 'relative inline-flex'}>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((v) => !v)}
        title="衔接工具：连贯性 / 字幕 / 局部重绘 / 宫格"
      >
        <Wrench size={13} /> 工具
      </button>
      {open && (
        <div
          className="absolute z-30 bottom-full mb-1 left-0 min-w-[180px] rounded-xl border border-line bg-surface shadow-lg p-1"
          role="menu"
        >
          {UTILITY_BLOCKS.map((u) => (
            <button
              key={u.kind}
              type="button"
              role="menuitem"
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-ink/80 hover:bg-brand/10 hover:text-brand"
              title={u.description}
              onClick={() => spawn(u.kind)}
            >
              <div className="font-medium">{u.label}</div>
              <div className="text-[10px] text-ink/45 line-clamp-1">{u.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
