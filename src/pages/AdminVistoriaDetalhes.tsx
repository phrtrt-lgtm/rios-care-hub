import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MediaThumbnail } from '@/components/MediaThumbnail';
import { MediaGallery } from '@/components/MediaGallery';
import { preloadMediaUrls } from '@/hooks/useMediaCache';

interface Inspection {
  id: string;
  property_id: string;
  created_at: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  notes?: string;
  transcript?: string;
  audio_url?: string;
  monday_item_id?: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
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
          .select('id, name, address')
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

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>← Voltar</Button>
        <h1 className="text-2xl font-bold">Vistoria – {property.name}</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4 md:col-span-2 space-y-3">
          <div>
            <span className="font-semibold">Data:</span> {formatDateTime(inspection.created_at)}
          </div>
          
          <div>
            <span className="font-semibold">Faxineira:</span>{' '}
            {inspection.cleaner_name || '-'}
            {inspection.cleaner_phone && <span className="text-muted-foreground"> ({inspection.cleaner_phone})</span>}
          </div>

          <div>
            <span className="font-semibold">Status:</span>{' '}
            <span className={`font-bold ${inspection.notes === 'OK' ? 'text-green-600' : 'text-red-600'}`}>
              {inspection.notes || '-'}
            </span>
          </div>

          {audioAttachments.length > 0 && (
            <div className="space-y-3">
              <span className="font-semibold">Áudios:</span>
              {audioAttachments.map((audio, idx) => (
                <div key={audio.id} className="space-y-1">
                  <div className="text-sm text-muted-foreground">Áudio {idx + 1}</div>
                  <audio controls src={audio.file_url} className="w-full" />
                </div>
              ))}
            </div>
          )}

          {inspection.transcript && (
            <div className="space-y-2">
              <span className="font-semibold">Resumo / Transcrição:</span>
              <div className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">
                {inspection.transcript}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">Links</div>
          {inspection.monday_item_id ? (
            <div className="text-sm">
              Item Monday: <span className="font-mono">{inspection.monday_item_id}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Sem item no Monday</span>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Anexos</div>
        {attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum anexo.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
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
                  <div className="w-full h-24 rounded bg-muted flex flex-col items-center justify-center text-xs group-hover:bg-muted/80 transition">
                    <span className="text-muted-foreground">{attachment.file_type || 'arquivo'}</span>
                    <span className="mt-1">Abrir</span>
                  </div>
                </a>
              ))}
          </div>
        )}
      </Card>

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
