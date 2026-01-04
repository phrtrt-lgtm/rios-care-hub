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
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export function EnablePushNative() {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // More robust native detection
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform() || platform === 'android' || platform === 'ios';
  
  console.log('EnablePushNative - platform:', platform, 'isNative:', isNative);

  useEffect(() => {
    if (isNative) {
      checkPermissions();
    }
  }, [isNative]);

  const checkPermissions = async () => {
    const permStatus = await PushNotifications.checkPermissions();
    setIsSubscribed(permStatus.receive === 'granted');
  };

  const enablePush = async () => {
    if (!isNative) {
      toast.error("Notificações nativas só funcionam no app Android/iOS");
      return;
    }

    setLoading(true);

    try {
      // Remove any existing listeners first to avoid duplicates
      await PushNotifications.removeAllListeners();

      // Request permission
      let permStatus = await PushNotifications.checkPermissions();
      console.log('Push permission status:', permStatus);

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
        console.log('Push permission after request:', permStatus);
      }

      if (permStatus.receive !== 'granted') {
        toast.error('Permissão de notificação negada');
        setLoading(false);
        return;
      }

      // Set up listeners BEFORE registering
      await PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, token:', token.value);

        try {
          // Save token to backend
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            toast.error("Você precisa estar logado");
            setLoading(false);
            return;
          }

          // Save token to backend (service-role function avoids RLS/unique-constraint issues)
          const fcmEndpoint = `https://fcm.googleapis.com/fcm/send/${token.value}`;

          const { error: subscribeError } = await supabase.functions.invoke(
            "push-subscribe",
            {
              body: {
                endpoint: fcmEndpoint,
                keys: {
                  p256dh: "native",
                  auth: "native",
                },
                userAgent: navigator.userAgent,
              },
            }
          );

          if (subscribeError) {
            console.error("Error saving token (push-subscribe):", subscribeError);
            toast.error(
              "Erro ao salvar token de notificação: " +
                (subscribeError.message || "tente novamente")
            );
            setLoading(false);
            return;
          }

          toast.success("Notificações ativadas com sucesso!");
          setIsSubscribed(true);
          setLoading(false);

          // Send test notification
          await supabase.functions.invoke("send-push", {
            body: {
              ownerId: session.user.id,
              payload: {
                title: "Notificações ativadas! 🔔",
                body: "Você receberá alertas de tickets e cobranças aqui.",
                url: "/",
              },
            },
          });
        } catch (err: any) {
          console.error('Error in registration handler:', err);
          toast.error('Erro ao processar registro: ' + err.message);
          setLoading(false);
        }
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', JSON.stringify(error));
        toast.error('Erro ao obter token FCM: ' + (error.error || 'Verifique a configuração do Firebase'));
        setLoading(false);
        setIsSubscribed(false);
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
        toast.info(notification.title || 'Nova notificação', {
          description: notification.body,
        });
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed', notification.actionId);
        const data = notification.notification.data;
        if (data?.url) {
          window.location.href = data.url;
        }
      });

      // Now register - this triggers registration or registrationError
      console.log('Calling PushNotifications.register()...');
      await PushNotifications.register();

    } catch (error: any) {
      console.error("Error enabling push:", error);
      toast.error("Erro ao ativar notificações: " + error.message);
      setLoading(false);
    }
  };

  const disablePush = async () => {
    setLoading(true);

    try {
      // Remove all listeners
      await PushNotifications.removeAllListeners();

      // Update database
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('owner_id', session.user.id);
      }

      toast.success("Notificações desativadas");
      setIsSubscribed(false);
    } catch (error: any) {
      console.error("Error disabling push:", error);
      toast.error("Erro ao desativar notificações: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isNative) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>
            As notificações nativas só funcionam no app Android/iOS.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

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
            💡 As notificações aparecem diretamente no Android, não no navegador.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
