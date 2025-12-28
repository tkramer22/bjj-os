import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface BJJButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "default" | "lg";
}

const BJJButton = forwardRef<HTMLButtonElement, BJJButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => {
    return (
      <button
        className={cn(
          // Base styles
          "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          
          // Size variants
          size === "default" && "px-10 py-4 text-lg",
          size === "lg" && "px-12 py-5 text-xl",
          
          // Variant styles
          variant === "primary" && [
            "bjj-gradient-bg text-white border-none",
            "hover:-translate-y-0.5 hover:bjj-hero-shadow",
            "active:translate-y-0",
          ],
          variant === "secondary" && [
            "bg-transparent border-2 border-[hsl(var(--bjj-primary-purple))] text-[hsl(var(--bjj-text-primary))]",
            "hover:-translate-y-0.5 hover:bg-[hsl(var(--bjj-primary-purple)_/_0.1)]",
            "active:translate-y-0",
          ],
          variant === "outline" && [
            "bg-transparent border-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))]",
            "hover:-translate-y-0.5 hover:border-[hsl(var(--bjj-primary-purple))]",
            "active:translate-y-0",
          ],
          
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

BJJButton.displayName = "BJJButton";

export { BJJButton };
