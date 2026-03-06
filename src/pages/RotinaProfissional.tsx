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
    title: "Receber e integrar informações",
    items: [
      "Tudo que chegar pelo WhatsApp (fotos, áudios, comprovantes, orçamentos) deve ser registrado no sistema RIOS — nada fica só no WhatsApp.",
      "Fotos e vídeos de problemas → anexar na vistoria ou manutenção correspondente.",
      "Comprovantes de serviço → anexar na manutenção com nota de atualização.",
      "Orçamentos → anexar no chamado e registrar o valor no campo de custo.",
    ],
    links: [
      { label: "Quadro de Manutenções →", href: "/admin/manutencoes" },
      { label: "Vistorias →", href: "/admin/vistorias" },
    ],
  },
  {
    num: "2",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    title: "Identificar e criar manutenções",
    items: [
      "Manutenções podem surgir de qualquer origem: vistoria, WhatsApp, pedido de proprietário, equipe de rua, ou percepção própria. Não precisa de vistoria para criar.",
      "Prioridade máxima: problemas que afetam hóspede em casa ou que chega em 24-48h (ar, chuveiro, fechadura, internet). Resolver o mais rápido possível.",
      "O que não der para resolver agora: deixar pendente no Kanban para acompanhamento.",
      "Sempre definir o responsável pelo custo: Proprietário, Gestão ou Hóspede.",
      "Substituições de itens básicos (copos, lâmpadas, pilhas) devem ser registradas mesmo se o custo for 100% da Gestão — faz parte da contabilidade.",
    ],
    links: [
      { label: "Criar manutenção →", href: "/admin/nova-manutencao" },
      { label: "Kanban →", href: "/admin/manutencoes" },
    ],
  },
  {
    num: "3",
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-800",
    title: "Envolver proprietários e equipe de rua",
    items: [
      "Toda comunicação com proprietários sobre manutenções e cobranças deve ser feita pelo chat no sistema RIOS — não por WhatsApp.",
      "Incluir o proprietário nas decisões sempre que o custo for dele ou quando ele precisar aprovar.",
      "Contestações de valor: responder pelo chat da cobrança. Revisar o aporte se necessário.",
      "Equipe de rua: usar sempre que possível para pequenos reparos e logística. Documentar com fotos no sistema.",
      "Contato com hóspede: somente para manutenções durante a estadia que precisam de acesso ao imóvel, ou para cobranças por danos.",
      "Contato com Airbnb: somente para assuntos de cobrança e manutenção quando necessário.",
    ],
    links: [
      { label: "Tickets/Chamados →", href: "/todos-tickets" },
    ],
  },
  {
    num: "4",
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    title: "Acompanhar manutenções em andamento",
    items: [
      "Alimentar os chamados com anexos (fotos, notas fiscais, comprovantes) enquanto a manutenção estiver em andamento.",
      "Registrar notas de atualização (FDI) para manter o histórico claro.",
      "Mover o chamado pelo Kanban conforme o status evolui.",
    ],
    links: [
      { label: "Kanban →", href: "/admin/manutencoes" },
    ],
  },
  {
    num: "5",
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    title: "Cobrar após as manutenções",
    items: [
      "Proprietários: criar cobrança pelo sistema RIOS após a conclusão. Ter autonomia para definir o aporte de gestão com base no histórico e na parceria — inicialmente orientado por Paulo Henrique.",
      "Hóspedes: cobrar pelas plataformas (Airbnb, etc.).",
      "Para contestações de proprietários: responder no chat da cobrança e revisar o aporte se necessário.",
    ],
    links: [
      { label: "Gerenciar cobranças →", href: "/gerenciar-cobrancas" },
      { label: "Nova cobrança →", href: "/nova-cobranca" },
    ],
  },
  {
    num: "6",
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    title: "Débito em reserva (inadimplência)",
    items: [
      "Após 10 dias do vencimento sem pagamento: calcular o débito em reserva.",
      "Encontrar a próxima reserva no Airbnb que cubra o valor total devido.",
      "Usar a calculadora de comissões no sistema para definir o percentual a alterar.",
      "Em 2025: quem altera a comissão no Airbnb é o Paulo Henrique. A partir de 2026 a função terá autonomia para isso.",
      "Registrar o débito no sistema para atualizar o status da cobrança e notificar o proprietário.",
    ],
    links: [
      { label: "Cobranças com débito reserva →", href: "/gerenciar-cobrancas" },
    ],
  },
];

export default function RotinaProfissional() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => goBack(navigate)} className="mb-6 -ml-2">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="flex items-center gap-2 mb-1">
          <Wrench className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Rotina do Profissional RIOS</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Organização, manutenção e integração com proprietários, faxineiras e equipe de rua.
        </p>

        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.num} className={`rounded-lg border p-4 ${step.bg} ${step.border}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`font-bold text-lg ${step.color}`}>{step.num}.</span>
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
