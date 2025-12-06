import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

interface InspectionCalendarProps {
  inspectionDates: InspectionDate[];
  onDateSelect?: (date: Date) => void;
  selectedDate?: Date;
  className?: string;
}

export function InspectionCalendar({ 
  inspectionDates, 
  onDateSelect, 
  selectedDate,
  className 
}: InspectionCalendarProps) {
  const [month, setMonth] = useState<Date>(new Date());

  const dateMap = useMemo(() => {
    const map = new Map<string, InspectionDate>();
    inspectionDates.forEach(item => {
      const dateKey = format(new Date(item.date), 'yyyy-MM-dd');
      const existing = map.get(dateKey);
      if (existing) {
        existing.count += item.count;
        existing.hasProblems = existing.hasProblems || item.hasProblems;
      } else {
        map.set(dateKey, { ...item });
      }
    });
    return map;
  }, [inspectionDates]);

  const modifiers = useMemo(() => {
    const withProblems: Date[] = [];
    const withoutProblems: Date[] = [];

    dateMap.forEach((item, dateKey) => {
      const date = new Date(dateKey);
      if (item.hasProblems) {
        withProblems.push(date);
      } else {
        withoutProblems.push(date);
      }
    });

    return {
      hasProblems: withProblems,
      noProblems: withoutProblems,
    };
  }, [dateMap]);

  const modifiersStyles = {
    hasProblems: {
      backgroundColor: 'hsl(var(--destructive) / 0.2)',
      borderRadius: '9999px',
    },
    noProblems: {
      backgroundColor: 'hsl(142 76% 36% / 0.2)',
      borderRadius: '9999px',
    },
  };

  const handleSelect = (date: Date | undefined) => {
    if (date && onDateSelect) {
      onDateSelect(date);
    }
  };

  // Get inspection count for selected date
  const selectedDateInfo = selectedDate 
    ? dateMap.get(format(selectedDate, 'yyyy-MM-dd'))
    : null;

  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Calendário de Vistorias</h3>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500/30" />
              <span className="text-muted-foreground">OK</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-destructive/30" />
              <span className="text-muted-foreground">Problema</span>
            </div>
          </div>
        </div>

        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          month={month}
          onMonthChange={setMonth}
          locale={ptBR}
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
          className="rounded-md border-0 pointer-events-auto"
          classNames={{
            day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          }}
        />

        {selectedDate && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium">
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </p>
            {selectedDateInfo ? (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={selectedDateInfo.hasProblems ? "destructive" : "secondary"}>
                  {selectedDateInfo.count} {selectedDateInfo.count === 1 ? 'vistoria' : 'vistorias'}
                </Badge>
                {selectedDateInfo.hasProblems && (
                  <span className="text-xs text-destructive">Com problemas</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Nenhuma vistoria neste dia</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}