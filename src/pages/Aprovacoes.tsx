import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function Aprovacoes() {
  const { profile } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPendingUsers(data);
    }
    setLoading(false);
  };

  const handleApproval = async (userId: string, approved: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          status: approved ? "approved" : "rejected",
          role: approved ? "owner" : "pending_owner",
        })
        .eq("id", userId);

      if (error) throw error;

      toast.success(
        approved ? "Usuário aprovado com sucesso!" : "Cadastro recusado"
      );

      // Refresh list
      fetchPendingUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast.error(error.message || "Erro ao processar aprovação");
    }
  };

  if (profile?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Acesso não autorizado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Aprovações de Cadastro</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <LoadingScreen message="Carregando aprovações..." />
        ) : pendingUsers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                Nenhuma solicitação pendente
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingUsers.map((user) => (
              <Card key={user.id} className="overflow-hidden">
                <CardHeader className="bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{user.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant="outline">Pendente</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 space-y-2">
                    {user.phone && (
                      <p className="text-sm">
                        <span className="font-medium">Telefone:</span> {user.phone}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Solicitado em{" "}
                      {new Date(user.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleApproval(user.id, true)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleApproval(user.id, false)}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Recusar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}