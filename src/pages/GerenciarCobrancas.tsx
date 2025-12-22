import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, DollarSign, Calendar, Search, Pencil, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { CHARGE_CATEGORIES } from "@/constants/chargeCategories";
import { EditChargeDialog } from "@/components/EditChargeDialog";

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
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [propertyGroups, setPropertyGroups] = useState<PropertyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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
        .not('status', 'in', '("paid","pago_no_vencimento","cancelled")')
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
    setEditDialogOpen(true);
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

        {/* Summary Cards */}
        {propertyGroups.length > 0 && (
          <div className="mb-6 space-y-4">
            {/* Overall Total */}
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Total a Receber (já com aporte deduzido)</p>
                    <p className="text-3xl font-bold text-primary">
                      {formatCurrency(propertyGroups.reduce((acc, g) => acc + g.totalDueCents, 0), 'BRL')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{propertyGroups.reduce((acc, g) => acc + g.charges.length, 0)} cobranças</p>
                    <p className="text-sm text-muted-foreground">{propertyGroups.length} imóveis</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Per Property Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {propertyGroups.map((group) => (
                <div
                  key={group.id}
                  className={`p-3 rounded-lg border text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                    group.overdueCount > 0 ? 'border-red-300 bg-red-50/50' : 'bg-card'
                  }`}
                  onClick={() => {
                    if (!expandedProperties.has(group.id)) {
                      toggleProperty(group.id);
                    }
                    document.getElementById(`property-${group.id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <p className="font-medium truncate text-xs">{group.name}</p>
                  <p className="font-bold text-primary">{formatCurrency(group.totalDueCents, 'BRL')}</p>
                  <p className="text-xs text-muted-foreground">{group.charges.length} cobrança{group.charges.length > 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
                <Card id={`property-${group.id}`} className={`transition-all ${group.overdueCount > 0 ? 'border-red-300 bg-red-50/50' : ''}`}>
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
        <EditChargeDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          charge={editingCharge}
          onSuccess={fetchCharges}
        />
      </main>
    </div>
  );
};

export default GerenciarCobrancas;