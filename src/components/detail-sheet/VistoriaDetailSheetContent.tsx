import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  User,
  Phone,
  Calendar,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';

interface Props {
  id: string;
  onOpenFull: () => void;
}

interface InspectionData {
  id: string;
  notes: string | null;
  created_at: string;
  cleaner_name: string | null;
  cleaner_phone: string | null;
  transcript_summary: string | null;
  transcript: string | null;
  property: {
    name: string;
    cover_photo_url: string | null;
  } | null;
  attachments: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type: string | null;
    maintenance_ticket_id?: string | null;
  }>;
}

export function VistoriaDetailSheetContent({ id, onOpenFull }: Props) {
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: insp, error } = await supabase
          .from('cleaning_inspections')
          .select(
            `
              id, notes, created_at, cleaner_name, cleaner_phone,
              transcript_summary, transcript,
              property:properties(name, cover_photo_url)
            `,
          )
          .eq('id', id)
          .single();
        if (error) throw error;

        const { data: attachments } = await supabase
          .from('cleaning_inspection_attachments')
          .select('id, file_url, file_name, file_type, maintenance_ticket_id')
          .eq('inspection_id', id);

        if (!cancelled) {
          setInspection({
            ...(insp as any),
            attachments: attachments || [],
          });
        }
      } catch (err) {
        console.error('Erro ao carregar vistoria:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Vistoria não encontrada.
      </div>
    );
  }

  const isOk = inspection.notes === 'OK';
  const imageAttachments = inspection.attachments.filter((a) =>
    a.file_type?.startsWith('image/'),
  );

  return (
    <div className="space-y-5">
      {/* Status */}
      <div>
        <Badge
          variant="outline"
          className={
            isOk
              ? 'bg-success/10 text-success border-success/30'
              : 'bg-destructive/10 text-destructive border-destructive/30'
          }
        >
          {isOk ? (
            <>
              <CheckCircle2 className="h-3 w-3 mr-1" /> OK
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 mr-1" /> Problema
            </>
          )}
        </Badge>
      </div>

      {/* Imóvel */}
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-md overflow-hidden bg-muted shrink-0">
          {inspection.property?.cover_photo_url ? (
            <img
              src={inspection.property.cover_photo_url}
              alt={inspection.property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{inspection.property?.name || 'Imóvel'}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Calendar className="h-3 w-3" />
            {format(new Date(inspection.created_at), "dd 'de' MMM 'às' HH:mm", {
              locale: ptBR,
            })}
          </div>
        </div>
      </div>

      {/* Faxineira */}
      {(inspection.cleaner_name || inspection.cleaner_phone) && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          {inspection.cleaner_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{inspection.cleaner_name}</span>
            </div>
          )}
          {inspection.cleaner_phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{inspection.cleaner_phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Resumo IA */}
      {inspection.transcript_summary && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-primary">Resumo da IA</p>
          </div>
          <p className="text-sm whitespace-pre-wrap">{inspection.transcript_summary}</p>
        </div>
      )}

      {/* Transcript se não tiver summary */}
      {!inspection.transcript_summary && inspection.transcript && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Transcrição</p>
          <p className="text-sm whitespace-pre-wrap line-clamp-6">{inspection.transcript}</p>
        </div>
      )}

      {/* Fotos */}
      {imageAttachments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Fotos ({imageAttachments.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {imageAttachments.slice(0, 6).map((att) => {
              const isLinked = !!att.maintenance_ticket_id;
              return (
                <a
                  key={att.id}
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative aspect-square rounded-md overflow-hidden border bg-muted block ${
                    isLinked ? 'ring-2 ring-primary/40' : ''
                  }`}
                >
                  <img
                    src={att.file_url}
                    alt={att.file_name || 'Foto'}
                    className={`w-full h-full object-cover ${isLinked ? 'opacity-80' : ''}`}
                    loading="lazy"
                  />
                  {isLinked && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                      <ClipboardCheck className="h-3 w-3" />
                    </div>
                  )}
                </a>
              );
            })}
          </div>
          {imageAttachments.some((a) => a.maintenance_ticket_id) && (
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3 text-primary" /> Já virou manutenção
            </p>
          )}
          {imageAttachments.length > 6 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              +{imageAttachments.length - 6} fotos
            </p>
          )}
        </div>
      )}

      {/* Botão final */}
      <div className="pt-2">
        <Button onClick={onOpenFull} className="w-full" variant="outline">
          <ExternalLink className="h-4 w-4 mr-2" />
          Ver página completa
        </Button>
      </div>
    </div>
  );
}
