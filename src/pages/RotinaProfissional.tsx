import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Wrench } from "lucide-react";

const steps = [
  {
    num: "1",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    title: "Criar manutenções quando necessário",
    items: [
      "Manutenções podem surgir de qualquer origem: vistoria, WhatsApp, pedido de proprietário ou percepção própria.",
      "Prioridade máxima: problemas que afetam hóspede em casa ou chegada em 24-48h (ar, chuveiro, fechadura, internet).",
      "Registre somente o que for relevante — não precisa documentar tudo que chega no WhatsApp.",
      "Após uma vistoria com vários problemas: use o botão 'Importar para Kanban do imóvel' para escolher o que vai resolver, atribuir responsáveis e deixar os demais como pendentes.",
    ],
    links: [
      { label: "Nova manutenção →", href: "/admin/nova-manutencao" },
      { label: "Resumo por imóvel →", href: "/resumo-propriedades" },
    ],
  },
  {
    num: "2",
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    title: "Acompanhar e resolver",
    items: [
      "Gerencie o Kanban do imóvel específico — não precisa ficar olhando o Kanban geral.",
      "Mova os chamados conforme o status avança. Não existe forma errada de organizar — faça como funcionar melhor para você.",
      "Anexe fotos, comprovantes ou notas fiscais quando tiver — não precisa adicionar nota toda vez que anexar algo.",
      "Defina o responsável pelo custo (Proprietário, Gestão ou Hóspede) quando for cobrar — não precisa preencher isso durante a manutenção.",
    ],
    links: [
      { label: "Manutenções →", href: "/admin/manutencoes" },
    ],
  },
  {
    num: "3",
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-800",
    title: "Comunicar pelo sistema",
    items: [
      "Comunicação com proprietários sobre manutenções e cobranças: usar o chat do sistema RIOS.",
      "Inclua o proprietário na decisão quando o custo for dele.",
      "Contestações de valor: responder no chat da cobrança.",
    ],
    links: [
      { label: "Chamados →", href: "/todos-tickets" },
    ],
  },
  {
    num: "4",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    title: "Cobrar após concluir",
    items: [
      "Criar cobrança pelo RIOS após concluir a manutenção. Defina o aporte de gestão com base no histórico.",
      "Hóspedes: cobrar pelas plataformas (Airbnb, etc.).",
      "Inadimplência após 10 dias: usar a calculadora de débito em reserva para calcular o percentual de comissão.",
    ],
    links: [
      { label: "Cobranças →", href: "/gerenciar-cobrancas" },
      { label: "Nova cobrança →", href: "/nova-cobranca" },
    ],
  },
];

export default function RotinaProfissional() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => goBack(navigate)} className="mb-6 -ml-2">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Rotina do Profissional RIOS</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Simples e direto — sem complicação.
        </p>

        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.num} className={`rounded-lg border p-4 ${step.bg} ${step.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-bold text-base ${step.color}`}>{step.num}.</span>
                <h2 className={`font-semibold text-sm ${step.color}`}>{step.title}</h2>
              </div>
              <ul className="space-y-1.5 mb-3">
                {step.items.map((item, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                    <span className={`mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full ${step.color.replace("text-", "bg-")}`} />
                    {item}
                  </li>
                ))}
              </ul>
              {step.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {step.links.map((link) => (
                    <button
                      key={link.href}
                      onClick={() => navigate(link.href)}
                      className={`text-xs font-medium underline underline-offset-2 ${step.color} hover:opacity-70`}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
