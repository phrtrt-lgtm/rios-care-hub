import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  MessageSquare,
  CreditCard,
  FileText,
  TrendingDown,
  TrendingUp,
  Calendar
} from "lucide-react";

export function TutorialCobrancas() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Sistema de Cobranças
          </CardTitle>
          <CardDescription>
            Guia completo sobre criação, gestão e fluxo de cobranças
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visão Geral */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Visão Geral do Sistema
            </h3>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                O sistema de cobranças gerencia todos os valores devidos pelos proprietários, desde manutenções 
                executadas até compras e serviços. Cada cobrança passa por um fluxo estruturado com prazos definidos.
              </p>
            </div>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-primary mb-1">Manutenção → Cobrança</p>
                    <p className="text-sm text-muted-foreground">
                      Quando uma manutenção é concluída, ela automaticamente se torna uma cobrança para o proprietário 
                      (exceto manutenções de responsabilidade do hóspede ou da gestão). O valor, categoria e anexos 
                      são transferidos da manutenção para a cobrança.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fluxo de Status */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Fluxo de Status da Cobrança
            </h3>

            <div className="space-y-3">
              <Card className="border-l-4 border-l-gray-400">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-gray-100">Rascunho</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Cobrança criada mas ainda não enviada ao proprietário. Pode ser editada livremente.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">Enviada</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Proprietário notificado. Tem <span className="font-medium">7 dias</span> para pagar ou contestar.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-orange-100 text-orange-700">Contestada</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Proprietário abriu contestação. A gestão deve analisar e responder via chat.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-green-100 text-green-700">Paga</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Pagamento confirmado (PIX, link ou comprovante manual).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-red-100 text-red-700">Debitada</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Valor descontado das reservas futuras do proprietário (offset).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sistema de Pontuação */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Sistema de Pontuação do Proprietário
            </h3>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Cada proprietário tem uma pontuação que reflete seu histórico de pagamentos. 
                A pontuação afeta a prioridade de atendimento e pode ser usada em decisões futuras.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <span className="font-medium text-green-700">Pontos Positivos</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>+5 pts: Pago até 2 dias antes</li>
                      <li>+1 pt: Pago até o vencimento</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-red-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="h-5 w-5 text-red-500" />
                      <span className="font-medium text-red-700">Pontos Negativos</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>-15 pts: Pago com atraso</li>
                      <li>-30 pts: Débito em reserva</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Prazo de Pagamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              Prazo de Pagamento
            </h3>

            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  <span className="font-medium text-amber-700">Regra dos 7 dias:</span> O proprietário tem 
                  exatamente 7 dias a partir do vencimento para efetuar o pagamento.
                </p>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Se pagar dentro do prazo:</span> Recebe pontos positivos</p>
                  <p><span className="font-medium">Se não pagar:</span> A gestão pode debitar em reservas futuras (-30 pts)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cobrança de Hóspedes */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Cobrança de Hóspedes (Airbnb)
            </h3>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  <span className="font-medium text-orange-700">⚠️ Regra do Airbnb:</span> Cobranças de hóspedes 
                  só podem ser realizadas <span className="font-medium">14 dias após o checkout</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  O sistema automaticamente rastreia a data de checkout e exibe lembretes quando a cobrança 
                  estiver disponível para ser enviada ao hóspede via plataforma.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Como Criar Cobrança */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-cyan-500" />
              Como Criar uma Cobrança
            </h3>

            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</span>
                <div>
                  <p className="font-medium">Acesse "Nova Cobrança"</p>
                  <p className="text-sm text-muted-foreground">Menu → Cobranças → Nova Cobrança</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</span>
                <div>
                  <p className="font-medium">Selecione Proprietário e Imóvel</p>
                  <p className="text-sm text-muted-foreground">Vincule a cobrança ao proprietário correto</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</span>
                <div>
                  <p className="font-medium">Defina Categoria e Valor</p>
                  <p className="text-sm text-muted-foreground">Manutenção, compra, serviço, etc.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</span>
                <div>
                  <p className="font-medium">Aporte da Gestão (Opcional)</p>
                  <p className="text-sm text-muted-foreground">Se a gestão contribuir com parte do valor, informe aqui</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</span>
                <div>
                  <p className="font-medium">Anexe Comprovantes</p>
                  <p className="text-sm text-muted-foreground">Notas fiscais, fotos do serviço, etc.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">6</span>
                <div>
                  <p className="font-medium">Envie ao Proprietário</p>
                  <p className="text-sm text-muted-foreground">O sistema gera PIX e link de pagamento automaticamente</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Gestão de Contestações */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              Gestão de Contestações
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Quando um proprietário contesta, use o <span className="font-medium">chat da cobrança</span> para:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Entender a razão da contestação</li>
                <li>Enviar documentação adicional</li>
                <li>Negociar ajustes se necessário</li>
                <li>Resolver e confirmar pagamento</li>
              </ul>
              <p className="text-sm pt-2 border-t border-indigo-200">
                <span className="font-medium text-indigo-700">💡 Dica:</span> Mantenha comunicação profissional 
                e documente tudo no chat para histórico.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
