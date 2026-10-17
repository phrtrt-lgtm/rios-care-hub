import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isVideoFile } from "@/lib/fileUpload";
import { ANEXOS_POR_ENVIO, ehMidiaAceita } from "@/lib/anexosListas";

/** Prévia local: foto em <img>, vídeo no primeiro quadro; HEIC (não abre no navegador) vira ícone. */
function Previa({ arquivo, url }: { arquivo: File; url: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  if (isVideoFile(arquivo)) {
    return (
      <>
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" onError={() => setFalhou(true)} />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/60 text-background">
            <Play className="h-3 w-3 fill-current" />
          </span>
        </span>
      </>
    );
  }
  return <img src={url} alt="" className="h-full w-full object-cover" onError={() => setFalhou(true)} />;
}

interface Props {
  arquivos: File[];
  onChange: (arquivos: File[]) => void;
  max?: number;
  rotulo?: string;
}

/** Foto ou vídeo escolhidos num formulário, com prévia e botão de tirar. */
export function EscolherAnexos({ arquivos, onChange, max = ANEXOS_POR_ENVIO, rotulo = "Foto ou vídeo" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => arquivos.map((a) => URL.createObjectURL(a)), [arquivos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const escolher = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []).filter(ehMidiaAceita);
    const vagas = max - arquivos.length;
    if (novos.length > vagas) toast.info(`Até ${max} arquivos por vez.`);
    if (novos.length > 0) onChange([...arquivos, ...novos.slice(0, Math.max(0, vagas))]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-none">
        {rotulo} <span className="font-normal text-muted-foreground">(se tiver)</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {arquivos.map((arquivo, i) => (
          <div key={urls[i]} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/70 bg-muted">
            <Previa arquivo={arquivo} url={urls[i]} />
            <button
              type="button"
              onClick={() => onChange(arquivos.filter((_, j) => j !== i))}
              aria-label={`Tirar o arquivo ${i + 1}`}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/75 text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        {arquivos.length < max && (
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
            className="h-16 gap-1.5 border-dashed px-3 text-xs"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {arquivos.length === 0 ? "Adicionar" : "Mais um"}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => escolher(e.target.files)}
      />
    </div>
  );
}
