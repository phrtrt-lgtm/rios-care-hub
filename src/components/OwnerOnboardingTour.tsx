import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Ticket, ClipboardCheck, DollarSign, Vote, BarChart3, X, ChevronRight, ChevronLeft } from "lucide-react";

const STORAGE_KEY = "owner_onboarding_v2_done";

const steps = [
  {
    icon: <Ticket className="h-10 w-10 text-primary" />,
    title: "Chamados",
    emoji: "🎫",
    description:
      "Abra um chamado para qualquer questão: bloquear datas, reportar problemas ou tirar dúvidas. Nossa equipe responde diretamente pelo chat do chamado.",
    tip: "Use o botão '+' no cabeçalho para abrir um novo chamado a qualquer momento.",
  },
  {
    icon: <ClipboardCheck className="h-10 w-10 text-emerald-600" />,
    title: "Vistorias",
    emoji: "🔍",
    description:
      "Acompanhe os relatórios fotográficos das vistorias de limpeza e rotina. Cada relatório documenta o estado do imóvel com fotos e observações da equipe.",
    tip: "Vistorias de rotina são feitas periodicamente para garantir a qualidade do seu imóvel.",
  },
  {
    icon: <DollarSign className="h-10 w-10 text-amber-600" />,
    title: "Cobranças & Manutenções",
    emoji: "💰",
    description:
      "Veja o histórico completo de manutenções, quanto a RIOS já aportou no seu imóvel e o valor que cabe a você. Pague via PIX ou em até 12x no cartão.",
    tip: "Você tem 7 dias para contestar qualquer cobrança diretamente pelo chat.",
  },
  {
    icon: <Vote className="h-10 w-10 text-purple-600" />,
    title: "Votações & Alertas",
    emoji: "🗳️",
    description:
      "Participe das decisões do seu imóvel: aprove propostas de melhorias, compra de itens e manutenções — e já pague pelo sistema em até 12x via MercadoPago. Desde outubro de 2025, realizamos manutenções preventivas para proteger seu patrimônio: no verão, com diárias mais altas, qualquer problema pode gerar avaliação negativa, cancelamento e reembolso de 30% ao hóspede — o que afeta diretamente seu rendimento. Boa parte dessas manutenções é custeada por nós (aporte de gestão). Quando há custo compartilhado, você vê exatamente cada parte.",
    tip: "Fique atento ao sino de notificações para não perder votações com prazo.",
  },
  {
    icon: <BarChart3 className="h-10 w-10 text-yellow-500" />,
    title: "Relatório de Manutenções",
    emoji: "📊",
    description:
      "Acompanhe o histórico completo de manutenções do seu imóvel: quanto a RIOS já aportou, o valor que coube a você, gráficos mensais de gastos e distribuição por tipo de serviço.",
    tip: "No relatório você também acessa os anexos (fotos, notas fiscais) de cada serviço realizado.",
  },
];

export function OwnerOnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so the page loads first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={finish} />

          {/* Card */}
          <motion.div
            className="relative z-10 w-full max-w-md rounded-2xl bg-card border shadow-2xl overflow-hidden"
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <motion.div
                className="h-1 bg-primary"
                animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Close */}
            <button
              onClick={finish}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="p-6 space-y-4"
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0">
                    {current.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {step + 1} de {steps.length}
                    </p>
                    <h2 className="text-xl font-bold">{current.emoji} {current.title}</h2>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {current.description}
                </p>

                {/* Tip */}
                <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3">
                  <p className="text-xs text-primary font-medium">💡 {current.tip}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Footer */}
            <div className="px-6 pb-6 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(s => s - 1)}
                disabled={step === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>

              {/* Dots */}
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>

              {isLast ? (
                <Button size="sm" onClick={finish}>
                  Começar!
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(s => s + 1)}>
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
