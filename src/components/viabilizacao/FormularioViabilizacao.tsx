import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Check, FileText, HousePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Etiqueta } from "@/components/painel/Etiqueta";
import { SeletorImovel } from "@/components/listas/SeletorImovel";
import { EscolherAnexos } from "@/components/listas/EscolherAnexos";
import { erroDeAnexo } from "@/lib/anexosListas";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  NOME_MAX,
  NOME_MIN,
  OBSERVACOES_MAX,
  ORDEM_ETAPAS,
  etapaInicial,
  type EtapaViabilizacao,
} from "@/lib/viabilizacaoMeta";
import {
  useAtualizarViabilizacao,
  useContasProprietarios,
  useCriarViabilizacao,
  useFichasCaptacao,
  useImoveisDoPortal,
  type ContaProprietario,
  type FichaCaptacao,
  type Viabilizacao,
} from "@/hooks/useViabilizacoes";
import { SEM_CONTA, SeletorProprietario, type EscolhaProprietario } from "./SeletorProprietario";

type Origem = "novo" | "portal";

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Com registro, o diálogo edita em vez de criar. */
  editar?: Viabilizacao | null;
  /** Começa em "já está no portal" com este imóvel escolhido (sugestões, ?imovel=). */
  imovelInicial?: string | null;
  /** Imóveis que já têm viabilização (não aparecem em "já está no portal"). */
  imoveisJaRegistrados?: Set<string>;
  onSalvo?: (id: string) => void;
}

function primeiroNomeMaiusculo(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? "").toUpperCase();
}

/** Lista das fichas de /cadastro-imovel, para puxar nome, endereço e proprietário. */
function SeletorFicha({
  open,
  onOpenChange,
  fichas,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fichas: FichaCaptacao[];
  onEscolher: (f: FichaCaptacao) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Puxar de uma ficha de captação</DialogTitle>
          <DialogDescription>As fichas mais recentes de /cadastro-imovel. Busque pelo nome, endereço ou proprietário.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Buscar ficha…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Nenhuma ficha com esse texto.</CommandEmpty>
            <CommandGroup>
              {fichas.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`${f.property_nickname ?? ""} ${f.property_address} ${f.owner_name} ${f.owner_email}`}
                  onSelect={() => onEscolher(f)}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{f.property_nickname || f.owner_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.property_address} · {f.owner_name}
                    </span>
                  </span>
                  {f.owner_profile_id && <Etiqueta tom="success">com conta</Etiqueta>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Registrar um imóvel novo (ou editar o registro). Três jeitos de começar:
 * do zero, de um imóvel que já está no portal, ou puxando uma ficha de
 * captação. Com a conta do proprietário escolhida, o imóvel é criado no
 * portal na hora e os itens já podem ser listados.
 */
export function FormularioViabilizacao({ open, onOpenChange, editar = null, imovelInicial = null, imoveisJaRegistrados, onSalvo }: Props) {
  const { user } = useAuth();
  const criar = useCriarViabilizacao();
  const atualizar = useAtualizarViabilizacao();
  const contas = useContasProprietarios(open);
  const imoveis = useImoveisDoPortal(open);
  const fichas = useFichasCaptacao(open);
  const editando = !!editar;

  const [origem, setOrigem] = useState<Origem>("novo");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [conta, setConta] = useState<EscolhaProprietario>(null);
  const [propNome, setPropNome] = useState("");
  const [propTelefone, setPropTelefone] = useState("");
  const [propEmail, setPropEmail] = useState("");
  const [etapa, setEtapa] = useState<EtapaViabilizacao | null>(null);
  const [visitaEm, setVisitaEm] = useState("");
  const [estreia, setEstreia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [avisar, setAvisar] = useState(true);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);

  // Ao abrir: limpa ou carrega o registro em edição.
  useEffect(() => {
    if (!open) return;
    setTentouEnviar(false);
    setArquivos([]);
    setFichaAberta(false);
    if (editar) {
      setOrigem("novo");
      setPropertyId(editar.property_id);
      setNome(editar.imovel?.name ?? editar.nome);
      setEndereco(editar.imovel?.address ?? editar.endereco ?? "");
      setConta(null);
      setPropNome(editar.proprietario_nome ?? editar.imovel?.owner?.name ?? "");
      setPropTelefone(editar.proprietario_telefone ?? editar.imovel?.owner?.phone ?? "");
      setPropEmail(editar.proprietario_email ?? editar.imovel?.owner?.email ?? "");
      setEtapa(editar.etapa);
      setVisitaEm(editar.visita_em ?? "");
      setEstreia(editar.estreia_prevista ?? "");
      setObservacoes(editar.observacoes ?? "");
      setAvisar(editar.avisar_proprietario);
    } else {
      setOrigem(imovelInicial ? "portal" : "novo");
      setPropertyId(imovelInicial);
      setNome("");
      setEndereco("");
      setConta(null);
      setPropNome("");
      setPropTelefone("");
      setPropEmail("");
      setEtapa(null);
      setVisitaEm("");
      setEstreia("");
      setObservacoes("");
      setAvisar(true);
    }
  }, [open, editar, imovelInicial]);

  const imovelEscolhido = useMemo(() => imoveis.data?.find((i) => i.id === propertyId) ?? null, [imoveis.data, propertyId]);
  const opcoesImoveis = useMemo(
    () => (imoveis.data ?? []).filter((i) => !imoveisJaRegistrados?.has(i.id)).map((i) => ({ id: i.id, name: i.name })),
    [imoveis.data, imoveisJaRegistrados],
  );

  const contaEscolhida: ContaProprietario | null = conta && conta !== SEM_CONTA ? conta : null;
  const etapaEfetiva: EtapaViabilizacao = etapa ?? etapaInicial(visitaEm || null);
  const usaPortal = !editando && origem === "portal";
  const nomeFinal = usaPortal ? (imovelEscolhido?.name ?? "") : nome.trim();
  const erroNome = tentouEnviar && !usaPortal && (nomeFinal.length < NOME_MIN || nomeFinal.length > NOME_MAX);
  const erroImovel = tentouEnviar && usaPortal && !imovelEscolhido;
  const erroConta = tentouEnviar && !editando && !usaPortal && conta === null;
  const salvando = criar.isPending || atualizar.isPending;

  const aplicarFicha = (f: FichaCaptacao) => {
    setFichaAberta(false);
    setOrigem("novo");
    setPropertyId(null);
    setNome((f.property_nickname || primeiroNomeMaiusculo(f.owner_name)).toUpperCase());
    setEndereco(f.property_address ?? "");
    setPropNome(f.owner_name ?? "");
    setPropTelefone(f.owner_phone ?? "");
    setPropEmail(f.owner_email ?? "");
    const c = f.owner_profile_id ? contas.data?.find((x) => x.id === f.owner_profile_id) ?? null : null;
    setConta(c ?? SEM_CONTA);
    toast.success(c ? "Ficha carregada; o proprietário já tem conta no portal." : "Ficha carregada. Essa pessoa ainda não tem conta no portal.");
  };

  const escolherConta = (v: EscolhaProprietario) => {
    setConta(v);
    if (v && v !== SEM_CONTA) {
      // Os dados da conta valem mais do que o que foi digitado.
      setPropNome(v.name);
      if (v.phone) setPropTelefone(v.phone);
      setPropEmail(v.email);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTentouEnviar(true);
    if (!user) return;
    if (erroNome || erroImovel || erroConta) return;
    if (!usaPortal && (nomeFinal.length < NOME_MIN || nomeFinal.length > NOME_MAX)) return;
    if (usaPortal && !imovelEscolhido) return;
    if (!editando && !usaPortal && conta === null) return;

    try {
      if (editar) {
        await atualizar.mutateAsync({
          id: editar.id,
          propertyId: editar.property_id,
          mudanca: {
            nome: nomeFinal,
            endereco: endereco || null,
            proprietarioNome: propNome || null,
            proprietarioTelefone: propTelefone || null,
            proprietarioEmail: propEmail || null,
            etapa: etapaEfetiva,
            visitaEm: visitaEm || null,
            estreiaPrevista: estreia || null,
            observacoes: observacoes || null,
            avisarProprietario: avisar,
          },
        });
        toast.success("Registro atualizado");
        onOpenChange(false);
        onSalvo?.(editar.id);
        return;
      }

      const id = await criar.mutateAsync({
        nome: usaPortal ? imovelEscolhido!.name : nomeFinal,
        endereco: usaPortal ? (imovelEscolhido!.address ?? null) : endereco || null,
        proprietarioNome: usaPortal ? (imovelEscolhido!.owner?.name ?? null) : propNome || null,
        proprietarioTelefone: usaPortal ? (imovelEscolhido!.owner?.phone ?? null) : propTelefone || null,
        proprietarioEmail: usaPortal ? (imovelEscolhido!.owner?.email ?? null) : propEmail || null,
        etapa: etapaEfetiva,
        visitaEm: visitaEm || null,
        estreiaPrevista: estreia || null,
        observacoes: observacoes || null,
        avisarProprietario: avisar,
        propertyId: usaPortal ? imovelEscolhido!.id : null,
        ownerId: usaPortal ? null : (contaEscolhida?.id ?? null),
        autorId: user.id,
        arquivos,
      });
      toast.success(
        usaPortal || contaEscolhida
          ? "Imóvel registrado. Agora é listar o que precisa ser feito."
          : "Imóvel anotado. Quando o proprietário tiver conta, vincule para listar os itens.",
      );
      onOpenChange(false);
      onSalvo?.(id);
    } catch (erro) {
      console.error("[novos-imoveis] erro ao salvar:", erro);
      const texto = erro instanceof Error ? erro.message : "";
      if (/viabilizacoes_property_id_key|duplicate key/i.test(texto)) {
        toast.error("Esse imóvel já está registrado em Novos imóveis.");
      } else {
        toast.error(erroDeAnexo(erro));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar imóvel novo" : "Registrar imóvel novo"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Nome, endereço, proprietário, etapa e datas."
              : "Pode registrar antes mesmo da visita: só o nome e o endereço já bastam."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="space-y-4">
          {!editando && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="De onde vem o imóvel">
                {(
                  [
                    { v: "novo", rotulo: "Imóvel novo", dica: "Ainda não está no portal", icone: <HousePlus className="h-4 w-4" aria-hidden="true" /> },
                    { v: "portal", rotulo: "Já está no portal", dica: "Escolher da lista de imóveis", icone: <Building2 className="h-4 w-4" aria-hidden="true" /> },
                  ] as { v: Origem; rotulo: string; dica: string; icone: JSX.Element }[]
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={origem === o.v}
                    onClick={() => setOrigem(o.v)}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      origem === o.v ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("mt-0.5 shrink-0", origem === o.v ? "text-primary" : "text-muted-foreground")}>{o.icone}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{o.rotulo}</span>
                      <span className="block text-xs text-muted-foreground">{o.dica}</span>
                    </span>
                    {origem === o.v && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              {origem === "novo" && (fichas.data?.length ?? 0) > 0 && (
                <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setFichaAberta(true)}>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Puxar de uma ficha de captação
                </Button>
              )}
            </div>
          )}

          {usaPortal ? (
            <SeletorImovel
              id="viab-imovel"
              valor={propertyId}
              onChange={setPropertyId}
              imoveis={opcoesImoveis}
              carregando={imoveis.isLoading}
              ehFaxineira={false}
              erro={erroImovel}
              semGeral
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="viab-nome">Nome do imóvel</Label>
                <Input
                  id="viab-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={NOME_MAX}
                  placeholder="Ex.: SORAIA"
                  autoFocus={!editando}
                  aria-invalid={erroNome || undefined}
                  className={cn("h-11 uppercase", erroNome && "border-destructive")}
                />
                {erroNome && <p className="text-xs text-destructive">Dê um nome ao imóvel (2 a 80 letras).</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="viab-endereco">Endereço</Label>
                <Input
                  id="viab-endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  maxLength={300}
                  placeholder="Rua, número, apto, bairro, cidade"
                  className="h-11"
                />
              </div>
            </div>
          )}

          {usaPortal && imovelEscolhido && (
            <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {imovelEscolhido.address ? `${imovelEscolhido.address} · ` : ""}
              Proprietário: {imovelEscolhido.owner?.name ?? "sem dono"}
            </p>
          )}

          {!usaPortal && !editando && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <SeletorProprietario
                id="viab-conta"
                valor={conta}
                onChange={escolherConta}
                contas={contas.data ?? []}
                carregando={contas.isLoading}
                erro={erroConta}
              />
              <p className="text-xs text-muted-foreground">
                {contaEscolhida
                  ? `O imóvel é criado no portal agora, no nome de ${contaEscolhida.name}, e os itens já podem ser listados.`
                  : conta === SEM_CONTA
                    ? "Sem conta dá para anotar e marcar a visita. Para listar o que fazer e cobrar, vincule a conta depois (o proprietário pode preencher /cadastro-imovel)."
                    : "Com a conta, o imóvel já nasce no portal e os itens podem virar cobrança."}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="viab-prop-nome">Nome</Label>
                  <Input id="viab-prop-nome" value={propNome} onChange={(e) => setPropNome(e.target.value)} maxLength={120} className="h-10" readOnly={!!contaEscolhida} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="viab-prop-tel">WhatsApp</Label>
                  <Input id="viab-prop-tel" value={propTelefone} onChange={(e) => setPropTelefone(e.target.value)} maxLength={40} inputMode="tel" placeholder="22 99999-0000" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="viab-prop-email">E-mail</Label>
                  <Input id="viab-prop-email" value={propEmail} onChange={(e) => setPropEmail(e.target.value)} maxLength={160} inputMode="email" className="h-10" readOnly={!!contaEscolhida} />
                </div>
              </div>
            </div>
          )}

          {editando && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="viab-prop-nome">Proprietário</Label>
                <Input id="viab-prop-nome" value={propNome} onChange={(e) => setPropNome(e.target.value)} maxLength={120} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="viab-prop-tel">WhatsApp</Label>
                <Input id="viab-prop-tel" value={propTelefone} onChange={(e) => setPropTelefone(e.target.value)} maxLength={40} inputMode="tel" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="viab-prop-email">E-mail</Label>
                <Input id="viab-prop-email" value={propEmail} onChange={(e) => setPropEmail(e.target.value)} maxLength={160} inputMode="email" className="h-10" />
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="viab-avisar" className="text-sm">
                Avisar o proprietário por WhatsApp
              </Label>
              <p className="text-xs text-muted-foreground">
                A cada avanço: visita marcada, preparação, itens feitos e cobranças enviadas. Itens juntam numa mensagem só.
                {usaPortal
                  ? " Vai para o WhatsApp do perfil dele."
                  : propTelefone.trim()
                    ? ` Vai para ${propTelefone.trim()}.`
                    : " Sem número, nada sai."}
              </p>
            </div>
            <Switch id="viab-avisar" checked={avisar} onCheckedChange={setAvisar} aria-label="Avisar o proprietário por WhatsApp" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="viab-etapa">Etapa</Label>
              <Select value={etapaEfetiva} onValueChange={(v) => setEtapa(v as EtapaViabilizacao)}>
                <SelectTrigger id="viab-etapa" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {(editando ? ORDEM_ETAPAS : ETAPAS_ABERTAS).map((e) => (
                    <SelectItem key={e} value={e}>
                      {ETAPAS[e].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="viab-visita">Visita</Label>
              <Input id="viab-visita" type="date" value={visitaEm} onChange={(e) => setVisitaEm(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="viab-estreia">Estreia prevista</Label>
              <Input id="viab-estreia" type="date" value={estreia} onChange={(e) => setEstreia(e.target.value)} className="h-10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="viab-obs">Observações</Label>
            <Textarea
              id="viab-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              maxLength={OBSERVACOES_MAX}
              placeholder="Ex.: chaves com o porteiro; proprietário quer estrear antes do réveillon."
              className="min-h-[72px] resize-y text-sm"
            />
          </div>

          {!editando && <EscolherAnexos arquivos={arquivos} onChange={setArquivos} rotulo="Fotos ou vídeos da visita" />}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <HousePlus className="h-4 w-4" aria-hidden="true" />}
              {editando ? "Salvar" : "Registrar imóvel"}
            </Button>
          </div>
        </form>

        <SeletorFicha open={fichaAberta} onOpenChange={setFichaAberta} fichas={fichas.data ?? []} onEscolher={aplicarFicha} />
      </DialogContent>
    </Dialog>
  );
}
