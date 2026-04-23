import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface MentionableUser {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string, mentionedIds: string[]) => void;
  users: MentionableUser[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onSubmit?: () => void;
  className?: string;
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g;

export function extractMentionedIds(text: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_REGEX.source, "g");
  while ((m = re.exec(text))) ids.add(m[2]);
  return Array.from(ids);
}

export function MentionInput({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
  disabled,
  onSubmit,
  className,
}: MentionInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const filtered = users
    .filter((u) =>
      u.name.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 6);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart ?? newValue.length;

    // Detect "@" trigger
    const upToCursor = newValue.slice(0, cursor);
    const atMatch = upToCursor.match(/@(\w*)$/);

    if (atMatch) {
      setMentionStart(cursor - atMatch[0].length);
      setQuery(atMatch[1]);
      setShowPicker(true);
    } else {
      setShowPicker(false);
      setMentionStart(null);
    }

    onChange(newValue, extractMentionedIds(newValue));
  };

  const insertMention = (user: MentionableUser) => {
    if (mentionStart === null || !ref.current) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(ref.current.selectionStart ?? value.length);
    const token = `@[${user.name}](${user.id}) `;
    const next = before + token + after;
    onChange(next, extractMentionedIds(next));
    setShowPicker(false);
    setMentionStart(null);
    setQuery("");
    requestAnimationFrame(() => {
      if (ref.current) {
        const pos = before.length + token.length;
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowPicker(false);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="resize-none"
      />
      {showPicker && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-72 max-w-full rounded-md border bg-popover shadow-md z-50 overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b">
            Mencionar
          </div>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(u);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                i === activeIndex && "bg-muted"
              )}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={u.photo_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {u.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{u.name}</span>
              <span className="text-[10px] text-muted-foreground capitalize">
                {u.role === "owner" ? "proprietário" : u.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
