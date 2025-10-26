import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut } from "lucide-react";
import { TicketList } from "@/components/TicketList";

export default function MinhaCaixa() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="RIOS" className="h-8" />
            <h1 className="text-xl font-semibold">Minha Caixa</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile?.name}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Meus Chamados</h2>
            <p className="text-muted-foreground">
              Acompanhe seus tickets e solicitações
            </p>
          </div>
          <Button onClick={() => navigate("/novo-ticket")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Chamado
          </Button>
        </div>

        <TicketList />
      </main>
    </div>
  );
}