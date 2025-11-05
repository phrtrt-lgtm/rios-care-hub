import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
        setAttachments(attachData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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

          {inspection.audio_url && (
            <div className="space-y-2">
              <span className="font-semibold">Áudio:</span>
              <audio controls src={inspection.audio_url} className="w-full" />
            </div>
          )}

          {(inspection.transcript || inspection.notes) && (
            <div className="space-y-2">
              <span className="font-semibold">Resumo / Transcrição:</span>
              <div className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">
                {inspection.transcript || inspection.notes}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                {attachment.file_type?.startsWith('image/') ? (
                  <img
                    src={attachment.file_url}
                    alt={attachment.file_name || 'Anexo'}
                    className="w-full h-32 object-cover rounded group-hover:opacity-90 transition"
                  />
                ) : (
                  <div className="w-full h-32 rounded bg-muted flex flex-col items-center justify-center text-xs group-hover:bg-muted/80 transition">
                    <span className="text-muted-foreground">{attachment.file_type || 'arquivo'}</span>
                    <span className="mt-1">Abrir</span>
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
