import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Vote, 
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  DollarSign,
  FileText,
  Bell,
  Calendar,
  ShoppingCart,
  AlertTriangle
} from "lucide-react";

export function TutorialVotacoes() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Propostas e Votações
          </CardTitle>
          <CardDescription>
            Como criar e gerenciar aprovações coletivas de proprietários
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* O que são Propostas */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              O que são Propostas?
            </h3>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Propostas são votações enviadas aos proprietários para decisões coletivas ou individuais. 
                Podem ser usadas para aprovações de compras, melhorias, mudanças de política, etc.
              </p>
            </div>
          </div>

          {/* Tipos de Proposta */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Tipos de Proposta
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">Individual</Badge>
                  </div>
                  <p className="text-sm font-medium">Para um único proprietário/imóvel</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ex: Compra de item específico para o imóvel, melhoria solicitada pelo dono.
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

          {/* Categorias */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-500" />
              Categorias de Proposta
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline">Compra</Badge>
                <p className="text-sm text-muted-foreground">Aquisição de itens para o imóvel</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline">Melhoria</Badge>
                <p className="text-sm text-muted-foreground">Upgrades e reformas</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline">Serviço</Badge>
                <p className="text-sm text-muted-foreground">Contratação de serviços adicionais</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline">Política</Badge>
                <p className="text-sm text-muted-foreground">Mudanças em regras e procedimentos</p>
              </div>
            </div>
          </div>

          {/* Fluxo de Pagamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Propostas com Pagamento
            </h3>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  Propostas podem incluir valor a ser pago pelo proprietário. O fluxo é:
                </p>
                
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
                  <li>Proprietário visualiza a proposta com valor</li>
                  <li>Se aprovar, sistema gera link de pagamento (Mercado Pago)</li>
                  <li>Pagamento é confirmado automaticamente</li>
                  <li>Proposta marcada como "Paga" após confirmação</li>
                </ol>

                <div className="pt-2 border-t border-green-200">
                  <p className="text-sm">
                    <span className="font-medium text-green-700">Tipos de pagamento:</span>
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
                    <li><span className="font-medium">Valor fixo:</span> Mesmo valor para todos</li>
                    <li><span className="font-medium">Por quantidade:</span> Proprietário escolhe quantidade de itens</li>
                    <li><span className="font-medium">Itens múltiplos:</span> Lista de itens com preços individuais</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Prazo e Notificações */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-500" />
              Prazo e Notificações
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Toda proposta tem um <span className="font-medium">prazo de resposta</span>. O sistema envia 
                notificações automáticas:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><Bell className="h-3 w-3 inline mr-1" />Email ao criar a proposta</li>
                <li><Bell className="h-3 w-3 inline mr-1" />Lembrete 24h antes do prazo</li>
                <li><Bell className="h-3 w-3 inline mr-1" />Push notification (se habilitado)</li>
              </ul>
              <p className="text-sm pt-2 border-t border-amber-200">
                <span className="font-medium text-amber-700">⚠️ Importante:</span> Após o prazo, a proposta 
                pode ser encerrada automaticamente ou manualmente pela equipe.
              </p>
            </div>
          </div>

          {/* Como Criar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Vote className="h-5 w-5 text-cyan-500" />
              Como Criar uma Proposta
            </h3>

            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</span>
                <div>
                  <p className="font-medium">Acesse "Nova Proposta"</p>
                  <p className="text-sm text-muted-foreground">Menu → Votações → Nova Proposta</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</span>
                <div>
                  <p className="font-medium">Defina o Público-Alvo</p>
                  <p className="text-sm text-muted-foreground">Todos os proprietários ou imóvel específico</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</span>
                <div>
                  <p className="font-medium">Preencha Título e Descrição</p>
                  <p className="text-sm text-muted-foreground">Seja claro sobre o que está sendo proposto</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</span>
                <div>
                  <p className="font-medium">Configure Opções de Resposta</p>
                  <p className="text-sm text-muted-foreground">Aprovar/Rejeitar ou opções customizadas</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</span>
                <div>
                  <p className="font-medium">Adicione Valor (Opcional)</p>
                  <p className="text-sm text-muted-foreground">Se houver custo, defina tipo de pagamento</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">6</span>
                <div>
                  <p className="font-medium">Defina Prazo e Envie</p>
                  <p className="text-sm text-muted-foreground">O sistema notifica os proprietários automaticamente</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Acompanhamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-indigo-500" />
              Acompanhamento de Respostas
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Na página de detalhes da proposta você pode ver:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Quantos aprovaram / rejeitaram</li>
                <li>Lista de quem respondeu e quem ainda não</li>
                <li>Status de pagamento (se aplicável)</li>
                <li>Observações enviadas pelos proprietários</li>
              </ul>
              <p className="text-sm pt-2 border-t border-indigo-200">
                <span className="font-medium text-indigo-700">💡 Dica:</span> Use o dashboard para ver 
                propostas pendentes de resposta e enviar lembretes.
              </p>
            </div>
          </div>

          {/* Compra em Grupo */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-500" />
              Compras em Grupo (Bulk Purchase)
            </h3>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  Para compras em grupo onde cada proprietário escolhe quantidade:
                </p>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
                  <li>Crie proposta com tipo "Por quantidade" ou "Itens múltiplos"</li>
                  <li>Defina preço unitário de cada item</li>
                  <li>Proprietários escolhem quantidades desejadas</li>
                  <li>Sistema calcula total individual automaticamente</li>
                  <li>Pagamento gerado com base na seleção</li>
                </ol>
                <p className="text-sm pt-2 border-t border-orange-200">
                  <span className="font-medium text-orange-700">Exemplo:</span> "Compra de jogo de cama premium - 
                  R$ 150/unidade". Cada dono escolhe quantas unidades quer para seu imóvel.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
