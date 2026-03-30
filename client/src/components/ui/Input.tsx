import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  suffix?: React.ReactNode;
}

export function Input({ label, suffix, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-400">{label}</label>
      )}
      <div className="relative">
        <input
          className={clsx(
            "w-full rounded-2xl bg-white/6 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:bg-white/[0.08] transition-all",
            suffix && "pr-20",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
