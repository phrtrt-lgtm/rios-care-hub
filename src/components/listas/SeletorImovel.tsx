import { useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { IMOVEL_GERAL, type ImovelOpcao } from "./imovel";

interface Props {
  id: string;
  valor: string | null;
  onChange: (valor: string) => void;
  imoveis: ImovelOpcao[];
  carregando: boolean;
  /** A faxineira só enxerga os imóveis dela; o "geral" vira "outro imóvel". */
  ehFaxineira: boolean;
  erro?: boolean;
  /** Rótulo do "geral" para a equipe. */
  rotuloGeralEquipe?: string;
  /** Onde a faxineira diz qual é o imóvel fora da lista ("na descrição", "no item"). */
  ondeDizerOutro?: string;
  /** Esconde a opção "Geral" (quando o item precisa de um imóvel de verdade). */
  semGeral?: boolean;
}

/**
 * Botão que abre a lista de imóveis com busca (Ajustes e Compras).
 *
 * A faxineira com uma casa só já começa com ela escolhida.
 */
export function SeletorImovel({
  id,
  valor,
  onChange,
  imoveis,
  carregando,
  ehFaxineira,
  erro = false,
  rotuloGeralEquipe = "Geral (vale para todos)",
  ondeDizerOutro = "na descrição",
  semGeral = false,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const rotuloGeral = ehFaxineira ? "Outro imóvel ou geral" : rotuloGeralEquipe;
  const nome = valor === IMOVEL_GERAL ? rotuloGeral : imoveis.find((i) => i.id === valor)?.name;

  useEffect(() => {
    if (ehFaxineira && valor === null && !carregando && imoveis.length === 1) onChange(imoveis[0].id);
  }, [ehFaxineira, valor, carregando, imoveis, onChange]);

  const escolher = (v: string) => {
    onChange(v);
    setAberto(false);
  };

  return (
    <div className="space-y-1.5">
      <Label id={`${id}-rotulo`}>Imóvel</Label>
      <Button
        type="button"
        variant="outline"
        aria-labelledby={`${id}-rotulo`}
        aria-haspopup="dialog"
        aria-invalid={erro || undefined}
        onClick={() => setAberto(true)}
        className={cn("h-11 w-full justify-between px-3 font-normal", erro && "border-destructive")}
      >
        <span className="flex min-w-0 items-center gap-2">
          {valor === IMOVEL_GERAL ? (
            <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={cn("truncate", !nome && "text-muted-foreground")}>
            {nome ?? (carregando ? "Carregando imóveis…" : "Escolher imóvel")}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
      {erro && <p className="text-xs text-destructive">Escolha o imóvel.</p>}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Qual imóvel?</DialogTitle>
            <DialogDescription>
              {semGeral
                ? "Escolha o imóvel; o aviso vai para o proprietário dele."
                : ehFaxineira
                ? `Estes são os seus imóveis. Se não estiver aqui, escolha “Outro imóvel ou geral” e diga qual ${ondeDizerOutro}.`
                : `Escolha “${rotuloGeralEquipe.split(" (")[0]}” quando não é de um imóvel só.`}
            </DialogDescription>
          </DialogHeader>
          <Command>
            {imoveis.length > 6 && <CommandInput placeholder="Buscar imóvel..." />}
            <CommandList className="max-h-80">
              <CommandEmpty>Nenhum imóvel encontrado.</CommandEmpty>
              {!semGeral && (
              <CommandGroup>
                <CommandItem value={rotuloGeral} onSelect={() => escolher(IMOVEL_GERAL)} className="gap-2">
                  <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{rotuloGeral}</span>
                  {valor === IMOVEL_GERAL && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                </CommandItem>
              </CommandGroup>
              )}
              {!semGeral && imoveis.length > 0 && <CommandSeparator />}
              {imoveis.length > 0 && (
                <CommandGroup heading="Imóveis">
                  {imoveis.map((i) => (
                    <CommandItem key={i.id} value={i.name} onSelect={() => escolher(i.id)} className="gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{i.name}</span>
                      {valor === i.id && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
