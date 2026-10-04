import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { AbaPilula, BarraFiltros, CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VisaoGeral } from "@/components/resultados/VisaoGeral";
import { CalendarioReservas } from "@/components/resultados/CalendarioReservas";
import { ListaReservas } from "@/components/resultados/ListaReservas";
import {
  calcularReserva,
  coletaEmDia,
  hojeDia,
  paraDia,
  useImoveisDeResultados,
  useResultadosImovel,
} from "@/lib/resultadosImovel";

type Aba = "geral" | "calendario" | "reservas";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "calendario", rotulo: "Calendário" },
  { id: "reservas", rotulo: "Reservas" },
];

/**
 * Resultados do imóvel: reservas, ocupação, diárias e calendário, a partir do
 * cache diário da Hostex.
 *
 * O proprietário vê os imóveis dele; admin e agent veem qualquer um (é a mesma
 * página, para a gestão conferir o que o proprietário enxerga). O acesso é
 * decidido no banco, pela função `resultados_imovel`.
 */
export default function ResultadosImovel() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [busca, setBusca] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const equipe = profile?.role === "admin" || profile?.role === "agent";
  const inicio = equipe ? "/painel" : "/minha-caixa";

  const aba = (ABAS.find((a) => a.id === busca.get("aba"))?.id ?? "geral") as Aba;
  const trocarAba = (id: Aba) => setBusca(id === "geral" ? {} : { aba: id }, { replace: true });

  // Imóveis que a pessoa pode abrir, para o seletor.
  const { data: imoveis, isLoading: carregandoImoveis } = useImoveisDeResultados(user?.id, equipe, !!profile);

  // Sem imóvel na URL: abre o primeiro.
  useEffect(() => {
    if (!propertyId && imoveis && imoveis.length > 0) {
      navigate(`/resultados/${imoveis[0].id}`, { replace: true });
    }
  }, [propertyId, imoveis, navigate]);

  const { data: dados, isLoading, error } = useResultadosImovel(propertyId);

  const hoje = hojeDia();
  const reservas = useMemo(() => (dados?.reservas ?? []).map(calcularReserva), [dados]);
  const primeira = dados?.primeira_reserva ? paraDia(dados.primeira_reserva) : null;
  const emDia = coletaEmDia(dados?.coletado_em);

  const seletor =
    imoveis && imoveis.length > 1 ? (
      <Select value={propertyId} onValueChange={(id) => navigate(`/resultados/${id}${aba === "geral" ? "" : `?aba=${aba}`}`, { replace: true })}>
        <SelectTrigger className="h-9 w-[150px] text-xs sm:w-[220px] sm:text-sm" aria-label="Trocar de imóvel">
          <SelectValue placeholder="Imóvel" />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {imoveis.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : undefined;

  const cabecalho = (
    <CabecalhoPagina
      titulo="Resultados"
      subtitulo={dados?.imovel.nome}
      icone={<BarChart3 />}
      voltarPara={inicio}
      acoes={seletor}
      abaixo={
        dados && reservas.length > 0 && (emDia || dados.visao_equipe) ? (
          <BarraFiltros role="tablist" aria-label="Seções dos resultados">
            {ABAS.map((a) => (
              <AbaPilula key={a.id} ativa={aba === a.id} onClick={() => trocarAba(a.id)}>
                {a.rotulo}
              </AbaPilula>
            ))}
          </BarraFiltros>
        ) : undefined
      }
    />
  );

  let conteudo: React.ReactNode;
  if (carregandoImoveis || (propertyId && isLoading) || (!propertyId && imoveis && imoveis.length > 0)) {
    conteudo = (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando resultados">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Skeleton className="col-span-2 h-32 rounded-xl" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  } else if (imoveis && imoveis.length === 0) {
    conteudo = <EmptyState ilustracao="busca" title="Nenhum imóvel por aqui" description="Quando houver um imóvel ligado à sua conta, os resultados aparecem nesta página." />;
  } else if (error || !dados) {
    const semAcesso = String((error as { message?: string } | null)?.message ?? "").includes("sem_acesso");
    conteudo = (
      <EmptyState
        ilustracao="busca"
        title={semAcesso ? "Este imóvel não está na sua conta" : "Não foi possível carregar os resultados"}
        description={semAcesso ? "Escolha um dos seus imóveis para ver os resultados." : "Tente de novo em instantes."}
      />
    );
  } else if (!emDia && !dados.visao_equipe) {
    // Número velho é pior que número nenhum: o proprietário só vê a página com a coleta em dia.
    conteudo = (
      <EmptyState
        ilustracao="manutencoes"
        title="Resultados em atualização"
        description="Estamos atualizando os dados de reservas deste imóvel. Volte em breve para ver ocupação, diárias e calendário."
      />
    );
  } else if (reservas.length === 0) {
    conteudo = (
      <EmptyState
        ilustracao="busca"
        title="Ainda não há reservas registradas"
        description={`Assim que ${dados.imovel.nome} receber a primeira reserva, os resultados aparecem aqui.`}
      />
    );
  } else {
    conteudo = (
      <>
        {!emDia && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">
                Dados da Hostex parados
                {dados.coletado_em ? ` desde ${format(new Date(dados.coletado_em), "d 'de' MMMM", { locale: ptBR })}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Reservas feitas depois dessa data não aparecem. Só a equipe vê esta página enquanto a coleta não voltar; para o
                proprietário ela mostra "resultados em atualização".
              </p>
            </div>
          </div>
        )}
        {aba === "geral" && <VisaoGeral key={dados.imovel.id} dados={dados} reservas={reservas} hoje={hoje} primeira={primeira} />}
        {aba === "calendario" && (
          <CalendarioReservas
            key={dados.imovel.id}
            reservas={reservas}
            anunciado={dados.calendario}
            hoje={hoje}
            primeira={primeira}
            comissaoPct={dados.comissao_pct}
            visaoEquipe={dados.visao_equipe}
          />
        )}
        {aba === "reservas" && (
          <ListaReservas key={dados.imovel.id} reservas={reservas} hoje={hoje} comissaoPct={dados.comissao_pct} visaoEquipe={dados.visao_equipe} />
        )}
      </>
    );
  }

  return (
    <PaginaInterna cabecalho={cabecalho} comNavInferior>
      {conteudo}
    </PaginaInterna>
  );
}
