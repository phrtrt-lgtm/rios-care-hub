import { AlertCircle, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ProfileUnavailableProps {
  /** Mensagem técnica vinda do useAuth, exibida como detalhe secundário. */
  error?: string | null;
}

/**
 * Mostrado quando há sessão autenticada mas o perfil não pôde ser carregado.
 *
 * Existe para que esse estado nunca caia em duas armadilhas antigas:
 * renderizar a tela protegida assim mesmo (o perfil nulo fazia a checagem de
 * papel ser pulada) ou ficar em carregamento infinito, sem saída.
 */
export const ProfileUnavailable = ({ error }: ProfileUnavailableProps) => {
  const { refreshProfile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center animate-fade-in">
      <img src="/logo.png" alt="RIOS" className="h-16 md:h-20" />

      <div className="flex flex-col items-center gap-3">
        <AlertCircle className="h-8 w-8 text-warning" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">
          Não foi possível carregar seu perfil
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sua sessão está ativa, mas não conseguimos buscar seus dados de acesso.
          Normalmente é falha de conexão. Tente de novo ou entre novamente.
        </p>
        {error && (
          <p className="max-w-sm break-words text-xs text-muted-foreground/70">
            Detalhe: {error}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={() => refreshProfile()} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
        <Button variant="outline" onClick={() => signOut()} className="gap-2">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </Button>
      </div>
    </div>
  );
};
