import { memo } from 'react';

interface PillOption {
  id: string;
  label: string;
}

interface GenSettingsPillsProps {
  label: string;
  options: readonly PillOption[] | PillOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function GenSettingsPills({ label, options, value, onChange, className = '' }: GenSettingsPillsProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-[10px] text-ink/50">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`nodrag nopan text-[10px] px-2 py-1 rounded-full border transition-colors ${
              value === opt.id
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'border-line text-ink/60 hover:border-brand/30 hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(GenSettingsPills);
