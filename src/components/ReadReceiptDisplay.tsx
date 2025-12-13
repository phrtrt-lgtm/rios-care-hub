import { Check, CheckCheck } from "lucide-react";
import { ReadReceipt, formatReadReceipt } from "@/hooks/useReadReceipts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReadReceiptDisplayProps {
  receipts: ReadReceipt[];
  isOwnMessage: boolean;
}

export function ReadReceiptDisplay({ receipts, isOwnMessage }: ReadReceiptDisplayProps) {
  if (!isOwnMessage || receipts.length === 0) {
    // Show single check for sent but not read
    if (isOwnMessage) {
      return (
        <div className="flex items-center gap-0.5 text-muted-foreground/60">
          <Check className="h-3 w-3" />
        </div>
      );
    }
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-0.5 text-primary cursor-pointer">
            <CheckCheck className="h-3 w-3" />
            {receipts.length > 1 && (
              <span className="text-[10px]">{receipts.length}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-1">
            <p className="text-xs font-medium">Lido por:</p>
            {receipts.map((receipt) => (
              <p key={receipt.id} className="text-xs text-muted-foreground">
                {formatReadReceipt(receipt)}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
