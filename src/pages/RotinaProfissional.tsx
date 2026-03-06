import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Wrench, PackagePlus, Hammer, MessageSquare, CreditCard, LayoutGrid, BrainCircuit } from "lucide-react";

const steps = [
  {
    icon: PackagePlus,
    emoji: "📋",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    title: "Crie a manutenção quando precisar",
    subtitle: "Sem burocracia, quando surgir o problema",
    items: [
      "A manutenção pode vir de uma vistoria, de uma mensagem no WhatsApp, de um pedido do proprietário ou de algo que você mesmo notou",
      "Não precisa registrar tudo que chega no WhatsApp — só o que for relevante resolver",
      "Problema afetando hóspede agora ou chegada em até 48h? Prioridade máxima: ar-condicionado, chuveiro, fechadura, internet",
      "Custo responsável (Proprietário, Gestão ou Hóspede) você define só na hora de cobrar, não agora",
    ],
    links: [
      { label: "Nova manutenção", href: "/admin/nova-manutencao" },
    ],
  },
  {
    icon: LayoutGrid,
    emoji: "🗂️",
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    title: "Use o Kanban do imóvel",
    subtitle: "Após vistoria com vários problemas",
    items: [
      "Depois de uma vistoria, use o botão 'Importar para Kanban do imóvel' para ver todos os problemas encontrados",
      "Escolha quais manutenções vai resolver agora e atribua cada uma ao responsável correto",
      "Deixe as demais como pendentes — elas ficam salvas e você não esquece nenhuma",
      "O Kanban do imóvel específico é o seu foco, não precisa ficar no Kanban geral",
    ],
    links: [
      { label: "Resumo por imóvel", href: "/resumo-propriedades" },
    ],
  },
  {
    icon: Hammer,
    emoji: "🔧",
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    iconBg: "bg-green-100 dark:bg-green-900/50",
    title: "Resolva do seu jeito",
    subtitle: "Sem regra rígida de acompanhamento",
    items: [
      "Mova os chamados no Kanban conforme o status avança — mas faça como funcionar melhor para você",
      "Anexe fotos, comprovantes e notas fiscais quando tiver — não precisa adicionar uma nota toda vez que subir um arquivo",
      "Quer deixar uma observação importante? Anote. Mas não é obrigatório a cada atualização",
      "O histórico fica salvo automaticamente para consultas futuras",
    ],
    links: [
      { label: "Ver manutenções", href: "/admin/manutencoes" },
    ],
  },
  {
    icon: MessageSquare,
    emoji: "💬",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    title: "Fale pelo sistema com o proprietário",
    subtitle: "Chat do RIOS, não WhatsApp",
    items: [
      "Quando precisar envolver o proprietário em uma decisão ou cobrar por um dano, use o chat dentro do sistema",
      "Proprietário contestou um valor? Responde no chat da cobrança e ajusta o aporte se fizer sentido",
      "Para equipe de rua: combine pelo RIOS e documente com fotos no chamado",
      "Contato direto com hóspede ou Airbnb só quando for realmente necessário",
    ],
    links: [
      { label: "Ver chamados", href: "/todos-tickets" },
    ],
  },
  {
    icon: CreditCard,
    emoji: "💰",
    color: "text-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-rose-200 dark:border-rose-800",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    title: "Cobre depois que concluir",
    subtitle: "Simples e direto",
    items: [
      "Manutenção concluída? Cria a cobrança no RIOS para o proprietário, com o valor do serviço e o aporte de gestão",
      "Hóspede causou dano? Cobra pela plataforma (Airbnb, Booking etc.)",
      "Proprietário não pagou em 10 dias? Use a calculadora de débito em reserva para calcular o percentual de comissão a ajustar",
      "Dúvida sobre o valor do aporte? Consulte o histórico ou pergunte para a equipe",
    ],
    links: [
      { label: "Gerenciar cobranças", href: "/gerenciar-cobrancas" },
      { label: "Nova cobrança", href: "/nova-cobranca" },
    ],
  },
  {
    icon: BrainCircuit,
    emoji: "🤖",
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-200 dark:border-teal-800",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
    title: "Consulte a I.A quando tiver dúvida",
    subtitle: "Pergunte qualquer coisa sobre os imóveis",
    items: [
      "Não sabe o que está pendente em um imóvel específico? Pergunta para a I.A",
      "Quer ver todas as manutenções abertas de todos os imóveis de uma vez? A I.A responde na hora",
      "O botão I.A fica flutuante no painel — é só clicar e digitar sua pergunta",
      "Quanto mais você usar o sistema, mais a I.A consegue te ajudar com respostas precisas",
    ],
    links: [],
  },
];

export default function RotinaProfissional() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => goBack(navigate)} className="mb-6 -ml-2">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
            <Wrench className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Sua rotina no RIOS</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Tudo que você precisa saber para trabalhar bem — sem complicar.
          </p>
        </div>

        {/* Grid 2 colunas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className={`rounded-xl border p-5 flex flex-col gap-3 ${step.bg} ${step.border}`}
              >
                {/* Header do card */}
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-lg ${step.iconBg}`}>
                    {step.emoji}
                  </div>
                  <div className="min-w-0">
                    <h2 className={`font-semibold text-sm leading-snug ${step.color}`}>{step.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.subtitle}</p>
                  </div>
                </div>

                {/* Itens */}
                <ul className="space-y-2">
                  {step.items.map((item, i) => (
                    <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                      <span className={`mt-[5px] flex-shrink-0 w-1.5 h-1.5 rounded-full ${step.color.replace("text-", "bg-")}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                {/* Links */}
                {step.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-current/10">
                    {step.links.map((link) => (
                      <button
                        key={link.href}
                        onClick={() => navigate(link.href)}
                        className={`text-xs font-semibold underline underline-offset-2 ${step.color} hover:opacity-70 transition-opacity`}
                      >
                        {link.label} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
