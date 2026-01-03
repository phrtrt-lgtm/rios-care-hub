import { ReactNode, useState, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  bgColor: string;
  onClick: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  className?: string;
  onTap?: () => void;
}

const SWIPE_THRESHOLD = 80;

export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  className,
  onTap,
}: SwipeableCardProps) {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform for left action reveal
  const leftBgOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const leftScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.8, 1]);
  
  // Transform for right action reveal
  const rightBgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const rightScale = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0.8]);

  const handleDragEnd = () => {
    const currentX = x.get();
    
    if (currentX >= SWIPE_THRESHOLD && leftAction) {
      leftAction.onClick();
    } else if (currentX <= -SWIPE_THRESHOLD && rightAction) {
      rightAction.onClick();
    }
    
    // Reset position
    x.set(0);
    setIsDragging(false);
  };

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-lg">
      {/* Left action background */}
      {leftAction && (
        <motion.div
          style={{ opacity: leftBgOpacity }}
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-start px-4",
            leftAction.bgColor
          )}
        >
          <motion.div
            style={{ scale: leftScale }}
            className="flex items-center gap-2"
          >
            <span className={leftAction.color}>{leftAction.icon}</span>
            <span className={cn("text-sm font-medium", leftAction.color)}>
              {leftAction.label}
            </span>
          </motion.div>
        </motion.div>
      )}

      {/* Right action background */}
      {rightAction && (
        <motion.div
          style={{ opacity: rightBgOpacity }}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-end px-4",
            rightAction.bgColor
          )}
        >
          <motion.div
            style={{ scale: rightScale }}
            className="flex items-center gap-2"
          >
            <span className={cn("text-sm font-medium", rightAction.color)}>
              {rightAction.label}
            </span>
            <span className={rightAction.color}>{rightAction.icon}</span>
          </motion.div>
        </motion.div>
      )}

      {/* Main content */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: rightAction ? -SWIPE_THRESHOLD * 1.5 : 0, right: leftAction ? SWIPE_THRESHOLD * 1.5 : 0 }}
        dragElastic={0.5}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onTap={() => {
          if (!isDragging && onTap) {
            onTap();
          }
        }}
        className={cn("relative bg-card", className)}
      >
        {children}
      </motion.div>
    </div>
  );
}
