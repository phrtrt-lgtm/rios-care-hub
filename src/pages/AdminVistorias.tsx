import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InspectionCalendar } from '@/components/InspectionCalendar';
import {
  Settings,
  List,
  Search,
  ArrowLeft,
  Building2,
  AlertTriangle,
  ClipboardCheck,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { saveScrollPosition } from '@/lib/navigation';
import { goBack } from '@/lib/navigation';

interface Property {
  id: string;
  name: string;
}

interface Inspection {
  id: string;
  property_id: string;
  notes: string;
  created_at: string;
}

interface PropertyRow {
  id: string;
  name: string;
  inspectionCount: number;
  problemCount: number;
  lastInspectionAt: string | null;
}

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

export default function AdminVistorias() {
  useScrollRestoration();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [inspectionDates, setInspectionDates] = useState<InspectionDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent' && profile?.role !== 'maintenance') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile]);

  const fetchData = async () => {
    try {
      const [{ data: properties, error: propError }, { data: inspections, error: inspError }] =
        await Promise.all([
          supabase.from('properties').select('id, name').order('name', { ascending: true }),
          supabase
            .from('cleaning_inspections')
            .select('id, property_id, notes, created_at')
            .order('created_at', { ascending: false }),
        ]);

      if (propError) throw propError;
      if (inspError) throw inspError;

      setAllProperties(properties || []);
      setAllInspections(inspections || []);

      const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();
      inspections?.forEach((insp) => {
        const dateKey = format(new Date(insp.created_at), 'yyyy-MM-dd');
        const existing = dateAggregates.get(dateKey) || { count: 0, hasProblems: false };
        existing.count++;
        if (insp.notes === 'NÃO') existing.hasProblems = true;
        dateAggregates.set(dateKey, existing);
      });

      const datesArray: InspectionDate[] = [];
      dateAggregates.forEach((value, key) => {
        datesArray.push({ date: key, ...value });
      });
      setInspectionDates(datesArray);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate((prev) => (prev && isSameDay(prev, date) ? undefined : date));
  };

  // Build a property list aggregated by inspection counts (filtered by date if active).
  const propertyRows = useMemo<PropertyRow[]>(() => {
    const filteredInspections = selectedDate
      ? allInspections.filter((insp) =>
          isSameDay(startOfDay(parseISO(insp.created_at)), startOfDay(selectedDate)),
        )
      : allInspections;

    const byProperty = new Map<string, { count: number; problem: number; last: string | null }>();
    for (const insp of filteredInspections) {
      const acc = byProperty.get(insp.property_id) || { count: 0, problem: 0, last: null };
      acc.count++;
      if (insp.notes === 'NÃO') acc.problem++;
      if (!acc.last || insp.created_at > acc.last) acc.last = insp.created_at;
      byProperty.set(insp.property_id, acc);
    }

    let rows: PropertyRow[] = allProperties.map((p) => {
      const agg = byProperty.get(p.id);
      return {
        id: p.id,
        name: p.name,
        inspectionCount: agg?.count || 0,
        problemCount: agg?.problem || 0,
        lastInspectionAt: agg?.last || null,
      };
    });

    // When filtering by date, hide properties without inspections that day.
    if (selectedDate) {
      rows = rows.filter((r) => r.inspectionCount > 0);
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(term));
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return rows;
  }, [allProperties, allInspections, searchTerm, selectedDate]);

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  const handleOpenProperty = (propertyId: string) => {
    saveScrollPosition('/admin/vistorias');
    navigate(`/admin/vistorias/${propertyId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, '/painel')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Vistorias de Faxina</h1>
              <p className="text-sm text-muted-foreground">
                {allProperties.length} imóveis · {allInspections.length} vistorias registradas
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/vistorias/todas')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              Ver Todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/vistorias/configuracoes')}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Config
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Pesquisar imóvel por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Active filters indicator */}
            {selectedDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </Badge>
                <button
                  type="button"
                  className="text-xs underline hover:text-foreground"
                  onClick={() => setSelectedDate(undefined)}
                >
                  Limpar data
                </button>
              </div>
            )}

            {propertyRows.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title={
                  searchTerm || selectedDate
                    ? 'Nenhum imóvel encontrado'
                    : 'Nenhum imóvel cadastrado'
                }
                description={
                  searchTerm || selectedDate
                    ? 'Tente ajustar os filtros aplicados.'
                    : 'Cadastre imóveis para começar a registrar vistorias.'
                }
              />
            ) : (
              <Card className="divide-y">
                {propertyRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleOpenProperty(row.id)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        window.open(`/admin/vistorias/${row.id}`, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}</p>
                      {row.lastInspectionAt && (
                        <p className="text-[11px] text-muted-foreground">
                          Última: {format(new Date(row.lastInspectionAt), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.problemCount > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 gap-1 text-[10px]">
                          <AlertTriangle className="h-3 w-3" />
                          {row.problemCount}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {row.inspectionCount}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </Card>
            )}
          </div>

          {/* Calendar Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start space-y-4">
            <InspectionCalendar
              inspectionDates={inspectionDates}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
