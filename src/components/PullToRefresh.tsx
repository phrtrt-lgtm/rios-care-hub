import { useState, useRef, useCallback, ReactNode } from "react";
import { motion, useAnimation } from "framer-motion";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

const PULL_THRESHOLD = 80;
const RESISTANCE = 0.4;

export function PullToRefresh({ children, onRefresh, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === 0 || isRefreshing) return;
    if (containerRef.current && containerRef.current.scrollTop > 0) return;

    const currentY = e.touches[0].clientY;
    const diff = (currentY - startY.current) * RESISTANCE;

    if (diff > 0) {
      setPullDistance(Math.min(diff, PULL_THRESHOLD * 1.5));
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      await controls.start({ rotate: 360, transition: { repeat: Infinity, duration: 1, ease: "linear" } });
      await onRefresh();
      await controls.stop();
      setIsRefreshing(false);
    }
    
    startY.current = 0;
    setPullDistance(0);
  }, [pullDistance, isRefreshing, onRefresh, controls]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const shouldShowSpinner = pullDistance > 0 || isRefreshing;

  return (
    <div
      ref={containerRef}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex justify-center z-50 pointer-events-none"
        style={{
          top: -40,
          transform: `translateY(${pullDistance}px)`,
          opacity: progress,
        }}
      >
        <motion.div
          animate={controls}
          className={`h-10 w-10 rounded-full bg-card shadow-lg flex items-center justify-center border ${
            pullDistance >= PULL_THRESHOLD ? "border-primary" : "border-muted"
          }`}
        >
          <RefreshCw
            className={`h-5 w-5 transition-colors ${
              pullDistance >= PULL_THRESHOLD ? "text-primary" : "text-muted-foreground"
            }`}
            style={{
              transform: `rotate(${progress * 180}deg)`,
            }}
          />
        </motion.div>
      </div>

      {/* Content with pull offset */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? 50 : pullDistance * 0.5}px)`,
          transition: pullDistance === 0 ? "transform 0.3s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
