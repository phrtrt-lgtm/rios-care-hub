import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Ticket, Clock, Bell, Users, CheckCheck, Mic, Sparkles, Building2 } from "lucide-react";

export function TutorialTicketsChat() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-500" />
            Tickets e Chat - Visão Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Os tickets são a principal forma de comunicação entre proprietários e a equipe RIOS. 
            Cada ticket possui um chat integrado para troca de mensagens, arquivos e acompanhamento em tempo real.
          </p>
          <div className="bg-blue-500/10 p-3 rounded-lg">
            <p className="font-medium">💡 Importante:</p>
            <p className="text-muted-foreground">
              Todo ticket tem um <strong>SLA</strong> (tempo limite de resposta) que deve ser respeitado. 
              O contador aparece em vermelho quando está expirando!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tipos de Ticket */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Tipos de Ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Manutenção</Badge>
              </div>
              <p className="text-muted-foreground">
                Problemas técnicos no imóvel. Possui fluxo especial com decisão do proprietário e geração de cobrança.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Dúvida/Informação</Badge>
              </div>
              <p className="text-muted-foreground">
                Perguntas gerais do proprietário sobre o imóvel ou gestão.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Bloqueio de Data</Badge>
              </div>
              <p className="text-muted-foreground">
                Solicitação para bloquear datas no calendário do imóvel.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Financeiro</Badge>
              </div>
              <p className="text-muted-foreground">
                Questões sobre repasses, comissões e pagamentos.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Conversar com Hóspedes</Badge>
              </div>
              <p className="text-muted-foreground">
                Proprietário solicita contato com hóspedes atuais.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Melhorias/Compras</Badge>
              </div>
              <p className="text-muted-foreground">
                Sugestões de melhorias ou compras para o imóvel.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status dos Tickets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Status dos Tickets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge>Novo</Badge>
              <span className="text-muted-foreground">Recém criado, aguardando primeira resposta</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="secondary">Em Análise</Badge>
              <span className="text-muted-foreground">Equipe está analisando o caso</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="outline">Aguardando Info</Badge>
              <span className="text-muted-foreground">Esperando resposta do proprietário</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="secondary">Em Execução</Badge>
              <span className="text-muted-foreground">Trabalho em andamento</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="outline">Concluído</Badge>
              <span className="text-muted-foreground">Ticket finalizado</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="destructive">Cancelado</Badge>
              <span className="text-muted-foreground">Ticket cancelado</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Sistema de Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            Cada ticket possui um chat em tempo real para comunicação entre equipe e proprietário.
          </p>
          
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <CheckCheck className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Confirmação de Leitura</span>
              </div>
              <p className="text-muted-foreground">
                Mensagens mostram ✓ quando enviadas e ✓✓ azul quando lidas pelo destinatário.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Notificações</span>
              </div>
              <p className="text-muted-foreground">
                Badge vermelho no ícone de mensagem indica mensagens não lidas. 
                Proprietários recebem notificações push e por email.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="h-4 w-4 text-green-500" />
                <span className="font-medium">Voz para Texto</span>
              </div>
              <p className="text-muted-foreground">
                Grave áudio que é automaticamente transcrito. A transcrição pode ser usada 
                para gerar uma resposta profissional via IA.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="font-medium">Geração de Resposta com IA</span>
              </div>
              <p className="text-muted-foreground">
                Clique no botão IA para gerar uma resposta profissional baseada no contexto 
                do ticket e nas suas instruções de voz.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kanban e Organização */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Kanban e Organização
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Os tickets são exibidos em formato Kanban no painel, organizados por status e ordenados por SLA.
          </p>
          
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="font-medium mb-2">📋 Visualizações:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>Painel:</strong> Preview dos tickets mais urgentes</li>
              <li><strong>Chamados (Kanban):</strong> Todos os tickets de proprietários</li>
              <li><strong>Manutenções (Kanban):</strong> Apenas tickets de manutenção</li>
              <li><strong>Todos os Tickets:</strong> Lista completa com filtros</li>
            </ul>
          </div>
          
          <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
            <p className="font-medium text-amber-600">⏱️ SLA (Tempo de Resposta):</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
              <li><span className="text-blue-500">Azul:</span> Tempo normal</li>
              <li><span className="text-orange-500">Laranja:</span> Menos de 24h restantes</li>
              <li><span className="text-red-500">Vermelho:</span> SLA expirado</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Mensagens Internas */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Mensagens Internas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Use o toggle "Interno" ao enviar mensagens que só devem ser vistas pela equipe.
          </p>
          <div className="bg-purple-500/10 p-3 rounded-lg">
            <p className="text-muted-foreground">
              Mensagens internas aparecem com fundo diferenciado e <strong>não são visíveis</strong> para 
              o proprietário. Use para coordenação da equipe, anotações e discussões internas.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chat da Equipe */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            Chat da Equipe (Widget)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            No topo do painel existe um chat geral da equipe para comunicação rápida entre todos 
            os membros (admin, agentes, manutenção).
          </p>
          <div className="bg-green-500/10 p-3 rounded-lg">
            <p className="text-muted-foreground">
              Use para avisos gerais, coordenação de plantão, e discussões que não pertencem 
              a nenhum ticket específico. Mensagens são em tempo real e aparecem para todos os 
              membros da equipe.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
