import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Users, Ticket, AlertTriangle, CheckCircle2, Plus, DollarSign, Building2, Bell, Settings, Sparkles, UserPlus, Vote, Shield, Wrench, List, Search, FileText, Mail, BookOpen, Download, Calendar, BrainCircuit, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { UnifiedCalendarWidget } from "@/components/UnifiedCalendarWidget";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
import { GlobalSearch, useGlobalSearch } from "@/components/GlobalSearch";
import { ResponseTemplatesPanel } from "@/components/ResponseTemplatesPanel";
import { EnablePushNative } from "@/components/EnablePushNative";
import { AIConsultaWidget } from "@/components/AIConsultaWidget";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { StatsCard } from "@/components/StatsCard";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function Painel() {
  useScrollRestoration();
  const { profile, user, signOut } = useAuth();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch();
  const [stats, setStats] = useState({
    novos: 0,
    urgentes: 0,
    pendentes: 0,
    concluidos: 0,
  });
  const navigate = useNavigate();

  // Save scroll position when leaving, restore when returning
  useEffect(() => {
    const saved = sessionStorage.getItem('painel_scroll');
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
        sessionStorage.removeItem('painel_scroll');
      });
    }
    // Save scroll on unmount (SPA navigation)
    return () => {
      sessionStorage.setItem('painel_scroll', String(window.scrollY));
    };
  }, []);

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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0 overflow-x-hidden">
      {/* Global Search */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      
      {/* Team Chat Widget - Only for team members */}
      <TeamChatWidget />
      {/* AI Consulta Widget - team members */}
      {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
        <AIConsultaWidget />
      )}
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => navigate("/painel")}
                className="flex-shrink-0"
                aria-label="Início"
              >
                <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
              </button>

              {/* Ação primária — desktop apenas. No mobile fica no MobileBottomNav. */}
              {(profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance") && (
                <Button
                  variant="default"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => navigate("/novo-ticket-massa")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo ticket
                </Button>
              )}

              {/* Mais ações — desktop apenas */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                    <MoreHorizontal className="h-4 w-4 mr-2" />
                    Mais
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 bg-popover">
                  {profile?.role === "admin" && (
                    <DropdownMenuItem onClick={() => navigate("/admin/vistorias")}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Vistorias de faxina
                    </DropdownMenuItem>
                  )}
                  {profile?.role === "maintenance" && (
                    <DropdownMenuItem onClick={() => navigate("/admin/vistorias")}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Vistorias de faxina
                    </DropdownMenuItem>
                  )}
                  {(profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance") && (
                    <DropdownMenuItem onClick={() => navigate("/resumo-propriedades")}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Resumo por propriedade
                    </DropdownMenuItem>
                  )}
                  {(profile?.role === "admin" || profile?.role === "maintenance") && (
                    <DropdownMenuItem onClick={() => navigate("/admin/manutencoes-lista")}>
                      <List className="h-4 w-4 mr-2" />
                      Lista de manutenções
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {/* Search Button */}
              <Button
                variant="outline"
                className="hidden sm:flex items-center gap-2 text-muted-foreground h-9"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">Buscar...</span>
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
              
              {(profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance") && (
                <UnifiedCalendarWidget />
              )}
              
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
              <DialogContent className="max-w-xs sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-base">Meu Perfil</DialogTitle>
                </DialogHeader>
                  <div className="space-y-3 py-2">
                    <AvatarUpload 
                      userId={user?.id || ''}
                      currentPhotoUrl={photoUrl}
                      userName={profile?.name || 'User'}
                      onUploadComplete={(url) => setPhotoUrl(url)}
                    />
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Nome</label>
                    <p className="text-sm">{profile?.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <p className="text-sm">{profile?.email}</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm">{profile?.phone || "Não informado"}</p>
                  </div>
                  
                  <ChangePasswordDialog />

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/debug-app")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Debug do App
                  </Button>
                  
                  {/* Push Notifications - Native only */}
                  <EnablePushNative />
                  
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
        {/* Banners de acesso rápido */}
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <div 
            onClick={() => navigate("/rotina-profissional")}
            className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 cursor-pointer hover:bg-primary/10 transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Rotina do Profissional RIOS</p>
              <p className="text-xs text-muted-foreground">Guia completo de organização e manutenção</p>
            </div>
            <span className="text-xs text-primary font-medium flex-shrink-0">Ver →</span>
          </div>
          <div 
            onClick={() => navigate("/protocolo-trabalho")}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border cursor-pointer hover:bg-muted transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Protocolo de Manutenções</p>
              <p className="text-xs text-muted-foreground">Fluxo de vistorias, manutenções e cobranças</p>
            </div>
            <span className="text-xs text-muted-foreground font-medium flex-shrink-0">Ver →</span>
          </div>
        </div>

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

        {/* Kanban Boards - masonry layout (cada card só ocupa a altura do seu conteúdo) */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6 min-w-0 columns-1 md:columns-2 lg:columns-4 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
            <MaintenanceKanbanPreview />
            <ChargesKanbanPreview />
            <VistoriasKanbanPreview />
            <ChamadosKanbanPreview />
          </div>
        )}

        {/* Booking Comissões */}
        {(profile?.role === "admin" || profile?.role === "agent") && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Comissões Booking
              </h3>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/booking-comissoes")}>
                Ver tudo →
              </Button>
            </div>
            <Card
              className="cursor-pointer hover:shadow-md transition-all border-primary/20 bg-primary/5"
              onClick={() => navigate("/booking-comissoes")}
            >
              <CardContent className="py-4 px-4">
                <p className="text-sm text-muted-foreground">
                  Gerencie cobranças de comissão e taxa de limpeza de reservas recebidas diretamente pelos proprietários via Booking.com.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); navigate("/nova-comissao-booking"); }}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Nova Comissão
                  </Button>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate("/admin/relatorio-booking"); }}>
                    Relatório
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}


        {/* Insights IA */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6">
            <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              Insights
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card 
                className="cursor-pointer hover-lift group border-info/30 hover:border-info/30 dark:hover:border-info/30 transition-colors"
                onClick={() => navigate("/calendario-reservas")}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center group-hover:bg-info/20 transition-colors">
                      <Calendar className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Calendário & Ocupação</CardTitle>
                      <CardDescription className="text-xs">
                        Organize manutenções, veja disponibilidade e ocupação
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card
                className="cursor-pointer hover-lift group border-primary/20 hover:border-primary/40 transition-colors"
                onClick={() => navigate("/admin/relatorios-financeiros")}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Relatórios Financeiros</CardTitle>
                      <CardDescription className="text-xs">
                        Consulte relatórios por proprietário
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card
                className="cursor-pointer hover-lift group border-primary/20 hover:border-primary/40 transition-colors"
                onClick={() => navigate("/admin/fichas-imoveis")}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Fichas dos Imóveis</CardTitle>
                      <CardDescription className="text-xs">
                        Documentação completa em Markdown (contexto da IA)
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>
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
        <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Novos"
            value={stats.novos}
            description="Tickets recém-criados"
            icon={<Ticket className="h-4 w-4 text-info" />}
            iconBgColor="bg-info/10"
            borderColor="border-l-blue-500"
            delay={0}
            onClick={() => navigate("/todos-tickets?status=novo")}
          />
          <StatsCard
            title="Urgentes"
            value={stats.urgentes}
            description="Prioridade alta"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            iconBgColor="bg-destructive/10"
            borderColor="border-l-red-500"
            delay={0.1}
            onClick={() => navigate("/todos-tickets?priority=urgente")}
          />
          <StatsCard
            title="Em Andamento"
            value={stats.pendentes}
            description="Aguardando conclusão"
            icon={<Users className="h-4 w-4 text-warning" />}
            iconBgColor="bg-warning/10"
            borderColor="border-l-yellow-500"
            delay={0.2}
          />
          <StatsCard
            title="Concluídos"
            value={stats.concluidos}
            description="Total finalizado"
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            iconBgColor="bg-success/10"
            borderColor="border-l-green-500"
            delay={0.3}
          />
        </div>

        {/* Quick Actions - Outras Ações - Admin and team */}
        {(profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance") && (
          <div>
            <h3 className="mb-4 text-xl font-semibold">Outras Ações</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Tutoriais */}
              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/tutoriais")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center group-hover:bg-success/20 transition-colors">
                      <BookOpen className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Tutoriais</CardTitle>
                      <CardDescription className="text-xs">
                        Guias completos do sistema
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Templates de Resposta */}
              <ResponseTemplatesPanel 
                triggerElement={
                  <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Templates de Resposta</CardTitle>
                          <CardDescription className="text-xs">
                            Gerenciar respostas rápidas
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                }
              />

              {/* Templates de Email - Admin only */}
              {profile?.role === "admin" && (
                <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/configuracao-email")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Templates de Email</CardTitle>
                        <CardDescription className="text-xs">
                          Configurar templates de email
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              )}
              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/admin/cadastrar-proprietario")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Cadastrar Proprietário</CardTitle>
                      <CardDescription className="text-xs">
                        Criar nova conta pendente de aprovação
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/admin/cadastrar-faxineira")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Cadastrar Faxineira</CardTitle>
                      <CardDescription className="text-xs">
                        Criar nova conta de faxineira
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/admin/cadastrar-equipe")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                      <Users className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Cadastrar Equipe</CardTitle>
                      <CardDescription className="text-xs">
                        Adicionar atendente ou manutenção
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/admin/gerenciar-usuarios")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                      <Shield className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Gerenciar Usuários</CardTitle>
                      <CardDescription className="text-xs">
                        Visualizar e gerenciar todas as contas
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/aprovacoes")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Aprovações Pendentes</CardTitle>
                      <CardDescription className="text-xs">
                        Gerencie solicitações de cadastro
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={() => navigate("/propriedades")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                      <Building2 className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Gerenciar Unidades</CardTitle>
                      <CardDescription className="text-xs">
                        Cadastrar e gerenciar propriedades
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Fichas dos Imóveis movidas para a seção Insights */}

              {/* Calendário de Reservas moved to Insights section */}

              <Card className="cursor-pointer hover-lift group border-transparent hover:border-primary/20" onClick={async () => {
                try {
                  const { data, error } = await supabase
                    .from("profiles")
                    .select("name, phone")
                    .in("role", ["owner", "pending_owner"])
                    .not("phone", "is", null)
                    .neq("phone", "")
                    .order("name");
                  
                  if (error) throw error;
                  if (!data || data.length === 0) {
                    toast.error("Nenhum contato encontrado");
                    return;
                  }

                  const vcards = data.map(p => {
                    const fullName = `${p.name} Proprietário`;
                    const phone = (p.phone || "").replace(/[^\d+]/g, "");
                    return [
                      "BEGIN:VCARD",
                      "VERSION:3.0",
                      `FN:${fullName}`,
                      `N:Proprietário;${p.name};;;`,
                      `TEL;TYPE=CELL:${phone}`,
                      `ORG:RIOS`,
                      "END:VCARD"
                    ].join("\r\n");
                  }).join("\r\n");

                  const blob = new Blob([vcards], { type: "text/vcard;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "proprietarios-rios.vcf";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`${data.length} contatos exportados!`);
                } catch (err) {
                  console.error("Erro ao exportar contatos:", err);
                  toast.error("Erro ao exportar contatos");
                }
              }}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center group-hover:bg-success/20 transition-colors">
                      <Download className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Exportar Contatos</CardTitle>
                      <CardDescription className="text-xs">
                        Baixar vCard dos proprietários
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        )}
      </main>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}