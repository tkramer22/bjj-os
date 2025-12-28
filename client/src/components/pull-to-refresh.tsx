import { useState, useRef, useCallback } from "react";
import { IOSSpinner } from "./ios-spinner";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function PullToRefresh({ 
  onRefresh, 
  children, 
  className,
  disabled = false 
}: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  const THRESHOLD = 80;
  const MAX_PULL = 120;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    
    if (diff > 0) {
      const distance = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(distance);
      
      if (distance >= THRESHOLD && pullDistance < THRESHOLD) {
        triggerHaptic('light');
      }
    }
  }, [isPulling, disabled, isRefreshing, pullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;
    
    setIsPulling(false);
    
    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      triggerHaptic('medium');
      
      try {
        await onRefresh();
        triggerHaptic('success');
      } catch (error) {
        console.error('Refresh failed:', error);
        triggerHaptic('error');
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
  }, [isPulling, disabled, pullDistance, onRefresh]);

  const spinnerOpacity = Math.min(pullDistance / THRESHOLD, 1);
  const spinnerScale = 0.5 + (0.5 * Math.min(pullDistance / THRESHOLD, 1));

  return (
    <div className={cn("relative h-full", className)}>
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center transition-transform"
        style={{
          top: Math.max(pullDistance - 40, isRefreshing ? 16 : -40),
          opacity: isRefreshing ? 1 : spinnerOpacity,
          transform: `translateX(-50%) scale(${isRefreshing ? 1 : spinnerScale})`
        }}
      >
        <div className="p-2 bg-zinc-800 rounded-full shadow-lg">
          <IOSSpinner size="sm" className="text-purple-400" />
        </div>
      </div>
      
      <div
        ref={containerRef}
        className="h-full overflow-y-auto overscroll-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${isPulling || isRefreshing ? pullDistance * 0.3 : 0}px)`,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
}
