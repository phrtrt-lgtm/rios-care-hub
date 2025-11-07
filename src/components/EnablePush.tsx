import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, BellOff, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messaging, getToken } from "@/lib/firebase";

export function EnablePush() {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const checkSubscription = async () => {
    if (!messaging) return false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const { data } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("owner_id", session.user.id)
        .eq("is_active", true)
        .maybeSingle();

      setIsSubscribed(!!data);
      return !!data;
    } catch (error) {
      console.error("Error checking subscription:", error);
      return false;
    }
  };

  const enablePush = async () => {
    if (!messaging) {
      toast.error("Notificações push não são suportadas neste navegador");
      return;
    }

    setLoading(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada");
        setLoading(false);
        return;
      }

      // Register Firebase messaging service worker
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: "BPxWLHkxgDk5n9V7g8XcSLNPRcXtSkVxCqKnKf8R3n7vQjc1cK6pT7M8DhV5Y2F3gK9RpT4mZ6wN8sJ2xQ5bL0c"
      });

      if (!token) {
        toast.error("Não foi possível obter token FCM");
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        setLoading(false);
        return;
      }

      // Send FCM token to backend
      const { error } = await supabase.functions.invoke("push-subscribe", {
        body: {
          endpoint: token,
          keys: {},
          userAgent: navigator.userAgent,
        },
      });

      if (error) throw error;

      toast.success("Notificações ativadas com sucesso!");
      setIsSubscribed(true);

      // Send test notification
      await supabase.functions.invoke("send-push", {
        body: {
          ownerId: session.user.id,
          payload: {
            title: "Notificações ativadas! 🔔",
            body: "Você receberá alertas de tickets e cobranças aqui também.",
            url: "/",
          },
        },
      });
    } catch (error: any) {
      console.error("Error enabling push:", error);
      toast.error("Erro ao ativar notificações: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
    if (!messaging) return;

    setLoading(true);

    try {
      const token = await getToken(messaging, {
        vapidKey: "BPxWLHkxgDk5n9V7g8XcSLNPRcXtSkVxCqKnKf8R3n7vQjc1cK6pT7M8DhV5Y2F3gK9RpT4mZ6wN8sJ2xQ5bL0c"
      });

      if (token) {
        const { error } = await supabase.functions.invoke("push-unsubscribe", {
          body: {
            endpoint: token,
          },
        });

        if (error) throw error;

        toast.success("Notificações desativadas");
        setIsSubscribed(false);
      }
    } catch (error: any) {
      console.error("Error disabling push:", error);
      toast.error("Erro ao desativar notificações: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Check subscription status on mount
  useEffect(() => {
    checkSubscription();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações Push
        </CardTitle>
        <CardDescription>
          Receba notificações instantâneas de tickets e cobranças no seu
          dispositivo, mesmo quando não estiver com o app aberto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isSubscribed
              ? "✅ Você está recebendo notificações push"
              : "Ative as notificações para receber alertas em tempo real"}
          </p>
          {!isSubscribed ? (
            <Button onClick={enablePush} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ativando...
                </>
              ) : (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  Ativar notificações no meu dispositivo
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={disablePush}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desativando...
                </>
              ) : (
                <>
                  <BellOff className="mr-2 h-4 w-4" />
                  Desativar notificações
                </>
              )}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            💡 Dica: No celular, adicione este site à tela inicial para uma
            experiência ainda melhor!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
