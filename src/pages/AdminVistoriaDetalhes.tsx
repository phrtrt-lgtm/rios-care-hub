import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MediaThumbnail } from '@/components/MediaThumbnail';
import { MediaGallery } from '@/components/MediaGallery';
import { CreateMaintenanceFromInspectionDialog } from '@/components/CreateMaintenanceFromInspectionDialog';
import { LinkInspectionAttachmentsDialog } from '@/components/LinkInspectionAttachmentsDialog';
import EditInspectionDialog from '@/components/EditInspectionDialog';
import { RoutineChecklistDisplay } from '@/components/RoutineChecklistDisplay';
import { preloadMediaUrls } from '@/hooks/useMediaCache';
import { InspectionCommentThread } from '@/components/comments/InspectionCommentThread';
import { ArrowLeft, Calendar, User, CheckCircle2, AlertTriangle, Headphones, FileText, Building2, Wrench, Plus, Sparkles, Loader2, Pencil, RefreshCw, Import, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Inspection {
  id: string;
  property_id: string;
  created_at: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  notes?: string;
  transcript?: string;
  transcript_summary?: string;
  audio_url?: string;
  monday_item_id?: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
  owner_id: string;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  size_bytes?: number;
  maintenance_ticket_id?: string | null;
}

// Component to show audio with duration
function AudioWithDuration({ audio, index }: { audio: Attachment; index: number }) {
  const [duration, setDuration] = useState<string>('...');

  // Get duration using a separate Audio element
  useEffect(() => {
    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    
    const handleLoadedMetadata = () => {
      const secs = tempAudio.duration;
      if (isFinite(secs) && !isNaN(secs)) {
        const mins = Math.floor(secs / 60);
        const remainingSecs = Math.floor(secs % 60);
        setDuration(`${mins}:${remainingSecs.toString().padStart(2, '0')}`);
      }
    };

    const handleError = () => {
      // If we can't load metadata, show file size as fallback
      if (audio.size_bytes) {
        const kb = Math.round((audio as any).size_bytes / 1024);
        setDuration(`${kb}KB`);
      } else {
        setDuration('—');
      }
    };
    
    tempAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    tempAudio.addEventListener('error', handleError);
    tempAudio.src = audio.file_url;
    
    return () => {
      tempAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      tempAudio.removeEventListener('error', handleError);
      tempAudio.src = '';
    };
  }, [audio.file_url]);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Áudio {index + 1}</span>
        <Badge variant="outline" className="text-xs">{duration}</Badge>
      </div>
      <audio controls src={audio.file_url} className="w-full" preload="metadata" />
    </div>
  );
}

export default function AdminVistoriaDetalhes() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, loading: authLoading } = useAuth();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [importingToKanban, setImportingToKanban] = useState(false);
  const [routineChecklist, setRoutineChecklist] = useState<any>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent' && profile?.role !== 'maintenance') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile, inspectionId]);

  const fetchData = async () => {
    try {
      // Fetch inspection
      const { data: inspData, error: inspError } = await supabase
        .from('cleaning_inspections')
        .select('*')
        .eq('id', inspectionId)
        .single();

      if (inspError) throw inspError;
      setInspection(inspData);

      // Fetch property
      if (inspData) {
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('id, name, address, cover_photo_url, owner_id')
          .eq('id', inspData.property_id)
          .single();

        if (propError) throw propError;
        setProperty(propData);

        // Fetch attachments
        const { data: attachData, error: attachError } = await supabase
          .from('cleaning_inspection_attachments')
          .select('*')
          .eq('inspection_id', inspectionId)
          .order('created_at');

        if (attachError) throw attachError;
        const attachmentsList = attachData || [];
        setAttachments(attachmentsList);

        // Fetch routine checklist if is_routine
        if (inspData.is_routine) {
          const { data: checklistData } = await supabase
            .from('routine_inspection_checklists')
            .select('*')
            .eq('inspection_id', inspectionId!)
            .maybeSingle();
          setRoutineChecklist(checklistData);
        }

        // Preload all media
        const mediaUrls = attachmentsList
          .filter(a => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/'))
          .map(a => a.file_url);
        if (mediaUrls.length > 0) {
          preloadMediaUrls(mediaUrls);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async (customPrompt?: string) => {
    if (!inspection?.transcript) return;
    
    setGeneratingSummary(true);
    try {
      const response = await supabase.functions.invoke('generate-inspection-summary', {
        body: { 
          inspectionId: inspection.id,
          transcript: inspection.transcript,
          extraPrompt: customPrompt || undefined
        }
      });

      if (response.error) throw response.error;
      
      const summary = response.data?.summary;
      if (summary) {
        setInspection(prev => prev ? { ...prev, transcript_summary: summary } : null);
        toast.success('Resumo gerado com sucesso!');
        setRegenerateDialogOpen(false);
        setExtraPrompt('');
      } else {
        toast.error('Não foi possível gerar o resumo');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Erro ao gerar resumo');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const CATEGORY_PATTERNS: { pattern: RegExp; category: string }[] = [
    { pattern: /PEDREIRO|ALVENARIA/i, category: 'PEDREIRO/ALVENARIA' },
    { pattern: /VIDRACEIRO/i, category: 'VIDRACEIRO' },
    { pattern: /HIDR[ÁA]ULICA/i, category: 'HIDRÁULICA' },
    { pattern: /EL[ÉE]TRICA/i, category: 'ELÉTRICA' },
    { pattern: /MARCENARIA/i, category: 'MARCENARIA' },
    { pattern: /MANUTEN[ÇC][ÃA]O\s*GERAL/i, category: 'MANUTENÇÃO GERAL' },
    { pattern: /REFRIGERA[ÇC][ÃA]O/i, category: 'REFRIGERAÇÃO' },
    { pattern: /LIMPEZA/i, category: 'LIMPEZA' },
    { pattern: /ITENS|REPOSI[ÇC][ÃA]O/i, category: 'ITENS/REPOSIÇÃO' },
  ];

  const parseAISummary = (summary: string): { category: string; description: string }[] => {
    const lines = summary.split('\n');
    const result: { category: string; description: string }[] = [];
    let currentCategory = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check if this line is a category header
      let foundCategory = false;
      for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(trimmed) && trimmed.includes(':')) {
          currentCategory = category;
          foundCategory = true;
          break;
        }
      }
      
      if (foundCategory) continue;

      // Check if it's a bullet point item
      if ((trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) && currentCategory) {
        const description = trimmed.replace(/^[•\-*]\s*/, '').trim();
        if (description) {
          result.push({ category: currentCategory, description });
        }
      }
    }

    return result;
  };

  const handleImportToKanban = async () => {
    if (!inspection?.transcript_summary) {
      toast.error('Nenhuma análise de IA disponível para importar');
      return;
    }

    setImportingToKanban(true);
    try {
      const parsedItems = parseAISummary(inspection.transcript_summary);
      
      if (parsedItems.length === 0) {
        toast.error('Não foi possível extrair itens da análise');
        return;
      }

      // Check if items already exist for this inspection
      const { data: existingItems } = await supabase
        .from('inspection_items')
        .select('id')
        .eq('inspection_id', inspection.id);

      if (existingItems && existingItems.length > 0) {
        toast.info('Os itens desta vistoria já foram importados');
        return;
      }

      // Insert all items
      const itemsToInsert = parsedItems.map((item, index) => ({
        inspection_id: inspection.id,
        category: item.category,
        description: item.description,
        status: 'pending',
        order_index: index,
      }));

      const { error } = await supabase
        .from('inspection_items')
        .insert(itemsToInsert);

      if (error) throw error;
      
      toast.success(`${parsedItems.length} itens importados para o Kanban do imóvel`);
    } catch (error) {
      console.error('Error importing items:', error);
      toast.error('Erro ao importar itens');
    } finally {
      setImportingToKanban(false);
    }
  };

  const imageAttachments = attachments.filter(a => a.file_type?.startsWith('image/'));
  const videoAttachments = attachments.filter(a => a.file_type?.startsWith('video/'));
  const audioAttachments = attachments.filter(a => a.file_type?.startsWith('audio/'));
  const mediaAttachments = [...imageAttachments, ...videoAttachments];
  const pendingMedia = mediaAttachments.filter(a => !a.maintenance_ticket_id);
  const linkedMedia = mediaAttachments.filter(a => !!a.maintenance_ticket_id);

  const handleMediaClick = (attachment: Attachment) => {
    const index = mediaAttachments.findIndex(a => a.id === attachment.id);
    if (index !== -1) {
      setGalleryStartIndex(index);
      setGalleryOpen(true);
    }
  };

  // Get the AI summary for passing to maintenance dialog
  const transcriptSummaryForDialog = inspection?.transcript_summary || inspection?.transcript || '';
  
  // Show generate button if there's transcript but no summary
  const canGenerateSummary = inspection?.transcript && !inspection?.transcript_summary;

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (!inspection || !property) {
    return (
      <div className="container mx-auto p-4">
        <p>Vistoria não encontrada.</p>
      </div>
    );
  }

  const isOk = inspection.notes === 'OK';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/admin/vistorias/todas", location)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Detalhes da Vistoria</h1>
              <p className="text-sm text-muted-foreground">{property.name}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setEditDialogOpen(true)}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Badge 
              variant={isOk ? "secondary" : "destructive"}
              className={isOk ? "bg-success/20 text-success" : ""}
            >
              {isOk ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
              {inspection.notes || '—'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Quick Maintenance Button at Top */}
          <div className="flex justify-end">
            <Button
              onClick={() => setMaintenanceDialogOpen(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Wrench className="h-4 w-4" />
              Nova Manutenção
            </Button>
          </div>

          {/* Property & Date Info */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div 
                className="w-20 h-14 rounded overflow-hidden bg-muted flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => navigate(`/admin/vistorias/${property.id}`)}
              >
                {property.cover_photo_url ? (
                  <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 
                  className="font-semibold cursor-pointer hover:text-primary hover:underline transition-colors"
                  onClick={() => navigate(`/admin/vistorias/${property.id}`)}
                >
                  {property.name}
                </h3>
                <p className="text-sm text-muted-foreground">{property.address || 'Sem endereço'}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
              {inspection.cleaner_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{inspection.cleaner_name}</span>
                  {inspection.cleaner_phone && (
                    <span className="text-muted-foreground">({inspection.cleaner_phone})</span>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Routine Checklist */}
          {routineChecklist && (
            <RoutineChecklistDisplay checklist={routineChecklist} />
          )}

          {/* Audio Section */}
          {audioAttachments.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Headphones className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Áudios Gravados</h3>
                <Badge variant="secondary">{audioAttachments.length}</Badge>
              </div>
              <div className="space-y-3">
                {audioAttachments.map((audio, idx) => (
                  <AudioWithDuration key={audio.id} audio={audio} index={idx} />
                ))}
              </div>
            </Card>
          )}

          {/* AI Summary Section - Show first if available */}
          {inspection.transcript_summary && (
            <Card className="p-4 border-primary/30/30 bg-gradient-to-br from-primary/10 to-info/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-primary dark:text-purple-300">Análise da IA</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleImportToKanban()}
                    disabled={importingToKanban}
                    className="gap-1.5 border-primary/30/50 text-primary hover:bg-primary/10"
                  >
                    {importingToKanban ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Import className="h-4 w-4" />
                    )}
                    Importar p/ Kanban
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRegenerateDialogOpen(true)}
                    className="gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerar
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm">
                {inspection.transcript_summary}
              </div>
            </Card>
          )}

          {/* Generate AI Summary Button - Show if transcript exists but no summary */}
          {canGenerateSummary && (
            <Card className="p-4 border-primary/30/30 bg-gradient-to-br from-primary/5 to-info/5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-primary dark:text-purple-300">Análise da IA</h3>
                    <p className="text-sm text-muted-foreground">Gere um resumo automático da transcrição</p>
                  </div>
                </div>
                <Button 
                  onClick={() => generateAISummary()}
                  disabled={generatingSummary}
                  variant="outline"
                  className="gap-2 border-primary/30/50 text-primary hover:bg-primary/10"
                >
                  {generatingSummary ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Gerar Resumo IA
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Transcript Section */}
          {inspection.transcript && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Transcrição do Áudio</h3>
              </div>
              <div className="whitespace-pre-wrap text-sm bg-muted rounded-lg p-4">
                {inspection.transcript}
              </div>
            </Card>
          )}

          {/* Comments */}
          {inspection && <InspectionCommentThread inspectionId={inspection.id} />}

          {/* Media Gallery */}
          {mediaAttachments.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Fotos e Vídeos</h3>
                  <Badge variant="secondary">{mediaAttachments.length}</Badge>
                </div>
                {pendingMedia.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Já virou manutenção
                  </Button>
                )}
              </div>
              {pendingMedia.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Pendentes ({pendingMedia.length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {pendingMedia.map((attachment) => (
                      <MediaThumbnail
                        key={attachment.id}
                        src={attachment.file_url}
                        fileType={attachment.file_type}
                        fileName={attachment.file_name}
                        size="lg"
                        onClick={() => handleMediaClick(attachment)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Todas as fotos desta vistoria já foram atribuídas a manutenções.
                </p>
              )}

              {linkedMedia.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-2">
                    <Wrench className="h-3 w-3" />
                    Já viraram manutenção ({linkedMedia.length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {linkedMedia.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => handleMediaClick(att)}
                        className="relative aspect-square rounded-lg overflow-hidden ring-2 ring-primary/40 group"
                      >
                        {att.file_type?.startsWith('image/') ? (
                          <img
                            src={att.file_url}
                            alt={att.file_name || 'Foto'}
                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Wrench className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-1 shadow-md">
                          <Wrench className="h-3 w-3" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Other attachments */}
          {attachments.filter(a => !a.file_type?.startsWith('image/') && !a.file_type?.startsWith('video/') && !a.file_type?.startsWith('audio/')).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Outros Anexos</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {attachments
                  .filter(a => !a.file_type?.startsWith('image/') && !a.file_type?.startsWith('video/') && !a.file_type?.startsWith('audio/'))
                  .map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="w-full h-20 rounded bg-muted flex flex-col items-center justify-center text-xs group-hover:bg-muted/80 transition">
                        <span className="text-muted-foreground">{attachment.file_type || 'arquivo'}</span>
                        <span className="mt-1 text-primary">Abrir</span>
                      </div>
                    </a>
                  ))}
              </div>
            </Card>
          )}

          {/* Create Maintenance Section - Always show for all inspections */}
          <Card className={`p-4 ${inspection.notes === 'NÃO' ? 'border-destructive/50 bg-destructive/5' : 'border-warning/30/30 bg-warning/5'}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className={`font-semibold ${inspection.notes === 'NÃO' ? 'text-destructive' : 'text-warning'}`}>Criar Manutenção</h3>
                <p className="text-sm text-muted-foreground">
                  {inspection.notes === 'NÃO'
                    ? 'Crie uma manutenção com anexos da vistoria. Para triagem automática, use o Kanban acima.'
                    : 'Crie uma manutenção preventiva a partir desta vistoria.'}
                </p>
              </div>
              <Button 
                onClick={() => setMaintenanceDialogOpen(true)}
                variant="outline"
                className="gap-2 w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Nova Manutenção
              </Button>
            </div>
          </Card>
        </div>
      </main>

      <MediaGallery
        items={mediaAttachments.map(a => ({
          id: a.id,
          file_url: a.file_url,
          file_name: a.file_name,
          file_type: a.file_type
        }))}
        initialIndex={galleryStartIndex}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />

      <CreateMaintenanceFromInspectionDialog
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        propertyId={property.id}
        propertyName={property.name}
        ownerId={property.owner_id}
        inspectionId={inspection.id}
        attachments={attachments}
        transcriptSummary={transcriptSummaryForDialog}
      />

      <EditInspectionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        inspection={{ ...inspection, is_routine: (inspection as any).is_routine, internal_only: (inspection as any).internal_only }}
        existingAttachments={attachments}
        routineChecklist={routineChecklist}
        onSuccess={fetchData}
      />

      {/* Regenerate AI Dialog */}
      <Dialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Regenerar Análise IA
            </DialogTitle>
            <DialogDescription>
              Gere uma nova análise da transcrição. Você pode adicionar um comando extra para personalizar o resultado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <label className="text-sm font-medium">Comando extra (opcional)</label>
            <Textarea
              placeholder="Ex: Agrupe por cômodo, destaque problemas urgentes, foque em problemas elétricos..."
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              A análise já agrupa por categoria de serviço. Use este campo para instruções adicionais.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setRegenerateDialogOpen(false);
                setExtraPrompt('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => generateAISummary(extraPrompt)}
              disabled={generatingSummary}
              className="gap-2 bg-primary hover:bg-primary"
            >
              {generatingSummary ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Regenerar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}