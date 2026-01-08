import { BarChart3, Receipt } from "lucide-react";


export default function TopChargesRules() {
  return (
    <section id="charges-rules" className="w-full">
      {/* Banner compacto */}
      <div className="w-full rounded-2xl p-5 md:p-6 bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl md:text-2xl font-semibold">Área de Cobranças</h2>
            <p className="mt-2 text-sm md:text-base opacity-95">
              Acompanhe cobranças com valor total, aporte da gestão e valor devido. Pague via Mercado Pago (débito automático), selecione várias cobranças de uma vez e parcele em até 12x com juros. Você tem 7 dias para contestar. Comprovante só é necessário se houver erro no débito automático. No relatório, acesse anexos dos serviços, histórico completo, separação por tipo de serviço e gráfico de gastos mensais.
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
          </div>
        </div>
      </div>
    </section>
  );
}
