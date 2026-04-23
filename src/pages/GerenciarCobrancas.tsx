import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign, Search, Trash2, Calculator, CreditCard, Building2, BarChart3, Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { EditChargeDialog } from "@/components/EditChargeDialog";
import { DebitoReservaCalculator } from "@/components/DebitoReservaCalculator";
import { ReserveDebitsTable } from "@/components/ReserveDebitsTable";
import { OpenChargesTable } from "@/components/OpenChargesTable";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  totalDueCents: number; // Total a receber (já com aporte deduzido)
}

const GerenciarCobrancas = () => {
  useScrollRestoration();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [propertyGroups, setPropertyGroups] = useState<PropertyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("abertas");
  const [debitoCharges, setDebitoCharges] = useState<Charge[]>([]);
  const [debitoPropertyGroups, setDebitoPropertyGroups] = useState<PropertyGroup[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [selectedPropertyForCalc, setSelectedPropertyForCalc] = useState<PropertyGroup | null>(null);
  const [selectedChargeIdsForCalc, setSelectedChargeIdsForCalc] = useState<string[]>([]);

  useEffect(() => {
    if (!user || !['admin', 'agent', 'maintenance'].includes(profile?.role || '')) {
      navigate("/");
      return;
    }
    fetchCharges();
    fetchDebitoCharges();
  }, [user, profile, navigate]);

  useEffect(() => {
    groupChargesByProperty();
  }, [charges, searchTerm]);

  useEffect(() => {
    groupDebitoChargesByProperty();
  }, [debitoCharges]);

  const fetchCharges = async () => {
    try {
      setLoading(true);
      
      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .not('status', 'in', '(paid,pago_no_vencimento,cancelled,pago_antecipado,pago_com_atraso,debited)')
        .is('archived_at', null)
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

  const fetchDebitoCharges = async () => {
    try {
      const { data: chargesData, error } = await supabase
        .from('charges')
        .select('*')
        .eq('status', 'overdue')
        .is('archived_at', null)
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

      setDebitoCharges(enrichedCharges);
    } catch (error) {
      console.error('Erro ao carregar cobranças para débito:', error);
    }
  };

  const groupDebitoChargesByProperty = () => {
    const groups: Record<string, PropertyGroup> = {};
    
    debitoCharges.forEach(charge => {
      const propertyId = charge.property?.id || 'sem-imovel';
      const propertyName = charge.property?.name || 'Sem Imóvel';
      
      if (!groups[propertyId]) {
        groups[propertyId] = {
          id: propertyId,
          name: propertyName,
          cover_photo_url: charge.property?.cover_photo_url || null,
          ownerName: charge.owner.name,
          charges: [],
          openCount: 0,
          overdueCount: 0,
          totalDueCents: 0
        };
      }
      
      groups[propertyId].charges.push(charge);
      const amountDue = charge.amount_cents - (charge.management_contribution_cents || 0);
      groups[propertyId].totalDueCents += amountDue;
      groups[propertyId].overdueCount++;
    });
    
    const sortedGroups = Object.values(groups).sort((a, b) => b.totalDueCents - a.totalDueCents);
    setDebitoPropertyGroups(sortedGroups);
  };

  const openCalculator = (group: PropertyGroup) => {
    setSelectedPropertyForCalc(group);
    setSelectedChargeIdsForCalc(group.charges.map(c => c.id));
    setCalculatorOpen(true);
  };

  const handleDebitConfirmed = () => {
    fetchCharges();
    fetchDebitoCharges();
    setCalculatorOpen(false);
    setSelectedPropertyForCalc(null);
    setSelectedChargeIdsForCalc([]);
  };

  const groupChargesByProperty = () => {
    const groups: Record<string, PropertyGroup> = {};
    
    charges.forEach(charge => {
      // Exclude charges that are waiting for reserve debit (they show in ReserveDebitsTable)
      if (charge.status === 'aguardando_reserva') return;
      
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
          overdueCount: 0,
          totalDueCents: 0
        };
      }
      
      groups[propertyId].charges.push(charge);
      
      // Calculate amount due (total - management contribution)
      const amountDue = charge.amount_cents - (charge.management_contribution_cents || 0);
      groups[propertyId].totalDueCents += amountDue;
      
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


  const handleEdit = (charge: Charge) => {
    setEditingCharge(charge);
    setEditDialogOpen(true);
  };

  const toggleChargeSelection = (chargeId: string) => {
    const newSelected = new Set(selectedCharges);
    if (newSelected.has(chargeId)) {
      newSelected.delete(chargeId);
    } else {
      newSelected.add(chargeId);
    }
    setSelectedCharges(newSelected);
  };

  const toggleSelectAll = () => {
    const allChargeIds = charges.map(c => c.id);
    if (selectedCharges.size === allChargeIds.length) {
      setSelectedCharges(new Set());
    } else {
      setSelectedCharges(new Set(allChargeIds));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCharges.size === 0) return;
    
    try {
      setDeleting(true);
      
      const { error } = await supabase
        .from('charges')
        .update({ archived_at: new Date().toISOString(), status: 'arquivado' })
        .in('id', Array.from(selectedCharges));

      if (error) throw error;

      toast({
        title: "Cobranças movidas para lixeira",
        description: `${selectedCharges.size} cobrança(s) movida(s) para a lixeira.`,
      });
      
      setSelectedCharges(new Set());
      setDeleteDialogOpen(false);
      fetchCharges();
      fetchDebitoCharges();
    } catch (error) {
      console.error('Erro ao arquivar cobranças:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível mover as cobranças para a lixeira.",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline"; className?: string }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      sent: { label: 'Enviada', variant: 'default' },
      paid: { label: 'Paga', variant: 'default', className: 'bg-success' },
      overdue: { label: 'Vencida', variant: 'destructive' },
      cancelled: { label: 'Cancelada', variant: 'outline' },
      debited: { label: 'Débito em Reserva', variant: 'destructive', className: 'bg-destructive' }
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
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
          <Button variant="ghost" size="sm" onClick={() => goBack(navigate, "/painel")}>
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
          <Button variant="outline" onClick={() => navigate("/admin/relatorio-cobrancas")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Histórico Pago
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="abertas" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Em Aberto ({charges.length})
            </TabsTrigger>
            <TabsTrigger value="debito" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Débito Reserva ({debitoCharges.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab: Cobranças em Aberto */}
          <TabsContent value="abertas" className="space-y-4">
            {/* Débitos Pendentes em Reserva - Inline Table */}
            <ReserveDebitsTable />

            {/* Search and Selection Controls */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por imóvel, proprietário ou título..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Selection Controls */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="select-all"
                    checked={charges.length > 0 && selectedCharges.size === charges.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    {selectedCharges.size === 0 
                      ? "Selecionar todas" 
                      : `${selectedCharges.size} selecionada(s)`}
                  </label>
                </div>
                
                {selectedCharges.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Lixeira ({selectedCharges.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Inline Property Table */}
            <OpenChargesTable
              propertyGroups={propertyGroups}
              selectedCharges={selectedCharges}
              onToggleChargeSelection={toggleChargeSelection}
              onEditCharge={handleEdit}
            />

          </TabsContent>

          {/* Tab: Débito em Reserva */}
          <TabsContent value="debito" className="space-y-4">
            {/* Summary */}
            {debitoPropertyGroups.length > 0 && (
              <Card className="bg-gradient-to-r from-red-100 to-red-50 border-destructive/30">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">Total a Debitar em Reservas</p>
                      <p className="text-3xl font-bold text-destructive">
                        {formatCurrency(debitoPropertyGroups.reduce((acc, g) => acc + g.totalDueCents, 0), 'BRL')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{debitoCharges.length} cobranças</p>
                      <p className="text-sm text-muted-foreground">{debitoPropertyGroups.length} imóveis</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Property List for Debit */}
            {debitoPropertyGroups.length === 0 ? (
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title="Nenhuma cobrança pendente"
                description="Não há cobranças aguardando débito em reserva no momento."
              />
            ) : (
              <div className="space-y-3">
                {debitoPropertyGroups.map((group) => (
                  <Card 
                    key={group.id} 
                    className="border-destructive/30 bg-destructive/10/30 hover:bg-destructive/10 transition-colors cursor-pointer"
                    onClick={() => openCalculator(group)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center gap-4">
                        {/* Property Photo */}
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {group.cover_photo_url ? (
                            <img 
                              src={group.cover_photo_url} 
                              alt={group.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        
                        {/* Property Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{group.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{group.ownerName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="destructive" className="text-xs">
                              {group.charges.length} cobrança{group.charges.length > 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Amount and Calculator Button */}
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p className="text-lg font-bold text-destructive">
                              {formatCurrency(group.totalDueCents, 'BRL')}
                            </p>
                            <p className="text-xs text-muted-foreground">a debitar</p>
                          </div>
                          <Button variant="outline" size="sm" className="border-destructive/30 hover:bg-destructive/10">
                            <Calculator className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Charges List Preview */}
                      <div className="mt-3 pt-3 border-t border-destructive/30 space-y-1">
                        {group.charges.slice(0, 3).map((charge) => (
                          <div key={charge.id} className="flex justify-between text-sm">
                            <span className="text-muted-foreground truncate flex-1">{charge.title}</span>
                            <span className="font-medium ml-2">
                              {formatCurrency(charge.amount_cents - (charge.management_contribution_cents || 0), charge.currency)}
                            </span>
                          </div>
                        ))}
                        {group.charges.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            + {group.charges.length - 3} mais...
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialog de Edição */}
        <EditChargeDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          charge={editingCharge}
          onSuccess={() => {
            fetchCharges();
            fetchDebitoCharges();
          }}
        />

        {/* Dialog de Confirmação de Exclusão */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mover cobranças para a lixeira?</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a mover <strong>{selectedCharges.size} cobrança(s)</strong> para a lixeira. 
                Elas não serão mais cobradas nem aparecerão nos relatórios.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Movendo..." : "Mover para lixeira"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Calculadora de Débito em Reserva */}
        <DebitoReservaCalculator
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          propertyName={selectedPropertyForCalc?.name || ""}
          totalDebtCents={selectedPropertyForCalc?.totalDueCents || 0}
          chargeIds={selectedChargeIdsForCalc}
          onDebitConfirmed={handleDebitConfirmed}
        />
      </main>
    </div>
  );
};

export default GerenciarCobrancas;