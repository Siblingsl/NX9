import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    const variants: Record<string, string> = {
      primary: 'bg-brand text-white hover:bg-brand/90',
      secondary: 'border border-line bg-white text-ink/70 hover:border-brand/30 hover:text-brand',
      ghost: 'text-ink/50 hover:bg-surface hover:text-ink/80',
      danger: 'bg-error text-white hover:bg-error/90',
    };
    const sizes: Record<string, string> = {
      sm: 'h-8 px-3 text-[11px]',
      md: 'h-[var(--nx9-btn-h)] px-4 text-sm',
      lg: 'h-11 px-6 text-sm',
    };
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
