import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, Building2, Sparkles, List, Search, FileText, MoreHorizontal, ClipboardList } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UnifiedCalendarWidget } from "@/components/UnifiedCalendarWidget";
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
import { GlobalSearch, useGlobalSearch } from "@/components/GlobalSearch";
import { EnablePushNative } from "@/components/EnablePushNative";
import { AIConsultaWidget } from "@/components/AIConsultaWidget";

import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PainelResumo } from "@/components/painel/PainelResumo";
import { PainelAtalhos } from "@/components/painel/PainelAtalhos";
import { DetailSheet } from "@/components/detail-sheet/DetailSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function Painel() {
  useScrollRestoration();
  const { profile, user, signOut } = useAuth();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearch();
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

  const isTeam =
    profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance";

  const {
    open: detailSheetOpen,
    entityId: detailEntityId,
    entityType: detailEntityType,
    openSheet,
    closeSheet,
  } = useDetailSheet();

  const [lembreteHospedeAberto, setLembreteHospedeAberto] = useState(false);
  const abrirLembreteHospede = useCallback(() => {
    setLembreteHospedeAberto(true);
    requestAnimationFrame(() =>
      document.getElementById("lembrete-hospede")?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, []);

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
                    <DropdownMenuItem onClick={() => navigate("/admin/vistorias/rotina")}>
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Vistorias de rotina
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
                <button
                  type="button"
                  aria-label="Meu perfil"
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {photoUrl ? (
                    <img 
                      src={photoUrl} 
                      alt={profile?.name || "User"} 
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-medium">
                      {profile?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium hidden sm:inline">{profile?.name}</span>
                </button>
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
      <main className="container mx-auto flex flex-col gap-6 px-4 py-6 md:py-8">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Painel</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>

        {/* 1. Números do dia — cada um leva à tela correspondente */}
        {isTeam && <PainelResumo onAbrirHospede={abrirLembreteHospede} />}

        {/* 2. Avisos e votações (só aparecem quando existem) */}
        <AlertBanner />
        <VotacoesPendentes />

        {/* 3. Operações — o trabalho do dia */}
        {isTeam && (
          <section aria-labelledby="titulo-operacoes" className="flex min-w-0 flex-col gap-3">
            <TituloSecao id="titulo-operacoes" titulo="Operações" subtitulo="Manutenções, cobranças, chamados e vistorias" />
            <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
              <MaintenanceKanbanPreview />
              <ChargesKanbanPreview />
              <ChamadosKanbanPreview />
              <VistoriasKanbanPreview />
            </div>
            {/* Lembrete compacto: uma linha fechado, lista completa aberto */}
            <GuestChargeReminders
              open={lembreteHospedeAberto}
              onOpenChange={setLembreteHospedeAberto}
              onOpenDetail={openSheet}
            />
          </section>
        )}

        {/* 4. Atalhos — tudo o que era espalhado em cinco seções */}
        {isTeam && (
          <section aria-labelledby="titulo-atalhos" className="flex min-w-0 flex-col gap-3">
            <TituloSecao id="titulo-atalhos" titulo="Atalhos" subtitulo="Criar, consultar e configurar" />
            <PainelAtalhos />
          </section>
        )}
      </main>

      {/* Itens do lembrete de hóspede abrem aqui, sem sair do painel */}
      <DetailSheet
        open={detailSheetOpen}
        onClose={closeSheet}
        entityId={detailEntityId}
        entityType={detailEntityType}
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}

function TituloSecao({ id, titulo, subtitulo }: { id: string; titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="h-4 w-1 self-center rounded-full bg-primary" aria-hidden="true" />
      <h2 id={id} className="text-base font-semibold">
        {titulo}
      </h2>
      {subtitulo && <span className="text-xs text-muted-foreground">{subtitulo}</span>}
    </div>
  );
}
