import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, DollarSign, ClipboardCheck, Ticket } from "lucide-react";
import { TicketList } from "@/components/TicketList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationButton } from "@/components/NotificationButton";
import TopChargesRules from "@/components/TopChargesRules";
import { VotacoesPendentes } from "@/components/VotacoesPendentes";
import { supabase } from "@/integrations/supabase/client";
import OwnerMaintenancePolicyBanner from "@/components/OwnerMaintenancePolicyBanner";
import { OwnerPropertiesSection } from "@/components/OwnerPropertiesSection";
import { OwnerScoreDisplay } from "@/components/OwnerScoreDisplay";
import { MaintenanceKanbanPreview } from "@/components/MaintenanceKanbanPreview";


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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
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
      <main className="container mx-auto px-4 py-6 md:py-8">
        {/* Propostas Pendentes - Prioridade no topo */}
        <VotacoesPendentes />

        {/* Kanban de Manutenções - visível para equipe */}
        {(profile?.role === "admin" || profile?.role === "maintenance" || profile?.role === "agent") && (
          <div className="mb-6">
            <MaintenanceKanbanPreview />
          </div>
        )}

        {/* Owner Properties Section */}
        <OwnerPropertiesSection />

        {/* Score de Pagamentos - abaixo das unidades */}
        <div className="mb-6">
          <OwnerScoreDisplay />
        </div>

        {/* Maintenance Policy Banner */}
        <OwnerMaintenancePolicyBanner />
        
        {/* Alert Banner */}
        <div className="mb-6">
          <AlertBanner />
        </div>

        {/* Top Charges Rules Section */}
        <div className="mb-6">
          <TopChargesRules />
        </div>

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Meus Chamados</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe seus tickets e solicitações
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button 
              onClick={() => navigate("/novo-ticket")}
              size="sm"
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Chamado
            </Button>
          </div>
        </div>

        <TicketList />
      </main>
    </div>
  );
}