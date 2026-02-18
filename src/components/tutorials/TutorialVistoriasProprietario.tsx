import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Camera,
  CheckCircle2,
  Eye,
  ListChecks,
  Calendar,
  Bell,
  Sparkles,
  ShieldCheck
} from "lucide-react";

export function TutorialVistoriasProprietario() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Vistorias do Seu Imóvel
          </CardTitle>
          <CardDescription>
            Entenda como as vistorias protegem seu imóvel e como acompanhá-las
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* O que são vistorias */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              O que são Vistorias?
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Vistorias são inspeções feitas no seu imóvel para garantir que tudo está funcionando 
                perfeitamente para os hóspedes. Existem dois tipos principais:
              </p>
            </div>
          </div>

          {/* Tipos */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-purple-500" />
              Tipos de Vistoria
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-green-700">
                    <Camera className="h-4 w-4" />
                    Vistoria de Limpeza (Faxineira)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Feita após cada limpeza</p>
                  <p className="text-muted-foreground">
                    A faxineira registra o estado do imóvel com fotos, vídeos e áudios. 
                    Se encontrar algum problema, reporta para a equipe.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Documenta o estado geral do imóvel</li>
                    <li>Identifica itens quebrados ou faltando</li>
                    <li>Reporta danos de hóspedes anteriores</li>
                    <li>IA analisa e resume os problemas</li>
                  </ul>
                  <div className="pt-2 border-t mt-2">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-green-700">Status:</span> 
                      {" "}<Badge variant="outline" className="bg-green-100 text-green-700 text-xs">OK</Badge> ou 
                      {" "}<Badge variant="outline" className="bg-red-100 text-red-700 text-xs">Problema</Badge>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                    <ClipboardCheck className="h-4 w-4" />
                    Vistoria de Rotina (Equipe)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="font-medium">Inspeção técnica periódica</p>
                  <p className="text-muted-foreground">
                    A equipe faz verificações técnicas detalhadas para prevenir problemas maiores.
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Ar-condicionado (filtros, funcionamento)</li>
                    <li>TV, internet e tomadas/lâmpadas</li>
                    <li>Portas, fechaduras e janelas</li>
                    <li>Fogão/forno (todas as bocas)</li>
                    <li>Banheiros e encanamento</li>
                    <li>Contagem de copos, travesseiros</li>
                    <li>Substituição de pilhas</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* O que acontece quando há problema */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              O que Acontece Quando Há Problema?
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-medium">1</span>
                  <div>
                    <p className="font-medium">Problema Identificado</p>
                    <p className="text-sm text-muted-foreground">A vistoria registra o problema com fotos e descrição</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="font-medium">Equipe Analisa</p>
                    <p className="text-sm text-muted-foreground">Classificamos como Essencial (urgente) ou Estrutural (pode aguardar)</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="font-medium">Manutenção Criada</p>
                    <p className="text-sm text-muted-foreground">Um chamado de manutenção é aberto automaticamente com os dados da vistoria</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-medium">4</span>
                  <div>
                    <p className="font-medium">Você é Notificado</p>
                    <p className="text-sm text-muted-foreground">Recebe notificação para acompanhar ou decidir sobre a manutenção</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          {/* Como acompanhar */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-500" />
              Como Acompanhar Vistorias
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <p className="text-sm">
                Se o <span className="font-medium">Portal do Proprietário</span> estiver habilitado para seu imóvel, 
                você pode ver as vistorias diretamente no app:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Acesse <span className="font-medium">"Vistorias"</span> no menu</li>
                <li>Veja fotos, vídeos e resumos de cada vistoria</li>
                <li>Acompanhe o histórico completo do imóvel</li>
                <li>Veja quais problemas já foram resolvidos</li>
              </ul>
              <div className="pt-2 border-t border-indigo-200">
                <p className="text-sm">
                  <span className="font-medium text-indigo-700">📧 Notificação por email:</span> Você também recebe 
                  um email automático sempre que uma nova vistoria é registrada (se configurado).
                </p>
              </div>
            </div>
          </div>

          {/* Frequência */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-cyan-500" />
              Frequência das Vistorias
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="bg-green-100 text-green-700">Limpeza</Badge>
                <p className="text-sm text-muted-foreground">Após cada check-out / antes de cada check-in</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="bg-blue-100 text-blue-700">Rotina</Badge>
                <p className="text-sm text-muted-foreground">Periodicamente (mensal ou conforme necessidade)</p>
              </div>
            </div>
          </div>

          {/* Benefícios */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Benefícios das Vistorias
            </h3>

            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-4 space-y-2">
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Identificação precoce de problemas (antes que hóspedes reclamem)</li>
                  <li>Documentação completa para disputas com plataformas</li>
                  <li>Responsabilização de danos causados por hóspedes</li>
                  <li>Manutenção preventiva que economiza dinheiro a longo prazo</li>
                  <li>Melhor avaliação nas plataformas (Airbnb, Booking, etc.)</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}