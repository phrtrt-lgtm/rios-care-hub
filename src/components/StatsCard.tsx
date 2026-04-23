import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: ReactNode;
  iconBgColor: string;
  /** @deprecated mantido por compatibilidade — não é mais usado visualmente */
  borderColor?: string;
  /** @deprecated mantido por compatibilidade — entrada não tem mais stagger */
  delay?: number;
  onClick?: () => void;
}

export function StatsCard({
  title,
  value,
  description,
  icon,
  iconBgColor,
  onClick,
}: StatsCardProps) {
  return (
    <div className="animate-fade-in" style={{ animationDuration: "0.25s" }}>
      <Card
        onClick={onClick}
        className={cn(
          "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
          onClick && "cursor-pointer hover:bg-accent/50"
        )}
      >
        <CardHeader className="flex flex-row items-center gap-3 pb-2 space-y-0">
          <div
            className={cn(
              "h-12 w-12 shrink-0 rounded-xl flex items-center justify-center",
              iconBgColor
            )}
          >
            {icon}
          </div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Animated counter for stats
export function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  return <span className={className}>{value}</span>;
}
