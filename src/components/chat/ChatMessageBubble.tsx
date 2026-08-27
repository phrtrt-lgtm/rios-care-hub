import { ReactNode } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReadReceipt } from "@/hooks/useReadReceipts";
import { ChatReceiptStatus } from "./ChatReceiptStatus";

const TEAM_ROLES = ["admin", "agent", "maintenance"];

export interface ChatMessageBubbleProps {
  authorName?: string | null;
  authorPhoto?: string | null;
  authorRole?: string | null;
  createdAt: string;
  isOwn: boolean;
  isInternal?: boolean;
  pending?: boolean;
  receipts?: ReadReceipt[];
  /** Rendered message text (may be plain text or a MentionText node) */
  body?: ReactNode;
  /** Attachment previews rendered under the bubble */
  attachments?: ReactNode;
  /** Hide avatar/name when grouped with previous message from same author */
  grouped?: boolean;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ChatMessageBubble({
  authorName,
  authorPhoto,
  authorRole,
  createdAt,
  isOwn,
  isInternal,
  pending,
  receipts = [],
  body,
  attachments,
  grouped,
}: ChatMessageBubbleProps) {
  const isTeam = TEAM_ROLES.includes(authorRole || "");

  return (
    <div
      className={`flex w-full gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"} ${
        grouped ? "mt-0.5" : "mt-3"
      } animate-in fade-in slide-in-from-bottom-1`}
    >
      <div className="w-8 shrink-0">
        {!grouped && (
          <Avatar className="h-8 w-8 ring-2 ring-background">
            <AvatarImage src={authorPhoto || undefined} />
            <AvatarFallback
              className={`text-[10px] font-semibold ${
                isTeam ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {initials(authorName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className={`flex min-w-0 max-w-[78%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!grouped && (
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-semibold text-foreground">
              {isOwn ? "Você" : authorName || "Desconhecido"}
            </span>
            {isTeam && !isOwn && (
              <span className="rounded-full bg-primary/12 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
                RIOS
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(createdAt), "HH:mm")}
            </span>
          </div>
        )}

        {body ? (
          <div
            className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm transition-colors ${
              isInternal
                ? "border border-warning/40 bg-warning/10 text-foreground"
                : isOwn
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm border border-border/60 bg-muted text-foreground"
            } ${pending ? "opacity-70" : ""}`}
          >
            <div className="whitespace-pre-wrap break-words">{body}</div>
          </div>
        ) : null}

        {attachments && <div className="mt-1.5 w-full">{attachments}</div>}

        <div className="mt-1 px-1">
          <ChatReceiptStatus
            receipts={receipts}
            isOwnMessage={isOwn}
            createdAt={createdAt}
            pending={pending}
          />
        </div>
      </div>
    </div>
  );
}
