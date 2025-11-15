import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import maintenanceChat from "@/assets/maintenance-chat.png";
import maintenanceTypes from "@/assets/maintenance-types.png";
import maintenanceDecision from "@/assets/maintenance-decision.png";
import maintenanceImpact from "@/assets/maintenance-impact.png";
import maintenanceEcosystem from "@/assets/maintenance-ecosystem.png";
import maintenancePayment from "@/assets/maintenance-payment.png";

export default function OwnerMaintenancePolicyBanner() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="mb-6 border-yellow-400 bg-yellow-50">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
            <CardTitle className="text-lg">Política de Manutenção</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100"
          >
            {isOpen ? (
              <>
                Fechar <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                Ver detalhes <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Para garantir qualidade, segurança e desempenho nas plataformas, a manutenção preventiva e corretiva passa a seguir estas regras:
          </p>

          {/* Chamados de Manutenção */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <div>
                <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                  💬 Chamados de Manutenção
                </h3>
                <p className="text-sm text-muted-foreground">
                  Tanto o <strong>proprietário</strong> quanto a <strong>gestão</strong> podem abrir chamados. 
                  Dentro deles, poderemos conversar, enviar anexos e você receberá <strong>notificações por e-mail</strong>.
                </p>
              </div>
              <img src={maintenanceChat} alt="Chamados de Manutenção" className="rounded-lg w-full" />
            </div>
          </div>

          {/* Classificação */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-4 border-l-4 border-orange-500">
            <h3 className="text-base font-semibold mb-3 text-orange-900">⚡ Classificação</h3>
            <img src={maintenanceTypes} alt="Tipos de Manutenção" className="rounded-lg w-full mb-4" />
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white/80 rounded-lg p-3">
                <h4 className="text-sm font-bold text-red-600 mb-1">🚨 Essencial (atendimento imediato)</h4>
                <p className="text-xs text-muted-foreground">
                  Geladeira, fogão, micro-ondas, água quente, energia, infiltração grave, fechadura, piscina não utilizável. 
                  Podem ser executados <strong>de imediato</strong> pela gestão.
                </p>
              </div>
              <div className="bg-white/80 rounded-lg p-3">
                <h4 className="text-sm font-bold text-blue-600 mb-1">🔧 Estrutural (pode aguardar)</h4>
                <p className="text-xs text-muted-foreground">
                  Piso, mobília, pintura etc. Abriremos chamado e você decide.
                </p>
              </div>
            </div>
          </div>

          {/* Decisão */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <div>
                <h3 className="text-base font-semibold mb-2">⏱️ Decisão</h3>
                <p className="text-sm text-muted-foreground">
                  Para itens estruturais: <strong>✅ Assumir execução</strong> (informar prazo/fornecedor) ou <strong>🤝 Delegar à gestão</strong>.
                </p>
              </div>
              <img src={maintenanceDecision} alt="Processo de Decisão" className="rounded-lg w-full" />
            </div>
          </div>

          {/* Impacto */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-4 border-l-4 border-red-500">
            <h3 className="text-base font-semibold mb-3 text-red-900">⚠️ VOCÊ é o Maior Prejudicado</h3>
            <img src={maintenanceImpact} alt="Impacto nas Avaliações" className="rounded-lg w-full mb-3" />
            <p className="text-sm text-muted-foreground">
              Avaliações negativas <strong>derrubam drasticamente</strong> o desempenho. Uma avaliação ruim pode reduzir receita em <strong>+R$ 500/mês</strong>, 
              prejudicar posição nas plataformas e afastar hóspedes. Itens essenciais podem ser executados imediatamente para proteger <strong>sua renda</strong>.
            </p>
          </div>

          {/* Ecossistema */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="grid md:grid-cols-2 gap-4 items-center">
              <img src={maintenanceEcosystem} alt="Ecossistema RIOS" className="rounded-lg w-full" />
              <div>
                <h3 className="text-base font-semibold mb-2">🌟 Ecossistema RIOS</h3>
                <p className="text-sm text-muted-foreground">
                  Cada imóvel impacta todos. Negligências prejudicam seu resultado e dos demais.
                </p>
              </div>
            </div>
          </div>

          {/* Pós-Execução */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-base font-semibold mb-3">💰 Pós-Execução</h3>
            <img src={maintenancePayment} alt="Processo de Pagamento" className="rounded-lg w-full mb-3" />
            <p className="text-sm text-muted-foreground">
              As manutenções feitas pela gestão vão para a <strong>área de cobranças</strong>, onde será gerada uma cobrança conforme regras publicadas (contestação 7 dias, pagamento/offset).
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
