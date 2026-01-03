import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title?: string;
  subtitle?: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  className?: string;
  showLogo?: boolean;
}

export function MobileHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  className,
  showLogo = true,
}: MobileHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "sticky top-0 z-30 border-b bg-card/95 backdrop-blur-md safe-area-top",
        className
      )}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showLogo && (
              <motion.img
                src="/logo.png"
                alt="RIOS"
                className="h-6 object-contain"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              />
            )}
            {leftAction}
          </div>

          {(title || subtitle) && (
            <div className="text-center flex-1 px-4 hidden sm:block">
              {title && (
                <h1 className="text-sm font-semibold truncate">{title}</h1>
              )}
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">{rightAction}</div>
        </div>
      </div>
    </motion.header>
  );
}

interface QuickActionButtonProps {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  variant?: "default" | "ghost" | "outline";
  className?: string;
  showLabel?: boolean;
}

export function QuickActionButton({
  icon,
  label,
  onClick,
  variant = "ghost",
  className,
  showLabel = false,
}: QuickActionButtonProps) {
  return (
    <Button
      variant={variant}
      size={showLabel ? "sm" : "icon"}
      onClick={onClick}
      className={cn("tap-highlight-none press-effect", className)}
    >
      {icon}
      {showLabel && label && <span className="ml-2">{label}</span>}
    </Button>
  );
}
