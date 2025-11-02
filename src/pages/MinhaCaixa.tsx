import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, DollarSign } from "lucide-react";
import { TicketList } from "@/components/TicketList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertBanner } from "@/components/AlertBanner";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";


export default function MinhaCaixa() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);

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
        {/* Alert Banner */}
        <div className="mb-6">
          <AlertBanner />
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
              onClick={() => navigate("/minhas-cobrancas")} 
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Minhas Cobranças
            </Button>
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