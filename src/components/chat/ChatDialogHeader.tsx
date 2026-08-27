import { ReactNode } from "react";
import { Building2, Radio } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ChatDialogHeaderProps {
  title: string;
  propertyName?: string;
  /** true when other participants are connected to this conversation */
  live?: boolean;
  actions?: ReactNode;
  extra?: ReactNode;
}

export function ChatDialogHeader({
  title,
  propertyName,
  live,
  actions,
  extra,
}: ChatDialogHeaderProps) {
  return (
    <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 bg-gradient-to-r from-primary/8 via-background to-background px-4 py-3 pr-12">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogTitle className="truncate text-[15px] font-semibold leading-tight">
            {title}
          </DialogTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {propertyName && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {propertyName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                {live && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    live ? "bg-success" : "bg-muted-foreground/50"
                  }`}
                />
              </span>
              {live ? "Online agora" : "Tempo real"}
            </span>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {extra}
    </DialogHeader>
  );
}
