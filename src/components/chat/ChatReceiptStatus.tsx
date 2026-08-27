import { Check, CheckCheck, Eye } from "lucide-react";
import { format } from "date-fns";
import { ReadReceipt } from "@/hooks/useReadReceipts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatReceiptStatusProps {
  receipts: ReadReceipt[];
  isOwnMessage: boolean;
  createdAt: string;
  pending?: boolean;
}

const TEAM_ROLES = ["admin", "agent", "maintenance"];

/** WhatsApp-style delivery/read status with "visualizado" detail. */
export function ChatReceiptStatus({
  receipts,
  isOwnMessage,
  createdAt,
  pending,
}: ChatReceiptStatusProps) {
  if (!isOwnMessage) return null;

  const time = format(new Date(createdAt), "HH:mm");
  const read = receipts.length > 0;

  const label = pending
    ? "Enviando…"
    : read
      ? `Visualizado ${format(new Date(receipts[0].read_at), "HH:mm")}`
      : `Enviado ${time}`;

  const icon = pending ? (
    <Check className="h-3 w-3 opacity-40" />
  ) : read ? (
    <CheckCheck className="h-3 w-3 text-primary" />
  ) : (
    <Check className="h-3 w-3" />
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex cursor-default items-center gap-1 text-[10px] ${
              read ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {icon}
            <span>{label}</span>
            {receipts.length > 1 && (
              <span className="rounded-full bg-primary/10 px-1 font-semibold">
                {receipts.length}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          {read ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs font-semibold">
                <Eye className="h-3 w-3" /> Visualizado por
              </p>
              {receipts.map((r) => (
                <p key={r.id} className="text-xs text-muted-foreground">
                  {r.reader?.name || "Usuário"}
                  {" · "}
                  {TEAM_ROLES.includes(r.reader?.role || "") ? "Equipe" : "Proprietário"}
                  {" · "}
                  {format(new Date(r.read_at), "dd/MM HH:mm")}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs">Ainda não visualizado</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
