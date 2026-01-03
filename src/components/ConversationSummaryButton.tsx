import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";

interface ConversationSummaryButtonProps {
  ticketId: string;
  messageCount?: number;
  disabled?: boolean;
}

export function ConversationSummaryButton({ ticketId, messageCount = 0, disabled }: ConversationSummaryButtonProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isTeamMember = profile?.role === 'admin' || profile?.role === 'agent' || profile?.role === 'maintenance';

  // Only show for team members with enough messages
  if (!isTeamMember || messageCount < 5) return null;

  const generateSummary = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('summarize-conversation', {
        body: { ticketId }
      });

      if (error) throw error;

      if (data?.summary) {
        setSummary(data.summary);
        setDialogOpen(true);
      } else {
        toast.error("Não foi possível gerar o resumo");
      }
    } catch (error: any) {
      console.error("Error generating summary:", error);
      toast.error(error.message || "Erro ao gerar resumo");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("Erro ao copiar");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={generateSummary}
        disabled={loading || disabled}
        className="gap-1.5"
        title="Resumir conversa com IA"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Resumir</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Resumo da Conversa
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
