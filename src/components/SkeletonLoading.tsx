import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function SkeletonPulse({ className }: SkeletonProps) {
  return (
    <motion.div
      className={cn("bg-muted rounded-lg", className)}
      animate={{
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

export function SkeletonShimmer({ className }: SkeletonProps) {
  return (
    <div className={cn("relative overflow-hidden bg-muted rounded-lg", className)}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-card rounded-xl p-4 border shadow-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <SkeletonShimmer className="h-5 w-32" />
        <SkeletonPulse className="h-8 w-8 rounded-full" />
      </div>
      <SkeletonShimmer className="h-8 w-20" />
      <SkeletonShimmer className="h-3 w-24" />
    </motion.div>
  );
}

export function KanbanCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-lg p-3 border shadow-sm space-y-2"
    >
      <SkeletonShimmer className="h-4 w-3/4" />
      <SkeletonShimmer className="h-3 w-1/2" />
      <div className="flex gap-2 mt-2">
        <SkeletonPulse className="h-7 flex-1 rounded-md" />
      </div>
    </motion.div>
  );
}

export function TableRowSkeleton() {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="p-3">
          <SkeletonShimmer className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </motion.tr>
  );
}

export function ListItemSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 p-3 rounded-lg bg-card border"
    >
      <SkeletonPulse className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonShimmer className="h-4 w-3/4" />
        <SkeletonShimmer className="h-3 w-1/2" />
      </div>
      <SkeletonPulse className="h-6 w-16 rounded-full" />
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <CardSkeleton />
          </motion.div>
        ))}
      </div>

      {/* Kanban preview */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            className="bg-card rounded-xl p-4 border space-y-3"
          >
            <div className="flex items-center gap-2">
              <SkeletonPulse className="h-5 w-5 rounded" />
              <SkeletonShimmer className="h-5 w-40" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((col) => (
                <div key={col} className="bg-muted/30 rounded-lg p-2 space-y-2">
                  <SkeletonShimmer className="h-3 w-16" />
                  {[0, 1, 2].map((card) => (
                    <KanbanCardSkeleton key={card} />
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
