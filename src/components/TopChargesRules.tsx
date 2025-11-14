import React, { useState } from "react";
import { BarChart3, Receipt, FileText } from "lucide-react";


export default function TopChargesRules() {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenRules = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsOpen(true);
    // Scroll suave até a seção
    setTimeout(() => {
      document.getElementById('regras-completas')?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
  };

  return (
    <section id="charges-rules" className="w-full">
      {/* Banner compacto (topo fixo) */}
      <div className="w-full rounded-2xl p-5 md:p-6 mb-4 bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl md:text-2xl font-semibold">Área de Cobranças</h2>
            <p className="mt-2 text-sm md:text-base opacity-95">
              Acompanhe cobranças com valor total, aporte da gestão e valor devido. Pague via Mercado Pago, selecione várias cobranças de uma vez e parcele em até 12x com juros. Você tem 7 dias para contestar ou anexar comprovante. No relatório, acesse anexos dos serviços, histórico completo, separação por tipo de serviço e gráfico de gastos mensais.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full md:w-auto md:min-w-[280px]">
            <a href="/manutencoes"
               className="w-full px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Relatório de Cobranças/Manutenções
            </a>
            <a href="/minhas-cobrancas"
               className="w-full px-4 py-2 rounded-xl font-medium bg-white text-secondary hover:bg-white/90 transition-colors flex items-center justify-center gap-2">
              <Receipt className="h-5 w-5" />
              Minhas Cobranças
            </a>
            <a 
              href="#regras-completas"
              onClick={handleOpenRules}
              className="w-full px-4 py-2 rounded-xl font-medium bg-white text-secondary hover:bg-white/90 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <FileText className="h-5 w-5" />
              Regras completas
            </a>
          </div>
        </div>
      </div>

      {/* Acordeão - Regras completas */}
      <div id="regras-completas" className="bg-card rounded-2xl border p-5 md:p-6">
        <details open={isOpen}>
          <summary 
            className="cursor-pointer text-base md:text-lg font-semibold text-secondary"
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
          >
            Regras completas
          </summary>
          <div className="mt-4 space-y-6">
            {/* Grade: texto + diagrama */}
            <div className="grid grid-cols-1 gap-6">
              {/* Texto introdutório */}
              <div className="bg-card rounded-2xl border p-5 md:p-6">
                <h3 className="text-lg md:text-xl font-semibold text-secondary">
                  Transparência e critérios de aporte
                </h3>
                <p className="mt-2 text-sm md:text-base text-muted-foreground">
                  Em cada cobrança você verá: valor total da manutenção, aporte da gestão (se houver),
                  valor devido, justificativa resumida e anexos (fotos, vídeos, notas).
                  Nossa eventual participação financeira é avaliada caso a caso considerando:
                </p>
                <ul className="list-disc pl-5 mt-3 space-y-1 text-sm md:text-base text-muted-foreground">
                  <li>Relacionamento com o proprietário (histórico e parceria).</li>
                  <li>Resultados da unidade (giro e desempenho).</li>
                  <li>Custo e contexto da manutenção.</li>
                  <li>Urgência e risco operacional (impacto em reservas e avaliações).</li>
                </ul>
                <div className="mt-3 p-3 rounded-xl text-sm bg-accent border border-primary/20">
                  Exemplos: Em alta urgência com risco às reservas (escassez de mão de obra/preço elevado), podemos
                  não aportar. Em serviços pequenos ou com parceiros de longa data e ótimo resultado, podemos
                  contribuir parcialmente.
                </div>
              </div>

              {/* Diagrama SVG do fluxo de cobranças */}
              <div className="bg-card rounded-2xl border p-4 md:p-5">
                <h3 className="text-lg md:text-xl font-semibold mb-4 text-secondary">
                  Fluxo de cobranças
                </h3>
                <div className="w-full overflow-x-auto" aria-label="Diagrama do fluxo de cobranças">
                  <svg viewBox="0 0 1100 320" role="img" aria-labelledby="fluxoTitle fluxoDesc"
                       className="w-full min-w-[900px]">
                    <title id="fluxoTitle">Fluxo de cobranças</title>
                    <desc id="fluxoDesc">Processo linear de cobranças com decisões e resultados</desc>

                    {/* Definições */}
                    <defs>
                      <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(206 56% 22%)" />
                      </marker>
                      <marker id="arrowOrange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(20 63% 48%)" />
                      </marker>
                    </defs>

                    {/* Etapa 1: Emissão */}
                    <g transform="translate(20,40)">
                      <rect width="160" height="100" rx="12" fill="hsl(206 56% 22%)" stroke="hsl(206 56% 30%)" strokeWidth="2"/>
                      <text x="80" y="35" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">Cobrança</text>
                      <text x="80" y="52" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">emitida</text>
                      <text x="80" y="72" textAnchor="middle" fill="white" fontSize="11">Total, aporte</text>
                      <text x="80" y="86" textAnchor="middle" fill="white" fontSize="11">e valor devido</text>
                    </g>

                    {/* Seta 1 */}
                    <line x1="185" y1="90" x2="225" y2="90" stroke="hsl(206 56% 22%)" strokeWidth="2.5" markerEnd="url(#arrowBlue)" />

                    {/* Etapa 2: Janela 7 dias */}
                    <g transform="translate(225,40)">
                      <rect width="160" height="100" rx="12" fill="white" stroke="hsl(20 63% 48%)" strokeWidth="2.5"/>
                      <text x="80" y="35" textAnchor="middle" fill="hsl(206 56% 22%)" fontSize="14" fontWeight="600">Janela de</text>
                      <text x="80" y="52" textAnchor="middle" fill="hsl(206 56% 22%)" fontSize="14" fontWeight="600">7 dias</text>
                      <rect x="30" y="62" width="100" height="22" rx="11" fill="hsl(20 63% 48%)"/>
                      <text x="80" y="77" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">D-7 a D-0</text>
                      <text x="80" y="93" textAnchor="middle" fill="hsl(206 20% 45%)" fontSize="10">Contestar ou pagar</text>
                    </g>

                    {/* Seta 2 - dividida em 3 */}
                    <line x1="390" y1="90" x2="430" y2="90" stroke="hsl(206 56% 22%)" strokeWidth="2.5" markerEnd="url(#arrowBlue)" />
                    
                    {/* Seta para contestação (curva para cima) */}
                    <path d="M 390 90 Q 420 50, 455 50" fill="none" stroke="hsl(206 56% 22%)" strokeWidth="2" markerEnd="url(#arrowBlue)" />
                    
                    {/* Seta para sem resposta (curva para baixo) */}
                    <path d="M 390 90 Q 420 230, 455 230" fill="none" stroke="hsl(20 63% 48%)" strokeWidth="2" markerEnd="url(#arrowOrange)" />

                    {/* Etapa 3a: Pagamento */}
                    <g transform="translate(430,40)">
                      <rect width="160" height="100" rx="12" fill="hsl(206 56% 22%)" stroke="hsl(206 56% 30%)" strokeWidth="2"/>
                      <text x="80" y="40" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">Pagamento</text>
                      <text x="80" y="62" textAnchor="middle" fill="white" fontSize="11">Comprovante</text>
                      <text x="80" y="76" textAnchor="middle" fill="white" fontSize="11">anexado</text>
                      <rect x="50" y="82" width="60" height="16" rx="8" fill="white"/>
                      <text x="80" y="93" textAnchor="middle" fill="hsl(206 56% 22%)" fontSize="10" fontWeight="700">PAID</text>
                    </g>

                    {/* Etapa 3b: Contestação */}
                    <g transform="translate(455,10)">
                      <rect width="140" height="70" rx="10" fill="white" stroke="hsl(206 56% 22%)" strokeWidth="2"/>
                      <text x="70" y="25" textAnchor="middle" fill="hsl(206 56% 22%)" fontSize="13" fontWeight="600">Contestação</text>
                      <text x="70" y="42" textAnchor="middle" fill="hsl(206 20% 45%)" fontSize="10">Gestão analisa</text>
                      <text x="70" y="56" textAnchor="middle" fill="hsl(206 20% 45%)" fontSize="10">e responde</text>
                    </g>

                    {/* Etapa 3c: Sem resposta */}
                    <g transform="translate(455,200)">
                      <rect width="140" height="70" rx="10" fill="white" stroke="hsl(20 63% 48%)" strokeWidth="2.5"/>
                      <text x="70" y="28" textAnchor="middle" fill="hsl(206 56% 22%)" fontSize="13" fontWeight="600">Sem resposta</text>
                      <text x="70" y="48" textAnchor="middle" fill="hsl(206 20% 45%)" fontSize="10">Após 7 dias</text>
                      <text x="70" y="62" textAnchor="middle" fill="hsl(20 63% 48%)" fontSize="10" fontWeight="600">⚠ Automático</text>
                    </g>

                    {/* Setas finais */}
                    <line x1="595" y1="90" x2="635" y2="90" stroke="hsl(206 56% 22%)" strokeWidth="2.5" markerEnd="url(#arrowBlue)" />
                    <path d="M 595 45 Q 615 45, 615 90 L 635 90" fill="none" stroke="hsl(206 56% 22%)" strokeWidth="2" markerEnd="url(#arrowBlue)" />
                    <line x1="600" y1="235" x2="640" y2="235" stroke="hsl(20 63% 48%)" strokeWidth="2.5" markerEnd="url(#arrowOrange)" />

                    {/* Etapa 4a: Liquidada */}
                    <g transform="translate(635,40)">
                      <rect width="140" height="100" rx="12" fill="hsl(134 61% 41%)" stroke="hsl(134 61% 35%)" strokeWidth="2"/>
                      <text x="70" y="45" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">✓ Liquidada</text>
                      <text x="70" y="65" textAnchor="middle" fill="white" fontSize="11">Cobrança</text>
                      <text x="70" y="79" textAnchor="middle" fill="white" fontSize="11">encerrada</text>
                    </g>

                    {/* Etapa 4b: Offset */}
                    <g transform="translate(640,200)">
                      <rect width="140" height="70" rx="10" fill="hsl(20 63% 48%)" stroke="hsl(20 60% 40%)" strokeWidth="2"/>
                      <text x="70" y="28" textAnchor="middle" fill="white" fontSize="13" fontWeight="600">Offset</text>
                      <text x="70" y="45" textAnchor="middle" fill="white" fontSize="10">Desconto em</text>
                      <text x="70" y="59" textAnchor="middle" fill="white" fontSize="10">reserva futura</text>
                    </g>

                    {/* Legenda */}
                    <g transform="translate(820,40)">
                      <text x="0" y="0" fill="hsl(206 20% 45%)" fontSize="11" fontWeight="600">Status:</text>
                      <circle cx="8" cy="18" r="5" fill="hsl(206 56% 22%)"/>
                      <text x="18" y="22" fill="hsl(206 20% 45%)" fontSize="10">Fluxo normal</text>
                      <circle cx="8" cy="38" r="5" fill="hsl(20 63% 48%)"/>
                      <text x="18" y="42" fill="hsl(206 20% 45%)" fontSize="10">Sem resposta</text>
                      <circle cx="8" cy="58" r="5" fill="hsl(134 61% 41%)"/>
                      <text x="18" y="62" fill="hsl(206 20% 45%)" fontSize="10">Finalizado</text>
                    </g>
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Fluxo: Emissão → 7 dias para ação → Pagamento/Contestação/Timeout → Liquidação ou Offset
                </p>
              </div>
            </div>

            {/* Hub de Manutenções */}
            <div className="pt-3">
              <h4 className="font-semibold text-foreground text-base">Hub de Manutenções</h4>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">
                Acesse o Hub para ver todas as manutenções por unidade, com mídias, notas e
                gráficos por mês/ano. Filtre por período, tipo e status; exporte quando precisar.
              </p>
              <div className="flex flex-wrap gap-2 pt-3">
                <a href="/manutencoes"
                   className="px-4 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Abrir Hub</a>
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
