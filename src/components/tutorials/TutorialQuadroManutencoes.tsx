import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
  Paperclip, 
  Plus, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Archive,
  Sparkles,
  Wrench,
  Pencil,
  Play,
  Search,
  FileAudio,
  CheckSquare
} from "lucide-react";

export function TutorialQuadroManutencoes() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">📋 Quadro de Manutenções</h1>
        <p className="text-muted-foreground">
          Central de gerenciamento de manutenções, cobranças e vistorias em formato de lista
        </p>
      </div>

      {/* Visão Geral */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            🎯 Visão Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            O <strong>Quadro de Manutenções</strong> centraliza todas as manutenções, cobranças pendentes e vistorias 
            em um único lugar, permitindo gerenciar o fluxo completo de forma eficiente.
          </p>
          
          <div className="bg-muted/30 p-3 rounded-lg space-y-2">
            <p className="text-sm font-medium">O quadro é dividido em seções:</p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-amber-500 rounded" />
                <span><strong>Em Progresso</strong> – Manutenções em andamento</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-green-500 rounded" />
                <span><strong>Concluídas</strong> – Manutenções finalizadas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-red-600 rounded" />
                <span><strong>Cobranças Vencidas</strong> – Cobranças atrasadas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-destructive rounded" />
                <span><strong>Cobranças Pendentes</strong> – Aguardando pagamento</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estrutura da Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            📊 Estrutura da Tabela de Manutenções
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Cada linha representa uma manutenção ou cobrança, com informações editáveis diretamente na tabela:
          </p>

          {/* Mock table header */}
          <div className="overflow-x-auto">
            <div className="min-w-[700px] bg-muted rounded-lg p-2 text-xs">
              <div className="grid grid-cols-9 gap-2 items-center font-medium text-muted-foreground">
                <div className="flex items-center justify-center">
                  <CheckSquare className="h-3.5 w-3.5" />
                </div>
                <div>Nome</div>
                <div className="flex items-center justify-center">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div>Imóvel</div>
                <div>Valor</div>
                <div>Aporte</div>
                <div>Data</div>
                <div>Label</div>
                <div>Status</div>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
              <CheckSquare className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <strong>Seleção</strong>: Marque itens para ações em lote (arquivar múltiplas manutenções de uma vez)
              </div>
            </div>

            <div className="flex items-start gap-3 bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg">
              <span className="font-bold text-purple-600 shrink-0">Nome</span>
              <div>
                <strong>Clique para abrir o Chat</strong> da manutenção. O nome completo aparece ao passar o mouse.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
              <div className="relative shrink-0">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center text-[10px] font-bold bg-destructive text-white rounded-full">
                  3
                </span>
              </div>
              <div>
                <strong>Chat</strong>: Ícone com contador de mensagens não lidas. Clique para abrir o chat da manutenção.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
              <span className="text-green-600 font-bold shrink-0">R$</span>
              <div>
                <strong>Valor e Aporte Gestão</strong>: Clique na célula para editar. O valor inserido é salvo automaticamente ao pressionar Enter ou clicar fora.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
              <Paperclip className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong>Anexos</strong>: Número de arquivos anexados. Clique para visualizar, use o <Plus className="h-3 w-3 inline" /> para adicionar novos.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Labels e Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            🏷️ Labels e Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium">Categorias de Serviço (Labels):</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-blue-500 text-white">Refrigeração</Badge>
              <Badge className="bg-yellow-500 text-white">Elétrica</Badge>
              <Badge className="bg-cyan-500 text-white">Hidráulica</Badge>
              <Badge className="bg-amber-700 text-white">Marcenaria</Badge>
              <Badge className="bg-slate-600 text-white">Estrutural</Badge>
              <Badge className="bg-purple-500 text-white">Itens</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Clique na célula para selecionar a categoria apropriada
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Status da Manutenção:</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-amber-500 text-white">Em Progresso</Badge>
              <Badge className="bg-green-500 text-white">Feito</Badge>
              <Badge className="bg-primary text-primary-foreground">Enviar ao Proprietário</Badge>
            </div>
          </div>

          <div className="bg-primary/10 p-3 rounded-lg border border-primary/30">
            <p className="text-sm">
              <strong>⚡ Ação Automática:</strong> Ao mudar o status para <Badge className="bg-primary text-primary-foreground text-xs">Enviar ao Proprietário</Badge>, 
              uma cobrança é automaticamente criada com os valores preenchidos e enviada para o proprietário.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ordenação e Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Ordenação e Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 bg-muted/50 p-3 rounded-lg">
              <ArrowUpDown className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <strong>Ordenar Colunas</strong>: Clique no cabeçalho de qualquer coluna para ordenar. 
                Clique novamente para inverter a ordem (crescente/decrescente).
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
                <span>Sem ordenação</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
                <span>Crescente</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
                <span>Decrescente</span>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-muted/50 p-3 rounded-lg">
              <Search className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <strong>Busca</strong>: Use o campo de busca no topo para filtrar manutenções por nome, imóvel ou qualquer texto.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grupos Expansíveis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            📂 Grupos Expansíveis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Os grupos podem ser expandidos ou recolhidos clicando no cabeçalho:
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border-l-4 border-l-amber-500 cursor-pointer hover:bg-muted/70">
              <ChevronDown className="h-4 w-4" />
              <span className="font-medium">Em Progresso</span>
              <Badge variant="secondary">12</Badge>
            </div>
            <div className="ml-6 p-2 text-sm text-muted-foreground bg-muted/20 rounded">
              → Itens expandidos aparecem aqui
            </div>

            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border-l-4 border-l-green-500 cursor-pointer hover:bg-muted/70">
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium">Concluídas</span>
              <Badge variant="secondary">8</Badge>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              → Grupo recolhido (clique para expandir)
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            O badge mostra a quantidade de itens em cada grupo
          </p>
        </CardContent>
      </Card>

      {/* Tabela de Vistorias */}
      <Card className="border-2 border-amber-200 dark:border-amber-900">
        <CardHeader className="pb-2 bg-amber-50 dark:bg-amber-950/30 rounded-t-lg">
          <CardTitle className="text-lg flex items-center gap-2">
            🔍 Seção de Vistorias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm">
            Abaixo das manutenções, há uma seção dedicada às vistorias recentes, dividida em dois grupos:
          </p>

          <div className="grid gap-2">
            <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border-l-4 border-l-amber-500">
              <span className="font-medium">Vistorias de Faxineiras</span>
              <Badge variant="secondary">6</Badge>
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-lg border-l-4 border-l-green-500">
              <span className="font-medium">Vistorias de Equipe</span>
              <Badge variant="secondary">3</Badge>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-medium">Colunas da tabela de vistorias:</p>
            
            <div className="grid gap-2">
              <div className="flex items-start gap-3 bg-muted/30 p-2 rounded">
                <Badge variant={true ? "destructive" : "secondary"} className="shrink-0">NÃO</Badge>
                <div className="text-xs">
                  <strong>Status</strong>: Indica se foram encontrados problemas. 
                  <span className="text-green-600"> OK</span> = sem problemas, 
                  <span className="text-red-600"> NÃO</span> = problemas detectados.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-muted/30 p-2 rounded">
                <div className="flex items-center gap-1 shrink-0">
                  <Play className="h-4 w-4 text-primary" />
                  <FileAudio className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-xs">
                  <strong>Áudio</strong>: Play para ouvir a gravação. O texto mostra a transcrição ou observações.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-muted/30 p-2 rounded">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="text-xs">
                  <strong>Gerar Resumo</strong>: Use IA para criar um resumo automático da transcrição do áudio.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações nas Vistorias */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            ⚡ Ações nas Vistorias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
              <Pencil className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <strong>Editar Vistoria</strong>: Permite modificar as observações, transcrição e outros detalhes da vistoria.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg">
              <Wrench className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
              <div>
                <strong>Nova Manutenção</strong>: Cria uma manutenção diretamente a partir da vistoria, 
                já preenchendo o imóvel e descrição do problema encontrado.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
              <Sparkles className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong>Gerar Resumo com IA</strong>: Analisa automaticamente a transcrição do áudio 
                e gera um resumo identificando problemas encontrados.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
              <Archive className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <strong>Arquivar</strong>: Selecione múltiplas vistorias e clique em "Arquivar" para removê-las da lista ativa.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Débitos em Reserva */}
      <Card className="border-2 border-purple-200 dark:border-purple-900">
        <CardHeader className="pb-2 bg-purple-50 dark:bg-purple-950/30 rounded-t-lg">
          <CardTitle className="text-lg flex items-center gap-2">
            💰 Seção de Débitos em Reserva
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm">
            No final da página, há uma tabela dedicada aos <strong>Débitos em Reserva</strong> pendentes, 
            mostrando cobranças que estão aguardando débito automático nas próximas reservas dos proprietários.
          </p>
          
          <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg text-sm">
            <p>Esta seção permite acompanhar:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1 text-xs">
              <li>Valor total pendente por proprietário</li>
              <li>Data prevista do próximo débito</li>
              <li>Status de cada cobrança em débito</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Edição Inline */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            ✏️ Edição Inline (Direta na Tabela)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Uma das funcionalidades mais poderosas do quadro é a <strong>edição inline</strong>:
          </p>

          <div className="bg-white dark:bg-background p-4 rounded-lg border space-y-3">
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">Valor:</span>
                <div className="px-3 py-1 bg-muted/50 rounded cursor-pointer hover:bg-muted text-sm">
                  R$ 150,00 ← clique para editar
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">Data:</span>
                <div className="px-3 py-1 bg-muted/50 rounded cursor-pointer hover:bg-muted text-sm">
                  15/02/2026 ← clique para editar
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">Label:</span>
                <Badge className="bg-blue-500 text-white cursor-pointer">Refrigeração ▼</Badge>
              </div>
            </div>
          </div>

          <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
            <p className="text-sm">
              <strong>💡 Dica:</strong> Pressione <kbd className="px-1 bg-muted rounded text-xs">Enter</kbd> para salvar 
              ou <kbd className="px-1 bg-muted rounded text-xs">Esc</kbd> para cancelar a edição.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Fluxo de Trabalho Recomendado */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            🔄 Fluxo de Trabalho Recomendado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <div>
                <strong>Revisar Vistorias</strong>: Verifique as vistorias recentes e gere resumos com IA para identificar problemas.
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <div>
                <strong>Criar Manutenções</strong>: Para problemas encontrados, crie manutenções diretamente da vistoria.
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
              <div>
                <strong>Preencher Valores</strong>: Adicione valor e aporte de gestão nas manutenções em progresso.
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">4</div>
              <div>
                <strong>Comunicar via Chat</strong>: Use o chat para registrar comunicações e decisões.
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">5</div>
              <div>
                <strong>Enviar ao Proprietário</strong>: Quando concluída, mude o status para "Enviar ao Proprietário" para gerar a cobrança automaticamente.
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">6</div>
              <div>
                <strong>Arquivar Vistorias</strong>: Selecione e arquive vistorias já processadas para manter a lista organizada.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Atalhos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            ⌨️ Atalhos e Dicas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">Clique</kbd>
              <span>na célula = editar valor</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">Enter</kbd>
              <span>= salvar edição</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
              <span>= cancelar edição</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
              <kbd className="px-2 py-1 bg-muted rounded text-xs">Shift + Clique</kbd>
              <span>= selecionar intervalo</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
