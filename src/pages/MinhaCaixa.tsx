import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, DollarSign } from "lucide-react";
import { TicketList } from "@/components/TicketList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function MinhaCaixa() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);

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
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
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
                  <div className="mt-6 space-y-2">
                    <div>
                      <span className="text-sm font-medium">Nome:</span>
                      <p className="text-muted-foreground">{profile?.name}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Email:</span>
                      <p className="text-muted-foreground">{profile?.email}</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
          <div className="flex gap-2">
            <Button onClick={() => navigate("/minhas-cobrancas")} variant="outline">
              <DollarSign className="mr-2 h-4 w-4" />
              Minhas Cobranças
            </Button>
            <Button onClick={() => navigate("/novo-ticket")}>
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