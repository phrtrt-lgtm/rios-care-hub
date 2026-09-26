import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { X, Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOM, type Tom } from "@/components/painel/tons";

interface AlertData {
  id: string;
  title: string;
  message: string;
  type: string;
  recipient_id: string;
  is_read: boolean;
}

export const AlertBanner = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertData[]>([]);

  useEffect(() => {
    if (!user) return;

    fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel('alert-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alert_recipients',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchAlerts = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('alert_recipients')
      .select(`
        id,
        is_read,
        alerts!inner (
          id,
          title,
          message,
          type,
          expires_at,
          is_active
        )
      `)
      .eq('user_id', user.id)
      .eq('is_read', false)
      .eq('alerts.is_active', true);

    if (error) {
      console.error('Erro ao carregar alertas:', error);
      return;
    }

    const now = new Date();
    const activeAlerts = (data || [])
      .filter((item: any) => {
        if (!item.alerts.expires_at) return true;
        return new Date(item.alerts.expires_at) > now;
      })
      .map((item: any) => ({
        id: item.alerts.id,
        title: item.alerts.title,
        message: item.alerts.message,
        type: item.alerts.type,
        recipient_id: item.id,
        is_read: item.is_read,
      }));

    setAlerts(activeAlerts);
  };

  const markAsRead = async (recipientId: string) => {
    const { error } = await supabase
      .from('alert_recipients')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', recipientId);

    if (error) {
      console.error('Erro ao marcar alerta como lido:', error);
      return;
    }

    setAlerts(alerts.filter(a => a.recipient_id !== recipientId));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getAlertTone = (type: string): Tom => {
    switch (type) {
      case 'warning':
        return 'warning';
      case 'error':
        return 'destructive';
      case 'success':
        return 'success';
      default:
        return 'info';
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const tom = getAlertTone(alert.type);
        return (
          <div
            key={alert.id}
            role="alert"
            className={cn(
              "flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-sm",
              TOM[tom].borda,
            )}
          >
            <span
              className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM[tom].caixa)}
              aria-hidden="true"
            >
              {getAlertIcon(alert.type)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{alert.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{alert.message}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => markAsRead(alert.recipient_id)}
              aria-label="Dispensar aviso"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};
