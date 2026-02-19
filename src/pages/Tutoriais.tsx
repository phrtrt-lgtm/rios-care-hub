import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Wrench, 
  DollarSign, 
  ClipboardCheck, 
  Vote, 
  ChevronRight,
  Users,
  Home,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MessageSquare,
  LayoutList,
  ArrowLeft
} from "lucide-react";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { 
  TutorialCobrancas, 
  TutorialVistorias, 
  TutorialVotacoes,
  TutorialCobrancasProprietario,
  TutorialTicketsChat,
  TutorialTicketsChatProprietario,
  TutorialQuadroManutencoes,
  TutorialVistoriasProprietario,
  TutorialAlertasVotacoesProprietario
} from "@/components/tutorials";

// Tutorial sobre Manutenção
function TutorialManutencao() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Como Funciona o Sistema de Manutenção
          </CardTitle>
          <CardDescription>
            Guia completo sobre criação, tipos e consequências das manutenções
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Classificação */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Tipos de Manutenção
            </h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-red-700">
                    🚨 Essencial
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Atendimento IMEDIATO</p>
                  <p>Itens que inviabilizam a estadia do hóspede:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Geladeira, fogão, micro-ondas</li>
                    <li>Água quente, energia elétrica</li>
                    <li>Fechadura/portas quebradas</li>
                    <li>Piscina inutilizável</li>
                    <li>Infiltração grave</li>
                    <li>Substituição de itens essenciais</li>
                  </ul>
                  <div className="pt-2 border-t mt-2">
                    <p className="font-medium text-red-700">⚡ Consequência:</p>
                    <p className="text-muted-foreground">Pode ser executada IMEDIATAMENTE pela gestão, especialmente com check-in no mesmo dia.</p>
                  </div>
                  <div className="pt-2 border-t mt-2 bg-green-50 -mx-4 px-4 py-2 rounded-b">
                    <p className="font-medium text-green-700">🎁 Por conta da gestão:</p>
                    <p className="text-muted-foreground">Substituições básicas como <span className="font-medium">copos e lâmpadas comuns</span> são assumidas pela gestão, sem custo ao proprietário.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                    🔧 Estrutural
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Pode aguardar entre estadias</p>
                  <p>Itens que não impedem a estadia:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Piso, reformas, pintura</li>
                    <li>Mobília danificada</li>
                    <li>Melhorias estéticas</li>
                    <li>Reparos não urgentes</li>
                  </ul>
                  <div className="pt-2 border-t mt-2">
                    <p className="font-medium text-blue-700">📋 Consequência:</p>
                    <p className="text-muted-foreground">Abrimos chamado para o proprietário decidir: assumir execução ou delegar à gestão.</p>
                  </div>
                  <div className="pt-2 border-t mt-2 bg-amber-50 -mx-4 px-4 py-2 rounded-b">
                    <p className="font-medium text-amber-700">⚠️ Pode virar Essencial:</p>
                    <p className="text-muted-foreground">Se o proprietário <span className="font-medium">demorar a responder</span> ou houver <span className="font-medium">hóspede chegando</span> com risco de prejuízo (avaliação negativa, cancelamento), a gestão pode executar sem aprovação para proteger a renda do imóvel.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Visibilidade */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-500" />
              Visibilidade e Responsabilidade de Custo
            </h3>

            <div className="space-y-3">
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                      <Home className="h-3 w-3 mr-1" />
                      Proprietário
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium">Custo do Proprietário</p>
                      <p className="text-sm text-muted-foreground">
                        Visível para: <span className="font-medium">Gestão + Proprietário</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        O proprietário vê o chamado, pode acompanhar e será cobrado após execução.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                      <Users className="h-3 w-3 mr-1" />
                      Hóspede
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium">Custo do Hóspede</p>
                      <p className="text-sm text-muted-foreground">
                        Visível para: <span className="font-medium">Apenas Gestão</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        <EyeOff className="h-3 w-3 inline mr-1" />
                        Proprietário NÃO vê este chamado. Usado para danos causados por hóspedes.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                      <Wrench className="h-3 w-3 mr-1" />
                      Gestão
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium">Custo da Gestão</p>
                      <p className="text-sm text-muted-foreground">
                        Visível para: <span className="font-medium">Apenas Gestão</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Manutenções internas assumidas pela gestão sem repasse ao proprietário.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Fluxo de Decisão do Proprietário */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Decisão do Proprietário (Manutenção Estrutural)
            </h3>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">Quando uma manutenção estrutural é aberta, o proprietário tem duas opções:</p>
              
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Assumir Execução</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      O proprietário informa prazo e fornecedor próprio. Gestão apenas acompanha.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Delegar à Gestão</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      A gestão executa e depois cobra via sistema de cobranças (contestação 7 dias, pagamento/offset).
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Criar Manutenção a partir de Vistoria */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-500" />
              Criar Manutenção a partir de Vistoria
            </h3>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                <span className="font-medium text-emerald-700">💡 Dica:</span> Quando uma vistoria identifica problemas, 
                você pode criar manutenções diretamente a partir dela, com informações pré-preenchidas.
              </p>
              
              <div className="space-y-2 text-sm">
                <p className="font-medium">Fluxo Vistoria → Manutenção:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Acesse a vistoria com problemas (status "NÃO")</li>
                  <li>Clique em <span className="font-medium">"Nova Manutenção"</span></li>
                  <li>Os dados são pré-preenchidos automaticamente:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Imóvel e proprietário já vinculados</li>
                      <li>Descrição baseada no resumo da IA</li>
                      <li>Opção de selecionar anexos da vistoria</li>
                    </ul>
                  </li>
                  <li>Defina prioridade e responsabilidade de custo</li>
                  <li>Confirme a criação</li>
                </ol>
              </div>

              <div className="pt-2 border-t border-emerald-200">
                <p className="text-sm font-medium text-emerald-700">Kanban de Itens da Vistoria:</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Na página do imóvel, use o <span className="font-medium">Kanban de itens</span> para organizar 
                  problemas detectados. Você pode arrastar itens entre colunas (Pendente, Gestão, Proprietário, Hóspede, Concluído) 
                  e criar manutenções em lote selecionando múltiplos itens.
                </p>
              </div>
            </div>
          </div>

          {/* Passo a passo para criar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-cyan-500" />
              Como Criar uma Manutenção (Manual)
            </h3>

            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</span>
                <div>
                  <p className="font-medium">Acesse "Nova Manutenção"</p>
                  <p className="text-sm text-muted-foreground">Menu → Manutenções → Nova Manutenção</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</span>
                <div>
                  <p className="font-medium">Selecione o Imóvel</p>
                  <p className="text-sm text-muted-foreground">O proprietário será automaticamente vinculado</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</span>
                <div>
                  <p className="font-medium">Marque se é "Essencial"</p>
                  <p className="text-sm text-muted-foreground">Ativa execução imediata sem aguardar decisão do proprietário</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</span>
                <div>
                  <p className="font-medium">Defina a Responsabilidade de Custo</p>
                  <p className="text-sm text-muted-foreground">Proprietário (visível) ou Hóspede/Gestão (oculto do proprietário)</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</span>
                <div>
                  <p className="font-medium">Descreva o Problema</p>
                  <p className="text-sm text-muted-foreground">Use IA para gerar descrição profissional ou digite manualmente</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">6</span>
                <div>
                  <p className="font-medium">Anexe Fotos/Vídeos</p>
                  <p className="text-sm text-muted-foreground">Documente o problema com evidências visuais</p>
                </div>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Tutorial de Manutenção para Proprietários
function TutorialManutencaoProprietario() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Como Funciona a Manutenção do Seu Imóvel
          </CardTitle>
          <CardDescription>
            Entenda os tipos de manutenção, quando você será consultado e como acompanhar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Classificação */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Tipos de Manutenção
            </h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-red-700">
                    🚨 Essencial (Urgente)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Atendimento IMEDIATO</p>
                  <p>Problemas que impedem o hóspede de usar o imóvel normalmente:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Geladeira, fogão, micro-ondas</li>
                    <li>Água quente, energia elétrica</li>
                    <li>Fechadura/portas quebradas</li>
                    <li>Piscina inutilizável</li>
                    <li>Infiltração grave</li>
                    <li>Substituição de itens essenciais</li>
                  </ul>
                  <div className="pt-2 border-t mt-2">
                    <p className="font-medium text-red-700">⚡ O que acontece:</p>
                    <p className="text-muted-foreground">A gestão resolve <span className="font-medium">imediatamente</span> para evitar avaliações negativas e cancelamentos. Você é notificado, mas não precisa aprovar antes.</p>
                  </div>
                  <div className="pt-2 border-t mt-2 bg-green-50 -mx-4 px-4 py-2 rounded-b">
                    <p className="font-medium text-green-700">🎁 Sem custo para você:</p>
                    <p className="text-muted-foreground">Substituições básicas como <span className="font-medium">copos e lâmpadas comuns</span> são assumidas pela gestão.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                    🔧 Estrutural (Pode Aguardar)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Você decide quando e como fazer</p>
                  <p>Problemas que não impedem a estadia:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Piso, reformas, pintura</li>
                    <li>Mobília danificada</li>
                    <li>Melhorias estéticas</li>
                    <li>Reparos não urgentes</li>
                  </ul>
                  <div className="pt-2 border-t mt-2">
                    <p className="font-medium text-blue-700">📋 O que acontece:</p>
                    <p className="text-muted-foreground">Abrimos um chamado e você escolhe: fazer você mesmo ou delegar para a gestão.</p>
                  </div>
                  <div className="pt-2 border-t mt-2 bg-amber-50 -mx-4 px-4 py-2 rounded-b">
                    <p className="font-medium text-amber-700">⚠️ Atenção:</p>
                    <p className="text-muted-foreground">Se você <span className="font-medium">demorar a responder</span> ou houver <span className="font-medium">hóspede chegando</span>, a gestão pode executar para evitar prejuízos ao seu imóvel.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Suas opções de decisão */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Suas Opções (Manutenção Estrutural)
            </h3>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">Quando identificamos um problema estrutural, você receberá uma notificação para decidir:</p>
              
              <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Eu Resolvo</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Você contrata seu próprio profissional e nos informa o prazo. 
                      <span className="font-medium"> Sem custo de gestão.</span>
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Delegar à Gestão</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Resolvemos para você e depois enviamos a cobrança. 
                      <span className="font-medium"> Prazo de 7 dias para contestar.</span>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Fluxo de cobrança */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Como Funciona a Cobrança
            </h3>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">1</span>
                  <div>
                    <p className="font-medium">Manutenção Executada</p>
                    <p className="text-sm text-muted-foreground">A gestão resolve o problema e documenta com fotos/vídeos</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="font-medium">Cobrança Enviada</p>
                    <p className="text-sm text-muted-foreground">Você recebe detalhes do serviço, valor e comprovantes</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="font-medium">7 Dias para Contestar</p>
                    <p className="text-sm text-muted-foreground">Se discordar, pode contestar pelo chat da cobrança</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">4</span>
                  <div>
                    <p className="font-medium">Pagamento</p>
                    <p className="text-sm text-muted-foreground">Pague via PIX, cartão (até 12x), ou desconte dos repasses</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          {/* Acompanhamento */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-500" />
              Acompanhe pelo Painel
            </h3>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">No seu painel principal você pode ver:</p>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5" />
                  <div>
                    <span className="font-medium">Progresso da Manutenção</span>
                    <p className="text-muted-foreground">Barra visual mostrando: Pendente → Agendado → Em Execução → Concluído</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5" />
                  <div>
                    <span className="font-medium">Data Agendada</span>
                    <p className="text-muted-foreground">Quando o profissional vai ao imóvel</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600 mt-0.5" />
                  <div>
                    <span className="font-medium">Chat com a Gestão</span>
                    <p className="text-muted-foreground">Tire dúvidas e acompanhe em tempo real</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Por que agimos rápido */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-cyan-500" />
              Por Que Agimos Rápido?
            </h3>

            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  <span className="font-medium">Avaliações negativas derrubam a renda do seu imóvel.</span> 
                  Por isso, em situações urgentes, agimos para proteger:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Sua reputação nas plataformas (Airbnb, Booking, etc.)</li>
                  <li>Taxa de ocupação do imóvel</li>
                  <li>Valor do preço por diária</li>
                  <li>Evitar cancelamentos e reembolsos</li>
                </ul>
                <p className="text-sm pt-2 border-t border-amber-200">
                  <span className="font-medium text-amber-700">💡 Lembre-se:</span> Um hóspede insatisfeito pode custar muito mais do que o reparo em si.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Lista de tutoriais disponíveis
const tutoriaisFuncionarios = [
  {
    id: "manutencao",
    title: "Sistema de Manutenção",
    description: "Tipos, visibilidade e como criar chamados",
    icon: Wrench,
    component: TutorialManutencao,
    available: true,
  },
  {
    id: "cobrancas",
    title: "Sistema de Cobranças",
    description: "Fluxo completo de cobrança, contestação e pagamento",
    icon: DollarSign,
    component: TutorialCobrancas,
    available: true,
  },
  {
    id: "vistorias",
    title: "Vistorias e Inspeções",
    description: "Como registrar, anexar e gerenciar vistorias",
    icon: ClipboardCheck,
    component: TutorialVistorias,
    available: true,
  },
  {
    id: "votacoes",
    title: "Propostas e Votações",
    description: "Como criar e gerenciar aprovações coletivas",
    icon: Vote,
    component: TutorialVotacoes,
    available: true,
  },
  {
    id: "tickets-chat",
    title: "Tickets e Chat",
    description: "Sistema de chamados, mensagens e notificações",
    icon: MessageSquare,
    component: TutorialTicketsChat,
    available: true,
  },
  {
    id: "quadro-manutencoes",
    title: "Quadro de Manutenções",
    description: "Lista central com edição inline, vistorias e cobranças",
    icon: LayoutList,
    component: TutorialQuadroManutencoes,
    available: true,
  },
];

const tutoriaisProprietarios = [
  {
    id: "manutencao-prop",
    title: "Entendendo Manutenções",
    description: "Como acompanhar e decidir sobre manutenções",
    icon: Wrench,
    component: TutorialManutencaoProprietario,
    available: true,
  },
  {
    id: "cobrancas-prop",
    title: "Suas Cobranças",
    description: "Como visualizar, contestar e pagar cobranças",
    icon: DollarSign,
    component: TutorialCobrancasProprietario,
    available: true,
  },
  {
    id: "tickets-chat-prop",
    title: "Chamados e Chat",
    description: "Como abrir chamados e se comunicar com a equipe",
    icon: MessageSquare,
    component: TutorialTicketsChatProprietario,
    available: true,
  },
  {
    id: "vistorias-prop",
    title: "Vistorias do Imóvel",
    description: "Vistorias de limpeza e rotina: como protegem seu imóvel",
    icon: ClipboardCheck,
    component: TutorialVistoriasProprietario,
    available: true,
  },
  {
    id: "alertas-votacoes-prop",
    title: "Alertas, Propostas e Votações",
    description: "Comunicados, aprovações coletivas e compras em grupo",
    icon: Vote,
    component: TutorialAlertasVotacoesProprietario,
    available: true,
  },
];

export default function Tutoriais() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedTutorial, setSelectedTutorial] = useState<string | null>(null);
  const scrollPositionRef = useRef(0);
  
  const isTeamMember = profile?.role === 'admin' || profile?.role === 'maintenance' || profile?.role === 'agent';

  const handleSelectTutorial = useCallback((id: string) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedTutorial(id);
    window.scrollTo(0, 0);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTutorial(null);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });
  }, []);

  const currentTutorial = [...tutoriaisFuncionarios, ...tutoriaisProprietarios].find(t => t.id === selectedTutorial);
  const TutorialComponent = currentTutorial?.component;

  if (selectedTutorial && TutorialComponent) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <MobileHeader />
        <main className="container mx-auto px-4 py-6">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos Tutoriais
          </Button>
          <TutorialComponent />
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <MobileHeader />
      <main className="container mx-auto px-4 py-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Central de Tutoriais</h1>
          <p className="text-muted-foreground">Aprenda como usar cada funcionalidade do sistema</p>
        </div>

        <Tabs defaultValue={isTeamMember ? "funcionarios" : "proprietarios"}>
          <TabsList className="mb-6">
            {isTeamMember && (
              <TabsTrigger value="funcionarios">
                <Users className="h-4 w-4 mr-2" />
                Para Funcionários
              </TabsTrigger>
            )}
            <TabsTrigger value="proprietarios">
              <Home className="h-4 w-4 mr-2" />
              Para Proprietários
            </TabsTrigger>
          </TabsList>

          {isTeamMember && (
            <TabsContent value="funcionarios">
              <div className="grid gap-4 md:grid-cols-2">
                {tutoriaisFuncionarios.map((tutorial) => (
                  <Card 
                    key={tutorial.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${!tutorial.available && 'opacity-60'}`}
                    onClick={() => tutorial.available && handleSelectTutorial(tutorial.id)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <tutorial.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{tutorial.title}</CardTitle>
                            <CardDescription>{tutorial.description}</CardDescription>
                          </div>
                        </div>
                        {tutorial.available ? (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Badge variant="secondary">Em breve</Badge>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          <TabsContent value="proprietarios">
            <div className="grid gap-4 md:grid-cols-2">
              {tutoriaisProprietarios.map((tutorial) => (
                <Card 
                  key={tutorial.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${!tutorial.available && 'opacity-60'}`}
                  onClick={() => tutorial.available && handleSelectTutorial(tutorial.id)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <tutorial.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{tutorial.title}</CardTitle>
                          <CardDescription>{tutorial.description}</CardDescription>
                        </div>
                      </div>
                      {tutorial.available ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Badge variant="secondary">Em breve</Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <MobileBottomNav />
    </div>
  );
}
