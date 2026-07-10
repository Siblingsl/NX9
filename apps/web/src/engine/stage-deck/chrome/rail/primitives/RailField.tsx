import type { ReactNode } from 'react';

interface RailFieldProps {
  label: string;
  children: ReactNode;
}

export function RailField({ label, children }: RailFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      {children}
    </label>
  );
}

RailField.Input = function RailFieldInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-line px-2 py-1.5 text-sm focus:outline-none focus:border-brand/40"
    />
  );
};
