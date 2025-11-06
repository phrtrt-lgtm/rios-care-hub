import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { LoadingScreen } from "@/components/LoadingScreen";

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
}

export default function VistoriaDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

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

      setAttachments(attachmentsData || []);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      navigate("/vistorias");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!inspection) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/vistorias")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Detalhes da Vistoria</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <span className="font-semibold">Imóvel:</span>
              <p className="text-lg">{inspection.property.name}</p>
            </div>

            <div>
              <span className="font-semibold">Data:</span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatDateTime(inspection.created_at)}
              </div>
            </div>

            <div>
              <span className="font-semibold">Faxineira:</span>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {inspection.cleaner_name || "-"}
                {inspection.cleaner_phone && <span className="text-muted-foreground"> ({inspection.cleaner_phone})</span>}
              </div>
            </div>

            <div>
              <span className="font-semibold">Status:</span>{' '}
              <span className={`font-bold ${inspection.notes === 'OK' ? 'text-green-600' : 'text-red-600'}`}>
                {inspection.notes || '-'}
              </span>
            </div>

            {attachments.filter(a => a.file_type?.startsWith('audio/')).length > 0 && (
              <div className="space-y-3">
                <span className="font-semibold">Áudios:</span>
                {attachments.filter(a => a.file_type?.startsWith('audio/')).map((audio, idx) => (
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

            {attachments.filter(a => a.file_type?.startsWith('image/')).length > 0 && (
              <div className="space-y-2">
                <span className="font-semibold">Fotos:</span>
                <div className="grid grid-cols-2 gap-2">
                  {attachments
                    .filter(a => a.file_type?.startsWith('image/'))
                    .map((img) => (
                      <img
                        key={img.id}
                        src={img.file_url}
                        alt={img.file_name || 'Foto da vistoria'}
                        className="w-full h-48 object-cover rounded"
                      />
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
