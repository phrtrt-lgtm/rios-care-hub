import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6">
      <img src="/logo.png" alt="RIOS" className="h-16 md:h-20" />
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;
