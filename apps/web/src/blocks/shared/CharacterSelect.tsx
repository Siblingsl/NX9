import type { CharacterProfile } from '@nx9/shared';

export function CharacterSelect({
  characters,
  value,
  onChange,
  className = '',
}: {
  characters: CharacterProfile[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  if (characters.length === 0) return null;

  return (
    <label className={`block text-[10px] text-ink/50 ${className}`}>
      角色一致性
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink"
      >
        <option value="">自动（关联镜头角色）</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CharacterBadge({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="text-[10px] text-brand/80" title={names.join(', ')}>
      角色: {names.join(' · ')}
    </p>
  );
}
