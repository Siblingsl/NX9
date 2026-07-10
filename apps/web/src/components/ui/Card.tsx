import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  children: ReactNode;
}

export function Card({ padded = true, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-line bg-white ${padded ? 'p-[var(--nx9-card-padding)]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
