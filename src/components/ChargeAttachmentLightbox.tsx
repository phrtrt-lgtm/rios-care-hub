import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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

// O serve-attachment exige autenticação. <img>/<iframe> não mandam o token,
// então baixamos o arquivo com o token da sessão e abrimos como blob local.
async function baixarAnexoAutenticado(id: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/serve-attachment/${id}/file`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function ChargeAttachmentLightbox({ attachments, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = attachments[Math.min(index, attachments.length - 1)];

  useEffect(() => {
    if (!open || !current) return;
    let cancelado = false;
    let urlCriada: string | null = null;

    setCarregando(true);
    setErro(false);
    setBlobUrl(null);

    baixarAnexoAutenticado(current.id).then((url) => {
      if (cancelado) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      urlCriada = url;
      setBlobUrl(url);
      setErro(!url);
      setCarregando(false);
    });

    return () => {
      cancelado = true;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
    };
  }, [open, current?.id]);

  if (!attachments.length || !current) return null;

  const isImage = current.mime?.startsWith("image/");
  const isVideo = current.mime?.startsWith("video/");
  const isPdf = current.mime === "application/pdf";

  const prev = () => setIndex((i) => (i - 1 + attachments.length) % attachments.length);
  const next = () => setIndex((i) => (i + 1) % attachments.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-0">
        <div className="relative w-full h-[80vh] flex items-center justify-center">
          {carregando && <Skeleton className="w-full h-full" />}

          {!carregando && erro && (
            <div className="text-white flex flex-col items-center gap-3 p-8">
              <FileText className="h-12 w-12" />
              <p className="text-sm">Não foi possível abrir o anexo. Tente novamente.</p>
            </div>
          )}

          {!carregando && !erro && blobUrl && (
            <>
              {isImage && (
                <img src={blobUrl} alt="" className="max-w-full max-h-full object-contain" />
              )}
              {isVideo && (
                <video src={blobUrl} controls autoPlay className="max-w-full max-h-full" />
              )}
              {isPdf && (
                <iframe src={blobUrl} className="w-full h-full bg-white" title="PDF" />
              )}
              {!isImage && !isVideo && !isPdf && (
                <div className="text-white flex flex-col items-center gap-3 p-8">
                  <FileText className="h-12 w-12" />
                  <a
                    href={blobUrl}
                    download="anexo"
                    className="underline text-sm"
                  >
                    Baixar anexo
                  </a>
                </div>
              )}
            </>
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
