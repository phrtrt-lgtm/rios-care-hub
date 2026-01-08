import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft, 
  ClipboardCheck, 
  Wrench, 
  AlertTriangle, 
  Clock, 
  CreditCard,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowDown,
  Users,
  Home,
  Calendar,
  Bell,
  Banknote,
  Timer,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProtocoloTrabalho() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Protocolo de Trabalho</h1>
          <p className="text-muted-foreground">
            Fluxo completo desde a vistoria até o pagamento - Guia para equipe e proprietários
          </p>
        </div>

        {/* Seção explicativa - Planejamento */}
        <Card className="mb-6 border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Mais que urgências: um espaço de planejamento</h3>
                <p className="text-sm text-muted-foreground">
                  Uma manutenção não precisa ser executada imediatamente. Muitas vezes identificamos uma necessidade, como 
                  <strong>pintura, troca de móveis ou decoração</strong>, mas o momento não é ideal (ex: alta temporada).
                </p>
                <p className="text-sm text-muted-foreground">
                  Nesse caso, criamos o chamado e <strong>planejamos juntos</strong>: conversamos pelo sistema, escolhemos 
                  profissionais, definimos datas (ex: maio/junho) e alinhamos expectativas. Tudo documentado e organizado.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline" className="text-xs">Planejamento de reformas</Badge>
                  <Badge variant="outline" className="text-xs">Decoração</Badge>
                  <Badge variant="outline" className="text-xs">Prestação de contas</Badge>
                  <Badge variant="outline" className="text-xs">Orçamentos</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ETAPA 1: VISTORIA */}
        <Card className="mb-6 border-l-4 border-l-blue-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                    Etapa 1
                  </Badge>
                  Vistoria
                </CardTitle>
                <CardDescription>Identificação de problemas após limpeza</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Faxineira / Equipe de Campo
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Realiza a limpeza do imóvel
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Identifica problemas durante a vistoria
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Registra via áudio, fotos ou texto no sistema
                  </li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  O que é registrado
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Descrição do problema
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Fotos e vídeos do local
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Categoria (elétrica, hidráulica, estrutural, etc.)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Transcrição automática de áudios via IA
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center my-4">
          <ArrowDown className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* ETAPA 2: ANÁLISE E CLASSIFICAÇÃO */}
        <Card className="mb-6 border-l-4 border-l-amber-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
                    Etapa 2
                  </Badge>
                  Análise e Classificação
                </CardTitle>
                <CardDescription>Equipe administrativa classifica o problema</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/20 space-y-3">
                <h4 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Manutenção ESSENCIAL
                </h4>
                <p className="text-sm text-muted-foreground">
                  Afeta diretamente a experiência do hóspede ou segurança do imóvel.
                </p>
                <ul className="text-sm space-y-1">
                  <li>• Chuveiro/água quente quebrado</li>
                  <li>• Ar-condicionado não funciona</li>
                  <li>• Fechadura com problema</li>
                  <li>• Vazamentos ativos</li>
                  <li>• Problemas elétricos graves</li>
                </ul>
                <div className="pt-2 border-t">
                  <Badge className="bg-red-600">Gestão executa imediatamente</Badge>
                </div>
              </div>
              <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 space-y-3">
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Manutenção ESTRUTURAL
                </h4>
                <p className="text-sm text-muted-foreground">
                  Melhorias, desgaste natural ou itens não urgentes.
                </p>
                <ul className="text-sm space-y-1">
                  <li>• Pintura desgastada</li>
                  <li>• Móveis com defeito</li>
                  <li>• Pequenos reparos estéticos</li>
                  <li>• Substituição de itens antigos</li>
                  <li>• Melhorias opcionais</li>
                </ul>
                <div className="pt-2 border-t">
                  <Badge variant="outline" className="border-blue-400 text-blue-600">Proprietário decide</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center my-4">
          <ArrowDown className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* ETAPA 3: DECISÃO DO PROPRIETÁRIO */}
        <Card className="mb-6 border-l-4 border-l-purple-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Home className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">
                    Etapa 3
                  </Badge>
                  Decisão do Proprietário
                </CardTitle>
                <CardDescription>Para itens selecionados pela gestão - prazo de 48-72h</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 mb-4">
              <p className="text-sm text-muted-foreground">
                Para algumas <strong>questões pontuais</strong>, a gestão pode oferecer ao proprietário a possibilidade de assumir a frente, 
                caso tenha interesse em acompanhar de perto ou prefira usar seu próprio profissional.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-purple-500" />
                <span className="font-medium">Notificação enviada ao proprietário</span>
              </div>
              <p className="text-sm text-muted-foreground">
                E-mail + notificação push com detalhes do problema, fotos e opções de decisão.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-card space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Wrench className="h-4 w-4 text-green-600" />
                  </div>
                  <h4 className="font-medium">Assumir execução</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  O proprietário contrata seu próprio profissional e resolve diretamente.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Proprietário coordena o serviço</li>
                  <li>• Deve informar quando concluído</li>
                  <li>• Sem cobrança pela gestão</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border bg-card space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <h4 className="font-medium">Delegar à gestão</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  A gestão contrata profissionais parceiros e <strong>intermedia</strong> a execução do serviço.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Gestão coordena e acompanha</li>
                  <li>• <strong>Responsabilidade do serviço:</strong> profissional contratado</li>
                  <li>• Cobrança gerada após execução</li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-700 dark:text-blue-400">Importante sobre delegação</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Quando você delega à gestão, nós contratamos profissionais de confiança e intermediamos todo o processo. 
                Porém, a <strong>responsabilidade técnica pelo serviço é do profissional que o executa</strong>, não da gestão.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-700 dark:text-amber-400">Sem resposta em 48-72h?</span>
              </div>
              <p className="text-sm text-muted-foreground">
                A gestão assume automaticamente a execução para não prejudicar o calendário de reservas.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center my-4">
          <ArrowDown className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* ETAPA 4: EXECUÇÃO */}
        <Card className="mb-6 border-l-4 border-l-green-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                    Etapa 4
                  </Badge>
                  Execução da Manutenção
                </CardTitle>
                <CardDescription>Profissional realiza o serviço</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <h4 className="font-medium text-sm">Agendamento</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Equipe agenda com profissional disponível
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <Wrench className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <h4 className="font-medium text-sm">Execução</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Serviço realizado no imóvel
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <h4 className="font-medium text-sm">Conclusão</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Fotos do serviço + cobrança gerada
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center my-4">
          <ArrowDown className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* ETAPA 5: COBRANÇA */}
        <Card className="mb-6 border-l-4 border-l-orange-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                    Etapa 5
                  </Badge>
                  Cobrança e Pagamento
                </CardTitle>
                <CardDescription>Fluxo de cobrança ao proprietário</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timeline Visual */}
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500 via-amber-500 to-red-500" />
              
              <div className="space-y-6">
                {/* Dia 0 */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-green-500 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-green-700 dark:text-green-400">Dia 0 - Cobrança Criada</span>
                      <Badge className="bg-green-600">7 dias para pagar</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Proprietário recebe e-mail e notificação com detalhes da cobrança, fotos do serviço e opções de pagamento.
                    </p>
                  </div>
                </div>

                {/* Dia 5 */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-amber-400 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">Dia 5 - Lembrete 48h</span>
                      <Badge variant="outline" className="border-amber-400 text-amber-600">Lembrete</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Notificação de lembrete: "Sua cobrança vence em 2 dias".
                    </p>
                  </div>
                </div>

                {/* Dia 6 */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-amber-500 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">Dia 6 - Lembrete 24h</span>
                      <Badge variant="outline" className="border-amber-400 text-amber-600">Lembrete</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Notificação de lembrete: "Sua cobrança vence amanhã".
                    </p>
                  </div>
                </div>

                {/* Dia 7 */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-orange-500 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-orange-700 dark:text-orange-400">Dia 7 - Vencimento</span>
                      <Badge className="bg-orange-500">Prazo final</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Último dia para pagamento sem penalidades. Notificação no dia do vencimento.
                    </p>
                  </div>
                </div>

                {/* Dia 8-10 */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-red-400 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-red-700 dark:text-red-400">Dias 8-10 - Tolerância</span>
                      <Badge variant="outline" className="border-red-400 text-red-600">3 dias</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Período de tolerância de 3 dias. Status muda para "Vencido". Score de pagamento começa a ser impactado.
                    </p>
                  </div>
                </div>

                {/* Dia 11+ */}
                <div className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-red-600 border-4 border-background" />
                  <div className="flex-1 p-4 rounded-lg bg-red-100 dark:bg-red-950/30 border-2 border-red-300">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-red-700 dark:text-red-400">Após 10 dias - Débito em Reserva</span>
                      <Badge className="bg-red-600">Automático</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Equipe define a data de débito no próximo check-in. Proprietário recebe notificação com a data exata do desconto.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Formas de Pagamento */}
            <div>
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Formas de Pagamento
              </h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="font-medium mb-2">PIX / Transferência</div>
                  <p className="text-sm text-muted-foreground">
                    Pagamento à vista sem taxas adicionais.
                  </p>
                  <Badge variant="outline" className="mt-2">Sem juros</Badge>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="font-medium mb-2">MercadoPago</div>
                  <p className="text-sm text-muted-foreground">
                    Cartão de crédito com parcelamento em <strong>até 12x</strong>.
                  </p>
                  <Badge variant="outline" className="mt-2 border-amber-400 text-amber-600">
                    Juros por conta do proprietário
                  </Badge>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="font-medium mb-2">Débito em Reserva</div>
                  <p className="text-sm text-muted-foreground">
                    Desconto automático no próximo repasse.
                  </p>
                  <Badge variant="outline" className="mt-2 border-red-400 text-red-600">
                    Impacta score
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Aporte da Gestão */}
            <div className="p-4 rounded-lg bg-primary/5 border-2 border-primary/20">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Banknote className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Aporte da Gestão</h4>
                  <p className="text-sm text-muted-foreground">
                    Em muitos casos, a gestão contribui com um <strong>aporte financeiro</strong> para ajudar no custo da manutenção.
                    Esse desconto aparece diretamente na cobrança, reduzindo o valor final para o proprietário.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RESUMO FINAL */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Resumo dos Prazos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Etapa</th>
                    <th className="text-left py-3 px-4 font-medium">Prazo</th>
                    <th className="text-left py-3 px-4 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4">Decisão do proprietário</td>
                    <td className="py-3 px-4">48-72h</td>
                    <td className="py-3 px-4">Assumir ou delegar</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">Pagamento da cobrança</td>
                    <td className="py-3 px-4">7 dias</td>
                    <td className="py-3 px-4">Pagar via PIX/MercadoPago</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">Tolerância após vencimento</td>
                    <td className="py-3 px-4">3 dias</td>
                    <td className="py-3 px-4">Regularizar pagamento</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Débito em reserva</td>
                    <td className="py-3 px-4">Após 10 dias</td>
                    <td className="py-3 px-4">Desconto automático no repasse</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* HISTÓRICO E ARQUIVO */}
        <Card className="mt-6 border-2 border-dashed border-muted-foreground/30 bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Tudo fica registrado e arquivado</h3>
                <p className="text-sm text-muted-foreground">
                  Todo o trâmite de manutenção, desde a vistoria inicial até a conclusão e pagamento, fica 
                  <strong>documentado e arquivado no histórico</strong>. Proprietários e equipe podem consultar 
                  a qualquer momento: conversas, decisões, fotos, valores, comprovantes e datas.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline" className="text-xs">Histórico de conversas</Badge>
                  <Badge variant="outline" className="text-xs">Fotos e anexos</Badge>
                  <Badge variant="outline" className="text-xs">Valores e pagamentos</Badge>
                  <Badge variant="outline" className="text-xs">Decisões registradas</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Importante:</strong> Toda comunicação deve ocorrer dentro do portal para registro e transparência. 
            Em caso de dúvidas, utilize o chat de cada chamado ou responda aos e-mails de notificação.
          </p>
        </div>
      </div>
    </div>
  );
}
