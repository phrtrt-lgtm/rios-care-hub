import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ChargeAttachmentLite {
  id: string;
  mime: string;
}

interface Props {
  attachments: ChargeAttachmentLite[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChargeAttachmentLightbox({ attachments, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  if (!attachments.length) return null;
  const current = attachments[Math.min(index, attachments.length - 1)];
  if (!current) return null;

  const isImage = current.mime?.startsWith("image/");
  const isVideo = current.mime?.startsWith("video/");
  const isPdf = current.mime === "application/pdf";
  const url = `${SUPABASE_URL}/functions/v1/serve-attachment/${current.id}/file`;

  const prev = () => setIndex((i) => (i - 1 + attachments.length) % attachments.length);
  const next = () => setIndex((i) => (i + 1) % attachments.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-0">
        <div className="relative w-full h-[80vh] flex items-center justify-center">
          {isImage && (
            <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          )}
          {isVideo && (
            <video src={url} controls autoPlay className="max-w-full max-h-full" />
          )}
          {isPdf && (
            <iframe src={url} className="w-full h-full bg-white" title="PDF" />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div className="text-white flex flex-col items-center gap-3 p-8">
              <FileText className="h-12 w-12" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-sm"
              >
                Abrir anexo
              </a>
            </div>
          )}

          {attachments.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 rounded-full px-3 py-1">
                {index + 1} / {attachments.length}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
