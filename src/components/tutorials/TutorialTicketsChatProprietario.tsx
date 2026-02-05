import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Ticket, Clock, Bell, CheckCheck, Plus, Building2 } from "lucide-react";

export function TutorialTicketsChatProprietario() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Ticket className="h-5 w-5 text-blue-500" />
            Seus Chamados - Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Os chamados (tickets) são a forma oficial de comunicação com a equipe RIOS. 
            Cada solicitação vira um chamado que é acompanhado do início ao fim.
          </p>
          <div className="bg-blue-500/10 p-3 rounded-lg">
            <p className="font-medium">💡 Por que usar chamados?</p>
            <p className="text-muted-foreground">
              Diferente de WhatsApp ou email, os chamados garantem <strong>rastreabilidade</strong>, 
              <strong>priorização</strong> e <strong>tempo de resposta garantido</strong> (SLA).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tipos de Chamado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Tipos de Chamado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Ao criar um chamado, escolha o tipo que melhor descreve sua solicitação:
          </p>
          
          <div className="grid gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Dúvida/Informação</Badge>
              </div>
              <p className="text-muted-foreground">
                Perguntas sobre seu imóvel, reservas, ou gestão em geral.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Bloqueio de Data</Badge>
              </div>
              <p className="text-muted-foreground">
                Solicitar bloqueio de datas para uso pessoal do imóvel.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Financeiro</Badge>
              </div>
              <p className="text-muted-foreground">
                Dúvidas sobre repasses, comissões, cobranças ou pagamentos.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Conversar com Hóspedes</Badge>
              </div>
              <p className="text-muted-foreground">
                Solicitar que a equipe entre em contato com hóspedes em seu nome.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">Melhorias/Compras</Badge>
              </div>
              <p className="text-muted-foreground">
                Sugerir melhorias ou solicitar compras para o imóvel.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
            <p className="font-medium text-amber-600">⚠️ Sobre Manutenções:</p>
            <p className="text-muted-foreground">
              Tickets de manutenção são criados pela <strong>equipe RIOS</strong> quando identificamos 
              problemas no imóvel. Se você notar algo errado, abra um chamado de "Dúvida" descrevendo 
              o problema e nós avaliaremos.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Acompanhando seu Chamado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Cada chamado passa por diferentes status que você pode acompanhar:
          </p>
          
          <div className="grid gap-2">
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge>Novo</Badge>
              <span className="text-muted-foreground">Seu chamado foi recebido</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="secondary">Em Análise</Badge>
              <span className="text-muted-foreground">Equipe está analisando</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="outline">Aguardando Info</Badge>
              <span className="text-muted-foreground">Precisamos de mais informações suas</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="secondary">Em Execução</Badge>
              <span className="text-muted-foreground">Estamos trabalhando na solução</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded border">
              <Badge variant="outline">Concluído</Badge>
              <span className="text-muted-foreground">Chamado finalizado</span>
            </div>
          </div>
          
          <div className="bg-blue-500/10 p-3 rounded-lg">
            <p className="font-medium">⏱️ Tempo de Resposta (SLA):</p>
            <p className="text-muted-foreground">
              Cada chamado tem um tempo máximo de resposta. Você pode ver o contador 
              na lista de chamados - quanto menor o tempo, mais urgente está a resposta.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Chat do Chamado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            Cada chamado tem um chat onde você conversa diretamente com a equipe RIOS.
          </p>
          
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <CheckCheck className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Confirmação de Leitura</span>
              </div>
              <p className="text-muted-foreground">
                ✓ = mensagem enviada | ✓✓ azul = mensagem lida pela equipe
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Notificações</span>
              </div>
              <p className="text-muted-foreground">
                Você receberá notificações push e por email quando a equipe responder. 
                O badge vermelho no ícone indica mensagens não lidas.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="h-4 w-4 text-green-500" />
                <span className="font-medium">Anexos</span>
              </div>
              <p className="text-muted-foreground">
                Envie fotos, vídeos e documentos pelo chat para ajudar a equipe 
                a entender melhor sua solicitação.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onde encontrar */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Ticket className="h-5 w-5 text-green-500" />
            Onde Ver Seus Chamados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-card">
              <p className="font-medium mb-1">📱 No Painel Principal</p>
              <p className="text-muted-foreground">
                Seus chamados em aberto aparecem em destaque na sua página inicial, 
                com acesso rápido ao chat.
              </p>
            </div>
            
            <div className="p-3 rounded-lg border bg-card">
              <p className="font-medium mb-1">📋 Em "Meus Chamados"</p>
              <p className="text-muted-foreground">
                Lista completa de todos os seus chamados (abertos e finalizados), 
                ordenados por urgência.
              </p>
            </div>
          </div>
          
          <div className="bg-green-500/10 p-3 rounded-lg">
            <p className="font-medium">💬 Acesso Rápido ao Chat:</p>
            <p className="text-muted-foreground">
              Clique no botão "Msgs" em qualquer chamado para abrir o chat instantaneamente, 
              sem precisar entrar na página de detalhes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dicas */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">💡 Dicas para Chamados Eficientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li>
              <strong>Seja específico:</strong> Descreva claramente o problema ou solicitação
            </li>
            <li>
              <strong>Anexe fotos/vídeos:</strong> Imagens ajudam muito na análise
            </li>
            <li>
              <strong>Responda rápido:</strong> Quando pedirmos informações, responda o quanto antes para agilizar
            </li>
            <li>
              <strong>Um assunto por chamado:</strong> Para questões diferentes, abra chamados separados
            </li>
            <li>
              <strong>Verifique notificações:</strong> Ative notificações para não perder respostas da equipe
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
