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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, DollarSign, Calendar, User, Search, Pencil, ChevronDown, ChevronRight, Building2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { useUpdateOwnerScore } from "@/hooks/useOwnerScore";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    id: string;
    name: string;
    cover_photo_url: string | null;
  };
}

interface PropertyGroup {
  id: string;
  name: string;
  cover_photo_url: string | null;
  ownerName: string;
  charges: Charge[];
  openCount: number;
  overdueCount: number;
}

const GerenciarCobrancas = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updateScore } = useUpdateOwnerScore();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [propertyGroups, setPropertyGroups] = useState<PropertyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    status: "",
    payment_link_url: ""
  });
  const [updatingScore, setUpdatingScore] = useState(false);

  useEffect(() => {
    if (!user || !['admin', 'agent', 'maintenance'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchCharges();
  }, [user, profile, navigate]);

  useEffect(() => {
    groupChargesByProperty();
  }, [charges, searchTerm]);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      
      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .not('status', 'in', '("paid","cancelled")')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const enrichedCharges = await Promise.all(
        (chargesData || []).map(async (charge) => {
          const [ownerResult, propertyResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('name, email')
              .eq('id', charge.owner_id)
              .single(),
            charge.property_id
              ? supabase.from('properties').select('id, name, cover_photo_url').eq('id', charge.property_id).single()
              : Promise.resolve({ data: null })
          ]);

          return {
            ...charge,
            owner: ownerResult.data || { name: 'N/A', email: 'N/A' },
            property: propertyResult.data || undefined
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

  const groupChargesByProperty = () => {
    const groups: Record<string, PropertyGroup> = {};
    
    charges.forEach(charge => {
      const propertyId = charge.property?.id || 'sem-imovel';
      const propertyName = charge.property?.name || 'Sem Imóvel';
      
      // Apply search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesProperty = propertyName.toLowerCase().includes(search);
        const matchesOwner = charge.owner.name.toLowerCase().includes(search);
        const matchesTitle = charge.title.toLowerCase().includes(search);
        if (!matchesProperty && !matchesOwner && !matchesTitle) return;
      }
      
      if (!groups[propertyId]) {
        groups[propertyId] = {
          id: propertyId,
          name: propertyName,
          cover_photo_url: charge.property?.cover_photo_url || null,
          ownerName: charge.owner.name,
          charges: [],
          openCount: 0,
          overdueCount: 0
        };
      }
      
      groups[propertyId].charges.push(charge);
      
      if (['sent', 'draft'].includes(charge.status)) {
        groups[propertyId].openCount++;
      }
      if (charge.status === 'overdue' || charge.status === 'debited') {
        groups[propertyId].overdueCount++;
      }
    });
    
    // Sort by overdue count (most urgent first), then by open count
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      return b.openCount - a.openCount;
    });
    
    setPropertyGroups(sortedGroups);
  };

  const toggleProperty = (propertyId: string) => {
    const newExpanded = new Set(expandedProperties);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedProperties(newExpanded);
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

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gerenciar Cobranças</h1>
            <p className="text-muted-foreground">Cobranças em aberto organizadas por imóvel</p>
          </div>
          <Button onClick={() => navigate("/nova-cobranca")}>
            <DollarSign className="mr-2 h-4 w-4" />
            Nova Cobrança
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por imóvel, proprietário ou título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Property Groups */}
        {propertyGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma cobrança em aberto encontrada.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {propertyGroups.map((group) => (
              <Collapsible
                key={group.id}
                open={expandedProperties.has(group.id)}
                onOpenChange={() => toggleProperty(group.id)}
              >
                <Card className={`transition-all ${group.overdueCount > 0 ? 'border-red-300 bg-red-50/50' : ''}`}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        {/* Property Photo */}
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {group.cover_photo_url ? (
                            <img 
                              src={group.cover_photo_url} 
                              alt={group.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        
                        {/* Property Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg truncate">{group.name}</CardTitle>
                            {expandedProperties.has(group.id) ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <CardDescription className="truncate">{group.ownerName}</CardDescription>
                          
                          {/* Counters */}
                          <div className="flex gap-2 mt-2">
                            {group.openCount > 0 && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {group.openCount} em aberto
                              </Badge>
                            )}
                            {group.overdueCount > 0 && (
                              <Badge variant="destructive">
                                {group.overdueCount} vencida{group.overdueCount > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-2 border-t pt-4">
                        {group.charges.map((charge) => (
                          <div
                            key={charge.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate(`/cobranca/${charge.id}`)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{charge.title}</span>
                                {getStatusBadge(charge.status)}
                              </div>
                              {charge.category && (
                                <span className="text-xs text-muted-foreground">
                                  {CHARGE_CATEGORIES[charge.category as keyof typeof CHARGE_CATEGORIES]}
                                </span>
                              )}
                              {charge.due_date && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>Venc: {format(new Date(charge.due_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="font-bold">
                                  {formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}
                                </div>
                                {charge.management_contribution_cents > 0 && (
                                  <div className="text-xs text-green-600">
                                    Aporte: {formatCurrency(charge.management_contribution_cents, charge.currency)}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(charge);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
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
      </main>
    </div>
  );
};

export default GerenciarCobrancas;