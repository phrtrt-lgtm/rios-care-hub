import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Users, Ticket, AlertTriangle, CheckCircle2, Plus, DollarSign, Building2, Bell, Settings, Sparkles, UserPlus, Vote, Shield, Wrench, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { VotacoesPendentes } from "@/components/VotacoesPendentes";
import { MaintenanceKanbanPreview } from '@/components/MaintenanceKanbanPreview';
import { ChamadosKanbanPreview } from '@/components/ChamadosKanbanPreview';
import { VistoriasKanbanPreview } from '@/components/VistoriasKanbanPreview';
import { ChargesKanbanPreview } from '@/components/ChargesKanbanPreview';
import { GuestChargeReminders } from "@/components/GuestChargeReminders";
import { NotificationButton } from "@/components/NotificationButton";
import { TeamChatWidget } from "@/components/TeamChatWidget";
export default function Painel() {
  const { profile, user, signOut } = useAuth();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);
  const [stats, setStats] = useState({
    novos: 0,
    urgentes: 0,
    pendentes: 0,
    concluidos: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data: tickets } = await supabase
      .from("tickets")
      .select("status, priority");

    if (tickets) {
      setStats({
        novos: tickets.filter((t) => t.status === "novo").length,
        urgentes: tickets.filter((t) => t.priority === "urgente").length,
        pendentes: tickets.filter((t) =>
          ["novo", "em_analise", "aguardando_info", "em_execucao"].includes(t.status)
        ).length,
        concluidos: tickets.filter((t) => t.status === "concluido").length,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Team Chat Widget - Only for team members */}
      <TeamChatWidget />
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
              
              {profile?.role === "admin" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/admin/vistorias")}
                    title="Vistorias de Faxina"
                  >
                    <Sparkles className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/configuracao-email")}
                    title="Configurar Templates de Email"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </>
              )}
              
              {(profile?.role === "admin" || profile?.role === "maintenance") && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/admin/manutencoes-lista")}
                  title="Lista de Manutenções e Vistorias"
                >
                  <List className="h-5 w-5" />
                </Button>
              )}
              
              {profile?.role === "maintenance" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/admin/vistorias")}
                  title="Vistorias de Faxina"
                >
                  <Sparkles className="h-5 w-5" />
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <NotificationButton />
              
              <Dialog>
              <DialogTrigger asChild>
                <div className="flex items-center gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white px-3 py-2 rounded-lg cursor-pointer transition-colors">
                  {photoUrl ? (
                    <img 
                      src={photoUrl} 
                      alt={profile?.name || "User"} 
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
                      {profile?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium hidden sm:inline">{profile?.name}</span>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Meu Perfil</DialogTitle>
                </DialogHeader>
                  <div className="space-y-4 py-4">
                    <AvatarUpload 
                      userId={user?.id || ''}
                      currentPhotoUrl={photoUrl}
                      userName={profile?.name || 'User'}
                      onUploadComplete={(url) => setPhotoUrl(url)}
                    />
                  
                  <div>
                    <label className="text-sm font-medium">Nome</label>
                    <p className="text-base mt-1">{profile?.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <p className="text-base mt-1">{profile?.email}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Telefone</label>
                    <p className="text-base mt-1">{profile?.phone || "Não informado"}</p>
                  </div>
                  
                  <ChangePasswordDialog />
                  
                  <Button 
                    variant="destructive"
                    onClick={signOut}
                    className="w-full"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold">Dashboard</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Visão geral dos chamados e solicitações
          </p>
        </div>

        {/* Alert Banner */}
        <div className="mb-6">
          <AlertBanner />
        </div>

        {/* Propostas Pendentes */}
        <div className="mb-6">
          <VotacoesPendentes />
        </div>

        {/* Guest Charge Reminders - visible to team */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6">
            <GuestChargeReminders />
          </div>
        )}

        {/* Kanban Boards - 2 columns layout */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChamadosKanbanPreview />
            <VistoriasKanbanPreview />
            <MaintenanceKanbanPreview />
            <ChargesKanbanPreview />
          </div>
        )}

        {/* Ações de Criar */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold">Criar Novo</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {(profile?.role === "admin" || profile?.role === "maintenance") && (
                <Button 
                  size="lg" 
                  className="h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                  onClick={() => navigate("/admin/nova-manutencao")}
                >
                  <Wrench className="mr-3 h-5 w-5" />
                  Nova Manutenção
                </Button>
              )}

              <Button 
                size="lg" 
                className="h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                onClick={() => navigate("/novo-ticket-massa")}
              >
                <Ticket className="mr-3 h-5 w-5" />
                Novo Ticket
              </Button>

              {(profile?.role === "admin" || profile?.role === "maintenance") && (
                <>
                  <Button 
                    size="lg" 
                    className="h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                    onClick={() => navigate("/novo-ticket-interno")}
                  >
                    <Users className="mr-3 h-5 w-5" />
                    Novo Ticket Equipe
                  </Button>

                  <Button 
                    size="lg" 
                    className="h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                    onClick={() => navigate("/novo-alerta")}
                  >
                    <Bell className="mr-3 h-5 w-5" />
                    Novo Alerta
                  </Button>

                  <Button 
                    size="lg" 
                    className="h-16 text-sm font-semibold justify-start px-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                    onClick={() => navigate("/nova-proposta-votacao")}
                  >
                    <Vote className="mr-3 h-5 w-5" />
                    Nova Proposta
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Ações de Gerenciar */}
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-semibold">Gerenciar</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button 
              size="lg" 
              className="h-16 text-sm font-semibold"
              onClick={() => navigate("/todos-tickets")}
            >
              <Ticket className="mr-3 h-5 w-5" />
              Ver Todos os Tickets
            </Button>
            
            {(profile?.role === "admin" || profile?.role === "maintenance") && (
              <Button 
                size="lg" 
                className="h-16 text-sm font-semibold"
                onClick={() => navigate("/gerenciar-cobrancas")}
              >
                <DollarSign className="mr-3 h-5 w-5" />
                Gerenciar Cobranças
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Novos</CardTitle>
              <Ticket className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.novos}</div>
              <p className="text-xs text-muted-foreground">
                Tickets recém-criados
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.urgentes}</div>
              <p className="text-xs text-muted-foreground">
                Prioridade alta
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
              <Users className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendentes}</div>
              <p className="text-xs text-muted-foreground">
                Aguardando conclusão
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.concluidos}</div>
              <p className="text-xs text-muted-foreground">
                Total finalizado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Outras Ações - Admin only */}
        {profile?.role === "admin" && (
        <div>
          <h3 className="mb-4 text-xl font-semibold">Outras Ações</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/admin/cadastrar-proprietario")}>
              <CardHeader>
                <CardTitle>Cadastrar Proprietário</CardTitle>
                <CardDescription>
                  Criar nova conta pendente de aprovação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/admin/cadastrar-faxineira")}>
              <CardHeader>
                <CardTitle>Cadastrar Faxineira</CardTitle>
                <CardDescription>
                  Criar nova conta de faxineira
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Nova Faxineira
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/admin/cadastrar-equipe")}>
              <CardHeader>
                <CardTitle>Cadastrar Equipe</CardTitle>
                <CardDescription>
                  Adicionar atendente ou manutenção
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Novo Membro
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/admin/gerenciar-usuarios")}>
              <CardHeader>
                <CardTitle>Gerenciar Usuários</CardTitle>
                <CardDescription>
                  Visualizar e gerenciar todas as contas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <Shield className="mr-2 h-4 w-4" />
                  Ver Usuários
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/aprovacoes")}>
              <CardHeader>
                <CardTitle>Aprovações Pendentes</CardTitle>
                <CardDescription>
                  Gerencie solicitações de cadastro
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Ver Solicitações
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/propriedades")}>
              <CardHeader>
                <CardTitle>Gerenciar Unidades</CardTitle>
                <CardDescription>
                  Cadastrar e gerenciar propriedades
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <Building2 className="mr-2 h-4 w-4" />
                  Ver Unidades
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}