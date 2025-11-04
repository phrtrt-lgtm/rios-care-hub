import React from "react";

export default function TopChargesRules() {
  return (
    <section id="charges-rules" className="w-full">
      {/* Paleta com fallback */}
      <style>{`
        :root{
          --brand-blue: var(--color-primary, #1E40AF);
          --brand-terracotta: #E07A5F;
          --brand-ink: #0F172A;
          --brand-bg: #F8FAFC;
        }
      `}</style>

      {/* Banner compacto (topo fixo) */}
      <div className="w-full rounded-2xl p-5 md:p-6 mb-4"
           style={{background:"linear-gradient(135deg,var(--brand-blue) 0%, #213E7A 100%)", color:"#fff"}}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl md:text-2xl font-semibold">Como funcionam as cobranças de manutenção</h2>
            <p className="mt-2 text-sm md:text-base opacity-95">
              Cada cobrança mostra o <strong>valor total do serviço</strong>, o <strong>aporte da gestão (quando houver)</strong> e o <strong>valor devido</strong>.
              Você tem <strong>7 dias</strong> para <strong>contestar</strong> ou <strong>anexar o comprovante</strong>. Sem resposta, o valor poderá ser
              <strong> compensado em reservas futuras</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/hub/manutencoes"
               className="px-4 py-2 rounded-xl font-medium"
               style={{background:"var(--brand-terracotta)", color:"#fff"}}>Ver minhas manutenções</a>
            <a href="#regras-completas"
               className="px-4 py-2 rounded-xl font-medium bg-white text-black">Regras completas</a>
          </div>
        </div>
      </div>

      {/* Grade: texto + diagrama */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Texto introdutório */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6">
          <h3 className="text-lg md:text-xl font-semibold" style={{color:"var(--brand-blue)"}}>
            Transparência e critérios de aporte
          </h3>
          <p className="mt-2 text-sm md:text-base text-slate-700">
            Em cada cobrança você verá: <strong>valor total</strong> da manutenção, <strong>aporte da gestão</strong> (se houver),
            <strong> valor devido</strong>, <strong>justificativa resumida</strong> e <strong>anexos</strong> (fotos, vídeos, notas).
            Nossa eventual participação financeira é avaliada caso a caso considerando:
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1 text-sm md:text-base text-slate-700">
            <li><strong>Relacionamento</strong> com o proprietário (histórico e parceria).</li>
            <li><strong>Resultados</strong> da unidade (giro e desempenho).</li>
            <li><strong>Custo e contexto</strong> da manutenção.</li>
            <li><strong>Urgência e risco operacional</strong> (impacto em reservas e avaliações).</li>
          </ul>
          <div className="mt-3 p-3 rounded-xl text-sm bg-orange-50 border border-orange-200"
               style={{borderColor:"rgba(224,122,95,0.35)"}}>
            <strong>Exemplos:</strong> Em alta urgência com risco às reservas (escassez de mão de obra/preço elevado), podemos
            <strong> não aportar</strong>. Em serviços pequenos ou com parceiros de longa data e ótimo resultado, podemos
            <strong> contribuir parcialmente</strong>.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/tickets/new?tipo=contestacao"
               className="px-4 py-2 rounded-xl font-medium"
               style={{background:"var(--brand-blue)", color:"#fff"}}>Abrir contestação</a>
            <a href="/charges"
               className="px-4 py-2 rounded-xl font-medium border border-slate-300 bg-white">Anexar comprovante</a>
          </div>
        </div>

        {/* Diagrama SVG do fluxo de cobranças */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
          <h3 className="text-lg md:text-xl font-semibold mb-3" style={{color:"var(--brand-blue)"}}>
            Fluxo de cobranças
          </h3>
          <div className="w-full overflow-auto" aria-label="Diagrama do fluxo de cobranças">
            <svg viewBox="0 0 980 560" role="img" aria-labelledby="fluxoTitle fluxoDesc"
                 className="w-[900px] max-w-none">
              <title id="fluxoTitle">Fluxo de cobranças</title>
              <desc id="fluxoDesc">Etapas e decisões do processo de cobranças com prazos e possíveis resultados.</desc>

              {/* Definições de setas */}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--brand-blue)" />
                </marker>
                <marker id="arrowTerracotta" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--brand-terracotta)" />
                </marker>
                <style>
                  {`
                    .node { fill: #fff; stroke: rgba(2,6,23,0.12); stroke-width: 1.5; rx: 14; }
                    .node-title { font: 600 15px/1.2 ui-sans-serif, system-ui; fill: var(--brand-ink); }
                    .node-sub { font: 400 12px/1.3 ui-sans-serif, system-ui; fill: #475569; }
                    .pill { font: 700 11px/1 ui-sans-serif, system-ui; fill: #fff; }
                  `}
                </style>
              </defs>

              {/* Linha 1 */}
              <g transform="translate(40,40)">
                <rect className="node" width="260" height="90" />
                <text className="node-title" x="18" y="28">Cobrança emitida</text>
                <text className="node-sub" x="18" y="52">Detalhe: total, aporte da gestão, devido</text>
                <rect x="170" y="60" width="80" height="20" fill="var(--brand-blue)" rx="10"/>
                <text className="pill" x="176" y="74">PENDING</text>
              </g>

              {/* seta 1 */}
              <line x1="300" y1="85" x2="430" y2="85" stroke="var(--brand-blue)" strokeWidth="2.5" markerEnd="url(#arrow)" />

              {/* Linha 2 */}
              <g transform="translate(430,40)">
                <rect className="node" width="260" height="90" />
                <text className="node-title" x="18" y="28">Janela de 7 dias</text>
                <text className="node-sub" x="18" y="52">Contestar ou pagar/anexar comprovante</text>
                <rect x="155" y="60" width="105" height="20" fill="var(--brand-terracotta)" rx="10"/>
                <text className="pill" x="162" y="74">D-7 a D-0</text>
              </g>

              {/* setas ramificadas */}
              <line x1="560" y1="130" x2="560" y2="200" stroke="var(--brand-blue)" strokeWidth="2.5" markerEnd="url(#arrow)" />
              <line x1="560" y1="130" x2="830" y2="200" stroke="var(--brand-blue)" strokeWidth="2.5" markerEnd="url(#arrow)" />
              <line x1="560" y1="130" x2="290" y2="200" stroke="var(--brand-terracotta)" strokeWidth="2.5" markerEnd="url(#arrowTerracotta)" />

              {/* Linha 3: Contestação */}
              <g transform="translate(430,200)">
                <rect className="node" width="260" height="90" />
                <text className="node-title" x="18" y="28">Contestação</text>
                <text className="node-sub" x="18" y="52">Gestão analisa e responde no portal</text>
              </g>

              {/* Linha 3: Pagamento */}
              <g transform="translate(700,200)">
                <rect className="node" width="240" height="90" />
                <text className="node-title" x="18" y="28">Pagamento</text>
                <text className="node-sub" x="18" y="52">Upload do comprovante</text>
                <rect x="150" y="60" width="80" height="20" fill="var(--brand-blue)" rx="10"/>
                <text className="pill" x="172" y="74">PAID</text>
              </g>

              {/* Linha 3: Sem resposta */}
              <g transform="translate(160,200)">
                <rect className="node" width="260" height="90" />
                <text className="node-title" x="18" y="28">Sem resposta</text>
                <text className="node-sub" x="18" y="52">Após 7 dias</text>
              </g>

              {/* setas para resultados */}
              <line x1="560" y1="290" x2="560" y2="360" stroke="var(--brand-blue)" strokeWidth="2.5" markerEnd="url(#arrow)" />
              <line x1="820" y1="245" x2="900" y2="245" stroke="var(--brand-blue)" strokeWidth="2.5" markerEnd="url(#arrow)" />
              <line x1="290" y1="245" x2="120" y2="245" stroke="var(--brand-terracotta)" strokeWidth="2.5" markerEnd="url(#arrowTerracotta)" />

              {/* Linha 4: Decisão da gestão */}
              <g transform="translate(430,360)">
                <rect className="node" width="260" height="120" />
                <text className="node-title" x="18" y="28">Decisão</text>
                <text className="node-sub" x="18" y="52">Aprovada: sem débito</text>
                <text className="node-sub" x="18" y="72">Rejeitada: volta a pagar/offset</text>
              </g>

              {/* Resultado: Liquidada */}
              <g transform="translate(900,200)">
                <rect className="node" width="260" height="90" />
                <text className="node-title" x="18" y="28">Liquidada</text>
                <text className="node-sub" x="18" y="52">Cobrança encerrada</text>
              </g>

              {/* Resultado: Offset */}
              <g transform="translate(0,200)">
                <rect className="node" width="140" height="90" />
                <text className="node-title" x="18" y="28">Offset</text>
                <text className="node-sub" x="18" y="52">Desconto em reserva futura</text>
              </g>
            </svg>
          </div>
          <p className="sr-only">
            Fluxo: Emissão → Janela de 7 dias → (Contestação → Decisão / Pagamento → Liquidada / Sem resposta → Offset).
          </p>
        </div>
      </div>

      {/* Acordeão - Regras completas */}
      <div id="regras-completas" className="mt-6 bg-[var(--brand-bg)] rounded-2xl border border-slate-200 p-5 md:p-6">
        <details>
          <summary className="cursor-pointer text-base md:text-lg font-semibold"
                   style={{color:"var(--brand-blue)"}}>
            Regras completas
          </summary>
          <div className="mt-3 text-sm md:text-base text-slate-800 space-y-3">
            <p>
              Em cada cobrança você verá: <strong>valor total</strong> da manutenção, <strong>aporte da gestão</strong> (quando houver),
              <strong> valor devido</strong>, <strong>justificativa</strong> e <strong>anexos</strong>. Você tem <strong>7 dias</strong> corridos para
              <strong> contestar</strong> ou <strong>pagar/anexar comprovante</strong>. Sem resposta no prazo, poderemos
              <strong> compensar o valor em reservas futuras</strong>.
            </p>
            <p>
              Critérios para eventual aporte: relacionamento, resultados da unidade, custo/contexto e urgência/risco operacional.
              <em> Não há tabela fixa</em>; registramos a justificativa na própria cobrança.
            </p>
            <ul className="list-disc pl-5">
              <li><strong>Alta urgência/risco</strong>: objetivo é proteger reservas e avaliações — pode não haver aporte.</li>
              <li><strong>Serviços pequenos ou parceiros de longa data com ótimo resultado</strong>: podemos aportar parte do valor.</li>
            </ul>
            <hr className="my-3 border-slate-200"/>
            <h4 className="font-semibold">Hub de Manutenções</h4>
            <p>
              Acesse o <strong>Hub</strong> para ver todas as manutenções por unidade, com mídias, notas e
              <strong> gráficos por mês/ano</strong>. Filtre por período, tipo e status; exporte quando precisar.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <a href="/hub/manutencoes"
                 className="px-4 py-2 rounded-xl font-medium"
                 style={{background:"var(--brand-terracotta)", color:"#fff"}}>Abrir Hub</a>
              <a href="/tickets/new?tipo=contestacao"
                 className="px-4 py-2 rounded-xl font-medium border border-slate-300 bg-white">Contestar cobrança</a>
              <a href="/charges"
                 className="px-4 py-2 rounded-xl font-medium border border-slate-300 bg-white">Anexar comprovante</a>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
