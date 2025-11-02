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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function EnablePush() {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const checkSubscription = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
      return !!subscription;
    } catch (error) {
      console.error("Error checking subscription:", error);
      return false;
    }
  };

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Notificações push não são suportadas neste navegador");
      return;
    }

    setLoading(true);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada");
        setLoading(false);
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Get VAPID public key from environment
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        toast.error("Chave VAPID não configurada");
        setLoading(false);
        return;
      }

      // Subscribe to push notifications
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });

      // Send subscription to backend
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        setLoading(false);
        return;
      }

      const { error } = await supabase.functions.invoke("push-subscribe", {
        body: {
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
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
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        const { error } = await supabase.functions.invoke("push-unsubscribe", {
          body: {
            endpoint: subscription.endpoint,
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
