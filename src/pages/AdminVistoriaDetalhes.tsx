import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MediaThumbnail } from '@/components/MediaThumbnail';
import { MediaGallery } from '@/components/MediaGallery';
import { CreateMaintenanceFromInspectionDialog } from '@/components/CreateMaintenanceFromInspectionDialog';
import { preloadMediaUrls } from '@/hooks/useMediaCache';
import { ArrowLeft, Calendar, User, CheckCircle2, AlertTriangle, Headphones, FileText, Building2, Wrench, Plus, Sparkles, Loader2 } from 'lucide-react';
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
}

export default function AdminVistoriaDetalhes() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent') {
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

  const generateAISummary = async () => {
    if (!inspection?.transcript) return;
    
    setGeneratingSummary(true);
    try {
      const response = await supabase.functions.invoke('generate-inspection-summary', {
        body: { 
          inspectionId: inspection.id,
          transcript: inspection.transcript 
        }
      });

      if (response.error) throw response.error;
      
      const summary = response.data?.summary;
      if (summary) {
        setInspection(prev => prev ? { ...prev, transcript_summary: summary } : null);
        toast.success('Resumo gerado com sucesso!');
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

  const imageAttachments = attachments.filter(a => a.file_type?.startsWith('image/'));
  const videoAttachments = attachments.filter(a => a.file_type?.startsWith('video/'));
  const audioAttachments = attachments.filter(a => a.file_type?.startsWith('audio/'));
  const mediaAttachments = [...imageAttachments, ...videoAttachments];

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
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Detalhes da Vistoria</h1>
              <p className="text-sm text-muted-foreground">{property.name}</p>
            </div>
            <Badge 
              variant={isOk ? "secondary" : "destructive"}
              className={isOk ? "bg-green-500/20 text-green-700 dark:text-green-400" : ""}
            >
              {isOk ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
              {inspection.notes || '—'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Property & Date Info */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
                {property.cover_photo_url ? (
                  <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{property.name}</h3>
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
                  <div key={audio.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="text-sm text-muted-foreground mb-2">Áudio {idx + 1}</div>
                    <audio controls src={audio.file_url} className="w-full" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* AI Summary Section - Show first if available */}
          {inspection.transcript_summary && (
            <Card className="p-4 border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-blue-500/10">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-purple-700 dark:text-purple-300">Análise da IA</h3>
              </div>
              <div className="whitespace-pre-wrap text-sm">
                {inspection.transcript_summary}
              </div>
            </Card>
          )}

          {/* Generate AI Summary Button - Show if transcript exists but no summary */}
          {canGenerateSummary && (
            <Card className="p-4 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-blue-500/5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <div>
                    <h3 className="font-semibold text-purple-700 dark:text-purple-300">Análise da IA</h3>
                    <p className="text-sm text-muted-foreground">Gere um resumo automático da transcrição</p>
                  </div>
                </div>
                <Button 
                  onClick={generateAISummary}
                  disabled={generatingSummary}
                  variant="outline"
                  className="gap-2 border-purple-500/50 text-purple-700 hover:bg-purple-500/10"
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

          {/* Media Gallery */}
          {mediaAttachments.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Fotos e Vídeos</h3>
                <Badge variant="secondary">{mediaAttachments.length}</Badge>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {mediaAttachments.map((attachment) => (
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

          {/* Create Maintenance Section - Always show for inspections with problems */}
          {inspection.notes === 'NÃO' && (
            <Card className="p-4 border-destructive/50 bg-destructive/5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-destructive">Problemas Identificados</h3>
                  <p className="text-sm text-muted-foreground">
                    Crie manutenções para resolver os problemas encontrados. Você pode selecionar quais anexos importar.
                  </p>
                </div>
                <Button 
                  onClick={() => setMaintenanceDialogOpen(true)}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  Nova Manutenção
                </Button>
              </div>
            </Card>
          )}
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
    </div>
  );
}