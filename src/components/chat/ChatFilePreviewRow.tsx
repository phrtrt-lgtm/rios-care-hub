import { useEffect, useState } from "react";
import { FileText, Loader2, Play, X } from "lucide-react";

interface ChatFilePreviewRowProps {
  files: File[];
  uploading: Set<string>;
  onRemove: (index: number) => void;
}

function FileChip({
  file,
  isUploading,
  onRemove,
}: {
  file: File;
  isUploading: boolean;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-xl border border-border bg-muted">
      {preview ? (
        <img src={preview} alt={file.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          {isVideo ? <Play className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          <span className="max-w-[54px] truncate px-1 text-[8px]">{file.name}</span>
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={isUploading}
        aria-label={`Remover anexo ${file.name}`}
        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

export function ChatFilePreviewRow({ files, uploading, onRemove }: ChatFilePreviewRowProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/30 px-3 py-2">
      {files.map((file, index) => (
        <FileChip
          key={`${file.name}-${index}`}
          file={file}
          isUploading={uploading.has(file.name)}
          onRemove={() => onRemove(index)}
        />
      ))}
    </div>
  );
}
