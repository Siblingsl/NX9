import type { ReactNode } from 'react';

interface RailShellProps {
  tabs: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function RailShell({ tabs, children, footer }: RailShellProps) {
  return (
    <div className="flex flex-col h-full">
      {tabs}
      <div className="flex-1 overflow-y-auto nx9-scroll nx9-rail-body">
        {children}
      </div>
      {footer && (
        <div className="border-t border-line px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
