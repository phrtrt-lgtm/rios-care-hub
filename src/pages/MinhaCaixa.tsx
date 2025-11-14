import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, DollarSign, BarChart3, ClipboardCheck, Ticket, FileText } from "lucide-react";
import { TicketList } from "@/components/TicketList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationButton } from "@/components/NotificationButton";
import TopChargesRules from "@/components/TopChargesRules";
import { VotacoesPendentes } from "@/components/VotacoesPendentes";
import { supabase } from "@/integrations/supabase/client";
import OwnerMaintenancePolicyBanner from "@/components/OwnerMaintenancePolicyBanner";


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
          <div className="flex flex-col gap-3 md:flex-row md:h-16 md:items-center md:justify-between">
            {/* Logo e Título */}
            <div className="flex items-center gap-2 md:gap-4">
              <img src="/logo.png" alt="RIOS" className="h-6 md:h-8" />
              <div>
                <h1 className="text-lg md:text-xl font-semibold">Minha Caixa</h1>
                <p className="text-xs text-muted-foreground md:hidden">{profile?.name}</p>
              </div>
            </div>
            
            {/* Botões de ação */}
            <div className="flex items-center gap-2 md:gap-4">
              <Button 
                onClick={() => navigate("/minhas-cobrancas")} 
                variant="ghost"
                size="sm"
              >
                <DollarSign className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Cobranças</span>
              </Button>

              <Button 
                onClick={() => navigate("/meus-chamados")} 
                variant="ghost"
                size="sm"
              >
                <Ticket className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Chamados</span>
              </Button>

              <Button 
                onClick={() => navigate("/novo-ticket")} 
                variant="ghost"
                size="sm"
              >
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Novo</span>
              </Button>
              
              {hasInspectionAccess && (
                <Button 
                  onClick={() => navigate("/vistorias")} 
                  variant="ghost"
                  size="sm"
                >
                  <ClipboardCheck className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Vistorias</span>
                </Button>
              )}
              
              <NotificationButton />
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                    {profile?.name}
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
        {/* Propostas Pendentes - Prioridade no topo */}
        <VotacoesPendentes />

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