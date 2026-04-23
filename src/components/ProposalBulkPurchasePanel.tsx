import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, 
  Package, 
  DollarSign, 
  Building2,
  Check,
  Clock
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProposalBulkPurchasePanelProps {
  proposalId: string;
}

interface ItemPurchase {
  itemId: string;
  itemName: string;
  unitPriceCents: number;
  quantity: number;
}

interface OwnerPurchase {
  ownerId: string;
  ownerName: string;
  propertyName: string | null;
  items: ItemPurchase[];
  totalCents: number;
  paid: boolean;
  paidAt: string | null;
}

export function ProposalBulkPurchasePanel({ proposalId }: ProposalBulkPurchasePanelProps) {
  // Fetch proposal items
  const { data: proposalItems } = useQuery({
    queryKey: ['proposal-items', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('id, name, unit_price_cents, order_index')
        .eq('proposal_id', proposalId)
        .order('order_index');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all responses with items and owner info
  const { data: purchases, isLoading } = useQuery({
    queryKey: ['proposal-bulk-purchases', proposalId],
    queryFn: async () => {
      // Get responses that have selected an option
      const { data: responses, error: responsesError } = await supabase
        .from('proposal_responses')
        .select(`
          id,
          owner_id,
          paid_at,
          payment_amount_cents,
          selected_option_id,
          quantity
        `)
        .eq('proposal_id', proposalId)
        .not('selected_option_id', 'is', null);

      if (responsesError) throw responsesError;
      if (!responses?.length) return [];

      // Get response items
      const responseIds = responses.map(r => r.id);
      const { data: responseItems, error: itemsError } = await supabase
        .from('proposal_response_items')
        .select('response_id, item_id, quantity')
        .in('response_id', responseIds);

      if (itemsError) throw itemsError;

      // Get owner profiles
      const ownerIds = responses.map(r => r.owner_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', ownerIds);

      if (profilesError) throw profilesError;

      // Get properties for each owner
      const { data: properties, error: propertiesError } = await supabase
        .from('properties')
        .select('id, name, owner_id')
        .in('owner_id', ownerIds);

      if (propertiesError) throw propertiesError;

      // Build purchase data
      const purchaseData: OwnerPurchase[] = responses.map(response => {
        const profile = profiles?.find(p => p.id === response.owner_id);
        const property = properties?.find(p => p.owner_id === response.owner_id);
        const items = responseItems?.filter(ri => ri.response_id === response.id) || [];

        const itemPurchases: ItemPurchase[] = items
          .filter(item => item.quantity > 0)
          .map(item => {
            const proposalItem = proposalItems?.find(pi => pi.id === item.item_id);
            return {
              itemId: item.item_id,
              itemName: proposalItem?.name || 'Item',
              unitPriceCents: proposalItem?.unit_price_cents || 0,
              quantity: item.quantity,
            };
          });

        const totalCents = itemPurchases.reduce(
          (sum, item) => sum + (item.unitPriceCents * item.quantity), 
          0
        );

        return {
          ownerId: response.owner_id,
          ownerName: profile?.name || 'Proprietário',
          propertyName: property?.name || null,
          items: itemPurchases,
          totalCents,
          paid: !!response.paid_at,
          paidAt: response.paid_at,
        };
      }).filter(p => p.items.length > 0);

      return purchaseData;
    },
    enabled: !!proposalItems?.length,
  });

  if (!proposalItems?.length) {
    return null;
  }

  const paidPurchases = purchases?.filter(p => p.paid) || [];
  const pendingPurchases = purchases?.filter(p => !p.paid) || [];

  // Calculate totals per item
  const itemTotals = proposalItems.map(item => {
    const totalQuantity = purchases?.reduce((sum, purchase) => {
      const purchaseItem = purchase.items.find(i => i.itemId === item.id);
      return sum + (purchaseItem?.quantity || 0);
    }, 0) || 0;

    const paidQuantity = paidPurchases.reduce((sum, purchase) => {
      const purchaseItem = purchase.items.find(i => i.itemId === item.id);
      return sum + (purchaseItem?.quantity || 0);
    }, 0);

    return {
      ...item,
      totalQuantity,
      paidQuantity,
      totalValueCents: totalQuantity * item.unit_price_cents,
      paidValueCents: paidQuantity * item.unit_price_cents,
    };
  });

  const grandTotalCents = itemTotals.reduce((sum, item) => sum + item.totalValueCents, 0);
  const paidTotalCents = itemTotals.reduce((sum, item) => sum + item.paidValueCents, 0);

  const formatCurrency = (cents: number) => 
    `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <Card className="border-0 shadow-md border-info/30">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingCart className="h-5 w-5 text-info" />
          Lista de Compras em Lote
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-info/10 dark:bg-blue-950/30 text-center">
            <Package className="h-5 w-5 text-info mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Itens</p>
            <p className="text-xl font-bold text-info">
              {itemTotals.reduce((sum, i) => sum + i.totalQuantity, 0)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 dark:bg-green-950/30 text-center">
            <Check className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Pagos</p>
            <p className="text-xl font-bold text-success">
              {itemTotals.reduce((sum, i) => sum + i.paidQuantity, 0)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-warning/10 dark:bg-amber-950/30 text-center">
            <DollarSign className="h-5 w-5 text-warning mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-warning">
              {formatCurrency(grandTotalCents)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 dark:bg-emerald-950/30 text-center">
            <DollarSign className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="text-lg font-bold text-success">
              {formatCurrency(paidTotalCents)}
            </p>
          </div>
        </div>

        <Separator />

        {/* Items Summary Table */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
            <Package className="h-4 w-4" />
            Resumo por Item
          </h4>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Preço Unit.</TableHead>
                  <TableHead className="text-center">Qtd Total</TableHead>
                  <TableHead className="text-center">Qtd Paga</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemTotals.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {formatCurrency(item.unit_price_cents)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{item.totalQuantity}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="bg-success/10 text-success">
                        {item.paidQuantity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.totalValueCents)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-center">
                    {itemTotals.reduce((sum, i) => sum + i.totalQuantity, 0)}
                  </TableCell>
                  <TableCell className="text-center text-success">
                    {itemTotals.reduce((sum, i) => sum + i.paidQuantity, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(grandTotalCents)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* Purchases by Owner */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4" />
            Compras por Unidade
          </h4>
          
          {purchases?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma compra registrada ainda
            </p>
          )}

          <div className="space-y-3">
            {purchases?.map((purchase) => (
              <div 
                key={purchase.ownerId}
                className={`p-4 rounded-lg border ${
                  purchase.paid 
                    ? 'bg-success/10/50 dark:bg-green-950/20 border-success/30' 
                    : 'bg-warning/10/50 dark:bg-amber-950/20 border-warning/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        {purchase.propertyName || purchase.ownerName}
                      </span>
                      {purchase.paid ? (
                        <Badge variant="secondary" className="bg-success/10 text-success text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Pago
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Aguardando
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-sm">
                      {purchase.items.map((item, idx) => (
                        <span 
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-background border text-xs"
                        >
                          <span className="font-medium">{item.quantity}x</span>
                          <span className="text-muted-foreground">{item.itemName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className={`text-lg font-bold ${purchase.paid ? 'text-success' : 'text-warning'}`}>
                      {formatCurrency(purchase.totalCents)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
