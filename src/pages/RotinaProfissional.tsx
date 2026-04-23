import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Wrench,
  PackagePlus,
  LayoutGrid,
  Paperclip,
  MessageSquare,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Users,
  FileText,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Calendar,
  DollarSign,
  Eye,
  Timer,
  MapPin,
} from "lucide-react";
import { useState } from "react";

interface SubItem {
  icon: React.ElementType;
  text: string;
  highlight?: boolean;
  badge?: string;
}

interface Phase {
  id: number;
  emoji: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  border: string;
  iconBg: string;
  dot: string;
  items: SubItem[];
  links?: { label: string; href: string }[];
}

const phases: Phase[] = [
  {
    id: 1,
    emoji: "📋",
    icon: PackagePlus,
    title: "Criar a manutenção",
    subtitle: "Quando e como registrar",
    color: "text-info",
    bg: "bg-info/10 dark:bg-blue-950/30",
    border: "border-info/30",
    iconBg: "bg-info/10 dark:bg-blue-900/50",
    dot: "bg-info",
    items: [
      { icon: Smartphone, text: "Pode vir de uma vistoria, de um pedido via WhatsApp, do proprietário ou de algo que você mesmo notou" },
      { icon: FileText, text: "Registre o que for pertinente — não precisa colocar tudo que chega no WhatsApp" },
      { icon: AlertTriangle, text: "Hóspede afetado agora ou chegada em até 48h? Prioridade máxima — ar-condicionado, chuveiro, fechadura, internet", highlight: true, badge: "URGENTE" },
      { icon: User, text: "Custo responsável: Proprietário, Gestão ou Hóspede — você define depois, não agora" },
    ],
    links: [{ label: "Nova manutenção", href: "/admin/nova-manutencao" }],
  },
  {
    id: 2,
    emoji: "🗂️",
    icon: LayoutGrid,
    title: "Triagem pós-vistoria",
    subtitle: "Use o Kanban do imóvel",
    color: "text-primary",
    bg: "bg-primary/10 dark:bg-violet-950/30",
    border: "border-primary/30",
    iconBg: "bg-primary/10 dark:bg-violet-900/50",
    dot: "bg-primary",
    items: [
      { icon: LayoutGrid, text: "Após vistoria, use o botão 'Importar para Kanban do imóvel' para ver todos os problemas encontrados de uma só vez" },
      { icon: CheckCircle2, text: "Escolha quais manutenções vai resolver agora e agende os serviços para cada responsável" },
      { icon: Clock, text: "Deixe as demais como pendentes — ficam salvas e você não esquece nenhuma, tanto no Kanban do imóvel quanto no Kanban geral" },
    ],
    links: [{ label: "Resumo por imóvel", href: "/resumo-propriedades" }],
  },
  {
    id: 3,
    emoji: "🔧",
    icon: Wrench,
    title: "Durante a manutenção",
    subtitle: "Acompanhe do seu jeito",
    color: "text-success",
    bg: "bg-success/10 dark:bg-green-950/30",
    border: "border-success/30",
    iconBg: "bg-success/10 dark:bg-green-900/50",
    dot: "bg-success",
    items: [
      { icon: Paperclip, text: "Anexe fotos, vídeos e comprovantes quando tiver — sem precisar adicionar nota toda vez" },
      { icon: FileText, text: "Quer deixar uma observação importante? Anote para a sua organização — não é obrigatório" },
      { icon: Eye, text: "O histórico fica salvo automaticamente para consultas futuras" },
    ],
    links: [{ label: "Ver manutenções", href: "/admin/manutencoes" }],
  },
  {
    id: 4,
    emoji: "💬",
    icon: MessageSquare,
    title: "Comunicação",
    subtitle: "Com proprietário, equipe e hóspede",
    color: "text-warning",
    bg: "bg-warning/10 dark:bg-amber-950/30",
    border: "border-warning/30",
    iconBg: "bg-warning/10 dark:bg-amber-900/50",
    dot: "bg-warning",
    items: [
      { icon: MessageSquare, text: "Precisar envolver o proprietário numa decisão? Habilite o chat para ele conversar diretamente pelo sistema" },
      { icon: DollarSign, text: "Proprietário contestou um valor? Responde no chat da cobrança e ajusta o aporte se fizer sentido" },
      { icon: Users, text: "Equipe de rua: troca de informações e mídias via WhatsApp" },
      { icon: Smartphone, text: "Contato direto com hóspede ou Airbnb só quando for realmente necessário", badge: "EXCEÇÃO" },
    ],
    links: [{ label: "Ver chamados", href: "/todos-tickets" }],
  },
  {
    id: 5,
    emoji: "💰",
    icon: CreditCard,
    title: "Cobrança",
    subtitle: "Depois que concluir",
    color: "text-destructive",
    bg: "bg-destructive/10 dark:bg-rose-950/30",
    border: "border-destructive/30",
    iconBg: "bg-destructive/10 dark:bg-rose-900/50",
    dot: "bg-destructive",
    items: [
      { icon: CheckCircle2, text: "Manutenção concluída? Cria a cobrança no RIOS com o valor do serviço e o aporte de gestão — autonomia orientada por Paulo Henrique inicialmente" },
      { icon: Calendar, text: "Hóspede causou dano? Cobre pela plataforma (Airbnb, Booking etc.) após 14 dias do check-out — registre o dia do check-out ao criar a manutenção", badge: "14 DIAS" },
      { icon: Timer, text: "Proprietário não pagou em 10 dias? Use a calculadora de débito em reserva para calcular o percentual. Paulo Henrique orienta — autonomia prevista para 2027", badge: "10 DIAS" },
      { icon: MapPin, text: "Dúvida sobre o valor do aporte? Consulte o histórico ou pergunte para a equipe" },
    ],
    links: [
      { label: "Gerenciar cobranças", href: "/gerenciar-cobrancas" },
      { label: "Nova cobrança", href: "/nova-cobranca" },
    ],
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, x: -24, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.07, duration: 0.3 },
  }),
};

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const Icon = phase.icon;

  return (
    <motion.div variants={cardVariants} className="relative">
      {/* Timeline dot + line */}
      <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center w-8 select-none pointer-events-none">
        <div className={`w-3 h-3 rounded-full mt-5 z-10 ring-2 ring-background ${phase.dot}`} />
        {index < phases.length - 1 && (
          <div className="w-0.5 flex-1 bg-border mt-1" />
        )}
      </div>

      {/* Card */}
      <div className={`ml-10 mb-4 rounded-2xl border overflow-hidden ${phase.bg} ${phase.border}`}>
        {/* Header — always visible, clickable */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full text-left"
        >
          <div className="flex items-center gap-3 p-4">
            <div className={`flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-xl ${phase.iconBg}`}>
              {phase.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-sm ${phase.color}`}>{phase.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${phase.iconBg} ${phase.color} opacity-80`}>
                  Passo {phase.id}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{phase.subtitle}</p>
            </div>
            <div className={`flex-shrink-0 ${phase.color} opacity-60`}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </button>

        {/* Expandable body */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-2">
                <div className={`h-px w-full ${phase.border} border-t`} />
                <motion.ul
                  className="space-y-2.5 pt-1"
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
                >
                  {phase.items.map((item, i) => {
                    const ItemIcon = item.icon;
                    return (
                      <motion.li
                        key={i}
                        custom={i}
                        variants={itemVariants}
                        className={`flex items-start gap-2.5 rounded-xl p-2.5 ${
                          item.highlight
                            ? "bg-destructive/10 border border-destructive/20"
                            : "bg-background/50"
                        }`}
                      >
                        <ItemIcon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${phase.color}`} />
                        <span className="text-xs text-foreground/80 leading-relaxed flex-1">{item.text}</span>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              item.badge === "URGENTE"
                                ? "bg-destructive text-destructive-foreground"
                                : item.badge === "EXCEÇÃO"
                                ? "bg-muted text-muted-foreground"
                                : "bg-warning text-white"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </motion.li>
                    );
                  })}
                </motion.ul>

                {phase.links && phase.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {phase.links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg ${phase.iconBg} ${phase.color} hover:opacity-80 transition-opacity`}
                      >
                        {link.label}
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function RotinaProfissional() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => goBack(navigate)} className="mb-6 -ml-2">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4"
          >
            <Wrench className="h-8 w-8 text-primary" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Sua rotina no RIOS</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Toque em cada etapa para ver os detalhes. Simples, direto e sem burocracia.
          </p>

          {/* progress pills */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-1.5 mt-4"
          >
            {phases.map((p) => (
              <div key={p.id} className={`h-1.5 w-6 rounded-full ${p.dot} opacity-60`} />
            ))}
          </motion.div>
        </motion.div>

        {/* Timeline */}
        <div className="relative pl-4">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {phases.map((phase, index) => (
              <PhaseCard key={phase.id} phase={phase} index={index} />
            ))}
          </motion.div>
        </div>

        {/* Footer tip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="mt-6 rounded-2xl border border-dashed bg-muted/30 p-4 text-center"
        >
          <p className="text-xs text-muted-foreground">
            💡 <strong className="text-foreground">Dúvidas rápidas?</strong> Use o botão{" "}
            <span className="font-semibold text-primary">I.A</span> no painel para consultar
            pendências de qualquer imóvel na hora.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
