import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Ticket, DollarSign, Wrench, Vote, AlertCircle, BellRing, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  reference_id: string | null;
  reference_url: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
}

const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform() || platform === 'android' || platform === 'ios';

  useEffect(() => {
    fetchNotifications(0, true);
    fetchUnreadCount();
    checkPushPermissions();

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
          fetchNotifications(0, true);
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", session.user.id)
        .eq("read", false);
      setUnreadCount(count || 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  const checkPushPermissions = async () => {
    if (!isNative) return;
    try {
      const permStatus = await PushNotifications.checkPermissions();
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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Você precisa estar logado");
          setEnablingPush(false);
          return;
        }
        const fcmEndpoint = `https://fcm.googleapis.com/fcm/send/${token.value}`;
        const { error } = await supabase.functions.invoke("push-subscribe", {
          body: {
            endpoint: fcmEndpoint,
            keys: { p256dh: "native", auth: "native" },
            userAgent: navigator.userAgent,
            userId: session.user.id,
          },
        });
        if (error) {
          toast.error('Erro ao salvar token: ' + (error.message || 'tente novamente'));
          setEnablingPush(false);
          return;
        }
        toast.success("Notificações push ativadas!");
        setIsPushEnabled(true);
        setEnablingPush(false);
      });
      await PushNotifications.addListener('registrationError', () => {
        toast.error('Erro ao registrar notificações');
        setEnablingPush(false);
      });
    } catch (error) {
      console.error("Error enabling push:", error);
      toast.error("Erro ao ativar notificações push");
      setEnablingPush(false);
    }
  };

  const fetchNotifications = useCallback(async (pageToFetch: number, reset: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const from = pageToFetch * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const fetched = (data as Notification[]) || [];
      setHasMore(fetched.length === PAGE_SIZE);
      setPage(pageToFetch);

      if (reset) {
        setNotifications(fetched);
      } else {
        setNotifications(prev => {
          const ids = new Set(prev.map(n => n.id));
          return [...prev, ...fetched.filter(n => !ids.has(n.id))];
        });
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchNotifications(page + 1, false);
    setLoadingMore(false);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
      fetchUnreadCount();
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
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) markAsRead(notification.id);
    const target = notification.link || notification.reference_url;
    if (target) {
      navigate(target);
      setOpen(false);
    }
  };

  const renderList = (items: Notification[]) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bell className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm">Nenhuma notificação</p>
        </div>
      );
    }
    return (
      <div className="divide-y">
        {items.map((notification) => (
          <button
            key={notification.id}
            onClick={() => handleNotificationClick(notification)}
            className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
              !notification.read ? "bg-muted/30" : ""
            }`}
          >
            <div className="flex gap-3">
              <div className={`mt-1 ${!notification.read ? "text-[hsl(var(--rios-terra))]" : "text-muted-foreground"}`}>
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium leading-tight ${
                    !notification.read ? "text-foreground font-semibold" : "text-muted-foreground"
                  }`}>
                    {notification.title}
                  </p>
                  {!notification.read && (
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--rios-terra))] flex-shrink-0 mt-1" />
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
        {hasMore && (
          <div className="p-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs"
            >
              {loadingMore ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Carregando...</>
              ) : (
                "Carregar mais"
              )}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const unreadList = notifications.filter(n => !n.read);

  const Trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-full hover:bg-muted"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span
          className={cn(
            "absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded-full text-[10px] font-semibold text-white",
            "bg-[hsl(var(--rios-terra))]"
          )}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  const Header = (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
      <h3 className="font-semibold">Notificações</h3>
      <div className="flex items-center gap-2">
        {!isPushEnabled && isNative && (
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
  );

  const Body = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")} className="w-full">
      <div className="px-4 pt-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="unread">
            Não lidas {unreadCount > 0 && <span className="ml-1 text-[hsl(var(--rios-terra))]">({unreadCount > 9 ? "9+" : unreadCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="unread" className="mt-2">
        <ScrollArea className={isMobile ? "h-[calc(100vh-180px)]" : "h-[420px]"}>
          {renderList(unreadList)}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="all" className="mt-2">
        <ScrollArea className={isMobile ? "h-[calc(100vh-180px)]" : "h-[420px]"}>
          {renderList(notifications)}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{Trigger}</SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Notificações</SheetTitle>
          </SheetHeader>
          {Header}
          <div className="flex-1 overflow-hidden">{Body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        {Header}
        {Body}
      </PopoverContent>
    </Popover>
  );
}
