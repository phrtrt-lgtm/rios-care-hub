import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

interface AttachmentDebugItem {
  id: string;
  ticket_id: string;
  message_id: string;
  file_url: string;
  file_type?: string;
  file_name?: string;
  name?: string;
  size_bytes?: number;
  created_at: string;
}

export function AttachmentInspector({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttachmentDebugItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAttachments = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke(
        `debug-ticket-attachments/${ticketId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );

      if (error) throw error;
      setItems(data.items || []);
    } catch (error: any) {
      console.error('Error loading attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadAttachments();
    }
  }, [open, ticketId]);

  return (
    <Card className="border-dashed border-2 border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Inspector de Anexos (Debug)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(!open)}
            className="h-8"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      {open && (
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              ⚠️ Nenhum anexo encontrado no banco de dados para este ticket.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium">
                ✅ {items.length} anexo(s) encontrado(s) no banco:
              </div>
              {items.map((item) => (
                <div key={item.id} className="p-3 bg-white dark:bg-gray-900 rounded-md border text-xs space-y-1">
                  <div>
                    <strong>Nome:</strong> {item.name || item.file_name || 'sem nome'}
                  </div>
                  <div>
                    <strong>Tipo:</strong> {item.file_type || 'não definido'}
                  </div>
                  <div>
                    <strong>Tamanho:</strong> {item.size_bytes ? `${(item.size_bytes / 1024).toFixed(1)} KB` : 'não definido'}
                  </div>
                  <div className="break-all">
                    <strong>URL:</strong>{' '}
                    <a 
                      href={item.file_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {item.file_url}
                    </a>
                  </div>
                  <div>
                    <strong>message_id:</strong> {item.message_id}
                  </div>
                  <div>
                    <strong>Criado em:</strong> {new Date(item.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
