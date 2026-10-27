import { useState } from "react";
import { Check, ChevronsUpDown, UserRound, UserRoundX } from "lucide-react";
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
import { Etiqueta } from "@/components/painel/Etiqueta";
import { cn } from "@/lib/utils";
import type { ContaProprietario } from "@/hooks/useViabilizacoes";

export const SEM_CONTA = "sem_conta";
export type EscolhaProprietario = ContaProprietario | typeof SEM_CONTA | null;

interface Props {
  id: string;
  valor: EscolhaProprietario;
  onChange: (valor: EscolhaProprietario) => void;
  contas: ContaProprietario[];
  carregando: boolean;
  erro?: boolean;
}

/** "Proprietário" ou "Pré-cadastro" (ficha enviada, conta ainda não aprovada). */
export function EtiquetaConta({ role }: { role: string }) {
  return role === "pending_owner" ? (
    <Etiqueta tom="warning">Pré-cadastro</Etiqueta>
  ) : (
    <Etiqueta tom="success">Proprietário</Etiqueta>
  );
}

/**
 * Conta do proprietário no portal (proprietários aprovados e pré-cadastros de
 * /cadastro-imovel), com busca por nome, e-mail ou telefone. Com a conta
 * escolhida o imóvel já nasce no portal; sem ela, só dá para anotar.
 */
export function SeletorProprietario({ id, valor, onChange, contas, carregando, erro = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const escolher = (v: EscolhaProprietario) => {
    onChange(v);
    setAberto(false);
  };
  const conta = valor && valor !== SEM_CONTA ? valor : null;

  return (
    <div className="space-y-1.5">
      <Label id={`${id}-rotulo`}>Conta do proprietário no portal</Label>
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
          {valor === SEM_CONTA ? (
            <UserRoundX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={cn("truncate", !valor && "text-muted-foreground")}>
            {conta ? conta.name : valor === SEM_CONTA ? "Ainda não tem conta no portal" : carregando ? "Carregando contas…" : "Escolher"}
          </span>
          {conta && <EtiquetaConta role={conta.role} />}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
      {erro && <p className="text-xs text-destructive">Escolha a conta, ou diga que ainda não tem.</p>}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Quem é o proprietário?</DialogTitle>
            <DialogDescription>
              Quem preencheu a ficha em /cadastro-imovel já aparece aqui como pré-cadastro. Busque por nome, e-mail ou telefone.
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Buscar por nome, e-mail ou telefone…" />
            <CommandList className="max-h-80">
              <CommandEmpty>Ninguém com esse nome. Sem conta, escolha a primeira opção.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="ainda nao tem conta no portal" onSelect={() => escolher(SEM_CONTA)} className="gap-2">
                  <UserRoundX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">Ainda não tem conta no portal</span>
                  {valor === SEM_CONTA && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
                </CommandItem>
              </CommandGroup>
              {contas.length > 0 && <CommandSeparator />}
              {contas.length > 0 && (
                <CommandGroup heading="Contas">
                  {contas.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.email} ${c.phone ?? ""}`}
                      onSelect={() => escolher(c)}
                      className="gap-2"
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.email}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </span>
                      </span>
                      <EtiquetaConta role={c.role} />
                      {conta?.id === c.id && <Check className="ml-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
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
