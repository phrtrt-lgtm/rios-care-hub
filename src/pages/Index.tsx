import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";

const Index = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    
    if (!profile) return;
    
    // Redireciona apenas uma vez baseado na role
    if (profile.role === 'pending_owner' && profile.status === 'pending') {
      navigate("/bem-vindo", { replace: true });
    } else if (profile.role === 'pending_owner') {
      navigate("/bem-vindo", { replace: true });
    } else if (profile.role === 'owner') {
      navigate("/minha-caixa", { replace: true });
    } else if (profile.role === 'cleaner') {
      navigate("/faxineira", { replace: true });
    } else if (profile.role === 'agent' || profile.role === 'admin' || profile.role === 'maintenance') {
      navigate("/painel", { replace: true });
    }
  }, [user, profile, loading, navigate]);

  if (loading) {
    return <LoadingScreen />;
  }

  return <LoadingScreen />;
};

export default Index;
