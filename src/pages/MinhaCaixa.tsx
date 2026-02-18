import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, DollarSign, ClipboardCheck, Ticket, BookOpen, Wrench, BarChart3 } from "lucide-react";
import { TicketList } from "@/components/TicketList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationButton } from "@/components/NotificationButton";
import { PropostasPendentesCompletas } from "@/components/PropostasPendentesCompletas";
import { supabase } from "@/integrations/supabase/client";

import { OwnerPropertiesSection } from "@/components/OwnerPropertiesSection";
import { OwnerScoreDisplay } from "@/components/OwnerScoreDisplay";
import { MaintenanceKanbanPreview } from "@/components/MaintenanceKanbanPreview";
import { OwnerMaintenanceProgress } from "@/components/OwnerMaintenanceProgress";
import { OwnerTicketsPreview } from "@/components/OwnerTicketsPreview";
import { OwnerChargesPreview } from "@/components/OwnerChargesPreview";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { motion } from "framer-motion";


export default function MinhaCaixa() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);
  const [hasInspectionAccess, setHasInspectionAccess] = useState(false);

  useEffect(() => {
    const checkInspectionAccess = async () => {
      if (!user) return;
      
      try {
        // Buscar propriedades do usuário
        const { data: properties, error: propError } = await supabase
          .from('properties')
          .select('id')
          .eq('owner_id', user.id);

        if (propError) throw propError;
        
        if (!properties || properties.length === 0) {
          setHasInspectionAccess(false);
          return;
        }

        // Verificar se alguma propriedade tem acesso ao portal habilitado
        const { data: settings, error: settingsError } = await supabase
          .from('inspection_settings')
          .select('owner_portal_enabled')
          .in('property_id', properties.map(p => p.id))
          .eq('owner_portal_enabled', true);

        if (settingsError) throw settingsError;

        setHasInspectionAccess(settings && settings.length > 0);
      } catch (error) {
        console.error('Error checking inspection access:', error);
        setHasInspectionAccess(false);
      }
    };

    checkInspectionAccess();
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0 overflow-x-hidden">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
              
              <Button
                onClick={() => navigate("/minhas-cobrancas")} 
                variant="ghost"
                size="icon"
              >
                <DollarSign className="h-5 w-5" />
              </Button>

              <Button 
                onClick={() => navigate("/meus-chamados")} 
                variant="ghost"
                size="icon"
              >
                <Ticket className="h-5 w-5" />
              </Button>

              <Button 
                onClick={() => navigate("/novo-ticket")} 
                variant="ghost"
                size="icon"
              >
                <Plus className="h-5 w-5" />
              </Button>
              
              {hasInspectionAccess && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/vistorias")}
                >
                  <ClipboardCheck className="h-5 w-5" />
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
      <main className="container mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Banners de Informação */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Banner Protocolo de Manutenções */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => navigate("/protocolo-trabalho")}
            className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 cursor-pointer hover:bg-primary/10 transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Protocolo de Manutenções</p>
              <p className="text-xs text-muted-foreground">Fluxo completo do sistema</p>
            </div>
            <span className="text-xs text-primary font-medium hidden sm:block">Ver →</span>
          </motion.div>

          {/* Banner Tutoriais */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            onClick={() => navigate("/tutoriais")}
            className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/10 transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Tutoriais</p>
              <p className="text-xs text-muted-foreground">Guias detalhados de cada funcionalidade</p>
            </div>
            <span className="text-xs text-emerald-600 font-medium hidden sm:block">Ver →</span>
          </motion.div>
        </div>

        {/* Propostas Pendentes - Prioridade no topo - na íntegra para owners */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PropostasPendentesCompletas />
        </motion.div>

        {/* Kanban de Manutenções - visível para equipe */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6">
            <MaintenanceKanbanPreview />
          </div>
        )}

        {/* Owner Maintenance Progress - for owners */}
        {profile?.role === "owner" && <OwnerMaintenanceProgress />}

        {/* Owner Properties Section - entre manutenções e chamados */}
        {profile?.role === "owner" && <OwnerPropertiesSection />}

        {/* Owner Tickets and Charges Preview - for owners */}
        {profile?.role === "owner" && (
          <div className="grid grid-cols-1 gap-4 mb-6">
            <OwnerChargesPreview />
            <OwnerTicketsPreview />
          </div>
        )}

        {/* Score de Pagamentos - abaixo das unidades */}
        <OwnerScoreDisplay />

        {/* Alert Banner */}
        <AlertBanner />

        {/* Atalhos para Relatórios - apenas para owners em desktop */}
        {profile?.role === "owner" && (
          <div className="hidden md:grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate("/manutencoes")}
            >
              <Wrench className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Relatório de Manutenções</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate("/resumo-propriedades")}
            >
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Resumo por Propriedade</span>
            </Button>
          </div>
        )}
      </main>
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}