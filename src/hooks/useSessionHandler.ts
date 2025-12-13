import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useSessionHandler() {
  useEffect(() => {
    // Listen for auth errors (session expired, invalid token, etc.)
    const handleAuthError = (event: CustomEvent) => {
      console.log('[SessionHandler] Auth error detected:', event.detail);
      toast.error("Sua sessão expirou. Por favor, faça login novamente.", {
        duration: 5000,
      });
      
      // Clear local state
      localStorage.removeItem("rememberMe");
      sessionStorage.removeItem("tempSession");
      
      // Redirect to login
      setTimeout(() => {
        window.location.href = "/login";
      }, 1000);
    };

    window.addEventListener("auth-error" as any, handleAuthError);

    // Also check for session expiration periodically
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        // Only trigger if we were previously logged in (has profile data in storage)
        const wasLoggedIn = localStorage.getItem("sb-ktzfovzwayfqczytmhno-auth-token");
        if (wasLoggedIn && !session) {
          console.log('[SessionHandler] Session expired detected');
          window.dispatchEvent(new CustomEvent("auth-error", { detail: "session_expired" }));
        }
      }
    };

    // Check session every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("auth-error" as any, handleAuthError);
      clearInterval(interval);
    };
  }, []);
}

// Helper function to handle API errors and detect auth issues
export function handleApiError(error: any, context?: string): boolean {
  const errorMessage = error?.message || error?.toString() || "";
  const errorCode = error?.code || error?.status;
  
  // Check for auth-related errors
  const isAuthError = 
    errorCode === 401 ||
    errorCode === "401" ||
    errorMessage.includes("401") ||
    errorMessage.includes("JWT") ||
    errorMessage.includes("token") ||
    errorMessage.includes("session") ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("not authenticated");

  if (isAuthError) {
    console.log('[handleApiError] Auth error detected:', context, error);
    window.dispatchEvent(new CustomEvent("auth-error", { detail: { context, error } }));
    return true;
  }

  return false;
}
