import { useLocation, useNavigate } from "react-router-dom";
import { Home, Ticket, DollarSign, Wrench, Plus, X, BarChart3, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type NavItem = {
  icon: typeof Home;
  label: string;
  path: string;
  roles?: string[];
};

const mainItems: NavItem[] = [
  { icon: Home, label: "Início", path: "/painel", roles: ["admin", "maintenance", "agent"] },
  { icon: Home, label: "Início", path: "/minha-caixa", roles: ["owner"] },
  { icon: Ticket, label: "Tickets", path: "/todos-tickets" },
  { icon: Wrench, label: "Manutenções", path: "/admin/manutencoes-lista", roles: ["admin", "maintenance"] },
  { icon: Wrench, label: "Relatório", path: "/manutencoes", roles: ["owner"] },
  { icon: ClipboardCheck, label: "Vistorias", path: "/admin/vistorias/todas", roles: ["admin", "maintenance", "agent"] },
  { icon: DollarSign, label: "Cobranças", path: "/minhas-cobrancas", roles: ["owner"] },
];

const quickActions: NavItem[] = [
  { icon: Ticket, label: "Novo Ticket", path: "/novo-ticket-massa", roles: ["admin", "maintenance", "agent"] },
  { icon: Ticket, label: "Novo Chamado", path: "/novo-ticket", roles: ["owner"] },
  { icon: Wrench, label: "Nova Manutenção", path: "/admin/nova-manutencao", roles: ["admin", "maintenance"] },
  { icon: Wrench, label: "Relatório Manutenções", path: "/manutencoes", roles: ["owner"] },
  { icon: BarChart3, label: "Resumo Propriedades", path: "/resumo-propriedades", roles: ["owner"] },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [showQuickActions, setShowQuickActions] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const userRole = profile?.role;

  const filteredMainItems = useMemo(() => {
    if (!userRole) return [];
    return mainItems
      .filter((item) => !item.roles || item.roles.includes(userRole))
      .slice(0, 4);
  }, [userRole]);

  const filteredQuickActions = useMemo(() => {
    if (!userRole) return [];
    return quickActions.filter((item) => !item.roles || item.roles.includes(userRole));
  }, [userRole]);

  if (!profile) return null;
  if (typeof document === "undefined") return null;

  // Render in a portal to escape any transformed/scrolling ancestors (common in mobile WebViews)
  // that can break `position: fixed`.
  return createPortal(
    <>
      {/* Backdrop for quick actions */}
      <AnimatePresence>
        {showQuickActions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setShowQuickActions(false)}
          />
        )}
      </AnimatePresence>

      {/* Quick Actions Menu */}
      <AnimatePresence>
        {showQuickActions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-2xl shadow-xl p-2 space-y-1 min-w-[200px] md:hidden"
          >
            {filteredQuickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => {
                  navigate(action.path);
                  setShowQuickActions(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium">{action.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t safe-area-bottom md:hidden">
        <div className="flex items-center justify-around px-2 py-1">
          {filteredMainItems.slice(0, 2).map((item) => (
            <NavButton
              key={item.path}
              item={item}
              isActive={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}

          {/* FAB Button */}
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className={cn(
              "relative -mt-6 h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300",
              showQuickActions ? "bg-destructive rotate-45" : "bg-primary hover:bg-primary/90"
            )}
          >
            <motion.div animate={{ rotate: showQuickActions ? 45 : 0 }} transition={{ duration: 0.2 }}>
              {showQuickActions ? (
                <X className="h-6 w-6 text-white" />
              ) : (
                <Plus className="h-6 w-6 text-white" />
              )}
            </motion.div>
          </button>

          {filteredMainItems.slice(2, 4).map((item) => (
            <NavButton
              key={item.path}
              item={item}
              isActive={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>
      </nav>
    </>,
    document.body
  );
}

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center py-2 px-3 rounded-xl transition-all duration-200 min-w-[60px]",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <motion.div
        animate={{ scale: isActive ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
      </motion.div>
      <span className={cn("text-[10px] mt-0.5 font-medium", isActive && "text-primary")}>
        {item.label}
      </span>
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute bottom-1 h-1 w-6 bg-primary rounded-full"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
}

