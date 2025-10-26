import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

export default function AguardandoAprovacao() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile && profile.status === 'approved') {
      if (profile.role === 'owner') {
        navigate("/minha-caixa");
      } else {
        navigate("/painel");
      }
    }
  }, [profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10">
            <Clock className="h-8 w-8 text-secondary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Aguardando aprovação</CardTitle>
            <CardDescription>
              Seu cadastro foi recebido e está sendo analisado pela nossa equipe
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="mb-2 font-medium">O que acontece agora?</p>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>Nossa equipe irá analisar sua solicitação</li>
              <li>Você receberá um e-mail quando seu acesso for liberado</li>
              <li>O processo geralmente leva até 24 horas</li>
            </ul>
          </div>
          <Button
            onClick={signOut}
            variant="outline"
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}