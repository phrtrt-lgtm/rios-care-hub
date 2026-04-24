import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, Headphones, FileText, CheckCircle2, AlertTriangle, Building2, Wrench, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingScreen } from "@/components/LoadingScreen";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { MediaGallery } from "@/components/MediaGallery";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { InspectionCommentThread } from "@/components/comments/InspectionCommentThread";

interface Inspection {
  id: string;
  property_id: string;
  cleaner_name: string | null;
  cleaner_phone: string | null;
  notes: string | null;
  transcript: string | null;
  audio_url: string | null;
  created_at: string;
  property: {
    name: string;
    cover_photo_url: string | null;
  };
}

interface Attachment {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  maintenance_ticket_id?: string | null;
}

export default function VistoriaDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchInspection();
  }, [id, user, navigate]);

  const fetchInspection = async () => {
    try {
      setLoading(true);

      // Buscar vistoria
      const { data: inspectionData, error: inspError } = await supabase
        .from("cleaning_inspections")
        .select(`
          *,
          property:properties!inner(name, cover_photo_url, owner_id)
        `)
        .eq("id", id!)
        .single();

      if (inspError) throw inspError;

      // Verificar se o usuário é o dono e tem acesso habilitado
      if (inspectionData.property.owner_id !== user!.id) {
        navigate("/minha-caixa");
        return;
      }

      const { data: settings } = await supabase
        .from("inspection_settings")
        .select("owner_portal_enabled")
        .eq("property_id", inspectionData.property_id)
        .eq("owner_portal_enabled", true)
        .single();

      if (!settings) {
        navigate("/minha-caixa");
        return;
      }

      setInspection(inspectionData);

      // Buscar anexos
      const { data: attachmentsData } = await supabase
        .from("cleaning_inspection_attachments")
        .select("*")
        .eq("inspection_id", id!);

      const attachmentsList = attachmentsData || [];
      setAttachments(attachmentsList);

      // Preload all media
      const mediaUrls = attachmentsList
        .filter(a => a.file_type?.startsWith('image/') || a.file_type?.startsWith('video/'))
        .map(a => a.file_url);
      if (mediaUrls.length > 0) {
        preloadMediaUrls(mediaUrls);
      }
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      navigate("/vistorias");
    } finally {
      setLoading(false);
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

  // Check if transcript contains AI summary indicators
  const hasSummary = inspection?.transcript?.includes('✅') || 
                     inspection?.transcript?.includes('🔧') || 
                     inspection?.transcript?.includes('💧') || 
                     inspection?.transcript?.includes('⚡');

  if (loading) {
    return <LoadingScreen />;
  }

  if (!inspection) {
    return null;
  }

  const isOk = inspection.notes === 'OK';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/minha-caixa", location)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Detalhes da Vistoria</h1>
              <p className="text-sm text-muted-foreground">{inspection.property.name}</p>
            </div>
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

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="space-y-6">
          {/* Property & Date Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div 
                  className="w-20 h-14 rounded overflow-hidden bg-muted flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  onClick={() => navigate(`/vistorias?property=${inspection.property_id}`)}
                >
                  {inspection.property.cover_photo_url ? (
                    <img 
                      src={inspection.property.cover_photo_url} 
                      alt={inspection.property.name} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 
                    className="font-semibold cursor-pointer hover:text-primary hover:underline transition-colors"
                    onClick={() => navigate(`/vistorias?property=${inspection.property_id}`)}
                  >
                    {inspection.property.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </div>

              {inspection.cleaner_name && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{inspection.cleaner_name}</span>
                  {inspection.cleaner_phone && (
                    <span className="text-muted-foreground">({inspection.cleaner_phone})</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audio Section */}
          {audioAttachments.length > 0 && (
            <Card>
              <CardContent className="p-4">
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
              </CardContent>
            </Card>
          )}

          {/* Transcript/Summary Section */}
          {inspection.transcript && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">
                    {hasSummary ? 'Resumo e Análise' : 'Transcrição'}
                  </h3>
                </div>
                <div className={`whitespace-pre-wrap text-sm rounded-lg p-4 ${
                  hasSummary 
                    ? isOk 
                      ? 'bg-success/10 border border-success/30/30' 
                      : 'bg-destructive/10 border border-destructive/30'
                    : 'bg-muted'
                }`}>
                  {inspection.transcript}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          {inspection && <InspectionCommentThread inspectionId={inspection.id} />}

          {/* Media Gallery */}
          {mediaAttachments.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="font-semibold">Fotos e Vídeos</h3>
                  <Badge variant="secondary">{pendingMedia.length}</Badge>
                </div>
                {pendingMedia.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {pendingMedia.map((media) => (
                      <MediaThumbnail
                        key={media.id}
                        src={media.file_url}
                        fileType={media.file_type}
                        fileName={media.file_name}
                        size="lg"
                        onClick={() => handleMediaClick(media)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Todas as fotos desta vistoria já foram atribuídas a manutenções.
                  </p>
                )}

                {linkedMedia.length > 0 && (
                  <Collapsible className="mt-4">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronDown className="h-4 w-4" />
                        Já em manutenção ({linkedMedia.length})
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                        {linkedMedia.map((att) => (
                          <div key={att.id} className="relative aspect-square rounded-lg overflow-hidden">
                            <img
                              src={att.file_url}
                              alt={att.file_name || 'Foto'}
                              className="w-full h-full object-cover opacity-50 grayscale"
                            />
                            <div className="absolute top-1 left-1">
                              <div className="bg-background/80 rounded p-0.5">
                                <Wrench className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
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
    </div>
  );
}