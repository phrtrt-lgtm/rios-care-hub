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
import { QuickInspectionAttachmentButton } from '@/components/QuickInspectionAttachmentButton';
import { CreateMaintenanceFromInspectionDialog } from '@/components/CreateMaintenanceFromInspectionDialog';
import { useDetailSheet } from '@/hooks/useDetailSheet';
import { DetailSheet } from '@/components/detail-sheet/DetailSheet';
import { getRowHandlers } from '@/lib/row-interaction';
import {
  Settings,
  List,
  Search,
  ArrowLeft,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Wrench,
  ChevronRight,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface Property {
  id: string;
  name: string;
  address?: string;
  cover_photo_url?: string;
  owner_id?: string;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
}

interface Inspection {
  id: string;
  property_id: string;
  notes: string;
  created_at: string;
  transcript_summary?: string;
  property?: Property;
  attachments?: Attachment[];
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
  const [inspectionDates, setInspectionDates] = useState<InspectionDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const detailSheet = useDetailSheet();

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
      // Fetch inspections with property info
      const { data: inspections, error: inspError } = await supabase
        .from('cleaning_inspections')
        .select(`
          id, property_id, notes, created_at, transcript_summary,
          property:properties(id, name, address, cover_photo_url, owner_id)
        `)
        .order('created_at', { ascending: false });

      if (inspError) throw inspError;

      const inspectionIds = (inspections || []).map((i) => i.id);
      const attachmentsMap = new Map<string, Attachment[]>();

      if (inspectionIds.length > 0) {
        const { data: attachmentsData } = await supabase
          .from('cleaning_inspection_attachments')
          .select('id, file_url, file_name, file_type, inspection_id')
          .in('inspection_id', inspectionIds);

        (attachmentsData || []).forEach((att) => {
          const existing = attachmentsMap.get(att.inspection_id) || [];
          existing.push({
            id: att.id,
            file_url: att.file_url,
            file_name: att.file_name || undefined,
            file_type: att.file_type || undefined,
          });
          attachmentsMap.set(att.inspection_id, existing);
        });
      }

      const inspectionsWithExtras = (inspections || []).map((insp) => ({
        ...insp,
        property: insp.property as unknown as Property,
        attachments: attachmentsMap.get(insp.id) || [],
      }));

      setAllInspections(inspectionsWithExtras);

      // Date aggregates for calendar
      const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();
      inspections?.forEach((insp) => {
        const dateKey = format(new Date(insp.created_at), 'yyyy-MM-dd');
        const dateExisting = dateAggregates.get(dateKey) || { count: 0, hasProblems: false };
        dateExisting.count++;
        if (insp.notes === 'NÃO') dateExisting.hasProblems = true;
        dateAggregates.set(dateKey, dateExisting);
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

  const handleNewMaintenance = (inspection: Inspection, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedInspection(inspection);
    setMaintenanceDialogOpen(true);
  };

  // Filter inspections by search term and selected date
  const filteredInspections = useMemo(() => {
    let list = allInspections;

    if (selectedDate) {
      const selectedDayStart = startOfDay(selectedDate);
      list = list.filter((insp) =>
        isSameDay(startOfDay(parseISO(insp.created_at)), selectedDayStart),
      );
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (insp) =>
          insp.property?.name?.toLowerCase().includes(term) ||
          insp.property?.address?.toLowerCase().includes(term),
      );
    }

    return list;
  }, [allInspections, searchTerm, selectedDate]);

  const problemInspections = useMemo(
    () => filteredInspections.filter((i) => i.notes === 'NÃO'),
    [filteredInspections],
  );
  const okInspections = useMemo(
    () => filteredInspections.filter((i) => i.notes === 'OK'),
    [filteredInspections],
  );

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  const renderInspectionRow = (inspection: Inspection, variant: 'problem' | 'ok') => {
    const baseClass =
      variant === 'problem'
        ? 'bg-destructive/10 dark:bg-red-950/30 hover:bg-destructive/15 dark:hover:bg-red-950/50'
        : 'bg-muted/50 hover:bg-muted';

    const handlers = getRowHandlers(`/admin/vistoria/${inspection.id}`, () =>
      detailSheet.openSheet(inspection.id, 'vistoria'),
    );

    return (
      <div
        key={inspection.id}
        {...handlers}
        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${baseClass}`}
      >
        {/* Thumbnail */}
        <div className="h-9 w-9 rounded-md overflow-hidden flex-shrink-0 bg-muted">
          {inspection.property?.cover_photo_url ? (
            <img
              src={inspection.property.cover_photo_url}
              alt={inspection.property.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {inspection.property?.name || 'Imóvel'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(inspection.created_at), 'dd/MM HH:mm', { locale: ptBR })}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0" data-no-sheet>
          <QuickInspectionAttachmentButton
            inspectionId={inspection.id}
            onSuccess={fetchData}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-warning shrink-0 whitespace-nowrap"
            onClick={(e) => handleNewMaintenance(inspection, e)}
          >
            <Wrench className="h-3 w-3" />
            <span className="hidden sm:inline ml-1">Manutenção</span>
          </Button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/painel')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Vistorias de Faxina</h1>
              <p className="text-sm text-muted-foreground">
                {allInspections.length} vistorias registradas
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
          {/* Inspection list */}
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Pesquisar imóvel por nome ou endereço..."
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

            {filteredInspections.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title={
                  searchTerm || selectedDate
                    ? 'Nenhuma vistoria encontrada'
                    : 'Nenhuma vistoria registrada'
                }
                description={
                  searchTerm || selectedDate
                    ? 'Tente ajustar os filtros aplicados.'
                    : 'As vistorias realizadas aparecerão aqui.'
                }
              />
            ) : (
              <Card className="p-4 space-y-4">
                {/* Problemas */}
                {problemInspections.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <p className="text-xs font-semibold text-destructive">
                        Problemas ({problemInspections.length})
                      </p>
                    </div>
                    <div className="space-y-1">
                      {problemInspections.map((insp) => renderInspectionRow(insp, 'problem'))}
                    </div>
                  </div>
                )}

                {/* OK */}
                {okInspections.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <p className="text-xs font-semibold text-success">
                        OK ({okInspections.length})
                      </p>
                    </div>
                    <div className="space-y-1">
                      {okInspections.map((insp) => renderInspectionRow(insp, 'ok'))}
                    </div>
                  </div>
                )}
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

      {selectedInspection && selectedInspection.property && (
        <CreateMaintenanceFromInspectionDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          propertyId={selectedInspection.property.id}
          propertyName={selectedInspection.property.name}
          ownerId={selectedInspection.property.owner_id || ''}
          inspectionId={selectedInspection.id}
          attachments={selectedInspection.attachments || []}
          transcriptSummary={selectedInspection.transcript_summary}
        />
      )}

      <DetailSheet
        open={detailSheet.open}
        onClose={detailSheet.closeSheet}
        entityId={detailSheet.entityId}
        entityType={detailSheet.entityType}
      />
    </div>
  );
}
