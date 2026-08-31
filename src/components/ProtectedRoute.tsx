import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/** Rotas liberadas para usuários com acesso restrito à curadoria. */
const CURATION_ONLY_PATHS = ["/minha-curadoria", "/definir-senha"];

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Acesso restrito: só a área de curadoria
  if (
    profile?.curation_only &&
    !CURATION_ONLY_PATHS.some((p) => location.pathname.startsWith(p))
  ) {
    return <Navigate to="/minha-curadoria" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
