import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Users, Ticket, AlertTriangle, CheckCircle2, Plus, DollarSign, Building2, Bell, Settings, Sparkles, UserPlus, Vote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { EnablePushNative } from "@/components/EnablePushNative";

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
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            {/* Logo e Título */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <img src="/logo.png" alt="RIOS" className="h-6 md:h-8 flex-shrink-0" />
              <h1 className="text-base md:text-xl font-semibold truncate">
                Painel <span className="hidden sm:inline">Administrativo</span>
              </h1>
            </div>
            
            {/* Perfil e Ações */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
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
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex items-center gap-2 max-w-[140px] md:max-w-none"
                  >
                    <Badge variant="secondary" className="text-xs hidden sm:flex">
                      {profile?.role === "admin" 
                        ? "Admin" 
                        : profile?.role === "maintenance" 
                        ? "Manutenção" 
                        : "Atendente"}
                    </Badge>
                    <span className="truncate text-xs md:text-sm">
                      {profile?.name && profile.name.length > 12 
                        ? `${profile.name.substring(0, 12)}...` 
                        : profile?.name
                      }
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Meu Perfil</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      {user && profile && (
                        <AvatarUpload
                          userId={user.id}
                          currentPhotoUrl={photoUrl}
                          userName={profile.name}
                          onUploadComplete={(url) => setPhotoUrl(url)}
                        />
                      )}
                      <div className="mt-6 space-y-4">
                        <div>
                          <span className="text-sm font-medium">Nome:</span>
                          <p className="text-muted-foreground">{profile?.name}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Email:</span>
                          <p className="text-muted-foreground">{profile?.email}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Função:</span>
                          <p className="text-muted-foreground">
                            {profile?.role === "admin" 
                              ? "Administrador" 
                              : profile?.role === "maintenance" 
                              ? "Manutenção" 
                              : "Atendente"}
                          </p>
                        </div>
                        <div className="pt-4 border-t">
                          <ChangePasswordDialog />
                        </div>
                      </div>
                    </div>
                </DialogContent>
              </Dialog>
              
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Sair</span>
              </Button>
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

        {/* Ações Principais - Destaque no Topo */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Button 
            size="lg" 
            className="h-20 text-lg font-semibold"
            onClick={() => navigate("/todos-tickets")}
          >
            <Ticket className="mr-3 h-6 w-6" />
            Ver Todos os Tickets
          </Button>
          
          <Button 
            size="lg" 
            className="h-20 text-lg font-semibold"
            onClick={() => navigate("/gerenciar-cobrancas")}
          >
            <DollarSign className="mr-3 h-6 w-6" />
            Gerenciar Cobranças
          </Button>

          <Button 
            size="lg" 
            className="h-20 text-lg font-semibold"
            onClick={() => navigate("/novo-alerta")}
            variant="secondary"
          >
            <Bell className="mr-3 h-6 w-6" />
            Criar Alerta
          </Button>

          <Button 
            size="lg" 
            className="h-20 text-lg font-semibold"
            onClick={() => navigate("/novo-ticket-massa")}
            variant="secondary"
          >
            <Ticket className="mr-3 h-6 w-6" />
            Criar Tickets
          </Button>

          <Button 
            size="lg" 
            className="h-20 text-lg font-semibold"
            onClick={() => navigate("/nova-proposta-votacao")}
            variant="secondary"
          >
            <Vote className="mr-3 h-6 w-6" />
            Criar Votação
          </Button>
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

        {/* Quick Actions - Outras Ações */}
        <div>
          <h3 className="mb-4 text-xl font-semibold">Outras Ações</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {profile?.role === "admin" && (
            <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate("/admin/cadastrar-usuario")}>
              <CardHeader>
                <CardTitle>Cadastrar Usuário</CardTitle>
                <CardDescription>
                  Criar nova conta no sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              </CardContent>
            </Card>
          )}

          {profile?.role === "admin" && (
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
          )}

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

        {/* Notificações Push */}
        <div className="mt-8">
          <EnablePushNative />
        </div>
      </main>
    </div>
  );
}