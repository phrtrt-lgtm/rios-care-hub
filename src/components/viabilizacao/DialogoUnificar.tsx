import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COST_RESPONSIBLE_OPTIONS } from "@/components/maintenance/listaTipos";
import { formatBRL } from "@/lib/format";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { NATUREZA_ITEM, type NaturezaItem } from "@/lib/ticketMeta";
import { devido } from "@/lib/viabilizacaoResumo";
import type { ItemViabilizacao, UnificacaoItens } from "@/hooks/useViabilizacoes";

type Custo = UnificacaoItens["costResponsible"];
const NATUREZAS = Object.keys(NATUREZA_ITEM) as NaturezaItem[];
const LIMITE_NOME = 200;

const emReais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const paraCents = (texto: string): number | null => {
  const n = Math.round(parseBRNumber(texto) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Nome sugerido: os nomes dos itens até caber no limite; o resto vira "e mais N itens". */
function nomeSugerido(itens: ItemViabilizacao[]): string {
  const nomes = itens.map((i) => i.subject.trim()).filter(Boolean);
  const todos = nomes.join(", ");
  if (todos.length <= LIMITE_NOME) return todos;
  const cabem: string[] = [];
  for (const nome of nomes) {
    const resto = nomes.length - cabem.length - 1;
    const tentativa = `${[...cabem, nome].join(", ")} e mais ${resto} ${resto === 1 ? "item" : "itens"}`;
    if (tentativa.length > LIMITE_NOME) break;
    cabem.push(nome);
  }
  if (cabem.length === 0) return nomes[0].slice(0, LIMITE_NOME);
  const resto = nomes.length - cabem.length;
  return `${cabem.join(", ")} e mais ${resto} ${resto === 1 ? "item" : "itens"}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Itens marcados, na ordem da lista. Não muda enquanto o diálogo está aberto. */
  itens: ItemViabilizacao[];
  salvando: boolean;
  onConfirmar: (dados: Omit<UnificacaoItens, "ids">) => void;
}

/**
 * Junta os itens selecionados num só (pedido do gestor, 2026-11-02): ele
 * compra vários itens de uma vez e cobra o proprietário uma vez. Nome, tipo,
 * quem paga, valor e aporte vêm preenchidos pelos itens e podem ser
 * corrigidos antes de confirmar. Quem grava é a função SQL
 * `unificar_manutencoes` (anexos e conversas vão junto; originais arquivados).
 */
export function DialogoUnificar({ open, onOpenChange, itens, salvando, onConfirmar }: Props) {
  const [nome, setNome] = useState("");
  const [natureza, setNatureza] = useState<NaturezaItem>("manutencao");
  const [custo, setCusto] = useState<Custo>("owner");
  const [valor, setValor] = useState("");
  const [aporte, setAporte] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(nomeSugerido(itens));
    setNatureza(itens.length > 0 && itens.every((i) => i.natureza === "compra") ? "compra" : "manutencao");
    const custos = new Set(itens.map((i) => i.cost_responsible ?? "owner"));
    setCusto(custos.size === 1 ? ([...custos][0] as Custo) : "owner");
    const somaValor = itens.reduce((s, i) => s + (i.amount_cents ?? 0), 0);
    const somaAporte = itens.reduce((s, i) => s + (i.management_contribution_cents ?? 0), 0);
    setValor(somaValor > 0 ? emReais(somaValor) : "");
    setAporte(somaAporte > 0 ? emReais(somaAporte) : "");
  }, [open, itens]);

  const valorCents = paraCents(valor);
  const aporteCents = paraCents(aporte);
  const aPagar = devido(valorCents, aporteCents);
  const nomeOk = nome.trim().length >= 2;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!nomeOk || salvando || itens.length < 2) return;
    onConfirmar({
      subject: nome.trim(),
      natureza,
      costResponsible: custo,
      amountCents: valorCents,
      managementContributionCents: aporteCents,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(aberto) => !salvando && onOpenChange(aberto)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5 text-primary" aria-hidden="true" />
              Unificar {itens.length} itens
            </DialogTitle>
            <DialogDescription>
              Os itens viram um só, com os anexos e as conversas deles; os originais vão para o arquivo. Depois, o envio ao
              proprietário é uma cobrança única.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/60 px-3 py-2 text-xs" aria-label="Itens selecionados">
            {itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{i.subject}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatBRL(i.amount_cents ?? 0)}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="unificar-nome">Nome do item</Label>
            <Input
              id="unificar-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={LIMITE_NOME}
              autoFocus
              disabled={salvando}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unificar-tipo">Tipo</Label>
              <Select value={natureza} onValueChange={(v) => setNatureza(v as NaturezaItem)} disabled={salvando}>
                <SelectTrigger id="unificar-tipo" aria-label="Compra ou manutenção">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {NATUREZAS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NATUREZA_ITEM[n].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unificar-custo">Quem paga</Label>
              <Select value={custo} onValueChange={(v) => setCusto(v as Custo)} disabled={salvando}>
                <SelectTrigger id="unificar-custo" aria-label="Quem paga">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {COST_RESPONSIBLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unificar-valor">Valor (R$)</Label>
              <Input
                id="unificar-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="text-right tabular-nums"
                disabled={salvando}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unificar-aporte">Aporte da gestão (R$)</Label>
              <Input
                id="unificar-aporte"
                value={aporte}
                onChange={(e) => setAporte(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="text-right tabular-nums"
                disabled={salvando}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            A pagar pelo proprietário: <strong className="tabular-nums text-foreground">{formatBRL(aPagar)}</strong>
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !nomeOk || itens.length < 2} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Merge className="h-4 w-4" aria-hidden="true" />}
              Unificar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
