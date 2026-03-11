import { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', icon, ...props }, ref) => {
    return (
      <div className={`relative flex items-center bg-slate-900/50 rounded-lg px-3 border border-slate-800 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-colors ${className}`}>
        {icon && <div className="mr-3 text-slate-500 shrink-0">{icon}</div>}
        <input
          ref={ref}
          className="w-full bg-transparent border-none focus:ring-0 text-sm py-2 text-slate-200 placeholder-slate-600 focus:outline-none"
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
