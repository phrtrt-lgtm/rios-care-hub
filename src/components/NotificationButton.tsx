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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  Bell,
  BellRing,
  ClipboardCheck,
  DollarSign,
  FileText,
  Loader2,
  MessageSquare,
  Newspaper,
  Sparkles,
  Ticket,
  Vote,
  Wrench,
} from "lucide-react";
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

/**
 * Ícone pelo tipo gravado no backend. Os tipos vêm de várias functions
 * (`ticket_created_team`, `charge_overdue`, `maintenance_update`,
 * `resumo_diario`, `inspection_created`...), por isso a maioria casa por prefixo.
 */
const iconeNotificacao = (type: string) => {
  if (type === "ticket") return <Ticket className="h-4 w-4" />;
  if (type.startsWith("ticket")) return <MessageSquare className="h-4 w-4" />;
  if (type.startsWith("charge")) return <DollarSign className="h-4 w-4" />;
  if (type.startsWith("maintenance") || type.startsWith("decision")) return <Wrench className="h-4 w-4" />;
  if (type === "vote" || type.startsWith("proposal")) return <Vote className="h-4 w-4" />;
  if (type.startsWith("alert")) return <AlertCircle className="h-4 w-4" />;
  if (type === "resumo_diario") return <Newspaper className="h-4 w-4" />;
  if (type.startsWith("inspection")) return <ClipboardCheck className="h-4 w-4" />;
  if (type.startsWith("curation")) return <Sparkles className="h-4 w-4" />;
  if (type === "report") return <FileText className="h-4 w-4" />;
  return <Bell className="h-4 w-4" />;
};

export function NotificationButton() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  // Lidas nesta abertura do painel: ficam na aba "Não lidas" até fechar,
  // só com o ponto apagado. Sumir na hora parecia que o clique falhou.
  const [lidasAgora, setLidasAgora] = useState<Set<string>>(new Set());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) setLidasAgora(new Set());
  }, [open]);

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
    } finally {
      setCarregando(false);
    }
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchNotifications(page + 1, false);
    setLoadingMore(false);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      setLidasAgora(prev => new Set(prev).add(notificationId));
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);
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
    if (carregando) {
      return (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Carregando notificações">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-1 h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="Nenhuma notificação"
          description={tab === "unread" ? "Você está em dia." : "As notificações do portal aparecem aqui."}
          className="py-10 [&>div:first-child]:h-10 [&>div:first-child]:w-10 [&>h3]:text-sm [&>p]:text-xs"
        />
      );
    }
    return (
      <div className="divide-y divide-border/60">
        {items.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => handleNotificationClick(notification)}
            className={cn(
              "w-full p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50",
              !notification.read && "bg-muted/30",
            )}
          >
            <div className="flex gap-3">
              <div className={cn("mt-1", !notification.read ? "text-primary" : "text-muted-foreground")} aria-hidden="true">
                {iconeNotificacao(notification.type)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn(
                    "text-sm leading-tight",
                    !notification.read ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                  )}>
                    {notification.title}
                  </p>
                  {!notification.read && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
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
          <div className="flex justify-center p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs"
            >
              {loadingMore && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    );
  };

  const unreadList = notifications.filter(n => !n.read || lidasAgora.has(n.id));
  const rotuloSino = unreadCount > 0
    ? `Notificações, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`
    : "Notificações";

  const Trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-full hover:bg-muted"
      aria-label={rotuloSino}
      aria-expanded={open}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  const Header = (
    // pr-12 no celular: o X do Sheet fica no canto direito, em cima dos botões.
    <div className={cn("flex items-center justify-between gap-2 border-b px-4 py-3", isMobile && "pr-12")}>
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
            <BellRing className="h-3 w-3" />
            {enablingPush ? "Ativando…" : "Ativar push"}
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
            Não lidas {unreadCount > 0 && <span className="ml-1 text-primary">({unreadCount > 9 ? "9+" : unreadCount})</span>}
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
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
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
