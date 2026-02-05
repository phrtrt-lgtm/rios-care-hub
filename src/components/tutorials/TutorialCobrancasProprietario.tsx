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
  Calendar,
  QrCode,
  Link,
  HelpCircle
} from "lucide-react";

export function TutorialCobrancasProprietario() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Entendendo Suas Cobranças
          </CardTitle>
          <CardDescription>
            Como visualizar, pagar e contestar cobranças do seu imóvel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* O que são Cobranças */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              O que são Cobranças?
            </h3>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Cobranças são valores referentes a manutenções, compras ou serviços realizados no seu imóvel. 
                Quando a gestão executa um serviço por você, o valor é registrado e enviado para pagamento.
              </p>
            </div>
          </div>

          {/* Fluxo de Status */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Status da Cobrança
            </h3>

            <div className="space-y-3">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">Enviada</Badge>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Você recebeu a cobrança. Tem <span className="font-medium">7 dias</span> para pagar ou contestar.
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
                        Você abriu uma contestação. A gestão vai analisar e responder.
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
                        Pagamento confirmado. Obrigado!
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
                        O valor foi descontado das suas reservas futuras.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                  <span className="font-medium text-amber-700">⏰ Regra dos 7 dias:</span> Você tem 7 dias a partir 
                  do vencimento para efetuar o pagamento.
                </p>
                <div className="space-y-2 text-sm">
                  <p><CheckCircle2 className="h-4 w-4 inline mr-1 text-green-500" /><span className="font-medium">Se pagar antes:</span> Você ganha pontos na sua pontuação</p>
                  <p><XCircle className="h-4 w-4 inline mr-1 text-red-500" /><span className="font-medium">Se não pagar:</span> O valor será descontado das suas reservas</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Formas de Pagamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              Formas de Pagamento
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="h-5 w-5 text-green-600" />
                    <span className="font-medium">PIX</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Escaneie o QR Code ou copie o código PIX para pagar instantaneamente.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Link className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">Link de Pagamento</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use o link para pagar com cartão de crédito ou débito via Mercado Pago.
                  </p>
                </CardContent>
              </Card>
            </div>

            <p className="text-sm text-muted-foreground">
              <span className="font-medium">💡 Dica:</span> Você pode pagar múltiplas cobranças de uma vez 
              selecionando-as na tela de cobranças.
            </p>
          </div>

          {/* Sistema de Pontuação */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-500" />
              Sua Pontuação de Pagamentos
            </h3>

            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Você tem uma pontuação que reflete seu histórico de pagamentos. Pagar em dia aumenta sua 
                pontuação e pode trazer benefícios futuros.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      <span className="font-medium text-green-700">Você Ganha Pontos</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>+5 pts: Pago até 2 dias antes do vencimento</li>
                      <li>+1 pt: Pago até o dia do vencimento</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-red-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="h-5 w-5 text-red-500" />
                      <span className="font-medium text-red-700">Você Perde Pontos</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>-15 pts: Pago com atraso</li>
                      <li>-30 pts: Valor debitado em reserva</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Como Contestar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              Como Contestar uma Cobrança
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Se você discorda de uma cobrança, pode contestar dentro do prazo de 7 dias:
              </p>
              
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
                <li>Acesse a cobrança em "Minhas Cobranças"</li>
                <li>Clique em "Contestar"</li>
                <li>Explique o motivo da contestação</li>
                <li>Anexe documentos se necessário</li>
                <li>Use o chat para conversar com a gestão</li>
              </ol>

              <div className="pt-2 border-t border-indigo-200">
                <p className="text-sm">
                  <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-500" />
                  <span className="font-medium">Importante:</span> Contestar não suspende o prazo de pagamento. 
                  Se a contestação for negada, você ainda deve pagar dentro do prazo original para evitar débito 
                  em reserva.
                </p>
              </div>
            </div>
          </div>

          {/* Aporte da Gestão */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-violet-500" />
              O que é "Aporte da Gestão"?
            </h3>

            <Card className="border-violet-200 bg-violet-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  Em alguns casos, a gestão contribui com parte do valor da manutenção. Quando isso acontece, 
                  você verá na cobrança:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li><span className="font-medium">Valor Total:</span> Custo completo do serviço</li>
                  <li><span className="font-medium">Aporte da Gestão:</span> Quanto a gestão está pagando</li>
                  <li><span className="font-medium">Valor a Pagar:</span> Sua parte (Total - Aporte)</li>
                </ul>
                <p className="text-sm pt-2 border-t border-violet-200">
                  <span className="font-medium text-violet-700">💡 Exemplo:</span> Manutenção de R$ 300, 
                  aporte da gestão de R$ 100, você paga R$ 200.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Onde Ver Cobranças */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-500" />
              Onde Ver Suas Cobranças
            </h3>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Você pode acessar suas cobranças de várias formas:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><span className="font-medium">Dashboard:</span> Veja cobranças pendentes no card "Minhas Cobranças"</li>
                <li><span className="font-medium">Menu:</span> Acesse "Minhas Cobranças" para histórico completo</li>
                <li><span className="font-medium">Notificações:</span> Receba alertas de novas cobranças e vencimentos</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
