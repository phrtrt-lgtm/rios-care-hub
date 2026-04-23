import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { goBack, saveScrollPosition } from "@/lib/navigation";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Checkbox } from '@/components/ui/checkbox';
import { InspectionCalendar } from '@/components/InspectionCalendar';
import TeamInspectionDialog from '@/components/TeamInspectionDialog';
import { PropertyInspectionItemsKanban } from '@/components/InspectionItemsKanban';
import { Headphones, Paperclip, ArrowLeft, User, Calendar, AlertTriangle, CheckCircle2, Building2, FileText, Plus, EyeOff, Trash2, Archive, X } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
  owner_id: string;
}

interface Inspection {
  id: string;
  created_at: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  audio_url?: string;
  notes?: string;
  transcript?: string;
  transcript_summary?: string;
  internal_only?: boolean;
  archived_at?: string | null;
}

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

export default function AdminVistoriasImovel() {
  useScrollRestoration();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | "ok" | "nao" | "arquivadas">("todos");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [showInspectionDialog, setShowInspectionDialog] = useState(false);
  
  // Selection state (admin only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent' && profile?.role !== 'maintenance') {
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
        .select('id, name, address, cover_photo_url, owner_id')
        .eq('id', id)
        .maybeSingle();

      if (propError) throw propError;

      // If not a property, check if it's an inspection ID and redirect
      if (!propData) {
        const { data: inspData } = await supabase
          .from('cleaning_inspections')
          .select('id')
          .eq('id', id)
          .maybeSingle();

        if (inspData) {
          navigate(`/admin/vistoria/${id}`, { replace: true });
          return;
        }
        setLoading(false);
        return;
      }

      setProperty(propData);

      // Fetch inspections (including archived)
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

  // Build calendar data (exclude archived)
  const inspectionDates = useMemo(() => {
    const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();
    
    inspections
      .filter(i => !i.archived_at)
      .forEach(insp => {
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
    
    if (statusFilter === "arquivadas") {
      filtered = filtered.filter((insp) => insp.archived_at);
    } else {
      // Exclude archived from normal views
      filtered = filtered.filter((insp) => !insp.archived_at);
      
      if (statusFilter === "ok") {
        filtered = filtered.filter((insp) => insp.notes === "OK");
      } else if (statusFilter === "nao") {
        filtered = filtered.filter((insp) => insp.notes === "NÃO");
      }
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

  const toggleSelect = (inspectionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(inspectionId)) {
        next.delete(inspectionId);
      } else {
        next.add(inspectionId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInspections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInspections.map(i => i.id)));
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('cleaning_inspections')
        .update({ archived_at: new Date().toISOString() })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({ title: `${selectedIds.size} vistoria(s) arquivada(s)` });
      setSelectedIds(new Set());
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao arquivar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUnarchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('cleaning_inspections')
        .update({ archived_at: null })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({ title: `${selectedIds.size} vistoria(s) restaurada(s)` });
      setSelectedIds(new Set());
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao restaurar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    try {
      // First delete attachments
      await supabase
        .from('cleaning_inspection_attachments')
        .delete()
        .in('inspection_id', Array.from(selectedIds));

      // Then delete inspection items
      await supabase
        .from('inspection_items')
        .delete()
        .in('inspection_id', Array.from(selectedIds));

      // Finally delete inspections
      const { error } = await supabase
        .from('cleaning_inspections')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast({ title: `${selectedIds.size} vistoria(s) excluída(s)` });
      setSelectedIds(new Set());
      setShowDeleteDialog(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (!property) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">Imóvel não encontrado.</p>
        <Button variant="outline" onClick={() => goBack(navigate, "/admin/vistorias")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const activeInspections = inspections.filter(i => !i.archived_at);
  const archivedCount = inspections.filter(i => i.archived_at).length;
  const okCount = activeInspections.filter(i => i.notes === 'OK').length;
  const problemCount = activeInspections.filter(i => i.notes === 'NÃO').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/admin/vistorias")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold line-clamp-1">{property.name}</h1>
              <p className="text-sm text-muted-foreground">
                {activeInspections.length} vistorias registradas
              </p>
            </div>
            <Button onClick={() => setShowInspectionDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Vistoria
            </Button>
          </div>
        </div>
      </header>

      {/* Bulk Actions Bar (Admin only) */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="sticky top-16 z-10 bg-primary text-primary-foreground py-2 px-4 shadow-md">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.size === filteredInspections.length}
                onCheckedChange={toggleSelectAll}
                className="border-primary-foreground"
              />
              <span className="font-medium">{selectedIds.size} selecionada(s)</span>
            </div>
            <div className="flex items-center gap-2">
              {statusFilter === "arquivadas" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUnarchiveSelected}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  Restaurar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleArchiveSelected}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  Arquivar
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="text-primary-foreground hover:text-primary-foreground/80"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <TeamInspectionDialog
        open={showInspectionDialog}
        onOpenChange={setShowInspectionDialog}
        propertyId={id!}
        propertyName={property.name}
        onSuccess={fetchData}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} vistoria(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as vistorias selecionadas e seus anexos serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  <Badge variant="secondary" className="bg-success/20 text-success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {okCount} OK
                  </Badge>
                  <Badge variant="secondary" className="bg-destructive/20 text-destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {problemCount} Problemas
                  </Badge>
                  {archivedCount > 0 && (
                    <Badge variant="outline">
                      <Archive className="h-3 w-3 mr-1" />
                      {archivedCount} Arquivadas
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Problem Items Kanban - show when there are problem inspections OR inspections with AI summaries */}
            {statusFilter !== "arquivadas" && activeInspections.some(i => i.notes === 'NÃO' || i.transcript_summary) && (
              <PropertyInspectionItemsKanban
                propertyId={property.id}
                ownerId={property.owner_id}
                inspections={activeInspections
                  .filter(i => i.transcript_summary)
                  .map(i => ({ id: i.id, transcript_summary: i.transcript_summary || null }))}
                isAdmin={profile?.role === 'admin'}
              />
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {isAdmin && filteredInspections.length > 0 && (
                <Checkbox
                  checked={selectedIds.size === filteredInspections.length && filteredInspections.length > 0}
                  onCheckedChange={toggleSelectAll}
                  className="mr-2 self-center"
                />
              )}
              <Button
                variant={statusFilter === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => { setStatusFilter("todos"); setSelectedIds(new Set()); }}
              >
                Todos ({activeInspections.length})
              </Button>
              <Button
                variant={statusFilter === "ok" ? "default" : "outline"}
                size="sm"
                onClick={() => { setStatusFilter("ok"); setSelectedIds(new Set()); }}
                className={statusFilter === "ok" ? "bg-success hover:bg-success" : ""}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                OK ({okCount})
              </Button>
              <Button
                variant={statusFilter === "nao" ? "default" : "outline"}
                size="sm"
                onClick={() => { setStatusFilter("nao"); setSelectedIds(new Set()); }}
                className={statusFilter === "nao" ? "bg-destructive hover:bg-destructive" : ""}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Problemas ({problemCount})
              </Button>
              {archivedCount > 0 && (
                <Button
                  variant={statusFilter === "arquivadas" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setStatusFilter("arquivadas"); setSelectedIds(new Set()); }}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  Arquivadas ({archivedCount})
                </Button>
              )}
              
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
                  {statusFilter === "arquivadas"
                    ? 'Nenhuma vistoria arquivada.'
                    : statusFilter !== "todos" || selectedDate
                    ? 'Nenhuma vistoria encontrada com os filtros selecionados.'
                    : 'Nenhuma vistoria registrada para este imóvel.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((inspection) => (
                  <Card
                    key={inspection.id}
                    className={`p-4 transition-all hover:shadow-md ${
                      selectedIds.has(inspection.id) ? 'ring-2 ring-primary' : 'hover:border-primary/50'
                    } ${inspection.archived_at ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox (Admin only) */}
                      {isAdmin && (
                        <Checkbox
                          checked={selectedIds.has(inspection.id)}
                          onCheckedChange={() => toggleSelect(inspection.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3"
                        />
                      )}

                      {/* Status Badge */}
                      <div 
                        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer ${
                          inspection.notes === 'OK' 
                            ? 'bg-success/20 text-success' 
                            : 'bg-destructive/20 text-destructive'
                        }`}
                        onClick={() => { saveScrollPosition(pathname); navigate(`/admin/vistoria/${inspection.id}`); }}
                      >
                        {inspection.notes === 'OK' ? (
                          <CheckCircle2 className="h-6 w-6" />
                        ) : (
                          <AlertTriangle className="h-6 w-6" />
                        )}
                      </div>

                      {/* Content */}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => { saveScrollPosition(pathname); navigate(`/admin/vistoria/${inspection.id}`); }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                          <div className="flex items-center gap-2">
                            {inspection.archived_at && (
                              <Badge variant="outline" className="text-xs">
                                <Archive className="h-3 w-3 mr-1" />
                                Arquivada
                              </Badge>
                            )}
                            <Badge variant={inspection.notes === 'OK' ? 'secondary' : 'destructive'}>
                              {inspection.notes || '—'}
                            </Badge>
                          </div>
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