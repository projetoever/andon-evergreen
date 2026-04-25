import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";
type Size = "md" | "lg" | "xl";

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
}

const toneClasses: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
  info: "bg-info text-info-foreground hover:bg-info/90",
  neutral: "bg-neutral text-neutral-foreground hover:bg-neutral/90",
};

const sizeClasses: Record<Size, string> = {
  md: "min-h-[56px] px-6 text-base",
  lg: "min-h-[72px] px-8 text-xl",
  xl: "min-h-[88px] px-10 text-2xl",
};

export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(
  ({ className, tone = "primary", size = "lg", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-3 rounded-xl font-bold uppercase tracking-wider shadow-lg transition-all",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]",
          toneClasses[tone],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
BigButton.displayName = "BigButton";
