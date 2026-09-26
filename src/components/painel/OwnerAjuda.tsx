import { useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, GraduationCap, Wrench } from "lucide-react";
import { CaixaOperacao, LinhaCaixa } from "./CaixaOperacao";

const ITENS = [
  {
    rotulo: "Relatório de manutenções",
    descricao: "Histórico e custos por unidade",
    icone: <Wrench className="h-4 w-4" />,
    para: "/manutencoes",
  },
  {
    rotulo: "Resumo por propriedade",
    descricao: "Visão geral de cada imóvel",
    icone: <BarChart3 className="h-4 w-4" />,
    para: "/resumo-propriedades",
  },
  {
    rotulo: "Protocolo de manutenções",
    descricao: "Como funciona o fluxo completo",
    icone: <BookOpen className="h-4 w-4" />,
    para: "/protocolo-trabalho",
  },
  {
    rotulo: "Tutoriais",
    descricao: "Guias de cada funcionalidade",
    icone: <GraduationCap className="h-4 w-4" />,
    para: "/tutoriais",
  },
];

/**
 * Relatórios e guias do proprietário, num bloco só.
 *
 * Substitui os dois banners que ficavam no topo (Protocolo e Tutoriais) e os
 * dois botões de relatório que só apareciam em desktop, no fim da página.
 */
export function OwnerAjuda() {
  const navigate = useNavigate();
  return (
    <CaixaOperacao icone={<BookOpen />} titulo="Relatórios e guias" tom="secondary">
      <div className="space-y-1">
        {ITENS.map((item) => (
          <LinhaCaixa
            key={item.para}
            titulo={item.rotulo}
            subtitulo={item.descricao}
            miniatura={
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-primary"
                aria-hidden="true"
              >
                {item.icone}
              </span>
            }
            onClick={() => navigate(item.para)}
          />
        ))}
      </div>
    </CaixaOperacao>
  );
}
