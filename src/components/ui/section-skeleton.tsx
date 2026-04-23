import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionSkeletonProps {
  /** Quantidade de linhas de conteúdo skeletadas (default: 3) */
  rows?: number;
  /** Mostrar header skeleton (título + subtítulo). Default: true */
  showHeader?: boolean;
  className?: string;
}

/**
 * Skeleton padrão para qualquer Section/Card que carrega conteúdo.
 * Imita a estrutura: header (título + subtítulo) + N linhas de conteúdo.
 */
export function SectionSkeleton({
  rows = 3,
  showHeader = true,
  className,
}: SectionSkeletonProps) {
  return (
    <Card className={cn("animate-pulse", className)}>
      {showHeader && (
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
