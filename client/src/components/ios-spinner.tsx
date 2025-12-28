import { cn } from "@/lib/utils";

interface IOSSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function IOSSpinner({ size = "md", className }: IOSSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8"
  };

  return (
    <div
      className={cn(
        "relative inline-block",
        sizeClasses[size],
        className
      )}
      data-testid="ios-spinner"
    >
      <div className="absolute inset-0">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 -translate-x-1/2 w-[8%] h-[25%] bg-current rounded-full origin-[center_200%]"
            style={{
              transform: `rotate(${i * 30}deg) translateX(-50%)`,
              opacity: 1 - (i * 0.08),
              animation: "ios-spinner 1s linear infinite",
              animationDelay: `${-i * (1/12)}s`
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes ios-spinner {
          from { opacity: 1; }
          to { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}

interface LoadingOverlayProps {
  show: boolean;
  message?: string;
}

export function LoadingOverlay({ show, message }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="loading-overlay"
    >
      <div className="flex flex-col items-center gap-3 p-6 bg-zinc-900 rounded-xl">
        <IOSSpinner size="lg" className="text-white" />
        {message && (
          <p className="text-sm text-zinc-300">{message}</p>
        )}
      </div>
    </div>
  );
}
