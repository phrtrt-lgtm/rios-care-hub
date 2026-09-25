import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

export interface DonoWhatsapp {
  id: string;
  name: string;
  notificar_whatsapp?: boolean | null;
  phone?: string | null;
}

interface Props {
  /**
   * switch: liga/desliga o WhatsApp de cobrança do proprietário (quadro
   * "Aguardando Envio" — vale para as próximas cobranças enviadas).
   * reenviar: dispara de novo o WhatsApp de uma cobrança já enviada.
   */
  modo: "switch" | "reenviar";
  owner: DonoWhatsapp | null | undefined;
  cobrancaId?: string;
  whatsappStatus?: string | null;
  whatsappEnviadoEm?: string | null;
  /** Recarrega as listas (o switch vale para todas as linhas do proprietário). */
  onAtualizado: () => void;
  variante?: "tabela" | "card";
}

// Mesmo critério de /admin/gerenciar-usuarios: telefone com DDD.
const temWhatsapp = (phone?: string | null) => (phone || "").replace(/\D/g, "").length >= 10;

/**
 * Controle de WhatsApp de cobrança direto na lista de manutenções, para não
 * precisar ir até Gerenciar usuários. Só admin: a policy de profiles e a
 * função notificar-cobranca só aceitam admin.
 */
export function WhatsappAcaoLinha({
  modo,
  owner,
  cobrancaId,
  whatsappStatus,
  whatsappEnviadoEm,
  onAtualizado,
  variante = "tabela",
}: Props) {
  const { profile } = useAuth();
  const [ligado, setLigado] = useState(!!owner?.notificar_whatsapp);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setLigado(!!owner?.notificar_whatsapp), [owner?.notificar_whatsapp]);

  if (profile?.role !== "admin" || !owner) return null;

  const semNumero = !temWhatsapp(owner.phone);

  const gravarSwitch = async (valor: boolean) => {
    const { error } = await supabase.from("profiles").update({ notificar_whatsapp: valor }).eq("id", owner.id);
    if (error) throw error;
  };

  const alternar = async (valor: boolean) => {
    if (valor && semNumero) {
      toast.error("Cadastre o WhatsApp do proprietário antes de ativar.");
      return;
    }
    setLigado(valor);
    setSalvando(true);
    try {
      await gravarSwitch(valor);
      toast.success(
        valor
          ? `${owner.name} vai receber cobranças por WhatsApp.`
          : `${owner.name} não recebe mais cobranças por WhatsApp.`,
      );
      onAtualizado();
    } catch {
      setLigado(!valor);
      toast.error("Não foi possível alterar a notificação por WhatsApp.");
    } finally {
      setSalvando(false);
    }
  };

  const enviar = async () => {
    if (!cobrancaId) return;
    setEnviando(true);
    try {
      // Desativado: o envio seria recusado pela função — ativa antes.
      if (!ligado) {
        await gravarSwitch(true);
        setLigado(true);
      }
      const { data, error } = await supabase.functions.invoke("notificar-cobranca", {
        body: { cobranca_id: cobrancaId, reenviar: true },
      });
      if (error) throw error;
      if (data?.status === "enviado") toast.success(`WhatsApp enviado para ${owner.name}.`);
      else if (data?.status === "desativado") toast.info("Este proprietário está com o WhatsApp desativado.");
      else toast.error(`Não foi possível enviar: ${data?.erro || "erro desconhecido"}`);
    } catch (e) {
      toast.error(`Não foi possível enviar o WhatsApp: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
      setConfirmar(false);
      onAtualizado();
    }
  };

  if (modo === "switch") {
    const dica = semNumero
      ? `${owner.name} não tem WhatsApp cadastrado`
      : ligado
        ? `WhatsApp de cobrança ligado para ${owner.name}. Vale para todas as cobranças dele.`
        : `Ligar WhatsApp de cobrança para ${owner.name}: avisa quando a cobrança for enviada.`;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={cn(
                "flex items-center gap-1.5 rounded px-1",
                variante === "card" ? "h-8" : "py-1",
                semNumero ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle
                className={cn("h-3.5 w-3.5", ligado ? "text-success" : "text-muted-foreground")}
                aria-hidden="true"
              />
              <Switch
                checked={ligado}
                onCheckedChange={alternar}
                disabled={salvando || (semNumero && !ligado)}
                aria-label={`WhatsApp de cobrança para ${owner.name}`}
                className="scale-75"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p>{dica}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const corStatus =
    whatsappStatus === "enviado"
      ? "text-success"
      : whatsappStatus === "falhou"
        ? "text-destructive"
        : "text-muted-foreground";
  const textoStatus =
    whatsappStatus === "enviado"
      ? `Enviado${whatsappEnviadoEm ? ` em ${format(new Date(whatsappEnviadoEm), "dd/MM 'às' HH:mm", { locale: ptBR })}` : ""}`
      : whatsappStatus === "falhou"
        ? "O último envio falhou"
        : whatsappStatus === "desativado"
          ? "Não enviado: WhatsApp estava desativado"
          : "Ainda não enviado por WhatsApp";
  const jaEnviado = whatsappStatus === "enviado";

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center justify-center rounded transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-50",
                variante === "card" ? "h-8 w-8 rounded-full active:scale-95" : "p-1.5",
                corStatus,
              )}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmar(true);
              }}
              disabled={semNumero || enviando}
              aria-label={`${jaEnviado ? "Reenviar" : "Enviar"} WhatsApp da cobrança para ${owner.name}`}
            >
              {enviando ? (
                <Loader2 className={cn("animate-spin", variante === "card" ? "h-4 w-4" : "h-3.5 w-3.5")} />
              ) : (
                <MessageCircle className={variante === "card" ? "h-4 w-4" : "h-3.5 w-3.5"} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p>{semNumero ? `${owner.name} não tem WhatsApp cadastrado` : `WhatsApp: ${textoStatus}. Clique para ${jaEnviado ? "reenviar" : "enviar"}.`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={confirmar} onOpenChange={(o) => !enviando && setConfirmar(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{jaEnviado ? "Reenviar" : "Enviar"} WhatsApp da cobrança?</AlertDialogTitle>
            <AlertDialogDescription>
              {owner.name} recebe a mensagem de cobrança no WhatsApp {owner.phone}. {textoStatus}.
              {!ligado && (
                <span className="mt-2 block font-medium text-foreground">
                  O WhatsApp de cobrança deste proprietário está desligado. Ao enviar, ele passa a ficar ligado
                  também para as próximas cobranças.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviando}
              onClick={(e) => {
                e.preventDefault();
                enviar();
              }}
            >
              {enviando ? "Enviando..." : ligado ? "Enviar" : "Ligar e enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
