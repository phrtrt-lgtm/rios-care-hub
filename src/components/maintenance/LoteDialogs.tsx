import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { valorDevido } from "@/lib/cobrancaMeta";
import { temWhatsapp } from "@/lib/lembreteAtraso";
import type { DonoWhatsapp } from "@/components/maintenance/WhatsappAcaoLinha";
import { INTERVALO_ENVIO_LOTE_MS, type MaintenanceItem } from "./listaTipos";

export function EnvioLoteDialog({
  open,
  itens,
  enviando,
  progresso,
  onCancelar,
  onConfirmar,
}: {
  open: boolean;
  itens: MaintenanceItem[];
  enviando: boolean;
  progresso: { feitos: number; total: number } | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const aPagar = (i: MaintenanceItem) =>
    valorDevido(i);
  const gratuita = (i: MaintenanceItem) =>
    (i.amount_cents ?? 0) > 0 && (i.management_contribution_cents ?? 0) >= (i.amount_cents ?? 0);
  const semValor = itens.filter((i) => (i.amount_cents ?? 0) === 0).length;
  const gratuitas = itens.filter(gratuita).length;
  const abertas = itens.filter((i) => i.status !== "concluido").length;
  const proprietarios = new Set(itens.map((i) => i.owner?.id)).size;
  const total = itens.reduce((soma, i) => soma + aPagar(i), 0);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !enviando && onCancelar()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Enviar {itens.length} {itens.length === 1 ? "manutenção" : "manutenções"} ao proprietário?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                {proprietarios} {proprietarios === 1 ? "proprietário recebe" : "proprietários recebem"} a cobrança por
                e-mail (e por WhatsApp, quem tiver ligado). Total a pagar: {formatBRL(total)}. Cada manutenção é
                concluída e vira cobrança, igual ao envio de uma por uma.
              </p>
              {itens.length > 1 && (
                <p>
                  Os envios saem um a cada {INTERVALO_ENVIO_LOTE_MS / 1000} segundos (cerca de{" "}
                  {Math.ceil(((itens.length - 1) * INTERVALO_ENVIO_LOTE_MS) / 60000)} min).{" "}
                  <span className="font-medium text-foreground">Deixe esta aba aberta até terminar.</span>
                </p>
              )}
              {(semValor > 0 || gratuitas > 0 || abertas > 0) && (
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  {gratuitas > 0 && <li>{gratuitas} vão de graça: o aporte da gestão cobre 100%.</li>}
                  {semValor > 0 && <li className="text-warning">{semValor} estão sem valor preenchido.</li>}
                  {abertas > 0 && (
                    <li className="text-warning">{abertas} ainda não estão como feitas e serão concluídas.</li>
                  )}
                </ul>
              )}
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {itens.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-3 border-b px-3 py-1.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{i.property?.name ?? "—"}</p>
                      <p className="truncate text-xs">{i.subject}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-foreground">
                      {gratuita(i) ? "de graça" : (i.amount_cents ?? 0) === 0 ? "sem valor" : formatBRL(aPagar(i))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
          >
            {enviando && progresso
              ? `Enviando ${progresso.feitos + 1} de ${progresso.total}...`
              : `Enviar ${itens.length}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ===== LEMBRETE DE ATRASO EM LOTE: CONFIRMAÇÃO =====
export function LembreteLoteDialog({
  open,
  donos,
  enviando,
  onCancelar,
  onConfirmar,
}: {
  open: boolean;
  donos: { owner: DonoWhatsapp; selecionadas: number }[];
  enviando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const apto = (d: DonoWhatsapp) => !!d.notificar_whatsapp && temWhatsapp(d.phone);
  const aptos = donos.filter((d) => apto(d.owner));
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !enviando && onCancelar()}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Enviar lembrete de atraso para {aptos.length} {aptos.length === 1 ? "proprietário" : "proprietários"}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Cada proprietário recebe <strong>uma mensagem só</strong> no WhatsApp, com o resumo de todas as
                cobranças dele em atraso (quantidade, total e vencimento mais antigo) e o aviso de que o valor pode ser
                debitado de uma próxima reserva.
                {aptos.length > 1 &&
                  ` Os envios saem um a cada ${INTERVALO_ENVIO_LOTE_MS / 1000} segundos — deixe esta aba aberta até terminar.`}
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {donos.map(({ owner, selecionadas }) => (
                  <div
                    key={owner.id}
                    className="flex items-center justify-between gap-3 border-b px-3 py-1.5 last:border-b-0"
                  >
                    <span className="truncate font-medium text-foreground">{owner.name}</span>
                    <span className={cn("shrink-0 text-xs", apto(owner) ? "text-muted-foreground" : "text-warning")}>
                      {!temWhatsapp(owner.phone)
                        ? "sem telefone — fica de fora"
                        : !owner.notificar_whatsapp
                          ? "WhatsApp desligado — fica de fora"
                          : `${selecionadas} ${selecionadas === 1 ? "marcada" : "marcadas"}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando || aptos.length === 0}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
          >
            {enviando ? "Enviando..." : `Enviar ${aptos.length}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
