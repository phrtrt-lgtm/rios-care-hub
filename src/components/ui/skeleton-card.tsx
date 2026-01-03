import { cn } from "@/lib/utils";

interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "kanban" | "ticket" | "stats";
}

export function SkeletonCard({ className, variant = "default", ...props }: SkeletonCardProps) {
  if (variant === "kanban") {
    return (
      <div className={cn("rounded-lg border bg-card p-4 space-y-3 animate-fade-in", className)}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 rounded-md bg-muted shimmer" />
          <div className="h-5 w-8 rounded-full bg-muted shimmer" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className="rounded-lg bg-muted/50 p-3 space-y-2"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="h-3 w-3/4 rounded bg-muted shimmer" />
              <div className="h-2 w-1/2 rounded bg-muted shimmer" />
              <div className="flex gap-1 pt-1">
                <div className="h-6 flex-1 rounded bg-muted shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "ticket") {
    return (
      <div className={cn("rounded-lg border bg-card overflow-hidden animate-fade-in", className)}>
        <div className="flex gap-4 p-4">
          <div className="w-32 h-32 rounded-lg bg-muted shimmer" />
          <div className="flex-1 space-y-3">
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-muted shimmer" />
              <div className="h-5 w-20 rounded-full bg-muted shimmer" />
              <div className="h-5 w-14 rounded-full bg-muted shimmer" />
            </div>
            <div className="h-5 w-3/4 rounded bg-muted shimmer" />
            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <div className="h-3 w-1/3 rounded bg-muted shimmer" />
              <div className="h-3 w-full rounded bg-muted shimmer" />
            </div>
          </div>
          <div className="w-32 space-y-2">
            <div className="h-3 w-full rounded bg-muted shimmer" />
            <div className="h-4 w-2/3 rounded bg-muted shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "stats") {
    return (
      <div className={cn("rounded-lg border bg-card p-6 space-y-4 animate-fade-in", className)}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 rounded bg-muted shimmer" />
          <div className="h-8 w-8 rounded-full bg-muted shimmer" />
        </div>
        <div className="space-y-2">
          <div className="h-8 w-16 rounded bg-muted shimmer" />
          <div className="h-3 w-24 rounded bg-muted shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3 animate-fade-in", className)}>
      <div className="h-4 w-3/4 rounded bg-muted shimmer" />
      <div className="h-3 w-1/2 rounded bg-muted shimmer" />
      <div className="h-3 w-2/3 rounded bg-muted shimmer" />
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  variant?: "default" | "kanban" | "ticket" | "stats";
  className?: string;
}

export function SkeletonList({ count = 3, variant = "default", className }: SkeletonListProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard 
          key={i} 
          variant={variant}
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
