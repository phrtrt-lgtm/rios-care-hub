import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormularioCompra } from "@/components/compras/FormularioCompra";
import { useImoveisAjuste } from "@/hooks/useAjustes";
import type { CustoCompra } from "@/lib/compraMeta";
import type { MaintenanceItem } from "@/components/maintenance/listaTipos";

/**
 * Pedido de compra feito de dentro de uma manutenção: já vem com o imóvel e
 * quem paga, e fica ligado ao ticket (compras.ticket_id). O WhatsApp sai pelo
 * mesmo trigger das compras (notificar-listas).
 */
export function CompraManutencaoDialog({
  item,
  onOpenChange,
}: {
  item: MaintenanceItem | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const imoveis = useImoveisAjuste();
  const custo: CustoCompra | null =
    item?.cost_responsible === "owner" || item?.cost_responsible === "pm" || item?.cost_responsible === "guest"
      ? item.cost_responsible
      : null;

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compra para a manutenção</DialogTitle>
          <DialogDescription className="line-clamp-2">{item?.subject}</DialogDescription>
        </DialogHeader>
        {item && (
          <FormularioCompra
            key={item.id}
            imoveis={imoveis.data ?? []}
            carregandoImoveis={imoveis.isLoading}
            ehFaxineira={false}
            imovelInicial={item.property?.id ?? null}
            ticketId={item.id}
            custoInicial={custo}
            className="border-0 p-0 shadow-none"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
