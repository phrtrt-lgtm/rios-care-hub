import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, DollarSign, Calendar, User, Paperclip, Search, Filter, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']),
  payment_link_url: z.string().url().optional().or(z.literal(''))
});

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
  owner_id: string;
  owner: {
    name: string;
    email: string;
  };
  attachments: ChargeAttachment[];
}

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
}

const GerenciarCobrancas = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [filteredCharges, setFilteredCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    status: "",
    payment_link_url: ""
  });

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  useEffect(() => {
    filterCharges();
  }, [searchTerm, statusFilter, charges]);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      
      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch owner and attachments for each charge
      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const { data: ownerData } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('id', charge.owner_id)
            .single();

          const { data: attachmentsData } = await supabase
            .from('charge_attachments')
            .select('id, file_name, file_path, file_size')
            .eq('charge_id', charge.id);

          return {
            ...charge,
            owner: ownerData || { name: 'N/A', email: 'N/A' },
            attachments: attachmentsData || []
          };
        })
      );

      setCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças:', error);
      toast({
        title: "Erro ao carregar cobranças",
        description: "Não foi possível carregar as cobranças.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCharges = () => {
    let filtered = [...charges];

    if (searchTerm) {
      filtered = filtered.filter(charge => 
        charge.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        charge.owner.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(charge => charge.status === statusFilter);
    }

    setFilteredCharges(filtered);
  };

  const handleEdit = (charge: Charge) => {
    setEditingCharge(charge);
    setFormData({
      status: charge.status,
      payment_link_url: charge.payment_link_url || ""
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate input
      const validated = statusUpdateSchema.parse(formData);

      const { error } = await supabase
        .from('charges')
        .update({
          status: validated.status,
          payment_link_url: validated.payment_link_url || null
        })
        .eq('id', editingCharge!.id);

      if (error) throw error;

      toast({
        title: "Status atualizado!",
        description: "O status da cobrança foi atualizado com sucesso."
      });

      setDialogOpen(false);
      setEditingCharge(null);
      fetchCharges();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Dados inválidos",
          description: error.errors[0].message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro ao atualizar status",
          description: error.message,
          variant: "destructive"
        });
      }
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

  const downloadAttachment = async (filePath: string) => {
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
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/painel")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Gerenciar Cobranças</h1>
            <p className="text-muted-foreground">Visualize e atualize o status das cobranças</p>
          </div>
          <Button onClick={() => navigate("/nova-cobranca")}>
            <DollarSign className="mr-2 h-4 w-4" />
            Nova Cobrança
          </Button>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título ou proprietário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                  <SelectItem value="paid">Paga</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Cobranças */}
        <div className="space-y-4">
          {filteredCharges.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Nenhuma cobrança encontrada com os filtros aplicados.</p>
              </CardContent>
            </Card>
          ) : (
            filteredCharges.map((charge) => (
              <Card 
                key={charge.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => navigate(`/cobranca/${charge.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="mb-2">{charge.title}</CardTitle>
                      {charge.description && (
                        <CardDescription>{charge.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {getStatusBadge(charge.status)}
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(charge);
                        }}
                      >
                        <Pencil className="mr-2 h-3 w-3" />
                        Editar Status
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Valor</p>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(charge.amount_cents, charge.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{charge.owner.name}</p>
                        <p className="text-xs text-muted-foreground">{charge.owner.email}</p>
                      </div>
                    </div>
                    <div>
                      {charge.due_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Vencimento</p>
                            <p className="text-sm font-medium text-foreground">
                              {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {charge.attachments.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-2 text-sm font-medium text-foreground">Anexos:</p>
                      <div className="space-y-2">
                        {charge.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            onClick={() => downloadAttachment(attachment.file_path)}
                            className="flex w-full items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                          >
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 truncate text-left text-foreground">
                              {attachment.file_name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {charge.payment_link_url && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-2 text-sm font-medium text-foreground">Link de Pagamento:</p>
                      <a
                        href={charge.payment_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {charge.payment_link_url}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Dialog de Edição */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atualizar Status da Cobrança</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="status">Status *</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="sent">Enviada</SelectItem>
                      <SelectItem value="paid">Paga</SelectItem>
                      <SelectItem value="overdue">Vencida</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payment_link_url">Link de Pagamento</Label>
                  <Input
                    id="payment_link_url"
                    type="url"
                    value={formData.payment_link_url}
                    onChange={(e) => setFormData({ ...formData, payment_link_url: e.target.value })}
                    placeholder="https://exemplo.com/pagamento/123"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Link para o cliente realizar o pagamento (opcional)
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Atualizar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default GerenciarCobrancas;
