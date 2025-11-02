import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AlertBanner } from "@/components/AlertBanner";

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
