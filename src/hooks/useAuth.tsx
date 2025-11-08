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
    let isMounted = true;

    const initAuth = async () => {
      // Check if user should be logged out (browser was closed and "remember me" was not checked)
      const rememberMe = localStorage.getItem("rememberMe");
      const tempSession = sessionStorage.getItem("tempSession");
      
      if (!rememberMe && !tempSession) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        
        if (isMounted) {
          setProfile(data);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          
          if (isMounted) {
            setProfile(data);
          }
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    initAuth();

    return () => {
      isMounted = false;
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

    // TODO: Send notification email (edge function temporarily disabled)
    // if (!error && data.user) {
    //   await supabase.functions.invoke("notify-ticket", {
    //     body: { type: "approval_request", userId: data.user.id },
    //   });
    // }

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