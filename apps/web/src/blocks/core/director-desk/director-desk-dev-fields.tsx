import { Bug } from 'lucide-react';
import { useDevPromptOverrides } from '../../../stores/dev-prompt-overrides';

export function DirectorDeskDevFields({ blockId: _bid }: { blockId: string }) {
  const { values, setValue, clearKey } = useDevPromptOverrides();
  const consistencyVal = values['directorDesk.consistencySuffix'] ?? '';
  const styleLockVal = values['directorDesk.styleLockAppendix'] ?? '';

  return (
    <details style={{ margin: '8px 4px 0', padding: 8, borderRadius: 8, border: '1px dashed var(--desk-warn, #d97706)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 11, color: 'var(--desk-warn, #d97706)' }}>
        <Bug size={12} style={{ display: 'inline', marginRight: 4 }} />开发 · 导演台短模板字段（仅开发）
      </summary>
      <div className="flex flex-col gap-2 mt-2">
        <label className="text-[10px] font-bold">consistencySuffix</label>
        <textarea
          className="w-full border border-line rounded text-[10px] p-1.5 bg-surface resize-none font-mono"
          rows={2}
          placeholder="拼写在 enrich 后的附加一致性说明"
          value={consistencyVal}
          onChange={(e) => setValue('directorDesk.consistencySuffix', e.target.value)}
        />
        <div className="flex justify-between">
          <span className="text-[9px] text-ink/40">
            {consistencyVal ? '来源：全局 Dev Override' : '来源：DEFAULT（无覆盖）'}
          </span>
          {consistencyVal ? <button type="button" className="text-[9px] text-warn" onClick={() => clearKey('directorDesk.consistencySuffix')}>清除</button> : null}
        </div>
        <label className="text-[10px] font-bold">styleLockAppendix</label>
        <textarea
          className="w-full border border-line rounded text-[10px] p-1.5 bg-surface resize-none font-mono"
          rows={2}
          placeholder="拼写在风格锁附件的额外约束"
          value={styleLockVal}
          onChange={(e) => setValue('directorDesk.styleLockAppendix', e.target.value)}
        />
        <div className="flex justify-between">
          <span className="text-[9px] text-ink/40">
            {styleLockVal ? '来源：全局 Dev Override' : '来源：DEFAULT（无覆盖）'}
          </span>
          {styleLockVal ? <button type="button" className="text-[9px] text-warn" onClick={() => clearKey('directorDesk.styleLockAppendix')}>清除</button> : null}
        </div>
      </div>
    </details>
  );
}
