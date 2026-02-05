import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  Camera,
  Mic,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Wrench,
  Sparkles,
  ListChecks
} from "lucide-react";

export function TutorialVistorias() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Vistorias e Inspeções
          </CardTitle>
          <CardDescription>
            Como registrar, analisar e criar manutenções a partir de vistorias
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* O que é uma Vistoria */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              O que é uma Vistoria?
            </h3>
            
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Vistorias são registros feitos após a limpeza de um imóvel, documentando o estado geral 
                e identificando problemas que precisam de atenção. São essenciais para manter a qualidade 
                dos imóveis e prevenir reclamações de hóspedes.
              </p>
            </div>
          </div>

          {/* Quem pode criar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-500" />
              Quem Pode Criar Vistorias
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-green-100 text-green-700">Faxineiras</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Criam vistorias após cada limpeza, documentando o estado do imóvel e reportando problemas.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700">Equipe Interna</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Podem criar vistorias internas (ocultas do proprietário) para documentação interna.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Tipos de Vistoria */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Tipos de Vistoria
            </h3>

            <div className="space-y-3">
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Vistoria Normal (Visível ao Proprietário)</p>
                      <p className="text-sm text-muted-foreground">
                        Padrão. O proprietário pode acompanhar pelo portal se tiver acesso habilitado.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-gray-500">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <EyeOff className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Vistoria Interna (Oculta)</p>
                      <p className="text-sm text-muted-foreground">
                        Apenas equipe vê. Usada para documentação interna, danos de hóspedes, etc.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Como Registrar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-cyan-500" />
              Como Registrar uma Vistoria
            </h3>

            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</span>
                <div>
                  <p className="font-medium">Acesse o Imóvel</p>
                  <p className="text-sm text-muted-foreground">Na área de vistorias, selecione o imóvel</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</span>
                <div>
                  <p className="font-medium">Tire Fotos e Vídeos</p>
                  <p className="text-sm text-muted-foreground">Documente todos os cômodos e problemas encontrados</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</span>
                <div>
                  <p className="font-medium">Grave Áudio (Opcional)</p>
                  <p className="text-sm text-muted-foreground">
                    <Mic className="h-3 w-3 inline mr-1" />
                    Descreva verbalmente os problemas. A IA transcreve automaticamente.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</span>
                <div>
                  <p className="font-medium">Indique se há Problemas</p>
                  <p className="text-sm text-muted-foreground">Marque "OK" ou "NÃO" conforme o estado do imóvel</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</span>
                <div>
                  <p className="font-medium">Envie a Vistoria</p>
                  <p className="text-sm text-muted-foreground">A equipe receberá notificação para análise</p>
                </div>
              </li>
            </ol>
          </div>

          {/* IA e Transcrição */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Inteligência Artificial
            </h3>

            <Card className="border-violet-200 bg-violet-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  O sistema usa IA para facilitar o trabalho com vistorias:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li><span className="font-medium">Transcrição de Áudio:</span> Converte gravações em texto automaticamente</li>
                  <li><span className="font-medium">Resumo Automático:</span> Gera um resumo dos problemas identificados</li>
                  <li><span className="font-medium">Categorização:</span> Sugere categorias para os itens encontrados</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Kanban de Itens */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-emerald-500" />
              Kanban de Itens da Vistoria
            </h3>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Na página do imóvel, o <span className="font-medium">Kanban de Itens</span> organiza os problemas 
                detectados em colunas:
              </p>
              
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="bg-gray-100 p-2 rounded text-center">
                  <p className="font-medium">Pendente</p>
                  <p className="text-muted-foreground">Aguardando análise</p>
                </div>
                <div className="bg-blue-100 p-2 rounded text-center">
                  <p className="font-medium">Gestão</p>
                  <p className="text-muted-foreground">Gestão resolve</p>
                </div>
                <div className="bg-green-100 p-2 rounded text-center">
                  <p className="font-medium">Proprietário</p>
                  <p className="text-muted-foreground">Dono resolve</p>
                </div>
                <div className="bg-orange-100 p-2 rounded text-center">
                  <p className="font-medium">Hóspede</p>
                  <p className="text-muted-foreground">Cobrar hóspede</p>
                </div>
                <div className="bg-emerald-100 p-2 rounded text-center">
                  <p className="font-medium">Concluído</p>
                  <p className="text-muted-foreground">Resolvido</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground pt-2 border-t border-emerald-200">
                <span className="font-medium">💡 Dica:</span> Arraste itens entre colunas para atualizar o status. 
                Selecione múltiplos itens para criar manutenções em lote.
              </p>
            </div>
          </div>

          {/* Criar Manutenção a partir de Vistoria */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5 text-red-500" />
              Criar Manutenção a partir de Vistoria
            </h3>

            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm">
                  Quando uma vistoria identifica problemas (<Badge variant="outline" className="bg-red-100 text-red-700 text-xs">NÃO</Badge>), 
                  você pode criar manutenções diretamente:
                </p>
                
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 ml-2">
                  <li>Acesse a vistoria com problemas</li>
                  <li>Clique em <span className="font-medium">"Nova Manutenção"</span></li>
                  <li>Os dados são pré-preenchidos automaticamente:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Imóvel e proprietário já vinculados</li>
                      <li>Descrição baseada no resumo da IA</li>
                      <li>Opção de selecionar anexos da vistoria</li>
                    </ul>
                  </li>
                  <li>Defina prioridade (Essencial ou não)</li>
                  <li>Defina responsabilidade de custo</li>
                  <li>Confirme a criação</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* Configurações por Imóvel */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-500" />
              Configurações de Visibilidade
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Cada imóvel pode ter configurações individuais de vistoria:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><span className="font-medium">Notificar Proprietário:</span> Envia email quando nova vistoria é criada</li>
                <li><span className="font-medium">Portal do Proprietário:</span> Permite que o dono veja vistorias pelo app</li>
              </ul>
              <p className="text-sm pt-2 border-t border-indigo-200">
                Acesse estas configurações em: <span className="font-medium">Vistorias → Imóvel → Configurações</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
