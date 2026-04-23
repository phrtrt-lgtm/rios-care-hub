import React from 'react';
import { Loader2, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface VideoCompressionProgressProps {
  stage: 'loading' | 'compressing' | 'done' | 'error';
  percent: number;
  message: string;
  className?: string;
  compact?: boolean;
}

export function VideoCompressionProgress({
  stage,
  percent,
  message,
  className,
  compact = false,
}: VideoCompressionProgressProps) {
  if (stage === 'done' && percent === 0) {
    return null;
  }

  const getIcon = () => {
    switch (stage) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'compressing':
        return <Video className="h-4 w-4 text-primary animate-pulse" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getProgressColor = () => {
    switch (stage) {
      case 'error':
        return 'bg-destructive';
      case 'done':
        return 'bg-success';
      default:
        return 'bg-primary';
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", className)}>
        {getIcon()}
        <span className="text-muted-foreground">{message}</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 p-3 rounded-lg bg-muted/50 border", className)}>
      <div className="flex items-center gap-2">
        {getIcon()}
        <span className="text-sm font-medium">{message}</span>
      </div>
      {(stage === 'loading' || stage === 'compressing') && (
        <Progress 
          value={percent} 
          className="h-2"
        />
      )}
      {stage === 'compressing' && (
        <p className="text-xs text-muted-foreground">
          Reduzindo qualidade para economizar espaço...
        </p>
      )}
    </div>
  );
}
