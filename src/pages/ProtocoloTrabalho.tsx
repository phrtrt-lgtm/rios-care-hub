import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft, 
  ClipboardCheck, 
  Wrench, 
  AlertTriangle, 
  CreditCard,
  CheckCircle2,
  ArrowRight,
  Users,
  Home,
  Calendar,
  Banknote,
  Timer,
  FileText,
  Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";

export default function ProtocoloTrabalho() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => goBack(navigate)}
          className="mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Protocolo de Manutenções</h1>
          <p className="text-sm text-muted-foreground">
            Como funciona o fluxo desde a identificação até o pagamento
          </p>
        </div>

        {/* FLUXO VISUAL RESUMIDO */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6 p-4 bg-muted/50 rounded-lg">
          <Badge className="bg-info">1. Vistoria</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Badge className="bg-warning">2. Análise</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Badge className="bg-primary">3. Decisão</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Badge className="bg-success">4. Execução</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Badge className="bg-warning">5. Pagamento</Badge>
        </div>

        {/* PLANEJAMENTO */}
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm mb-1">Mais que urgências: planejamento</h3>
                <p className="text-xs text-muted-foreground">
                  Manutenções podem ser planejadas para o momento ideal (ex: pintura em baixa temporada). 
                  Criamos o chamado, conversamos pelo sistema e alinhamos tudo de forma organizada.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ETAPAS EM GRID COMPACTO */}
        <div className="grid gap-4 mb-6">
          
          {/* ETAPA 1 */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-info" />
                <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-xs">1</Badge>
                Vistoria
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <p className="text-sm text-muted-foreground">
                Faxineira ou equipe identifica problemas durante a limpeza e registra via áudio, fotos ou texto. 
                A IA transcreve automaticamente os áudios.
              </p>
            </CardContent>
          </Card>

          {/* ETAPA 2 */}
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">2</Badge>
                Análise e Classificação
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-destructive/10 dark:bg-red-950/20 border border-destructive/30">
                  <div className="font-medium text-sm text-destructive mb-1">Essencial</div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Afeta hóspede ou segurança (chuveiro, ar, fechadura, vazamentos)
                  </p>
                  <Badge className="bg-destructive text-xs">Gestão executa</Badge>
                </div>
                <div className="p-3 rounded-lg bg-info/10 dark:bg-blue-950/20 border border-info/30">
                  <div className="font-medium text-sm text-info mb-1">Estrutural</div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Melhorias e desgaste (pintura, móveis, reparos estéticos)
                  </p>
                  <Badge variant="outline" className="border-info/30 text-info text-xs">Proprietário decide</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ETAPA 3 */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="h-4 w-4 text-primary" />
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">3</Badge>
                Decisão do Proprietário
                <Badge variant="outline" className="ml-auto text-xs">48-72h</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Para questões pontuais, o proprietário pode assumir a frente ou delegar à gestão.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <Wrench className="h-4 w-4 text-success" />
                    <span className="font-medium text-sm">Assumir</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Usa próprio profissional, sem cobrança da gestão</p>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-info" />
                    <span className="font-medium text-sm">Delegar</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Gestão intermedia, cobrança após execução</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-warning/10 dark:bg-amber-950/20 border border-warning/30">
                <Timer className="h-4 w-4 text-warning flex-shrink-0" />
                <span className="text-xs text-muted-foreground">
                  <strong>Sem resposta em 48-72h?</strong> Gestão assume automaticamente.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ETAPA 4 */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-success" />
                <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">4</Badge>
                Execução
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Agendamento</span>
                <ArrowRight className="h-4 w-4" />
                <span className="flex items-center gap-1"><Wrench className="h-4 w-4" /> Serviço</span>
                <ArrowRight className="h-4 w-4" />
                <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-success" /> Conclusão + Fotos</span>
              </div>
            </CardContent>
          </Card>

          {/* ETAPA 5 */}
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-warning" />
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">5</Badge>
                Cobrança e Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 space-y-4">
              {/* Timeline compacta */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full bg-success" />
                  <span className="font-medium">Dia 0:</span>
                  <span className="text-muted-foreground">Cobrança criada (7 dias para pagar)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full bg-warning" />
                  <span className="font-medium">Dias 5-6:</span>
                  <span className="text-muted-foreground">Lembretes enviados</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full bg-warning" />
                  <span className="font-medium">Dia 7:</span>
                  <span className="text-muted-foreground">Vencimento</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                  <span className="font-medium">Dias 8-10:</span>
                  <span className="text-muted-foreground">Tolerância (impacta score)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                  <span className="font-medium">Após 10 dias:</span>
                  <span className="text-muted-foreground">Débito automático em reserva</span>
                </div>
              </div>

              <Separator />

              {/* Formas de Pagamento */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-card text-center">
                  <div className="font-medium text-sm mb-1">PIX</div>
                  <Badge variant="outline" className="text-xs">Sem juros</Badge>
                </div>
                <div className="p-3 rounded-lg border bg-card text-center">
                  <div className="font-medium text-sm mb-1">Cartão até 12x</div>
                  <Badge variant="outline" className="text-xs border-warning/30 text-warning">Juros do proprietário</Badge>
                </div>
                <div className="p-3 rounded-lg border bg-card text-center">
                  <div className="font-medium text-sm mb-1">Débito em Reserva</div>
                  <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">Impacta score</Badge>
                </div>
              </div>

              {/* Aporte */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Banknote className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong>Aporte da Gestão:</strong> Em muitos casos, contribuímos financeiramente para reduzir o valor final.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RESUMO PRAZOS */}
        <Card className="mb-4 border-primary/20">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Resumo dos Prazos
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Decisão do proprietário</span>
                <Badge variant="outline" className="text-xs">48-72h</Badge>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Pagamento da cobrança</span>
                <Badge variant="outline" className="text-xs">7 dias</Badge>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Tolerância após vencimento</span>
                <Badge variant="outline" className="text-xs">3 dias</Badge>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Débito em reserva</span>
                <Badge variant="outline" className="text-xs">Após 10 dias</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HISTÓRICO */}
        <Card className="mb-4 border-dashed border-muted-foreground/30 bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm mb-1">Tudo fica registrado</h3>
                <p className="text-xs text-muted-foreground">
                  Todo o trâmite fica documentado e arquivado: conversas, decisões, fotos, valores e comprovantes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Importante:</strong> Toda comunicação deve ocorrer dentro do portal para registro e transparência.
          </p>
        </div>
      </div>
    </div>
  );
}
