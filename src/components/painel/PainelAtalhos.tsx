import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  Download,
  FileSignature,
  FileText,
  Inbox,
  List,
  Mail,
  MessageSquare,
  Package,
  Plus,
  Shield,
  Sparkles,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
  Vote,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ResponseTemplatesPanel } from "@/components/ResponseTemplatesPanel";
import StartInspectionButton from "@/components/StartInspectionButton";
import { cn } from "@/lib/utils";

type Papel = "admin" | "agent" | "maintenance";

interface Atalho {
  rotulo: string;
  icone: ReactNode;
  /**
   * Quem vê o atalho. Nunca mais aberto do que a tela aceita: um atalho que a
   * pessoa não pode abrir só a joga de volta ao início, sem aviso.
   *
   * Confira os DOIS lugares: allowedRoles da rota em src/App.tsx e o useEffect
   * da própria página, que às vezes é mais restrito (TodosTickets, Propriedades
   * e NovoAlerta aceitam só admin/agent; NovoTicketInterno, só admin).
   */
  papeis: Papel[];
  para?: string;
  /** Para atalhos que abrem um diálogo ou executam uma ação em vez de navegar. */
  render?: (classe: string) => ReactNode;
  acao?: () => void;
}

interface Grupo {
  titulo: string;
  atalhos: Atalho[];
}

const TODOS: Papel[] = ["admin", "agent", "maintenance"];
const ADMIN_MANUT: Papel[] = ["admin", "maintenance"];
const ADMIN_AGENT: Papel[] = ["admin", "agent"];
const SO_ADMIN: Papel[] = ["admin"];

const ICONE = "h-4 w-4 shrink-0";

async function exportarContatos() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("name, phone")
      .in("role", ["owner", "pending_owner"])
      .not("phone", "is", null)
      .neq("phone", "")
      .order("name");
    if (error) throw error;
    if (!data || data.length === 0) {
      toast.error("Nenhum contato encontrado");
      return;
    }
    const vcards = data
      .map((p) =>
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${p.name} Proprietário`,
          `N:Proprietário;${p.name};;;`,
          `TEL;TYPE=CELL:${(p.phone || "").replace(/[^\d+]/g, "")}`,
          "ORG:RIOS",
          "END:VCARD",
        ].join("\r\n"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([vcards], { type: "text/vcard;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "proprietarios-rios.vcf";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${data.length} contatos exportados!`);
  } catch (err) {
    console.error("Erro ao exportar contatos:", err);
    toast.error("Erro ao exportar contatos");
  }
}

const GRUPOS: Grupo[] = [
  {
    titulo: "Criar",
    atalhos: [
      { rotulo: "Nova manutenção", icone: <Wrench className={ICONE} />, papeis: ADMIN_MANUT, para: "/admin/nova-manutencao" },
      {
        rotulo: "Nova vistoria",
        icone: <ClipboardCheck className={ICONE} />,
        papeis: TODOS,
        render: (classe) => (
          <StartInspectionButton
            variant="panel"
            className={classe}
            icon={<ClipboardCheck className={cn(ICONE, "text-primary")} aria-hidden="true" />}
            label="Nova vistoria"
          />
        ),
      },
      { rotulo: "Novo ticket", icone: <Ticket className={ICONE} />, papeis: TODOS, para: "/novo-ticket-massa" },
      { rotulo: "Ticket de equipe", icone: <Users className={ICONE} />, papeis: SO_ADMIN, para: "/novo-ticket-interno" },
      { rotulo: "Nova cobrança", icone: <DollarSign className={ICONE} />, papeis: TODOS, para: "/nova-cobranca" },
      { rotulo: "Reposição de itens", icone: <Package className={ICONE} />, papeis: TODOS, para: "/nova-cobranca?reposicao=true" },
      { rotulo: "Novo alerta", icone: <Bell className={ICONE} />, papeis: ADMIN_AGENT, para: "/novo-alerta" },
      { rotulo: "Nova proposta", icone: <Vote className={ICONE} />, papeis: ADMIN_MANUT, para: "/nova-proposta-votacao" },
      { rotulo: "Nova comissão Booking", icone: <Plus className={ICONE} />, papeis: ADMIN_AGENT, para: "/nova-comissao-booking" },
    ],
  },
  {
    titulo: "Operação",
    atalhos: [
      { rotulo: "Todos os tickets", icone: <Ticket className={ICONE} />, papeis: ADMIN_AGENT, para: "/todos-tickets" },
      { rotulo: "Chamados (quadro)", icone: <MessageSquare className={ICONE} />, papeis: TODOS, para: "/admin/chamados" },
      { rotulo: "Lista de manutenções", icone: <List className={ICONE} />, papeis: ADMIN_MANUT, para: "/admin/manutencoes-lista" },
      { rotulo: "Gerenciar cobranças", icone: <DollarSign className={ICONE} />, papeis: TODOS, para: "/gerenciar-cobrancas" },
      { rotulo: "Vistorias de faxina", icone: <Sparkles className={ICONE} />, papeis: ADMIN_MANUT, para: "/admin/vistorias" },
      { rotulo: "Vistorias de rotina", icone: <ClipboardList className={ICONE} />, papeis: TODOS, para: "/admin/vistorias/rotina" },
      { rotulo: "Comissões Booking", icone: <Sparkles className={ICONE} />, papeis: ADMIN_AGENT, para: "/booking-comissoes" },
      { rotulo: "Curadorias", icone: <Sparkles className={ICONE} />, papeis: ADMIN_AGENT, para: "/admin/curadorias" },
      { rotulo: "Contratos", icone: <FileSignature className={ICONE} />, papeis: SO_ADMIN, para: "/admin/contratos" },
    ],
  },
  {
    titulo: "Relatórios e dados",
    atalhos: [
      { rotulo: "Central Hostex · calendário e ocupação", icone: <Calendar className={ICONE} />, papeis: SO_ADMIN, para: "/admin/central-hostex" },
      { rotulo: "Relatórios financeiros", icone: <BarChart3 className={ICONE} />, papeis: TODOS, para: "/admin/relatorios-financeiros" },
      { rotulo: "Relatórios de manutenções", icone: <Wrench className={ICONE} />, papeis: TODOS, para: "/admin/relatorios-manutencoes" },
      { rotulo: "Relatório Booking", icone: <BarChart3 className={ICONE} />, papeis: ADMIN_AGENT, para: "/admin/relatorio-booking" },
      { rotulo: "Comissão RIOS (Hostex)", icone: <FileText className={ICONE} />, papeis: SO_ADMIN, para: "/admin/comissao-rios" },
      { rotulo: "Resumo por propriedade", icone: <Building2 className={ICONE} />, papeis: TODOS, para: "/resumo-propriedades" },
      { rotulo: "Fichas dos imóveis", icone: <FileText className={ICONE} />, papeis: TODOS, para: "/admin/fichas-imoveis" },
    ],
  },
  {
    titulo: "Pessoas e imóveis",
    atalhos: [
      { rotulo: "Gerenciar usuários", icone: <Shield className={ICONE} />, papeis: SO_ADMIN, para: "/admin/gerenciar-usuarios" },
      { rotulo: "Aprovações pendentes", icone: <UserCheck className={ICONE} />, papeis: SO_ADMIN, para: "/aprovacoes" },
      { rotulo: "Cadastros de captação", icone: <Inbox className={ICONE} />, papeis: ADMIN_AGENT, para: "/admin/cadastros-proprietarios" },
      { rotulo: "Cadastrar proprietário", icone: <UserPlus className={ICONE} />, papeis: SO_ADMIN, para: "/admin/cadastrar-proprietario" },
      { rotulo: "Cadastrar faxineira", icone: <UserPlus className={ICONE} />, papeis: SO_ADMIN, para: "/admin/cadastrar-faxineira" },
      { rotulo: "Cadastrar equipe", icone: <Users className={ICONE} />, papeis: SO_ADMIN, para: "/admin/cadastrar-equipe" },
      { rotulo: "Gerenciar unidades", icone: <Building2 className={ICONE} />, papeis: ADMIN_AGENT, para: "/propriedades" },
      { rotulo: "Exportar contatos (vCard)", icone: <Download className={ICONE} />, papeis: TODOS, acao: exportarContatos },
    ],
  },
  {
    titulo: "Guias e configurações",
    atalhos: [
      { rotulo: "Rotina do profissional RIOS", icone: <BookOpen className={ICONE} />, papeis: TODOS, para: "/rotina-profissional" },
      { rotulo: "Protocolo de manutenções", icone: <BookOpen className={ICONE} />, papeis: TODOS, para: "/protocolo-trabalho" },
      { rotulo: "Tutoriais", icone: <BookOpen className={ICONE} />, papeis: TODOS, para: "/tutoriais" },
      {
        rotulo: "Templates de resposta",
        icone: <FileText className={ICONE} />,
        papeis: TODOS,
        render: (classe) => (
          <ResponseTemplatesPanel
            triggerElement={
              <button type="button" className={classe}>
                <FileText className={cn(ICONE, "text-primary")} aria-hidden="true" />
                <span className="min-w-0 leading-snug">Templates de resposta</span>
              </button>
            }
          />
        ),
      },
      { rotulo: "Templates de e-mail", icone: <Mail className={ICONE} />, papeis: SO_ADMIN, para: "/configuracao-email" },
    ],
  },
];

// h-full, justify-start, font-normal e text-foreground neutralizam o estilo
// padrão do <Button> do shadcn (usado por StartInspectionButton), que senão
// deixaria o texto branco e centralizado sobre fundo claro. h-full também
// iguala a altura dos atalhos da mesma linha quando um rótulo quebra.
const CLASSE_ATALHO =
  "group flex h-full w-full min-w-0 items-center justify-start gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2 " +
  "text-left text-[13px] font-medium text-foreground shadow-none transition-all hover:-translate-y-px hover:border-primary/40 " +
  "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:text-primary";

/**
 * Todos os atalhos do painel num bloco só, agrupados por assunto.
 *
 * Substitui cinco seções espalhadas (Comissões Booking, Insights, Criar Novo,
 * Gerenciar, Outras Ações) mais os dois banners de guia do topo — que juntas
 * tinham ~25 botões, um atalho duplicado (Calendário & Ocupação e Central
 * Hostex iam para o mesmo lugar) e vários atalhos que agent e maintenance
 * viam mas não podiam abrir.
 */
export function PainelAtalhos() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const papel = profile?.role as Papel | undefined;

  const grupos = GRUPOS.map((g) => ({
    ...g,
    atalhos: g.atalhos.filter((a) => papel && a.papeis.includes(papel)),
  })).filter((g) => g.atalhos.length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {grupos.map((grupo) => (
        <section
          key={grupo.titulo}
          aria-label={grupo.titulo}
          className="min-w-0 rounded-xl border border-border/60 bg-muted/30 p-3"
        >
          <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {grupo.titulo}
          </h4>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {grupo.atalhos.map((a) =>
              a.render ? (
                <div key={a.rotulo} className="min-w-0">
                  {a.render(CLASSE_ATALHO)}
                </div>
              ) : (
                <button
                  key={a.rotulo}
                  type="button"
                  className={CLASSE_ATALHO}
                  onClick={() => (a.acao ? a.acao() : a.para && navigate(a.para))}
                >
                  <span className="text-primary" aria-hidden="true">
                    {a.icone}
                  </span>
                  {/* Quebra linha em vez de cortar: "Relatórios de manutenções" some pela metade numa coluna estreita. */}
                  <span className="min-w-0 leading-snug">{a.rotulo}</span>
                </button>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
