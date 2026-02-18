import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Vote,
  AlertCircle,
  CheckCircle2,
  XCircle,
  DollarSign,
  Clock,
  FileText,
  ShoppingCart,
  Eye,
  MessageSquare
} from "lucide-react";

export function TutorialAlertasVotacoesProprietario() {
  return (
    <div className="space-y-6">
      {/* Alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas e Comunicados
          </CardTitle>
          <CardDescription>
            Como funcionam os alertas enviados pela gestão
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-500" />
              O que são Alertas?
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Alertas são comunicados importantes enviados pela gestão diretamente para você. 
                Podem conter informações sobre regras, avisos, novidades ou qualquer assunto relevante.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-500" />
              Tipos de Alerta
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Badge variant="outline" className="bg-blue-100 text-blue-700">ℹ️ Informativo</Badge>
                <p className="text-sm text-muted-foreground">Novidades, atualizações e informações gerais</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Badge variant="outline" className="bg-amber-100 text-amber-700">⚠️ Atenção</Badge>
                <p className="text-sm text-muted-foreground">Avisos importantes que requerem sua atenção</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <Badge variant="outline" className="bg-red-100 text-red-700">🚨 Urgente</Badge>
                <p className="text-sm text-muted-foreground">Comunicados críticos que precisam de ação imediata</p>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-indigo-700">Como você recebe alertas:</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Banner na tela principal do app</li>
              <li>Notificação push (se habilitada)</li>
              <li>Email (para alertas importantes)</li>
              <li>Podem incluir anexos (documentos, fotos)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Propostas e Votações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Propostas e Votações
          </CardTitle>
          <CardDescription>
            Como participar de decisões coletivas e individuais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              O que são Propostas?
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Propostas são consultas enviadas pela gestão para que você aprove ou rejeite algo. 
                Podem ser sobre compras, melhorias, mudanças de regras ou qualquer decisão que envolva proprietários.
              </p>
            </div>
          </div>

          {/* Tipos */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-500" />
              Tipos de Proposta
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">Individual</Badge>
                  </div>
                  <p className="text-sm font-medium">Só para você</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ex: Compra de item específico para o seu imóvel, melhoria solicitada por você.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-purple-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-purple-100 text-purple-700">Coletiva</Badge>
                  </div>
                  <p className="text-sm font-medium">Para todos os proprietários</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ex: Nova política, serviço adicional, compra em grupo com desconto.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Como responder */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Como Responder
            </h3>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">1</span>
                  <div>
                    <p className="font-medium">Acesse a Proposta</p>
                    <p className="text-sm text-muted-foreground">Pela notificação, email ou menu "Votações"</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="font-medium">Leia os Detalhes</p>
                    <p className="text-sm text-muted-foreground">Veja descrição, anexos e valores (se houver)</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="font-medium">Vote</p>
                    <p className="text-sm text-muted-foreground">
                      Escolha entre as opções disponíveis. Você pode adicionar uma observação.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">4</span>
                  <div>
                    <p className="font-medium">Pagamento (se aplicável)</p>
                    <p className="text-sm text-muted-foreground">
                      Se a proposta tiver custo e você aprovar, o sistema gera link de pagamento via PIX ou cartão.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          {/* Compras em grupo */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-500" />
              Compras em Grupo
            </h3>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  Em compras coletivas, você pode escolher a <span className="font-medium">quantidade</span> desejada. 
                  O valor total é calculado automaticamente.
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-orange-700">Exemplo:</span> "Jogo de cama premium - R$ 150/unidade". 
                  Você escolhe quantos quer para seu imóvel e paga apenas pelo que selecionou.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Prazos */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Prazos
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Toda proposta tem um <span className="font-medium">prazo de resposta</span>. Fique atento:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Você recebe lembrete <span className="font-medium">24h antes</span> do prazo</li>
                <li>Após o prazo, sua chance de participar pode acabar</li>
                <li>Propostas expiradas são encerradas pela equipe</li>
              </ul>
              <p className="text-sm pt-2 border-t border-amber-200">
                <span className="font-medium text-amber-700">💡 Dica:</span> Responda assim que receber a notificação para não perder o prazo!
              </p>
            </div>
          </div>

          {/* Onde encontrar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-500" />
              Onde Encontrar
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">Você pode acessar propostas pendentes de três formas:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><span className="font-medium">Card na tela principal</span> — mostra propostas pendentes</li>
                <li><span className="font-medium">Menu "Votações"</span> — lista completa de propostas</li>
                <li><span className="font-medium">Notificações</span> — clique para ir direto à proposta</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}