import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, FileText, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Charge {
  id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  attachments?: ChargeAttachment[];
}

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
}

const MinhasCobrancas = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || profile?.role !== 'owner') {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      
      // Fetch charges
      const { data: chargesData, error: chargesError } = await supabase
        .from('charges')
        .select('*')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (chargesError) throw chargesError;

      // Fetch attachments for all charges
      const chargesWithAttachments = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const { data: attachments } = await supabase
            .from('charge_attachments')
            .select('id, file_name, file_path, file_size')
            .eq('charge_id', charge.id);

          return {
            ...charge,
            attachments: attachments || []
          };
        })
      );

      setCharges(chargesWithAttachments);
    } catch (error) {
      console.error('Erro ao carregar cobranças:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Rascunho', variant: 'secondary' as const },
      sent: { label: 'Enviada', variant: 'default' as const },
      paid: { label: 'Paga', variant: 'default' as const },
      overdue: { label: 'Vencida', variant: 'destructive' as const },
      cancelled: { label: 'Cancelada', variant: 'outline' as const }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatCurrency = (cents: number, currency: string) => {
    const value = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  const downloadAttachment = async (filePath: string, fileName: string) => {
    const { data } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    if (data) {
      window.open(data.publicUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/minha-caixa")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Minhas Cobranças</h1>
            <p className="text-muted-foreground">Visualize todas as suas cobranças</p>
          </div>
        </div>

        {charges.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">Nenhuma cobrança encontrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Você não possui cobranças no momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {charges.map((charge) => (
              <Card key={charge.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{charge.title}</CardTitle>
                      {charge.description && (
                        <CardDescription className="mt-2">
                          {charge.description}
                        </CardDescription>
                      )}
                    </div>
                    {getStatusBadge(charge.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-foreground">
                        {formatCurrency(charge.amount_cents, charge.currency)}
                      </span>
                      {charge.due_date && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          Vencimento: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      )}
                    </div>

                    {charge.attachments && charge.attachments.length > 0 && (
                      <div className="border-t pt-4">
                        <p className="mb-2 text-sm font-medium text-foreground">Anexos:</p>
                        <div className="space-y-2">
                          {charge.attachments.map((attachment) => (
                            <button
                              key={attachment.id}
                              onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                              className="flex w-full items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                            >
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <span className="flex-1 truncate text-left text-foreground">
                                {attachment.file_name}
                              </span>
                              {attachment.file_size && (
                                <span className="text-xs text-muted-foreground">
                                  {(attachment.file_size / 1024).toFixed(1)} KB
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {charge.payment_link_url && charge.status !== 'paid' && charge.status !== 'cancelled' && (
                      <div className="border-t pt-4">
                        <Button 
                          onClick={() => window.open(charge.payment_link_url!, '_blank')}
                          className="w-full"
                        >
                          Pagar Agora
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MinhasCobrancas;
