import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  Users,
  MessageSquare,
  FileText,
  Clock,
  Smartphone,
  BarChart2,
  Banknote,
  Calculator,
  Calendar,
  Camera,
  ExternalLink,
  Phone,
  Star,
  ShieldAlert,
  Package,
  AlertCircle,
  Info,
  Home,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";

interface StepProps {
  number: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Step({ number, color, bgColor, borderColor, icon, title, subtitle, children, defaultOpen = false }: StepProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={`border-l-4 ${borderColor} overflow-hidden`}>
      <button
        className="w-full text-left"
        onClick={() => setOpen(!open)}
      >
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-base flex items-center gap-2">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${color}`}>
              {number}
            </span>
            <span className={`${color.replace('bg-', 'text-')}`}>{icon}</span>
            <span className="flex-1">{title}</span>
            {subtitle && <Badge variant="outline" className="text-xs hidden sm:flex">{subtitle}</Badge>}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          </CardTitle>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pb-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function TipBox({ icon, title, children, variant = "info" }: { icon: React.ReactNode; title: string; children: React.ReactNode; variant?: "info" | "warn" | "success" | "danger" }) {
  const styles = {
    info: "bg-primary/5 border-primary/20",
    warn: "bg-amber-50 dark:bg-amber-950/20 border-amber-200",
    success: "bg-green-50 dark:bg-green-950/20 border-green-200",
    danger: "bg-red-50 dark:bg-red-950/20 border-red-200",
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${styles[variant]}`}>
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="font-semibold text-sm mb-0.5">{title}</p>
        <div className="text-xs text-muted-foreground space-y-1">{children}</div>
      </div>
    </div>
  );
}

function LinkAction({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => external ? window.open(href, '_blank') : navigate(href)}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

export default function RotinaProfissional() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => goBack(navigate)} className="mb-6">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Rotina do Profissional RIOS</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Guia completo de organização, manutenção e integração com proprietários, faxineiras e equipe de rua.
          </p>
        </div>

        {/* Fluxo visual */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6 p-4 bg-muted/50 rounded-lg text-xs font-medium">
          {[
            { label: "1. Receber", color: "bg-blue-500" },
            { label: "2. Triar", color: "bg-amber-500" },
            { label: "3. Executar", color: "bg-purple-500" },
            { label: "4. Registrar", color: "bg-green-500" },
            { label: "5. Cobrar", color: "bg-orange-500" },
            { label: "6. Débito Reserva", color: "bg-red-500" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-1">
              <Badge className={`${s.color} text-white`}>{s.label}</Badge>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Conceito da função */}
        <TipBox icon={<Star className="h-4 w-4 text-primary" />} title="Sua função em resumo">
          <p>Você é o elo entre a operação de campo (faxineiras, equipe de rua, profissionais) e o sistema RIOS. Seu trabalho é <strong>garantir que nada se perca</strong>: toda informação recebida pelo WhatsApp deve entrar no sistema, toda manutenção deve ser acompanhada até o pagamento, e todo proprietário deve ser comunicado de forma profissional e ágil.</p>
        </TipBox>

        <div className="grid gap-4 mt-5">

          {/* ETAPA 1 */}
          <Step number={1} color="bg-blue-500" bgColor="bg-blue-50" borderColor="border-l-blue-500"
            icon={<Smartphone className="h-4 w-4" />} title="Receber e Integrar Informações" subtitle="Diário" defaultOpen={true}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tudo que chega pelo WhatsApp da equipe (faxineiras, equipe de rua, prestadores) precisa ser integrado ao sistema RIOS. <strong>Nenhuma informação fica só no WhatsApp.</strong>
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Camera className="h-4 w-4 text-blue-500" />
                    Fotos e vídeos de problemas
                  </div>
                  <p className="text-xs text-muted-foreground">Anexe diretamente na vistoria ou chamado correspondente no sistema.</p>
                </div>
                <div className="p-3 rounded-lg border bg-card space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Comprovantes de serviço
                  </div>
                  <p className="text-xs text-muted-foreground">Anexe nas manutenções em andamento como notas de atualização.</p>
                </div>
                <div className="p-3 rounded-lg border bg-card space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    Relatos verbais/áudios
                  </div>
                  <p className="text-xs text-muted-foreground">Transcreva ou resuma o que foi dito e registre como nota na vistoria ou chamado.</p>
                </div>
                <div className="p-3 rounded-lg border bg-card space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Banknote className="h-4 w-4 text-blue-500" />
                    Orçamentos recebidos
                  </div>
                  <p className="text-xs text-muted-foreground">Anexe na manutenção como arquivo e registre o valor no campo de custo.</p>
                </div>
              </div>

              <TipBox icon={<Info className="h-4 w-4 text-primary" />} title="Como fazer no sistema">
                <p>Acesse a manutenção correspondente → clique no ícone de clipe ou câmera → envie o arquivo. Para vistorias, vá em <strong>Vistorias</strong> → selecione a inspeção → adicione fotos e notas.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <LinkAction href="/admin/manutencoes" label="Quadro de Manutenções" />
                  <LinkAction href="/admin/vistorias" label="Vistorias" />
                </div>
              </TipBox>
            </div>
          </Step>

          {/* ETAPA 2 */}
          <Step number={2} color="bg-amber-500" bgColor="bg-amber-50" borderColor="border-l-amber-500"
            icon={<ClipboardCheck className="h-4 w-4" />} title="Triagem de Vistorias e Faxinas" subtitle="A cada vistoria">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao receber uma vistoria (pelo app ou WhatsApp), você deve <strong>decidir</strong> quais problemas geram manutenção, quem paga e com qual urgência.
              </p>

              <div className="p-3 rounded-lg border bg-card">
                <p className="font-medium text-sm mb-2">Prioridade de atendimento</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-700">🔴 URGENTE – Risco de avaliação ruim</p>
                      <p className="text-xs text-muted-foreground">Problemas que afetam hóspede atual ou que entram em 24-48h: ar condicionado, chuveiro, fechadura, TV, internet, vazamentos. Execute o mais rápido possível.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">🟡 IMPORTANTE – Resolver entre check-ins</p>
                      <p className="text-xs text-muted-foreground">Itens desgastados que não bloqueiam a estadia mas impactam a experiência. Deixe pendente no Kanban se não for possível resolver na hora.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-200">
                    <Clock className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-green-700">🟢 PODE AGUARDAR – Preventiva ou estética</p>
                      <p className="text-xs text-muted-foreground">Pintura, melhoria de móveis, itens estéticos. Pode planejar para baixa temporada.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-card">
                <p className="font-medium text-sm mb-2">Quem paga? (definir no Kanban)</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-center">
                    <p className="font-semibold text-xs text-blue-700">Proprietário</p>
                    <p className="text-xs text-muted-foreground mt-1">Desgaste natural do imóvel, problemas estruturais, equipamentos</p>
                  </div>
                  <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/20 border border-purple-200 text-center">
                    <p className="font-semibold text-xs text-purple-700">Gestão (RIOS)</p>
                    <p className="text-xs text-muted-foreground mt-1">Itens básicos (copos, lâmpadas), pequenos reparos que não cabem ao proprietário</p>
                  </div>
                  <div className="p-2 rounded bg-orange-50 dark:bg-orange-950/20 border border-orange-200 text-center">
                    <p className="font-semibold text-xs text-orange-700">Hóspede</p>
                    <p className="text-xs text-muted-foreground mt-1">Danos causados pelo hóspede, itens quebrados/furtados durante estadia</p>
                  </div>
                </div>
              </div>

              <TipBox icon={<Info className="h-4 w-4 text-primary" />} title="Como fazer no Kanban">
                <p>No Quadro de Manutenções, crie um novo chamado para cada problema identificado. Defina o <strong>responsável pelo custo</strong> (cost_responsible) no momento da criação. Itens urgentes devem ser criados como prioridade <strong>"Urgente"</strong>.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <LinkAction href="/admin/manutencoes" label="Quadro Kanban de Manutenções" />
                  <LinkAction href="/admin/nova-manutencao" label="Criar nova manutenção" />
                  <LinkAction href="/admin/vistorias" label="Ver vistorias" />
                </div>
              </TipBox>

              <TipBox icon={<Package className="h-4 w-4 text-purple-600" />} title="Substituições de itens básicos (custo da Gestão)" variant="info">
                <p>Trocas de copos, lâmpadas comuns, pilhas, produtos de limpeza e similares <strong>devem ser registradas</strong> mesmo que o custo seja 100% da gestão. Isso é necessário para a contabilidade. Crie a manutenção normalmente com <strong>Responsável: Gestão</strong> e aporte = valor total.</p>
              </TipBox>
            </div>
          </Step>

          {/* ETAPA 3 */}
          <Step number={3} color="bg-purple-500" bgColor="bg-purple-50" borderColor="border-l-purple-500"
            icon={<Users className="h-4 w-4" />} title="Envolver Proprietários e Equipe de Rua">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Para manutenções que envolvem custo do proprietário, use o sistema RIOS para comunicar e decidir juntos. Para execuções simples, use a equipe de rua sempre que possível.
              </p>

              <div className="p-3 rounded-lg border bg-card space-y-3">
                <p className="font-medium text-sm">Quando comunicar o proprietário</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> Qualquer manutenção que será cobrada ao proprietário</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> Quando o proprietário precisa decidir (assumir ou delegar)</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> Para contestações de cobranças (sempre pelo chat da cobrança)</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> Para atualizações de progresso quando solicitado</li>
                </ul>
              </div>

              <TipBox icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Use o Chat do Sistema – Não WhatsApp">
                <p>Toda comunicação com proprietários sobre manutenções e cobranças deve ocorrer no <strong>chat dentro do sistema RIOS</strong>. Isso gera registro, auditoria e transparência. Use o WhatsApp apenas para avisos rápidos quando necessário, mas sempre formalize no sistema.</p>
              </TipBox>

              <div className="p-3 rounded-lg border bg-card space-y-2">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-green-600" />
                  Equipe de Rua – Use sempre que possível
                </p>
                <p className="text-xs text-muted-foreground">Para pequenos reparos, retirada/entrega de itens e logística de manutenções, priorize a equipe de rua. Isso agiliza o processo e reduz custos. Documente o que foi feito com fotos no sistema.</p>
              </div>

              <TipBox icon={<Phone className="h-4 w-4 text-orange-600" />} title="Contato com hóspede – apenas quando necessário" variant="warn">
                <p>Entre em contato com o hóspede <strong>somente</strong> para: (1) manutenções durante a estadia que exigem acesso ao imóvel, ou (2) cobranças por danos causados. Nunca entre em contato para outros assuntos.</p>
              </TipBox>

              <TipBox icon={<Phone className="h-4 w-4 text-blue-600" />} title="Contato com o Airbnb – apenas quando necessário" variant="info">
                <p>Contate o Airbnb <strong>somente</strong> para: (1) suporte em cobranças de danos por hóspedes (através da plataforma), ou (2) problemas técnicos de manutenção que impactam reservas. Para demais assuntos, resolva internamente.</p>
              </TipBox>
            </div>
          </Step>

          {/* ETAPA 4 */}
          <Step number={4} color="bg-green-500" bgColor="bg-green-50" borderColor="border-l-green-500"
            icon={<Camera className="h-4 w-4" />} title="Acompanhar e Alimentar Manutenções em Andamento">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enquanto uma manutenção estiver em andamento, o sistema deve ser atualizado com fotos, notas e comprovantes. <strong>O quadro Kanban é a central de controle.</strong>
              </p>

              <div className="p-3 rounded-lg border bg-card space-y-2">
                <p className="font-medium text-sm">O que registrar durante a execução</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {[
                    { icon: "📸", label: "Fotos do antes e depois" },
                    { icon: "📝", label: "Notas de progresso" },
                    { icon: "🧾", label: "Comprovantes de compra/serviço" },
                    { icon: "📅", label: "Datas de visita do profissional" },
                    { icon: "💬", label: "Atualizações para o proprietário (via chat)" },
                    { icon: "⚠️", label: "Problemas encontrados que ampliam o escopo" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded bg-muted/50">
                      <span>{item.icon}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              <TipBox icon={<Info className="h-4 w-4 text-primary" />} title="Como fazer no sistema">
                <p>Na manutenção → aba de chat → envie fotos e escreva notas de atualização. Mova o card no Kanban conforme o status avança: <strong>Pendente → Agendado → Em Execução → Concluído</strong>.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <LinkAction href="/admin/manutencoes" label="Quadro Kanban" />
                  <LinkAction href="/admin/manutencoes-lista" label="Lista de Manutenções" />
                </div>
              </TipBox>
            </div>
          </Step>

          {/* ETAPA 5 */}
          <Step number={5} color="bg-orange-500" bgColor="bg-orange-50" borderColor="border-l-orange-500"
            icon={<CreditCard className="h-4 w-4" />} title="Realizar Cobranças após Conclusão" subtitle="Por proprietário ou hóspede">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Após a manutenção ser concluída, você tem autonomia para criar e gerenciar cobranças — sempre com base nas orientações do Paulo Henrique inicialmente.
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card space-y-2">
                  <p className="font-semibold text-sm text-blue-700 dark:text-blue-400 flex items-center gap-1">
                    <Home className="h-4 w-4" /> Cobrança de Proprietário
                  </p>
                  <p className="text-xs text-muted-foreground">Crie a cobrança no sistema RIOS. O proprietário recebe o link de pagamento e pode pagar por PIX ou cartão. O sistema envia lembretes automáticos.</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <LinkAction href="/nova-cobranca" label="Nova cobrança" />
                    <LinkAction href="/gerenciar-cobrancas" label="Gerenciar cobranças" />
                  </div>
                </div>
                <div className="p-3 rounded-lg border bg-card space-y-2">
                  <p className="font-semibold text-sm text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <Users className="h-4 w-4" /> Cobrança de Hóspede
                  </p>
                  <p className="text-xs text-muted-foreground">Cobranças de hóspedes por danos são feitas <strong>pelas plataformas</strong> (Airbnb, Booking). Lembre: só pode cobrar 14 dias após o checkout do hóspede no Airbnb.</p>
                  <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">Aguardar 14 dias pós-checkout</Badge>
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-card space-y-3">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  Aporte da Gestão — Sua autonomia
                </p>
                <p className="text-xs text-muted-foreground">
                  Você tem autonomia para definir o aporte (contribuição da gestão) com base no <strong>histórico do proprietário</strong> e na parceria. Pontos que guiam a decisão:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2"><Star className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" /> Score de pagamento do proprietário (quanto mais alto, mais parceria)</li>
                  <li className="flex items-start gap-2"><Star className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" /> Histórico de manutenções anteriores</li>
                  <li className="flex items-start gap-2"><Star className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" /> Natureza do problema (desgaste natural, urgência, etc.)</li>
                </ul>
                <TipBox icon={<AlertCircle className="h-4 w-4 text-amber-600" />} title="Início: sempre consulte o Paulo Henrique" variant="warn">
                  <p>No início, valide os aportes com o Paulo Henrique antes de finalizar. Com o tempo e experiência, você ganhará total autonomia nessa decisão.</p>
                </TipBox>
              </div>

              <TipBox icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Contestações de valores">
                <p>Se um proprietário questionar uma cobrança, responda <strong>sempre pelo chat da cobrança</strong> no sistema. Se necessário, revise o aporte da gestão. Nenhuma contestação deve ficar sem resposta.</p>
                <div className="mt-2">
                  <LinkAction href="/gerenciar-cobrancas" label="Ver cobranças em aberto" />
                </div>
              </TipBox>
            </div>
          </Step>

          {/* ETAPA 6 */}
          <Step number={6} color="bg-red-500" bgColor="bg-red-50" borderColor="border-l-red-500"
            icon={<Calculator className="h-4 w-4" />} title="Débito em Reserva — Após 10 dias de vencimento" subtitle="Com apoio do Paulo Henrique">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Se uma cobrança de proprietário não for paga após 10 dias do vencimento, ela pode ser recuperada via <strong>débito em reserva futura do Airbnb</strong>.
              </p>

              <div className="p-3 rounded-lg border bg-card space-y-3">
                <p className="font-semibold text-sm">Passo a passo do débito em reserva</p>
                <div className="space-y-3">
                  {[
                    {
                      step: "1",
                      title: "Verificar cobrança vencida",
                      desc: "Confirme que a cobrança tem mais de 10 dias de vencimento sem pagamento. Acesse Gerenciar Cobranças.",
                      color: "bg-red-100 text-red-700",
                      link: { href: "/gerenciar-cobrancas", label: "Cobranças em aberto" }
                    },
                    {
                      step: "2",
                      title: "Identificar próxima reserva no Airbnb",
                      desc: "Acesse o Calendário de Reservas no sistema ou diretamente no Airbnb. Encontre a próxima reserva com valor total que cubra o débito.",
                      color: "bg-orange-100 text-orange-700",
                      link: { href: "/calendario-reservas", label: "Calendário de Reservas" }
                    },
                    {
                      step: "3",
                      title: "Usar a Calculadora de Débito",
                      desc: "Na cobrança, use a calculadora para calcular o percentual de comissão a alterar no Airbnb para recuperar o valor.",
                      color: "bg-amber-100 text-amber-700",
                      link: null
                    },
                    {
                      step: "4",
                      title: "Registrar no sistema e acionar o Paulo Henrique",
                      desc: "Marque a cobrança como 'Aguardando Débito em Reserva' no sistema. Em 2025, o Paulo Henrique será responsável por alterar as comissões no Airbnb. Em 2026, você terá essa autonomia.",
                      color: "bg-blue-100 text-blue-700",
                      link: null
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${item.color}`}>
                        {item.step}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                        {item.link && (
                          <div className="mt-1">
                            <LinkAction href={item.link.href} label={item.link.label} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <TipBox icon={<ShieldAlert className="h-4 w-4 text-red-600" />} title="Impacto no score do proprietário" variant="danger">
                <p>Todo débito em reserva desconta <strong>-30 pontos</strong> no score do proprietário automaticamente. O sistema faz isso ao registrar o débito. Lembre sempre o proprietário disso antes de executar.</p>
              </TipBox>

              <div className="flex flex-wrap gap-2">
                <LinkAction href="/gerenciar-cobrancas" label="Gerenciar cobranças" />
                <LinkAction href="/calendario-reservas" label="Ver próximas reservas" />
              </div>
            </div>
          </Step>

        </div>

        {/* Prazos importantes */}
        <Separator className="my-6" />
        <Card className="mb-5 border-primary/20">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Prazos que você precisa conhecer
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {[
                { label: "Resposta do proprietário para decidir manutenção", value: "48-72h", color: "text-amber-600" },
                { label: "Prazo para pagamento de cobrança", value: "7 dias", color: "text-blue-600" },
                { label: "Tolerância após vencimento (impacta score)", value: "3 dias", color: "text-orange-600" },
                { label: "Débito em reserva (após vencimento)", value: "10 dias", color: "text-red-600" },
                { label: "Cobrança de hóspede no Airbnb (pós-checkout)", value: "14 dias", color: "text-purple-600" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center p-2 bg-muted/50 rounded gap-2">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${item.color} border-current`}>{item.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Links rápidos */}
        <Card className="mb-5">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Atalhos do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { href: "/painel", label: "📊 Painel Principal" },
                { href: "/admin/manutencoes", label: "🔧 Kanban Manutenções" },
                { href: "/admin/vistorias", label: "📋 Vistorias" },
                { href: "/gerenciar-cobrancas", label: "💰 Cobranças" },
                { href: "/nova-cobranca", label: "➕ Nova Cobrança" },
                { href: "/admin/chamados", label: "🎫 Chamados" },
                { href: "/calendario-reservas", label: "📅 Reservas" },
                { href: "/admin/profissionais", label: "👷 Profissionais" },
                { href: "/admin/relatorio-cobrancas", label: "📈 Relatórios" },
              ].map((link) => (
                <button
                  key={link.href}
                  onClick={() => navigate(link.href)}
                  className="p-2.5 text-xs font-medium rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Regra de ouro:</strong> Toda informação no sistema. Todo problema com responsável definido. Toda cobrança com prazo claro.
          </p>
        </div>
      </div>
    </div>
  );
}
