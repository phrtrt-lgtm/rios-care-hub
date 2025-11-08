import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AlertBanner } from "@/components/AlertBanner";

const Index = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Index] State:', { loading, hasUser: !!user, hasProfile: !!profile, role: profile?.role });
    
    if (!loading) {
      if (!user) {
        console.log('[Index] No user, redirecting to login');
        navigate("/login");
      } else if (profile) {
        console.log('[Index] Profile found:', profile.role);
        if (profile.role === 'pending_owner' && profile.status === 'pending') {
          console.log('[Index] Redirecting to aguardando-aprovacao');
          navigate("/aguardando-aprovacao");
        } else if (profile.role === 'owner') {
          console.log('[Index] Redirecting to minha-caixa');
          navigate("/minha-caixa");
        } else if (profile.role === 'agent' || profile.role === 'admin' || profile.role === 'maintenance') {
          console.log('[Index] Redirecting to painel');
          navigate("/painel");
        }
      } else {
        console.log('[Index] User exists but no profile yet');
      }
    }
  }, [user, profile, loading, navigate]);

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
