import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && <label className="text-[11px] font-medium text-ink/60">{label}</label>}
        <input
          ref={ref}
          className={`w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand/40 focus:ring-1 focus:ring-brand/20 ${className}`}
          {...props}
        />
      </div>
    );
  },
);
