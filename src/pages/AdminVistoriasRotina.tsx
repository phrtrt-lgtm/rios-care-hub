import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Search,
  ClipboardList,
  AlertTriangle,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { goBack, saveScrollPosition } from '@/lib/navigation';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

const PROBLEM_FIELDS = [
  'ac_working',
  'tv_internet_working',
  'outlets_switches_working',
  'doors_locks_working',
  'curtains_rods_working',
  'bathroom_working',
  'furniture_working',
  'kitchen_working',
  'stove_oven_working',
  'cutlery_ok',
] as const;

interface Row {
  id: string;
  name: string;
  total: number;
  lastAt: string | null;
  daysSinceLast: number | null;
  avgIntervalDays: number | null;
  problems: number;
  lastInspector: string | null;
  priority: number;
}

type SortKey =
  | 'name'
  | 'total'
  | 'daysSinceLast'
  | 'avgIntervalDays'
  | 'problems'
  | 'lastAt'
  | 'priority';

export default function AdminVistoriasRotina() {
  useScrollRestoration();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (authLoading) return;
    if (profile?.role !== 'admin' && profile?.role !== 'agent' && profile?.role !== 'maintenance') {
      navigate('/');
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  const fetchData = async () => {
    try {
      const [{ data: properties, error: propError }, { data: inspections, error: inspError }] =
        await Promise.all([
          supabase.from('properties').select('id, name').order('name'),
          supabase
            .from('cleaning_inspections')
            .select('id, property_id, created_at, cleaner_name')
            .eq('is_routine', true)
            .is('archived_at', null)
            .order('created_at', { ascending: false }),
        ]);
      if (propError) throw propError;
      if (inspError) throw inspError;

      const ids = (inspections || []).map((i) => i.id);
      let checklists: any[] = [];
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from('routine_inspection_checklists')
          .select('*')
          .in('inspection_id', ids);
        if (error) throw error;
        checklists = data || [];
      }

      const problemsByInspection = new Map<string, number>();
      for (const c of checklists) {
        const count = PROBLEM_FIELDS.reduce(
          (acc, f) => acc + (c[f] === 'problema' ? 1 : 0),
          0,
        );
        problemsByInspection.set(
          c.inspection_id,
          (problemsByInspection.get(c.inspection_id) || 0) + count,
        );
      }

      const byProperty = new Map<
        string,
        { dates: Date[]; problems: number; lastInspector: string | null }
      >();
      for (const insp of inspections || []) {
        const acc =
          byProperty.get(insp.property_id) || { dates: [], problems: 0, lastInspector: null };
        acc.dates.push(new Date(insp.created_at));
        acc.problems += problemsByInspection.get(insp.id) || 0;
        if (acc.lastInspector === null) acc.lastInspector = insp.cleaner_name ?? null;
        byProperty.set(insp.property_id, acc);
      }

      const today = new Date();
      const built: Row[] = (properties || []).map((p) => {
        const agg = byProperty.get(p.id);
        const dates = (agg?.dates || []).slice().sort((a, b) => b.getTime() - a.getTime());
        const lastAt = dates[0] ? dates[0].toISOString() : null;
        const daysSinceLast = dates[0] ? differenceInCalendarDays(today, dates[0]) : null;

        let avgIntervalDays: number | null = null;
        if (dates.length >= 2) {
          const spanDays = differenceInCalendarDays(dates[0], dates[dates.length - 1]);
          avgIntervalDays = Math.round(spanDays / (dates.length - 1));
        }

        // Priority: never inspected = maximum; otherwise days waiting vs expected cadence.
        const cadence = avgIntervalDays && avgIntervalDays > 0 ? avgIntervalDays : 30;
        const priority =
          dates.length === 0 ? 9999 : Math.round(((daysSinceLast || 0) / cadence) * 100);

        return {
          id: p.id,
          name: p.name,
          total: dates.length,
          lastAt,
          daysSinceLast,
          avgIntervalDays,
          problems: agg?.problems || 0,
          lastInspector: agg?.lastInspector || null,
          priority,
        };
      });

      setRows(built);
    } catch (e) {
      console.error('Erro ao carregar vistorias de rotina:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(t));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'pt-BR') * dir;
      if (sortKey === 'lastAt') {
        const av = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const bv = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return (av - bv) * dir;
      }
      const av = (a[sortKey] as number | null) ?? -1;
      const bv = (b[sortKey] as number | null) ?? -1;
      if (av === bv) return a.name.localeCompare(b.name, 'pt-BR');
      return (av - bv) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  const stats = useMemo(() => {
    const withInsp = rows.filter((r) => r.total > 0);
    const never = rows.length - withInsp.length;
    const overdue = withInsp.filter((r) => (r.daysSinceLast ?? 0) > 30).length;
    const total = rows.reduce((s, r) => s + r.total, 0);
    return { never, overdue, total };
  }, [rows]);

  if (authLoading || loading) return <LoadingScreen />;

  const SortHeader = ({
    label,
    keyName,
    className,
  }: {
    label: string;
    keyName: SortKey;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(keyName)}
      className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors ${className || ''}`}
    >
      {label}
      {sortKey === keyName &&
        (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  const priorityBadge = (row: Row) => {
    if (row.total === 0)
      return (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          Nunca vistoriado
        </Badge>
      );
    if (row.priority >= 150)
      return (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          Atrasado
        </Badge>
      );
    if (row.priority >= 100)
      return (
        <Badge className="h-5 px-1.5 text-[10px] bg-warning text-warning-foreground">
          No prazo limite
        </Badge>
      );
    return (
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
        Em dia
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, '/admin/vistorias')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold truncate">Vistorias de Rotina</h1>
              <p className="text-sm text-muted-foreground truncate">
                {stats.total} vistorias · {stats.overdue} imóveis com mais de 30 dias ·{' '}
                {stats.never} nunca vistoriados
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar imóvel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Nenhum imóvel encontrado"
            description="Ajuste a pesquisa para ver os imóveis e suas vistorias de rotina."
          />
        ) : (
          <Card className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[minmax(180px,2fr)_90px_120px_110px_120px_100px_140px_32px] items-center gap-2 border-b px-3 py-2">
                <SortHeader label="Imóvel" keyName="name" />
                <SortHeader label="Vistorias" keyName="total" />
                <SortHeader label="Última" keyName="lastAt" />
                <SortHeader label="Dias sem" keyName="daysSinceLast" />
                <SortHeader label="Média (dias)" keyName="avgIntervalDays" />
                <SortHeader label="Problemas" keyName="problems" />
                <SortHeader label="Prioridade" keyName="priority" />
                <span />
              </div>
              {sorted.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    saveScrollPosition('/admin/vistorias/rotina');
                    navigate(`/admin/vistorias/${row.id}`);
                  }}
                  className="w-full grid grid-cols-[minmax(180px,2fr)_90px_120px_110px_120px_100px_140px_32px] items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted/50 transition-colors last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}</p>
                      {row.lastInspector && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {row.lastInspector}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums">{row.total}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.lastAt
                      ? format(new Date(row.lastAt), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </span>
                  <span
                    className={`text-sm tabular-nums ${
                      (row.daysSinceLast ?? 0) > 30 || row.total === 0
                        ? 'text-destructive font-medium'
                        : ''
                    }`}
                  >
                    {row.daysSinceLast != null ? `${row.daysSinceLast} d` : '—'}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.avgIntervalDays != null ? `${row.avgIntervalDays} d` : '—'}
                  </span>
                  <span className="text-sm tabular-nums">
                    {row.problems > 0 ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {row.problems}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </span>
                  <span>{priorityBadge(row)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Prioridade compara os dias sem vistoria com a cadência média do próprio imóvel (padrão de
          30 dias quando ainda não há histórico suficiente). Problemas somam os itens marcados como
          “problema” nos checklists de rotina.
        </p>
      </main>
    </div>
  );
}
