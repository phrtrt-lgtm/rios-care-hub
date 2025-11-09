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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, DollarSign, Calendar, User, Paperclip, Search, Filter, Pencil, Trash2, Video, Image } from "lucide-react";
import { AuthenticatedImage } from "@/components/AuthenticatedMedia";
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
  management_contribution_cents: number;
  currency: string;
  due_date: string | null;
  maintenance_date: string | null;
  status: string;
  payment_link_url: string | null;
  created_at: string;
  owner_id: string;
  property_id: string | null;
  owner: {
    name: string;
    email: string;
  };
  property?: {
    name: string;
  };
  attachments: ChargeAttachment[];
  _count?: {
    messages: number;
  };
}

interface ChargeAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  poster_path: string | null;
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
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

      // Fetch owner, property, attachments, and message counts for each charge
      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [ownerResult, propertyResult, attachmentsResult, messagesResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('name, email')
              .eq('id', charge.owner_id)
              .single(),
            charge.property_id
              ? supabase.from('properties').select('name').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null }),
            supabase
              .from('charge_attachments')
              .select('id, file_name, file_path, file_size, mime_type, poster_path')
              .eq('charge_id', charge.id),
            supabase
              .from('charge_messages')
              .select('id', { count: 'exact', head: true })
              .eq('charge_id', charge.id)
          ]);

          return {
            ...charge,
            owner: ownerResult.data || { name: 'N/A', email: 'N/A' },
            property: propertyResult.data || undefined,
            attachments: attachmentsResult.data || [],
            _count: {
              messages: messagesResult.count || 0
            }
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

  const toggleChargeSelection = (chargeId: string) => {
    const newSelection = new Set(selectedCharges);
    if (newSelection.has(chargeId)) {
      newSelection.delete(chargeId);
    } else {
      newSelection.add(chargeId);
    }
    setSelectedCharges(newSelection);
  };

  const toggleAllCharges = () => {
    if (selectedCharges.size === filteredCharges.length) {
      setSelectedCharges(new Set());
    } else {
      setSelectedCharges(new Set(filteredCharges.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    try {
      setDeleting(true);

      const { error } = await supabase
        .from('charges')
        .delete()
        .in('id', Array.from(selectedCharges));

      if (error) throw error;

      toast({
        title: "Cobranças excluídas!",
        description: `${selectedCharges.size} cobrança(s) excluída(s) com sucesso`,
      });

      setSelectedCharges(new Set());
      setDeleteDialogOpen(false);
      fetchCharges();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir cobranças",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getAttachmentUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/file`;
  };

  const getPosterUrl = (attachment: ChargeAttachment) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/serve-attachment/${attachment.id}/poster`;
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

  const isImageFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('image/') || false;
  };

  const isVideoFile = (attachment: ChargeAttachment) => {
    return attachment.mime_type?.startsWith('video/') || false;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gerenciar Cobranças</h1>
            <p className="text-muted-foreground">Visualize e atualize o status das cobranças</p>
          </div>
          <div className="flex gap-2">
            {selectedCharges.size > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir ({selectedCharges.size})
              </Button>
            )}
            <Button onClick={() => navigate("/nova-cobranca")}>
              <DollarSign className="mr-2 h-4 w-4" />
              Nova Cobrança
            </Button>
          </div>
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

        {/* Seleção em massa */}
        {filteredCharges.length > 0 && (
          <Card className="mb-4 bg-muted/30">
            <CardContent className="py-4 flex items-center gap-3">
              <Checkbox
                checked={selectedCharges.size === filteredCharges.length}
                onCheckedChange={toggleAllCharges}
              />
              <span className="text-sm text-muted-foreground">
                {selectedCharges.size === filteredCharges.length 
                  ? "Desmarcar todas" 
                  : `Selecionar todas (${filteredCharges.length})`}
              </span>
            </CardContent>
          </Card>
        )}

        {/* Lista de Cobranças */}
        {filteredCharges.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhuma cobrança encontrada com os filtros aplicados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCharges.map((charge) => (
              <Card 
                key={charge.id}
                className={`group transition-all hover:shadow-lg ${selectedCharges.has(charge.id) ? 'ring-2 ring-primary' : ''}`}
              >
                <CardHeader>
                  <div className="flex items-start gap-3 mb-2">
                    <Checkbox
                      checked={selectedCharges.has(charge.id)}
                      onCheckedChange={() => toggleChargeSelection(charge.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/cobranca/${charge.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="text-lg line-clamp-2 flex-1">{charge.title}</CardTitle>
                        {getStatusBadge(charge.status)}
                      </div>
                      {charge.property && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 mb-2">
                          📍 {charge.property.name}
                        </Badge>
                      )}
                      {charge.description && (
                        <CardDescription className="line-clamp-2">
                          {charge.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent 
                  className="space-y-4 cursor-pointer"
                  onClick={() => navigate(`/cobranca/${charge.id}`)}
                >
                  {/* Valor */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Total:</span>
                      <span className="text-lg font-semibold text-foreground">
                        {formatCurrency(charge.amount_cents, charge.currency)}
                      </span>
                    </div>
                    {charge.management_contribution_cents > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">Aporte:</span>
                        <span className="text-sm font-medium text-green-600">
                          - {formatCurrency(charge.management_contribution_cents, charge.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t pt-1">
                      <span className="text-sm font-medium">Devido:</span>
                      <span className="text-xl font-bold text-foreground">
                        {formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Proprietário */}
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{charge.owner.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{charge.owner.email}</p>
                    </div>
                  </div>

                  {/* Data de Vencimento */}
                  {charge.due_date && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Venc: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}

                  {/* Data da Manutenção */}
                  {charge.maintenance_date && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Calendar className="h-4 w-4" />
                      <span>Data: {format(new Date(charge.maintenance_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}

                  {/* Contador de Anexos */}
                  {charge.attachments.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                      <Paperclip className="h-4 w-4" />
                      <span>+{charge.attachments.length} {charge.attachments.length === 1 ? 'anexo' : 'anexos'}</span>
                    </div>
                  )}

                  {/* Contador de Mensagens */}
                  {charge._count && charge._count.messages > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {charge._count.messages}
                        </AvatarFallback>
                      </Avatar>
                      <span>{charge._count.messages} {charge._count.messages === 1 ? 'mensagem' : 'mensagens'}</span>
                    </div>
                  )}

                  {/* Botão de Editar */}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(charge);
                    }}
                  >
                    <Pencil className="mr-2 h-3 w-3" />
                    Editar Status
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
                  <Label htmlFor="payment_link">Link de Pagamento</Label>
                  <Input
                    id="payment_link"
                    placeholder="https://..."
                    value={formData.payment_link_url}
                    onChange={(e) => setFormData({ ...formData, payment_link_url: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog de Exclusão em Massa */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Cobranças</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir {selectedCharges.size} cobrança(s)? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default GerenciarCobrancas;
