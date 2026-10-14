import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AttachmentBubble } from "@/components/AttachmentBubble";
import { ChatMosaico } from "./ChatMosaico";
import { separarAnexos, type AnexoChat } from "./anexos";

interface ChatAnexosProps {
  anexos: AnexoChat[];
  /** Abre o anexo na galeria da conversa. */
  aoAbrir: (anexo: AnexoChat) => void;
  pending?: boolean;
  /** Linha de ações acima do mosaico (ex.: "Baixar todos"). */
  acoes?: ReactNode;
  /** Mensagem própria: tudo encostado à direita. */
  alinharDireita?: boolean;
  /** Exclusão de arquivo não visual (PDF, documento). Foto e vídeo se excluem pela galeria. */
  aoExcluir?: (anexo: AnexoChat) => void | Promise<void>;
}

/**
 * Anexos de uma mensagem: fotos e vídeos em mosaico, arquivos como cartão.
 * É o bloco que vai no slot `attachments` do ChatMessageBubble.
 */
export function ChatAnexos({ anexos, aoAbrir, pending, acoes, alinharDireita, aoExcluir }: ChatAnexosProps) {
  if (anexos.length === 0) return null;
  const { midias, arquivos } = separarAnexos(anexos);

  return (
    <div className={cn("flex w-full flex-col gap-1.5", alinharDireita ? "items-end" : "items-start")}>
      {acoes && <div className="flex">{acoes}</div>}
      <ChatMosaico midias={midias} aoAbrir={(a) => aoAbrir(a)} pending={pending} />
      {arquivos.length > 0 && (
        <div className={cn("grid w-[min(100%,420px)] gap-1.5", arquivos.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {arquivos.map((a) => (
            <AttachmentBubble
              key={a.id}
              id={a.id}
              file_url={a.file_url}
              file_name={a.file_name ?? undefined}
              file_type={a.file_type ?? undefined}
              size_bytes={a.size_bytes ?? undefined}
              onPreview={() => aoAbrir(a)}
              onDelete={aoExcluir ? () => aoExcluir(a) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
