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

export function EnablePush() {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const checkSubscription = async () => {
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
    toast.info("Use o app nativo para ativar notificações push");
  };

  const disablePush = async () => {
    toast.info("Use o app nativo para desativar notificações push");
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
