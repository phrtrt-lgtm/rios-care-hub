import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Ticket, DollarSign, Wrench, Vote, AlertCircle, BellRing } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  reference_id: string | null;
  reference_url: string | null;
  read: boolean;
  created_at: string;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "ticket":
      return <Ticket className="h-4 w-4" />;
    case "charge":
      return <DollarSign className="h-4 w-4" />;
    case "maintenance":
      return <Wrench className="h-4 w-4" />;
    case "vote":
      return <Vote className="h-4 w-4" />;
    case "alert":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

export function NotificationButton() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const navigate = useNavigate();
  
  // More robust native detection
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform() || platform === 'android' || platform === 'ios';
  
  console.log('Capacitor platform:', platform, 'isNative:', isNative);

  useEffect(() => {
    fetchNotifications();
    checkPushPermissions();

    // Realtime subscription
    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkPushPermissions = async () => {
    if (!isNative) return;
    
    try {
      const permStatus = await PushNotifications.checkPermissions();
      
      // Check if permission granted AND we have an active subscription in DB
      if (permStatus.receive === 'granted') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('owner_id', session.user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          
          // Only hide button if we have both permission AND active subscription
          setIsPushEnabled(!!data);
        }
      } else {
        setIsPushEnabled(false);
      }
    } catch (error) {
      console.error("Error checking push permissions:", error);
      setIsPushEnabled(false);
    }
  };

  const enablePushNotifications = async () => {
    if (!isNative) {
      toast.info("Use o app Android/iOS para ativar notificações push");
      return;
    }

    setEnablingPush(true);

    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        toast.error('Permissão de notificação negada');
        setEnablingPush(false);
        return;
      }

      await PushNotifications.register();

      await PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, token: ' + token.value);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Você precisa estar logado");
          setEnablingPush(false);
          return;
        }

        // Save token via edge function to avoid RLS issues
        const fcmEndpoint = `https://fcm.googleapis.com/fcm/send/${token.value}`;
        
        const { error } = await supabase.functions.invoke("push-subscribe", {
          body: {
            endpoint: fcmEndpoint,
            keys: {
              p256dh: "native",
              auth: "native",
            },
            userAgent: navigator.userAgent,
            userId: session.user.id,
          },
        });

        if (error) {
          console.error('Error saving token:', error);
          toast.error('Erro ao salvar token: ' + (error.message || 'tente novamente'));
          setEnablingPush(false);
          return;
        }

        toast.success("Notificações push ativadas!");
        setIsPushEnabled(true);
        setEnablingPush(false);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('Error on registration: ' + JSON.stringify(error));
        toast.error('Erro ao registrar notificações');
        setEnablingPush(false);
      });
    } catch (error) {
      console.error("Error enabling push:", error);
      toast.error("Erro ao ativar notificações push");
      setEnablingPush(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount(data?.filter((n) => !n.read).length || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);

      fetchNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("owner_id", session.user.id)
        .eq("read", false);

      fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    if (notification.reference_url) {
      navigate(notification.reference_url);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full hover:bg-muted"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Notificações</h3>
          <div className="flex items-center gap-2">
            {!isPushEnabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={enablePushNotifications}
                disabled={enablingPush}
                className="text-xs"
              >
                <BellRing className="h-3 w-3 mr-1" />
                {enablingPush ? "Ativando..." : "Ativar Push"}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs"
              >
                Marcar todas como lidas
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                    !notification.read ? "bg-muted/30" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`mt-1 ${!notification.read ? "text-primary" : "text-muted-foreground"}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium leading-tight ${
                          !notification.read ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
