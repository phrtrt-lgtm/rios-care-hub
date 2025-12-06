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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, DollarSign, Calendar, User, Paperclip, Search, Filter, Pencil, Trash2, Video, Image, AlertCircle } from "lucide-react";
import { AuthenticatedImage } from "@/components/AuthenticatedMedia";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { useUpdateOwnerScore } from "@/hooks/useOwnerScore";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Payment status options that affect owner score
type PaymentStatus = 'paid_early' | 'paid_on_time' | 'paid_late' | 'debited';

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'paid_early', 'paid_on_time', 'paid_late', 'overdue', 'cancelled', 'debited']),
  payment_link_url: z.string().url().optional().or(z.literal(''))
});

interface Charge {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
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
  const { updateScore } = useUpdateOwnerScore();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [filteredCharges, setFilteredCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    status: "",
    payment_link_url: ""
  });
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingScore, setUpdatingScore] = useState(false);

  useEffect(() => {
    if (!user || !['admin', 'agent'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  useEffect(() => {
    filterCharges();
  }, [searchTerm, statusFilter, categoryFilter, charges]);

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

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(charge => charge.category === categoryFilter);
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
      setUpdatingScore(true);

      // Map payment statuses to database status and score reason
      let dbStatus = validated.status;
      let scoreReason: "early_payment" | "on_time_payment" | "late_payment" | "reserve_debit" | null = null;
      let paidAt: string | null = null;
      let debitedAt: string | null = null;

      switch (validated.status) {
        case 'paid_early':
          dbStatus = 'paid';
          scoreReason = 'early_payment';
          paidAt = new Date().toISOString();
          break;
        case 'paid_on_time':
          dbStatus = 'paid';
          scoreReason = 'on_time_payment';
          paidAt = new Date().toISOString();
          break;
        case 'paid_late':
          dbStatus = 'paid';
          scoreReason = 'late_payment';
          paidAt = new Date().toISOString();
          break;
        case 'debited':
          dbStatus = 'debited';
          scoreReason = 'reserve_debit';
          debitedAt = new Date().toISOString();
          break;
      }

      // Update charge status
      const updateData: any = {
        status: dbStatus,
        payment_link_url: validated.payment_link_url || null
      };
      
      if (paidAt) updateData.paid_at = paidAt;
      if (debitedAt) updateData.debited_at = debitedAt;

      const { error } = await supabase
        .from('charges')
        .update(updateData)
        .eq('id', editingCharge!.id);

      if (error) throw error;

      // Update owner score if applicable
      if (scoreReason && editingCharge) {
        try {
          await updateScore(editingCharge.owner_id, editingCharge.id, scoreReason);
          toast({
            title: "Status e pontuação atualizados!",
            description: `O status foi atualizado e a pontuação do proprietário foi ${scoreReason.includes('payment') && !scoreReason.includes('late') ? 'aumentada' : 'reduzida'}.`
          });
        } catch (scoreError) {
          console.error('Erro ao atualizar pontuação:', scoreError);
          toast({
            title: "Status atualizado!",
            description: "O status foi atualizado, mas houve um erro ao atualizar a pontuação.",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Status atualizado!",
          description: "O status da cobrança foi atualizado com sucesso."
        });
      }

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
    } finally {
      setUpdatingScore(false);
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
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline"; className?: string }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      sent: { label: 'Enviada', variant: 'default' },
      paid: { label: 'Paga', variant: 'default', className: 'bg-green-500' },
      overdue: { label: 'Vencida', variant: 'destructive' },
      cancelled: { label: 'Cancelada', variant: 'outline' },
      debited: { label: 'Débito em Reserva', variant: 'destructive', className: 'bg-red-700' }
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const getScoreImpactInfo = (status: string) => {
    switch (status) {
      case 'paid_early':
        return { points: '+5', color: 'text-green-600', description: 'Pago com antecedência (2+ dias antes)' };
      case 'paid_on_time':
        return { points: '+1', color: 'text-blue-600', description: 'Pago no prazo' };
      case 'paid_late':
        return { points: '-15', color: 'text-orange-600', description: 'Pago com atraso' };
      case 'debited':
        return { points: '-30', color: 'text-red-600', description: 'Debitado da reserva' };
      default:
        return null;
    }
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
            <div className="grid gap-4 md:grid-cols-3">
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
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Categorias</SelectItem>
                  {CHARGE_CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
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
                      {charge.category && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 mb-2 ml-2">
                          🔧 {CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES]}
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Atualizar Status da Cobrança</DialogTitle>
              <DialogDescription>
                Selecione o novo status. Status de pagamento afetam a pontuação do proprietário.
              </DialogDescription>
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
                      <SelectItem value="overdue">Vencida</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                      <SelectItem value="paid" disabled className="opacity-50">
                        ── Status de Pagamento ──
                      </SelectItem>
                      <SelectItem value="paid_early">
                        <span className="flex items-center gap-2">
                          ✅ Pago em até 2 dias
                          <Badge variant="outline" className="text-green-600 border-green-600 text-xs">+5 pts</Badge>
                        </span>
                      </SelectItem>
                      <SelectItem value="paid_on_time">
                        <span className="flex items-center gap-2">
                          ✅ Pago até o vencimento
                          <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">+1 pt</Badge>
                        </span>
                      </SelectItem>
                      <SelectItem value="paid_late">
                        <span className="flex items-center gap-2">
                          ⚠️ Pago com atraso
                          <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">-15 pts</Badge>
                        </span>
                      </SelectItem>
                      <SelectItem value="debited">
                        <span className="flex items-center gap-2">
                          🔴 Débito em Reserva
                          <Badge variant="outline" className="text-red-600 border-red-600 text-xs">-30 pts</Badge>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Score impact alert */}
                {getScoreImpactInfo(formData.status) && (
                  <Alert className={`border-2 ${formData.status.includes('paid') && !formData.status.includes('late') ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex flex-col gap-1">
                      <span className="font-medium">{getScoreImpactInfo(formData.status)?.description}</span>
                      <span className={`font-bold ${getScoreImpactInfo(formData.status)?.color}`}>
                        Impacto na pontuação: {getScoreImpactInfo(formData.status)?.points} pontos
                      </span>
                    </AlertDescription>
                  </Alert>
                )}

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
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={updatingScore}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updatingScore}>
                  {updatingScore ? "Salvando..." : "Salvar"}
                </Button>
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
