import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string, phone?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[useAuth] Initializing');
    let isMounted = true;
    let loadingTimeout: NodeJS.Timeout;
    let currentUserId: string | null = null;

    // Garantir que o loading nunca fique travado
    const ensureLoadingEnds = () => {
      loadingTimeout = setTimeout(() => {
        if (isMounted) {
          console.warn('[useAuth] Loading timeout - forcing completion');
          setLoading(false);
        }
      }, 5000); // 5 segundos máximo
    };

    ensureLoadingEnds();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        console.log('[useAuth] Auth state changed:', event, !!session);
        clearTimeout(loadingTimeout);

        const newUserId = session?.user?.id ?? null;

        // Eventos que NÃO devem disparar refetch/re-render: apenas atualiza a sessão silenciosamente
        // TOKEN_REFRESHED e USER_UPDATED acontecem em background (e quando a aba volta ao foco)
        // e não devem causar reload das páginas.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(session);
          // Não mexer em user/profile/loading se o usuário não mudou
          if (newUserId !== currentUserId) {
            currentUserId = newUserId;
            setUser(session?.user ?? null);
          }
          return;
        }

        // Se INITIAL_SESSION ou SIGNED_IN dispara para o mesmo usuário já carregado, ignorar refetch
        if (newUserId && newUserId === currentUserId && event !== 'SIGNED_OUT') {
          setSession(session);
          setLoading(false);
          return;
        }

        currentUserId = newUserId;
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('[useAuth] Fetching profile for user:', session.user.id);
          
          // Usar setTimeout para evitar deadlock
          setTimeout(async () => {
            try {
              const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", session.user.id)
                .single();
              
              if (error) {
                console.error('[useAuth] Error fetching profile:', error);
              }
              
              console.log('[useAuth] Profile data:', data);
              if (isMounted) {
                setProfile(data);
                setLoading(false);
              }
            } catch (error) {
              console.error('[useAuth] Exception fetching profile:', error);
              if (isMounted) {
                setLoading(false);
              }
            }
          }, 0);
        } else {
          if (isMounted) {
            setProfile(null);
            setLoading(false);
          }
        }
      }
    );

    // Initialize session
    const initSession = async () => {
      try {
        console.log('[useAuth] Getting initial session');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[useAuth] Error getting session:', error);
          if (isMounted) {
            setLoading(false);
          }
          return;
        }
        
        if (!isMounted) return;
        
        console.log('[useAuth] Initial session:', !!session);
        currentUserId = session?.user?.id ?? null;
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('[useAuth] Fetching initial profile');
          try {
            const { data, error } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();
            
            if (error) {
              console.error('[useAuth] Error fetching initial profile:', error);
            }
            
            if (isMounted) {
              setProfile(data);
              setLoading(false);
            }
          } catch (error) {
            console.error('[useAuth] Error fetching initial profile:', error);
            if (isMounted) {
              setLoading(false);
            }
          }
        } else {
          if (isMounted) {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('[useAuth] Error in initSession:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initSession();

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, name: string, phone?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    // Notificar admins sobre nova solicitação de cadastro
    if (!error && data.user) {
      try {
        await supabase.functions.invoke("notify-ticket", {
          body: { type: "approval_request", userId: data.user.id },
        });
      } catch (notifyError) {
        console.error("Erro ao notificar admins:", notifyError);
        // Não bloqueia o cadastro se falhar a notificação
      }
    }

    return { error };
  };

  const signOut = async () => {
    try {
      // Clear remember me preferences
      localStorage.removeItem("rememberMe");
      sessionStorage.removeItem("tempSession");
      
      // Limpa o estado local primeiro
      setSession(null);
      setUser(null);
      setProfile(null);
      
      // Tenta fazer logout no Supabase (mesmo que a sessão não exista)
      const { error } = await supabase.auth.signOut();
      
      // Ignora erros de "session not found" pois o objetivo já foi alcançado
      if (error && !error.message?.includes('Session not found') && !error.message?.includes('session id')) {
        console.error('Logout error:', error);
      }
    } catch (error) {
      console.error('Unexpected logout error:', error);
    } finally {
      // Sempre redireciona para login, independente de erros
      navigate("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};