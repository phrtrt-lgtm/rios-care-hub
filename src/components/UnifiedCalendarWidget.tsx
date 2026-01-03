import { useState, useMemo, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Sparkles, Wrench, DollarSign, CalendarOff, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

type EventType = 'inspection' | 'maintenance' | 'charge' | 'blocked' | 'checkout';

interface CalendarEvent {
  id: string;
  date: Date;
  type: EventType;
  title: string;
  subtitle?: string;
  hasProblems?: boolean;
  url?: string;
}

const eventColors: Record<EventType, { bg: string; dot: string; label: string; icon: React.ReactNode }> = {
  inspection: { 
    bg: 'bg-purple-500/20', 
    dot: 'bg-purple-500', 
    label: 'Vistoria',
    icon: <Sparkles className="h-3 w-3" />
  },
  maintenance: { 
    bg: 'bg-blue-500/20', 
    dot: 'bg-blue-500', 
    label: 'Manutenção',
    icon: <Wrench className="h-3 w-3" />
  },
  charge: { 
    bg: 'bg-amber-500/20', 
    dot: 'bg-amber-500', 
    label: 'Cobrança',
    icon: <DollarSign className="h-3 w-3" />
  },
  blocked: { 
    bg: 'bg-red-500/20', 
    dot: 'bg-red-500', 
    label: 'Bloqueio',
    icon: <CalendarOff className="h-3 w-3" />
  },
  checkout: { 
    bg: 'bg-green-500/20', 
    dot: 'bg-green-500', 
    label: 'Checkout',
    icon: <Users className="h-3 w-3" />
  },
};

export function UnifiedCalendarWidget() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchEvents();
    }
  }, [open]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const allEvents: CalendarEvent[] = [];

      // Fetch inspections
      const { data: inspections } = await supabase
        .from('cleaning_inspections')
        .select('id, created_at, property_id, properties(name), transcript_summary')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (inspections) {
        // Check for problems via inspection_items
        const inspectionIds = inspections.map(i => i.id);
        const { data: items } = await supabase
          .from('inspection_items')
          .select('inspection_id, status')
          .in('inspection_id', inspectionIds);

        const problemMap = new Map<string, boolean>();
        items?.forEach(item => {
          if (item.status === 'pending' || item.status === 'in_progress') {
            problemMap.set(item.inspection_id, true);
          }
        });

        inspections.forEach(i => {
          allEvents.push({
            id: i.id,
            date: startOfDay(parseISO(i.created_at)),
            type: 'inspection',
            title: (i.properties as any)?.name || 'Vistoria',
            subtitle: i.transcript_summary?.substring(0, 50) || undefined,
            hasProblems: problemMap.get(i.id) || false,
            url: `/admin/vistoria/${i.id}`,
          });
        });
      }

      // Fetch scheduled maintenances
      const { data: maintenances } = await supabase
        .from('tickets')
        .select('id, scheduled_at, subject, properties(name)')
        .eq('ticket_type', 'manutencao')
        .not('scheduled_at', 'is', null)
        .is('archived_at', null)
        .order('scheduled_at', { ascending: false })
        .limit(100);

      if (maintenances) {
        maintenances.forEach(m => {
          if (m.scheduled_at) {
            allEvents.push({
              id: m.id,
              date: startOfDay(parseISO(m.scheduled_at)),
              type: 'maintenance',
              title: m.subject,
              subtitle: (m.properties as any)?.name,
              url: `/ticket/${m.id}`,
            });
          }
        });
      }

      // Fetch charge due dates
      const { data: charges } = await supabase
        .from('charges')
        .select('id, due_date, title, properties(name)')
        .not('due_date', 'is', null)
        .is('archived_at', null)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: false })
        .limit(100);

      if (charges) {
        charges.forEach(c => {
          if (c.due_date) {
            allEvents.push({
              id: c.id,
              date: startOfDay(parseISO(c.due_date)),
              type: 'charge',
              title: c.title,
              subtitle: (c.properties as any)?.name,
              url: `/cobranca/${c.id}`,
            });
          }
        });
      }

      // Fetch blocked dates
      const { data: blockedTickets } = await supabase
        .from('tickets')
        .select('id, blocked_dates_start, blocked_dates_end, subject, properties(name)')
        .eq('ticket_type', 'bloqueio_data')
        .not('blocked_dates_start', 'is', null)
        .is('archived_at', null)
        .limit(100);

      if (blockedTickets) {
        blockedTickets.forEach(t => {
          if (t.blocked_dates_start) {
            allEvents.push({
              id: `${t.id}-start`,
              date: startOfDay(parseISO(t.blocked_dates_start)),
              type: 'blocked',
              title: t.subject,
              subtitle: `${(t.properties as any)?.name} - Início`,
              url: `/ticket/${t.id}`,
            });
          }
          if (t.blocked_dates_end) {
            allEvents.push({
              id: `${t.id}-end`,
              date: startOfDay(parseISO(t.blocked_dates_end)),
              type: 'blocked',
              title: t.subject,
              subtitle: `${(t.properties as any)?.name} - Fim`,
              url: `/ticket/${t.id}`,
            });
          }
        });
      }

      // Fetch guest checkouts
      const { data: checkoutTickets } = await supabase
        .from('tickets')
        .select('id, guest_checkout_date, subject, properties(name)')
        .not('guest_checkout_date', 'is', null)
        .is('archived_at', null)
        .limit(100);

      if (checkoutTickets) {
        checkoutTickets.forEach(t => {
          if (t.guest_checkout_date) {
            allEvents.push({
              id: `checkout-${t.id}`,
              date: startOfDay(parseISO(t.guest_checkout_date)),
              type: 'checkout',
              title: 'Checkout Hóspede',
              subtitle: (t.properties as any)?.name,
              url: `/ticket/${t.id}`,
            });
          }
        });
      }

      setEvents(allEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const key = format(event.date, 'yyyy-MM-dd');
      const existing = map.get(key) || [];
      map.set(key, [...existing, event]);
    });
    return map;
  }, [events]);

  const modifiers = useMemo(() => {
    const dates: Date[] = [];
    eventsByDate.forEach((_, key) => {
      dates.push(startOfDay(parseISO(key)));
    });
    return { hasEvents: dates };
  }, [eventsByDate]);

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return eventsByDate.get(key) || [];
  }, [selectedDate, eventsByDate]);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.url) {
      navigate(event.url);
      setOpen(false);
    }
  };

  const todayEventsCount = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return eventsByDate.get(today)?.length || 0;
  }, [eventsByDate]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          title="Calendário Unificado"
        >
          <CalendarIcon className="h-5 w-5" />
          {todayEventsCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {todayEventsCount > 9 ? '9+' : todayEventsCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm">Calendário Unificado</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(eventColors).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                <div className={cn("w-2 h-2 rounded-full", value.dot)} />
                <span>{value.label}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-[250px] w-[280px]" />
          </div>
        ) : (
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            month={month}
            onMonthChange={setMonth}
            locale={ptBR}
            modifiers={modifiers}
            modifiersStyles={{
              hasEvents: {
                fontWeight: 'bold',
              },
            }}
            components={{
              DayContent: ({ date }) => {
                const key = format(date, 'yyyy-MM-dd');
                const dayEvents = eventsByDate.get(key) || [];
                const types = [...new Set(dayEvents.map(e => e.type))];
                
                return (
                  <div className="relative flex flex-col items-center">
                    <span>{date.getDate()}</span>
                    {types.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {types.slice(0, 3).map(type => (
                          <div 
                            key={type} 
                            className={cn("w-1.5 h-1.5 rounded-full", eventColors[type].dot)} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              },
            }}
            className="rounded-md border-0"
          />
        )}

        {selectedDate && (
          <div className="border-t p-3">
            <p className="text-sm font-medium mb-2">
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </p>
            {selectedEvents.length > 0 ? (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {selectedEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        "w-full text-left p-2 rounded-md transition-colors",
                        eventColors[event.type].bg,
                        "hover:opacity-80"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {eventColors[event.type].icon}
                        <span className="text-xs font-medium truncate flex-1">
                          {event.title}
                        </span>
                        {event.hasProblems && (
                          <Badge variant="destructive" className="text-[10px] h-4">
                            Problema
                          </Badge>
                        )}
                      </div>
                      {event.subtitle && (
                        <p className="text-xs text-muted-foreground mt-1 truncate pl-5">
                          {event.subtitle}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum evento neste dia</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
