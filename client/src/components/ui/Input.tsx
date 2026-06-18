import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  suffix?: React.ReactNode;
}

export function Input({ label, suffix, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
      )}
      <div className="relative">
        <input
          className={clsx(
            "w-full rounded-2xl bg-foreground/6 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:bg-foreground/8 transition-all",
            suffix && "pr-20",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
