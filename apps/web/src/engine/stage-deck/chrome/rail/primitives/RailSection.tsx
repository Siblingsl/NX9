import type { ReactNode } from 'react';

interface RailSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function RailSection({ title, description, children }: RailSectionProps) {
  return (
    <section className="space-y-2 nx9-rail-section">
      {title && (
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
      )}
      {description && (
        <p className="text-[11px] text-ink/50 leading-relaxed">{description}</p>
      )}
      {children}
    </section>
  );
}
