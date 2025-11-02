import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";

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

    console.log('Buscando alertas para user:', user.id);

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

    console.log('Dados brutos de alertas:', data);

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

    console.log('Alertas ativos processados:', activeAlerts);
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

  const getAlertVariant = (type: string): "default" | "destructive" => {
    return type === 'error' ? 'destructive' : 'default';
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <Alert key={alert.id} variant={getAlertVariant(alert.type)}>
          <div className="flex items-start gap-2">
            {getAlertIcon(alert.type)}
            <div className="flex-1">
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">
                {alert.message}
              </AlertDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => markAsRead(alert.recipient_id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
};