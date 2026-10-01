import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Check, ChevronDown, ChevronRight, Download, Images, Loader2, Pencil, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { useGuestCharges, type GuestChargeItem } from "@/hooks/useGuestCharges";
import type { DetailEntityType } from "@/hooks/useDetailSheet";
import { GrupoCaixa, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { formatarBRL, formatarData } from "@/lib/cobrancaMeta";
import { baixarAnexosEmZip, listarAnexos, resumoDownloadAnexos, type AnexoDoItem } from "@/lib/baixarAnexos";
import { MediaGallery } from "@/components/MediaGallery";
import { QuickAttachUploader } from "@/components/maintenance/QuickAttachUploader";
import { deleteAttachmentRow } from "@/lib/deleteAttachment";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { Input } from "@/components/ui/input";
import { TOM, type Tom } from "@/components/painel/tons";

interface Props {
  /** Controlado pelo painel, para o resumo do topo conseguir abrir o lembrete. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Abre o item no painel lateral, sem sair do painel. */
  onOpenDetail: (id: string, type: DetailEntityType) => void;
}

const GRUPOS: { id: GuestChargeItem["grupo"]; titulo: string; tom: Tom }[] = [
  { id: "pronta", titulo: "Prontas para cobrar", tom: "success" },
  { id: "em_breve", titulo: "Em breve", tom: "neutral" },
  { id: "sem_data", titulo: "Sem data de check-out — informe a data para entrar na contagem", tom: "warning" },
];

/**
 * Lembrete de cobranças de hóspede.
 *
 * Fechado, é uma linha só com os totais — lembra sem ocupar o topo do painel.
 * Aberto, mostra a lista inteira (antes eram 3 itens e um "+ N mais" que não
 * abria), com rolagem própria, e cada item abre no painel lateral.
 */
export function GuestChargeReminders({ open, onOpenChange, onOpenDetail }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: itens = [], isLoading } = useGuestCharges();
  const [confirmar, setConfirmar] = useState<GuestChargeItem | null>(null);
  const [arquivandoId, setArquivandoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [abrindoGaleriaId, setAbrindoGaleriaId] = useState<string | null>(null);
  const [galeria, setGaleria] = useState<AnexoDoItem[] | null>(null);

  if (isLoading) return null;

  const prontas = itens.filter((i) => i.grupo === "pronta");
  const emBreve = itens.filter((i) => i.grupo === "em_breve");
  const semData = itens.filter((i) => i.grupo === "sem_data");
  const proxima = emBreve[0]?.days_until_charge;

  const arquivar = async (item: GuestChargeItem) => {
    setArquivandoId(item.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("tickets")
        .update({
          guest_charge_dismissed_at: new Date().toISOString(),
          guest_charge_dismissed_by: user?.id ?? null,
        })
        .eq("id", item.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["painel", "guest-charges"] });
      toast.success("Marcada como cobrada. Saiu dos avisos.");
    } catch (err) {
      console.error("Erro ao arquivar cobrança de hóspede:", err);
      toast.error("Não foi possível marcar como cobrada");
    } finally {
      setArquivandoId(null);
      setConfirmar(null);
    }
  };

  const baixarAnexos = async (item: GuestChargeItem) => {
    setBaixandoId(item.id);
    try {
      const resultado = await baixarAnexosEmZip([
        {
          ticketId: item.id,
          checkout: item.guest_checkout_date,
          imovel: item.property_name,
          dano: item.subject,
        },
      ]);
      if (resultado.baixados === 0) {
        toast.error(resultado.falhas > 0 ? "Não foi possível baixar os anexos" : "Nenhum anexo para baixar");
      } else {
        toast.success("Download iniciado", { description: resumoDownloadAnexos(resultado) });
      }
    } catch (err) {
      console.error("Erro ao baixar anexos:", err);
      toast.error("Não foi possível baixar os anexos");
    } finally {
      setBaixandoId(null);
    }
  };

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["painel", "guest-charges"] });

  const verAnexos = async (item: GuestChargeItem) => {
    setAbrindoGaleriaId(item.id);
    try {
      const anexos = await listarAnexos({ ticketId: item.id });
      if (anexos.length === 0) {
        toast.info("Esta cobrança ainda não tem anexos");
        return;
      }
      setGaleria(anexos);
    } catch (err) {
      console.error("Erro ao carregar anexos:", err);
      toast.error("Não foi possível carregar os anexos");
    } finally {
      setAbrindoGaleriaId(null);
    }
  };

  /** Grava o valor no rascunho do ticket e, se houver, na cobrança em rascunho. */
  const salvarValor = async (item: GuestChargeItem, centavos: number) => {
    if (centavos === (item.amount_cents ?? 0)) return;
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ charge_draft_amount_cents: centavos })
        .eq("id", item.id);
      if (error) throw error;
      if (item.charge_id && item.charge_status === "draft") {
        const { error: erroCobranca } = await supabase
          .from("charges")
          .update({ amount_cents: centavos })
          .eq("id", item.charge_id);
        if (erroCobranca) throw erroCobranca;
      }
      await recarregar();
      queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
      toast.success("Valor atualizado");
    } catch (err) {
      console.error("Erro ao salvar valor:", err);
      toast.error("Não foi possível salvar o valor");
    }
  };

  const abrir = (item: GuestChargeItem) =>
    item.charge_id ? onOpenDetail(item.charge_id, "cobranca") : onOpenDetail(item.id, "maintenance");

  const botaoArquivadas = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={(e) => {
        e.stopPropagation();
        navigate("/cobrancas-hospede-arquivadas");
      }}
    >
      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Cobradas</span>
    </Button>
  );

  const tomCabecalho: Tom = prontas.length > 0 ? "success" : "warning";

  if (itens.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted" aria-hidden="true">
            <UserRound className="h-4 w-4" />
          </span>
          Nenhuma cobrança de hóspede pendente
        </span>
        {botaoArquivadas}
      </div>
    );
  }

  return (
    <div
      id="lembrete-hospede"
      className={cn(
        "rounded-xl border border-border/70 bg-card shadow-sm",
        prontas.length > 0 && "border-success/40",
      )}
    >
      {/* Linha de resumo — sempre visível */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChange(!open);
          }
        }}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[tomCabecalho].caixa)} aria-hidden="true">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:flex-none">Cobranças de hóspede</span>

        {/* No celular os selos vão para a linha de baixo: espremidos ao lado do
            título, o texto quebrava dentro da pílula de altura fixa. */}
        <div className="order-last flex basis-full flex-wrap items-center gap-1.5 sm:order-none sm:basis-auto sm:flex-1 [&>span]:whitespace-nowrap">
          {prontas.length > 0 && (
            <SeloContagem tom="success">
              {prontas.length} {prontas.length === 1 ? "pronta" : "prontas"} para cobrar
            </SeloContagem>
          )}
          {emBreve.length > 0 && (
            <SeloContagem className="font-medium">
              {emBreve.length} em breve
              {proxima != null && ` · próxima em ${proxima} ${proxima === 1 ? "dia" : "dias"}`}
            </SeloContagem>
          )}
          {semData.length > 0 && (
            <SeloContagem tom="warning" className="font-medium">
              {semData.length} sem data de check-out
            </SeloContagem>
          )}
        </div>

        {botaoArquivadas}
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* Lista completa — rola dentro da caixa, sem empurrar o painel */}
      {open && (
        <div className="max-h-[520px] space-y-3 overflow-y-auto border-t border-border/60 px-3 pb-3 pt-3">
          {GRUPOS.map((grupo) => {
            const lista = itens.filter((i) => i.grupo === grupo.id);
            if (lista.length === 0) return null;
            return (
              <GrupoCaixa key={grupo.id} titulo={grupo.titulo} quantidade={lista.length} tom={grupo.tom}>
                {lista.map((item) => (
                  <LinhaHospede
                    key={item.id}
                    item={item}
                    onAbrir={() => abrir(item)}
                    onCobrada={() => setConfirmar(item)}
                    onBaixar={() => baixarAnexos(item)}
                    baixando={baixandoId === item.id}
                    onVerAnexos={() => verAnexos(item)}
                    abrindoGaleria={abrindoGaleriaId === item.id}
                    onAnexoAdicionado={recarregar}
                    onSalvarValor={(centavos) => salvarValor(item, centavos)}
                    arquivando={arquivandoId === item.id}
                  />
                ))}
              </GrupoCaixa>
            );
          })}
        </div>
      )}

      <MediaGallery
        items={galeria || []}
        initialIndex={0}
        open={!!galeria}
        onOpenChange={(o) => !o && setGaleria(null)}
        onDelete={async (anexo) => {
          const ok = await deleteAttachmentRow("ticket_attachments", anexo.id);
          if (ok) {
            setGaleria((prev) => {
              const resto = (prev || []).filter((a) => a.id !== anexo.id);
              return resto.length > 0 ? resto : null;
            });
            recarregar();
          }
        }}
      />

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como cobrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme quando a cobrança já foi feita ao hóspede (pelo Airbnb ou por fora). O aviso sai do painel e
              fica salvo em "Cobradas", de onde dá para restaurar se precisar.
              {confirmar && (
                <span className="mt-2 block font-medium text-foreground">
                  {confirmar.subject} — {confirmar.property_name}
                  {confirmar.amount_cents ? ` — ${formatarBRL(confirmar.amount_cents)}` : ""}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar && arquivar(confirmar)}>Sim, já foi cobrada</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface LinhaHospedeProps {
  item: GuestChargeItem;
  onAbrir: () => void;
  onCobrada: () => void;
  onBaixar: () => void;
  baixando: boolean;
  onVerAnexos: () => void;
  abrindoGaleria: boolean;
  onAnexoAdicionado: () => void;
  onSalvarValor: (centavos: number) => Promise<void>;
  arquivando: boolean;
}

/** Um dado da linha: rótulo pequeno em cima, valor embaixo. */
function Dado({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="truncate text-xs font-medium tabular-nums">{children}</div>
    </div>
  );
}

/**
 * Valor da cobrança, editável no clique. Enter ou sair do campo grava; Esc
 * desiste. Se a cobrança já saiu do rascunho o valor é só leitura: mudar ali
 * mexeria numa cobrança já lançada.
 */
function ValorEditavel({
  centavos,
  bloqueado,
  onSalvar,
}: {
  centavos: number | null;
  bloqueado: boolean;
  onSalvar: (centavos: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  // Esc cancela: o blur que vem em seguida não pode gravar.
  const cancelado = useRef(false);

  useEffect(() => {
    if (editando) campo.current?.select();
  }, [editando]);

  if (bloqueado) {
    return <span title="Cobrança já lançada: edite pelo detalhe">{centavos ? formatarBRL(centavos) : "Sem valor"}</span>;
  }

  const gravar = async () => {
    if (cancelado.current) {
      cancelado.current = false;
      setEditando(false);
      return;
    }
    const novo = Math.round(parseBRNumber(texto) * 100);
    setEditando(false);
    if (!Number.isFinite(novo) || novo < 0) return;
    setSalvando(true);
    await onSalvar(novo);
    setSalvando(false);
  };

  if (editando) {
    return (
      <Input
        ref={campo}
        value={texto}
        inputMode="decimal"
        aria-label="Valor da cobrança em reais"
        placeholder="0,00"
        className="h-8 w-full min-w-0 px-2 text-sm tabular-nums lg:h-7 lg:text-xs"
        onChange={(e) => setTexto(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={gravar}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") campo.current?.blur();
          if (e.key === "Escape") {
            cancelado.current = true;
            campo.current?.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={salvando}
      title="Clique para editar o valor"
      aria-label={`Editar valor: ${centavos ? formatarBRL(centavos) : "sem valor"}`}
      className="-mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left font-medium tabular-nums underline decoration-dashed decoration-muted-foreground/50 underline-offset-4 transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => {
        e.stopPropagation();
        setTexto(centavos ? (centavos / 100).toFixed(2).replace(".", ",") : "");
        setEditando(true);
      }}
    >
      <span className={cn("truncate", !centavos && "text-warning")}>{centavos ? formatarBRL(centavos) : "Informar valor"}</span>
      {salvando ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

/** Botão quadrado de ação da linha: maior no celular (toque), compacto no desktop. */
const BOTAO_ICONE = "h-9 w-9 shrink-0 p-0 lg:h-7 lg:w-7";

/**
 * Linha detalhada de uma cobrança de hóspede: dano e imóvel, check-out, valor
 * (editável), prazo, situação da manutenção e as ações — ver galeria,
 * adicionar anexo, baixar tudo em .zip e marcar como cobrada.
 *
 * No celular vira um cartão em três faixas (título + situação, dados, ações);
 * no desktop é uma linha só.
 */
function LinhaHospede({
  item,
  onAbrir,
  onCobrada,
  onBaixar,
  baixando,
  onVerAnexos,
  abrindoGaleria,
  onAnexoAdicionado,
  onSalvarValor,
  arquivando,
}: LinhaHospedeProps) {
  const temAnexos = item.attachments_count > 0;
  const situacao = (
    <Etiqueta tom={item.feita ? "success" : "info"} className="shrink-0">
      {item.feita ? "Manutenção feita" : "Em andamento"}
    </Etiqueta>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="flex cursor-pointer flex-col gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-row lg:items-center lg:gap-4 lg:px-2.5 lg:py-2"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 lg:flex-1">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium leading-tight lg:line-clamp-1 lg:text-[13px]">{item.subject}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.property_name}</p>
        </div>
        <span className="lg:hidden">{situacao}</span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 lg:w-[340px] lg:shrink-0">
        <Dado rotulo="Check-out">
          {item.guest_checkout_date ? formatarData(item.guest_checkout_date) : <span className="text-warning">Sem data</span>}
        </Dado>
        <Dado rotulo="Valor">
          <ValorEditavel
            centavos={item.amount_cents}
            bloqueado={!!item.charge_id && item.charge_status !== "draft"}
            onSalvar={onSalvarValor}
          />
        </Dado>
        <Dado rotulo="Cobrar">
          {item.grupo === "pronta" ? (
            <span className="text-success">Já pode</span>
          ) : item.grupo === "em_breve" && item.days_until_charge != null ? (
            <>
              em {item.days_until_charge} {item.days_until_charge === 1 ? "dia" : "dias"}
              {item.cobrar_a_partir_de && (
                <span className="font-normal text-muted-foreground"> · {formatarData(item.cobrar_a_partir_de, "dd/MM")}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Dado>
      </div>

      <div
        className="flex items-center gap-1.5 lg:shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="hidden lg:inline-flex lg:w-[116px] lg:justify-end">{situacao}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5 px-2.5 text-xs lg:h-7 lg:gap-1 lg:px-2"
          disabled={abrindoGaleria || !temAnexos}
          onClick={onVerAnexos}
          aria-label={`Ver galeria de anexos (${item.attachments_count}): ${item.property_name}`}
          title={temAnexos ? "Ver galeria de anexos" : "Sem anexos"}
        >
          {abrindoGaleria ? (
            <Loader2 className="h-4 w-4 animate-spin lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          ) : (
            <Images className="h-4 w-4 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          )}
          <span className="tabular-nums">{item.attachments_count}</span>
        </Button>
        <QuickAttachUploader
          itemId={item.id}
          isCharge={false}
          onSuccess={onAnexoAdicionado}
          className={cn(BOTAO_ICONE, "rounded-md border border-input bg-background")}
        />
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_ICONE}
          disabled={baixando || !temAnexos}
          onClick={onBaixar}
          aria-label={`Baixar todos os anexos (.zip): ${item.property_name}`}
          title={temAnexos ? "Baixar todos os anexos (.zip)" : "Sem anexos"}
        >
          {baixando ? (
            <Loader2 className="h-4 w-4 animate-spin lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-9 shrink-0 gap-1 border-success/40 px-3 text-xs text-success hover:bg-success/10 hover:text-success lg:ml-0 lg:h-7 lg:px-2"
          disabled={arquivando}
          onClick={onCobrada}
          aria-label={`Marcar como cobrada: ${item.property_name}`}
          title="Já cobrei do hóspede: tirar dos avisos"
        >
          <Check className="h-4 w-4 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          Cobrada
        </Button>
      </div>
    </div>
  );
}
