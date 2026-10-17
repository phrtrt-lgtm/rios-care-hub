import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigListas, useEquipe } from "@/hooks/useConfigListas";
import { cn } from "@/lib/utils";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { EstadoImovel } from "@/components/listas/EstadoImovel";
import { IMOVEL_GERAL, imovelEhValido, type ImovelOpcao } from "@/components/listas/imovel";
import { DESCRICAO_TAREFA_MAX, DESCRICAO_TAREFA_MIN, useCriarTarefaRua } from "@/hooks/useTarefasRua";
import type { JanelaImovel } from "@/hooks/useJanelaImoveis";

interface Props {
  imoveis: ImovelOpcao[];
  carregandoImoveis: boolean;
  janelas?: Map<string, JanelaImovel>;
  imovelInicial?: string | null;
  onEnviado?: () => void;
  onFechar?: () => void;
  className?: string;
}

/** Nova tarefa de rua: imóvel e o que precisa ser feito lá. */
export function FormularioTarefa({
  imoveis,
  carregandoImoveis,
  janelas,
  imovelInicial = null,
  onEnviado,
  onFechar,
  className,
}: Props) {
  const criar = useCriarTarefaRua();
  const [imovel, setImovel] = useState<string | null>(imovelInicial);
  const [descricao, setDescricao] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const equipe = useEquipe();
  const config = useConfigListas();
  const [responsavel, setResponsavel] = useState<string | null>(null);
  // Começa com quem cuida das tarefas de rua por padrão (hoje, o Kaique).
  useEffect(() => {
    if (responsavel === null && config.data?.tarefas_rua_padrao) setResponsavel(config.data.tarefas_rua_padrao);
  }, [responsavel, config.data]);
  const semWhatsapp = !!responsavel && equipe.data?.find((m) => m.id === responsavel)?.temTelefone === false;
  const campo = useRef<HTMLTextAreaElement>(null);

  const imovelValido = imovelEhValido(imovel, imoveis);
  const erroImovel = tentouEnviar && !imovelValido;
  const erroDescricao = tentouEnviar && descricao.trim().length < DESCRICAO_TAREFA_MIN;
  const janela = imovel && imovel !== IMOVEL_GERAL ? janelas?.get(imovel) : undefined;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTentouEnviar(true);
    if (!imovelValido || descricao.trim().length < DESCRICAO_TAREFA_MIN) {
      if (imovelValido) campo.current?.focus();
      return;
    }
    try {
      await criar.mutateAsync({ propertyId: imovel === IMOVEL_GERAL ? null : imovel, descricao, responsavelId: responsavel });
      toast.success("Tarefa adicionada");
      setDescricao("");
      setTentouEnviar(false);
      campo.current?.focus();
      onEnviado?.();
    } catch (erro) {
      console.error("[tarefas-rua] erro ao adicionar:", erro);
      toast.error("Não foi possível adicionar. Confira a internet e tente de novo.");
    }
  };

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="titulo-nova-tarefa"
      className={cn("space-y-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="titulo-nova-tarefa" className="text-[15px] font-semibold tracking-tight">
            Nova tarefa de rua
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">O que alguém da rua precisa ir fazer, e onde.</p>
        </div>
        {onFechar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onFechar}
            aria-label="Fechar formulário"
            className="-mr-1.5 -mt-1.5 h-8 w-8 shrink-0 text-muted-foreground lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <SeletorImovel
          id="imovel-tarefa"
          valor={imovel}
          onChange={setImovel}
          imoveis={imoveis}
          carregando={carregandoImoveis}
          ehFaxineira={false}
          erro={erroImovel}
          rotuloGeralEquipe="Geral (vários imóveis ou fora deles)"
        />
        {janela && <EstadoImovel janela={janela} variante="linha" />}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tarefa-descricao">O que fazer</Label>
        <Textarea
          id="tarefa-descricao"
          ref={campo}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          maxLength={DESCRICAO_TAREFA_MAX}
          placeholder="Ex.: levar 2 jogos de toalha e trocar a lâmpada da varanda."
          aria-invalid={erroDescricao || undefined}
          className={cn("min-h-[84px] resize-y text-sm", erroDescricao && "border-destructive")}
        />
        {erroDescricao && <p className="text-xs text-destructive">Escreva o que precisa ser feito.</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tarefa-responsavel">Quem vai cuidar</Label>
        <Select value={responsavel ?? undefined} onValueChange={setResponsavel}>
          <SelectTrigger id="tarefa-responsavel" className="h-11">
            <SelectValue placeholder={equipe.isLoading ? "Carregando equipe…" : "Escolher"} />
          </SelectTrigger>
          <SelectContent className="z-50 max-h-72 bg-popover">
            {(equipe.data ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                {!m.temTelefone && " (sem WhatsApp)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={cn("text-xs", semWhatsapp ? "text-warning" : "text-muted-foreground")}>
          {semWhatsapp
            ? "Essa pessoa não tem WhatsApp no cadastro: a tarefa fica na lista, mas ninguém é avisado."
            : "Recebe a tarefa no WhatsApp, com o estado do imóvel e o próximo check-out."}
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full gap-2 px-4" disabled={criar.isPending}>
        {criar.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Adicionando…
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar tarefa
          </>
        )}
      </Button>
    </form>
  );
}
