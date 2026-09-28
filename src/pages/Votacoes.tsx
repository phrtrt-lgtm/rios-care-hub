import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { Etiqueta } from "@/components/painel/Etiqueta";
import type { Tom } from "@/components/painel/tons";
import { CalendarDays, ChevronRight, CreditCard, Plus, Trash2, Users, Vote } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { formatarBRL, formatarData } from "@/lib/cobrancaMeta";
import { diasParaVencer } from "@/lib/vencimento";

interface Resposta {
  id: string;
  owner_id: string;
  selected_option_id: string | null;
}

interface Proposta {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: string;
  deadline: string;
  amount_cents: number | null;
  target_audience: string;
  created_at: string;
  proposal_responses: Resposta[];
}

/** Valores reais de `proposals.status` (check constraint da migration). */
const STATUS_PROPOSTA: Record<string, { rotulo: string; tom: Tom }> = {
  active: { rotulo: "Aberta", tom: "info" },
  approved: { rotulo: "Aprovada", tom: "success" },
  rejected: { rotulo: "Rejeitada", tom: "destructive" },
  expired: { rotulo: "Expirada", tom: "neutral" },
};

const PUBLICO: Record<string, { rotulo: string; tom: Tom }> = {
  owners: { rotulo: "Proprietários", tom: "primary" },
  team: { rotulo: "Equipe", tom: "secondary" },
};

type Escopo = "abertas" | "encerradas" | "todas";

const ESCOPOS: Array<{ valor: Escopo; rotulo: string }> = [
  { valor: "abertas", rotulo: "Abertas" },
  { valor: "encerradas", rotulo: "Encerradas" },
  { valor: "todas", rotulo: "Todas" },
];

/** Aberta = status ativo e prazo ainda não passou (o banco não expira sozinho). */
const estaAberta = (p: Proposta) => p.status === "active" && diasParaVencer(p.deadline) >= 0;

/** Etiqueta de status: ativa com prazo vencido vira "Prazo encerrado". */
function EtiquetaStatusProposta({ proposta }: { proposta: Proposta }) {
  if (proposta.status === "active" && !estaAberta(proposta)) {
    return <Etiqueta tom="neutral" ponto>Prazo encerrado</Etiqueta>;
  }
  const meta = STATUS_PROPOSTA[proposta.status];
  return (
    <Etiqueta tom={meta?.tom ?? "neutral"} ponto>
      {meta?.rotulo ?? proposta.status}
    </Etiqueta>
  );
}

const textoPrazo = (deadline: string) => {
  const dias = diasParaVencer(deadline);
  if (dias === 0) return "encerra hoje";
  if (dias === 1) return "encerra amanhã";
  if (dias > 1) return `encerra em ${dias} dias`;
  if (dias === -1) return "encerrou ontem";
  return `encerrou há ${-dias} dias`;
};

export default function Votacoes() {
  useScrollRestoration();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  // Mesma definição de equipe do VotacaoDetalhes: agent também é equipe.
  const isTeam = !!profile?.role && ['admin', 'agent', 'maintenance'].includes(profile.role);
  const isAdmin = profile?.role === 'admin';
  const [escopo, setEscopo] = useState<Escopo>("abertas");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ['proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          id, title, description, category, status, deadline, amount_cents, target_audience, created_at,
          proposal_responses (
            id,
            owner_id,
            selected_option_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Proposta[];
    },
  });

  const contagens = useMemo(() => {
    const lista = proposals ?? [];
    const abertas = lista.filter(estaAberta).length;
    return { abertas, encerradas: lista.length - abertas, todas: lista.length };
  }, [proposals]);

  const filtradas = useMemo(() => {
    const lista = proposals ?? [];
    if (escopo === "abertas") return lista.filter(estaAberta);
    if (escopo === "encerradas") return lista.filter((p) => !estaAberta(p));
    return lista;
  }, [proposals, escopo]);

  const abrir = (proposta: Proposta) => {
    saveScrollPosition(pathname);
    navigate(`/votacao-detalhes/${proposta.id}`);
  };

  const alternarSelecao = (id: string) => {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const excluirSelecionadas = async () => {
    if (!isAdmin || selecionadas.size === 0) return;
    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .in('id', Array.from(selecionadas));

      if (error) throw error;

      toast.success(`${selecionadas.size} proposta(s) excluída(s)`);
      setSelecionadas(new Set());
      setConfirmarExclusao(false);
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    } catch (error) {
      console.error('Erro ao excluir propostas:', error);
      toast.error('Erro ao excluir propostas');
    } finally {
      setExcluindo(false);
    }
  };

  const subtitulo = isLoading
    ? undefined
    : `${contagens.abertas} ${contagens.abertas === 1 ? "aberta" : "abertas"} · ${contagens.todas} no total`;

  const acoesCabecalho = (
    <>
      {isAdmin && selecionadas.size > 0 && (
        <Button variant="destructive" size="sm" className="h-9" onClick={() => setConfirmarExclusao(true)} disabled={excluindo}>
          <Trash2 className="h-4 w-4" />
          Excluir {selecionadas.size}
        </Button>
      )}
      {isTeam && (
        <Button size="sm" className="h-9" onClick={() => navigate('/nova-proposta-votacao')}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova proposta</span>
        </Button>
      )}
    </>
  );

  return (
    <PaginaInterna
      largura="larga"
      comNavInferior
      cabecalho={
        <CabecalhoPagina
          titulo="Propostas e votações"
          subtitulo={subtitulo}
          icone={<Vote />}
          tom="secondary"
          voltarPara={isTeam ? "/painel" : "/minha-caixa"}
          acoes={acoesCabecalho}
          abaixo={
            <BarraFiltros role="tablist" aria-label="Escopo das propostas">
              {ESCOPOS.map((e) => (
                <AbaPilula
                  key={e.valor}
                  ativa={escopo === e.valor}
                  quantidade={isLoading ? undefined : contagens[e.valor]}
                  tom={e.valor === "abertas" ? "info" : "neutral"}
                  onClick={() => setEscopo(e.valor)}
                >
                  {e.rotulo}
                </AbaPilula>
              ))}
            </BarraFiltros>
          }
        />
      }
    >
      {isLoading ? (
        <SectionSkeleton rows={3} showHeader={false} />
      ) : (proposals?.length ?? 0) === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            icon={<Vote className="h-6 w-6" />}
            title="Nenhuma proposta ainda"
            description={
              isTeam
                ? "Crie uma proposta para os proprietários ou para a equipe votarem."
                : "As propostas enviadas a você aparecem aqui."
            }
            action={
              isTeam && (
                <Button onClick={() => navigate('/nova-proposta-votacao')}>
                  <Plus className="h-4 w-4" />
                  Nova proposta
                </Button>
              )
            }
          />
        </Card>
      ) : filtradas.length === 0 ? (
        <Card className="rounded-xl border-border/70">
          <EmptyState
            ilustracao="busca"
            title={escopo === "abertas" ? "Nenhuma proposta aberta" : "Nenhuma proposta encerrada"}
            description="Mude o escopo acima para ver as demais."
            action={
              <Button variant="outline" onClick={() => setEscopo("todas")}>
                Ver todas
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((proposta) => {
            const respostas = proposta.proposal_responses ?? [];
            const respondidas = respostas.filter((r) => r.selected_option_id != null).length;
            const minha = respostas.find((r) => r.owner_id === profile?.id);
            const publico = PUBLICO[proposta.target_audience];
            const selecionada = selecionadas.has(proposta.id);
            const aberta = estaAberta(proposta);

            return (
              <Card
                key={proposta.id}
                role="button"
                tabIndex={0}
                onClick={() => abrir(proposta)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrir(proposta);
                  }
                }}
                aria-label={`Abrir proposta ${proposta.title}`}
                className={`cursor-pointer rounded-xl border-border/70 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selecionada ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {isAdmin && (
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selecionada}
                        onCheckedChange={() => alternarSelecao(proposta.id)}
                        aria-label={`Selecionar ${proposta.title}`}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {publico && <Etiqueta tom={publico.tom}>{publico.rotulo}</Etiqueta>}
                      <EtiquetaStatusProposta proposta={proposta} />
                      {proposta.category && <Etiqueta tom="neutral">{proposta.category}</Etiqueta>}
                    </div>
                    <p className="mt-2 text-[15px] font-semibold leading-tight">{proposta.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{proposta.description}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        Prazo {formatarData(proposta.deadline)}
                        {proposta.status === "active" && ` · ${textoPrazo(proposta.deadline)}`}
                      </span>
                      {isTeam ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {respondidas} de {respostas.length} responderam
                        </span>
                      ) : minha ? (
                        <span className={`inline-flex items-center gap-1 ${minha.selected_option_id ? "text-success" : aberta ? "text-warning" : ""}`}>
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {minha.selected_option_id ? "Você já respondeu" : aberta ? "Aguardando sua resposta" : "Sem resposta"}
                        </span>
                      ) : null}
                      {!!proposta.amount_cents && proposta.amount_cents > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatarBRL(proposta.amount_cents)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={confirmarExclusao}
        onOpenChange={setConfirmarExclusao}
        title={`Excluir ${selecionadas.size} proposta(s)?`}
        description="A exclusão é definitiva e apaga também as respostas e os anexos."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={excluirSelecionadas}
        loading={excluindo}
      />
    </PaginaInterna>
  );
}
