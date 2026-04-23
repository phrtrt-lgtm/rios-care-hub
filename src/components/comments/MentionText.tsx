import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MentionTextProps {
  body: string;
  className?: string;
}

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g;
const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Renders comment body with @[Name](uuid) tokens highlighted, line breaks preserved, and bare URLs linkified. */
export function MentionText({ body, className }: MentionTextProps) {
  const navigate = useNavigate();

  const renderInline = (text: string, keyPrefix: string) => {
    // Split on URLs
    const parts = text.split(URL_RE);
    return parts.map((p, i) => {
      if (URL_RE.test(p)) {
        return (
          <a
            key={`${keyPrefix}-u-${i}`}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline break-all"
          >
            {p}
          </a>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{p}</span>;
    });
  };

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  let i = 0;

  while ((match = re.exec(body))) {
    if (match.index > lastIndex) {
      segments.push(
        <span key={`pre-${i}`}>{renderInline(body.slice(lastIndex, match.index), `pre-${i}`)}</span>
      );
    }
    const name = match[1];
    const id = match[2];
    segments.push(
      <button
        key={`m-${i}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/admin/usuarios?focus=${id}`);
        }}
        className="text-primary font-semibold hover:underline"
      >
        @{name}
      </button>
    );
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < body.length) {
    segments.push(<span key="tail">{renderInline(body.slice(lastIndex), "tail")}</span>);
  }

  return (
    <p className={cn("text-sm whitespace-pre-wrap break-words", className)}>
      {segments}
    </p>
  );
}
