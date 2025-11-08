import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AlertBanner } from "@/components/AlertBanner";

const Index = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Só redireciona se estiver na rota raiz "/"
    if (location.pathname !== "/") return;
    
    console.log('[Index] State:', { loading, hasUser: !!user, hasProfile: !!profile, role: profile?.role });
    
    if (!loading && !user) {
      console.log('[Index] No user, redirecting to login');
      navigate("/login", { replace: true });
    } else if (!loading && user && profile) {
      console.log('[Index] Profile found:', profile.role);
      if (profile.role === 'pending_owner' && profile.status === 'pending') {
        console.log('[Index] Redirecting to aguardando-aprovacao');
        navigate("/aguardando-aprovacao", { replace: true });
      } else if (profile.role === 'owner') {
        console.log('[Index] Redirecting to minha-caixa');
        navigate("/minha-caixa", { replace: true });
      } else if (profile.role === 'agent' || profile.role === 'admin' || profile.role === 'maintenance') {
        console.log('[Index] Redirecting to painel');
        navigate("/painel", { replace: true });
      }
    }
  }, [user, profile, loading, navigate, location]);

  return (
    <div>
      {user && (
        <div className="container mx-auto p-4">
          <AlertBanner />
        </div>
      )}
      <LoadingScreen />
    </div>
  );
};

export default Index;
