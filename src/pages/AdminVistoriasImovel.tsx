import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { InspectionCalendar } from '@/components/InspectionCalendar';
import TeamInspectionDialog from '@/components/TeamInspectionDialog';
import { Headphones, Paperclip, ArrowLeft, User, Calendar, AlertTriangle, CheckCircle2, Building2, FileText, Plus, EyeOff } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

interface Inspection {
  id: string;
  created_at: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  audio_url?: string;
  notes?: string;
  transcript?: string;
  internal_only?: boolean;
}

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

export default function AdminVistoriasImovel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | "ok" | "nao">("todos");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showInspectionDialog, setShowInspectionDialog] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile, id]);

  const fetchData = async () => {
    try {
      // Fetch property
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, name, address, cover_photo_url')
        .eq('id', id)
        .single();

      if (propError) throw propError;
      setProperty(propData);

      // Fetch inspections
      const { data: inspData, error: inspError } = await supabase
        .from('cleaning_inspections')
        .select('*')
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      if (inspError) throw inspError;
      setInspections(inspData || []);

      // Fetch attachment counts
      if (inspData && inspData.length > 0) {
        const { data: attachData, error: attachError } = await supabase
          .from('cleaning_inspection_attachments')
          .select('inspection_id')
          .in('inspection_id', inspData.map(i => i.id));

        if (!attachError && attachData) {
          const counts: Record<string, number> = {};
          attachData.forEach(att => {
            counts[att.inspection_id] = (counts[att.inspection_id] || 0) + 1;
          });
          setAttachmentCounts(counts);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build calendar data
  const inspectionDates = useMemo(() => {
    const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();
    
    inspections.forEach(insp => {
      const dateKey = format(new Date(insp.created_at), 'yyyy-MM-dd');
      const existing = dateAggregates.get(dateKey) || { count: 0, hasProblems: false };
      existing.count++;
      if (insp.notes === 'NÃO') {
        existing.hasProblems = true;
      }
      dateAggregates.set(dateKey, existing);
    });

    const datesArray: InspectionDate[] = [];
    dateAggregates.forEach((value, key) => {
      datesArray.push({ date: key, ...value });
    });
    return datesArray;
  }, [inspections]);

  // Filter inspections
  const filteredInspections = useMemo(() => {
    let filtered = inspections;
    
    if (statusFilter === "ok") {
      filtered = filtered.filter((insp) => insp.notes === "OK");
    } else if (statusFilter === "nao") {
      filtered = filtered.filter((insp) => insp.notes === "NÃO");
    }

    if (selectedDate) {
      filtered = filtered.filter((insp) => 
        isSameDay(new Date(insp.created_at), selectedDate)
      );
    }
    
    return filtered;
  }, [statusFilter, inspections, selectedDate]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(prev => prev && isSameDay(prev, date) ? undefined : date);
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (!property) {
    return (
      <div className="container mx-auto p-4">
        <p>Imóvel não encontrado.</p>
      </div>
    );
  }

  const okCount = inspections.filter(i => i.notes === 'OK').length;
  const problemCount = inspections.filter(i => i.notes === 'NÃO').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/vistorias')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold line-clamp-1">{property.name}</h1>
              <p className="text-sm text-muted-foreground">
                {inspections.length} vistorias registradas
              </p>
            </div>
            <Button onClick={() => setShowInspectionDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Vistoria
            </Button>
          </div>
        </div>
      </header>

      <TeamInspectionDialog
        open={showInspectionDialog}
        onOpenChange={setShowInspectionDialog}
        propertyId={id!}
        propertyName={property.name}
        onSuccess={fetchData}
      />

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Main Content */}
          <div className="space-y-4">
            {/* Property Card */}
            <Card className="p-4 flex items-center gap-4">
              <div className="w-24 flex-shrink-0">
                <AspectRatio ratio={16 / 9} className="bg-muted rounded overflow-hidden">
                  {property.cover_photo_url ? (
                    <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </AspectRatio>
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{property.name}</h3>
                <p className="text-sm text-muted-foreground">{property.address || 'Sem endereço'}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {okCount} OK
                  </Badge>
                  <Badge variant="secondary" className="bg-destructive/20 text-destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {problemCount} Problemas
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={statusFilter === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("todos")}
              >
                Todos ({inspections.length})
              </Button>
              <Button
                variant={statusFilter === "ok" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("ok")}
                className={statusFilter === "ok" ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                OK ({okCount})
              </Button>
              <Button
                variant={statusFilter === "nao" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("nao")}
                className={statusFilter === "nao" ? "bg-red-600 hover:bg-red-700" : ""}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Problemas ({problemCount})
              </Button>
              
              {selectedDate && (
                <Badge variant="outline" className="ml-auto">
                  {format(selectedDate, "dd/MM/yyyy")}
                  <button 
                    onClick={() => setSelectedDate(undefined)}
                    className="ml-2 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>

            {/* Inspections List */}
            {filteredInspections.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {statusFilter !== "todos" || selectedDate
                    ? 'Nenhuma vistoria encontrada com os filtros selecionados.'
                    : 'Nenhuma vistoria registrada para este imóvel.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((inspection) => (
                  <Card
                    key={inspection.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/50"
                    onClick={() => navigate(`/admin/vistorias/${inspection.id}`)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Status Badge */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        inspection.notes === 'OK' 
                          ? 'bg-green-500/20 text-green-600' 
                          : 'bg-destructive/20 text-destructive'
                      }`}>
                        {inspection.notes === 'OK' ? (
                          <CheckCircle2 className="h-6 w-6" />
                        ) : (
                          <AlertTriangle className="h-6 w-6" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                          <Badge variant={inspection.notes === 'OK' ? 'secondary' : 'destructive'}>
                            {inspection.notes || '—'}
                          </Badge>
                        </div>

                        {inspection.cleaner_name && (
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{inspection.cleaner_name}</span>
                            {inspection.cleaner_phone && (
                              <span className="text-muted-foreground">({inspection.cleaner_phone})</span>
                            )}
                          </div>
                        )}

                        {/* Preview of transcript */}
                        {inspection.transcript && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            {inspection.transcript}
                          </p>
                        )}

                        {/* Indicators */}
                        <div className="flex items-center gap-3 mt-2">
                          {inspection.internal_only && (
                            <Badge variant="outline" className="text-xs bg-muted">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Interna
                            </Badge>
                          )}
                          {inspection.audio_url && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Headphones className="h-3 w-3" />
                              Áudio
                            </div>
                          )}
                          {attachmentCounts[inspection.id] > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {attachmentCounts[inspection.id]} anexos
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Calendar Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start">
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