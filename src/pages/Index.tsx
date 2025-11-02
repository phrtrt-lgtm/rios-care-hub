import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";

const Index = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/login");
      } else if (profile) {
        if (profile.role === 'pending_owner' && profile.status === 'pending') {
          navigate("/aguardando-aprovacao");
        } else if (profile.role === 'owner') {
          navigate("/minha-caixa");
        } else if (profile.role === 'agent' || profile.role === 'admin') {
          navigate("/painel");
        }
      }
    }
  }, [user, profile, loading, navigate]);

  return <LoadingScreen />;
};

export default Index;
