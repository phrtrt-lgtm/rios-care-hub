import { useEffect, useRef, useState } from "react";
import { FileCode2, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorProprietario, type EscolhaProprietario } from "@/components/viabilizacao/SeletorProprietario";
import { useContasProprietarios } from "@/hooks/useViabilizacoes";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_ARQUIVO_CURADORIA,
  enviarArquivoCuradoria,
  gerarTokenCuradoria,
  lerDadosDoArquivo,
  tabelaCuradorias,
  type DadosDoArquivo,
} from "@/lib/curadoriaHtml";

const SEM_IMOVEL = "sem-imovel";

interface Imovel {
  id: string;
  name: string;
  owner_id: string | null;
}

interface Props {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  onCriada: () => void;
}

/**
 * Hospeda o proposta.html da skill proposta-decorativa: escolhe o arquivo, o portal lê nome, peças e total
 * de dentro dele, acha o imóvel pelo nome e sugere o proprietário. A equipe só confere.
 */
export function NovaCuradoriaHtml({ aberto, onOpenChange, onCriada }: Props) {
  const { profile } = useAuth();
  const entrada = useRef<HTMLInputElement>(null);
  const contas = useContasProprietarios(aberto);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dados, setDados] = useState<DadosDoArquivo | null>(null);
  const [conta, setConta] = useState<EscolhaProprietario>(null);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [imovelId, setImovelId] = useState(SEM_IMOVEL);
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroConta, setErroConta] = useState(false);

  const contaId = conta && conta !== "sem_conta" ? conta.id : null;

  useEffect(() => {
    if (aberto) return;
    setArquivo(null);
    setDados(null);
    setConta(null);
    setImoveis([]);
    setImovelId(SEM_IMOVEL);
    setTitulo("");
    setErroConta(false);
  }, [aberto]);

  // Imóveis do proprietário escolhido
  useEffect(() => {
    if (!contaId) {
      setImoveis([]);
      return;
    }
    supabase
      .from("properties")
      .select("id, name, owner_id")
      .eq("owner_id", contaId)
      .order("name")
      .then(({ data }) => setImoveis((data ?? []) as Imovel[]));
  }, [contaId]);

  const escolherArquivo = async (novo: File | undefined) => {
    if (!novo) return;
    if (!/\.html?$/i.test(novo.name)) {
      toast.error("Escolha o arquivo .html da proposta");
      return;
    }
    if (novo.size > MAX_ARQUIVO_CURADORIA) {
      toast.error("O arquivo passa de 30 MB");
      return;
    }
    const lidos = lerDadosDoArquivo(await novo.text());
    setArquivo(novo);
    setDados(lidos);
    setTitulo(lidos ? `Proposta decorativa · ${lidos.nome}` : "Proposta decorativa");
    if (!lidos) {
      toast.warning("Não reconheci o arquivo como proposta da skill: confira os dados à mão.");
      return;
    }
    // Acha o imóvel pelo nome que veio no arquivo e sugere o dono dele
    const { data } = await supabase.from("properties").select("id, name, owner_id").ilike("name", lidos.nome).limit(1).maybeSingle();
    const imovel = data as Imovel | null;
    if (imovel?.owner_id) {
      const dono = (contas.data ?? []).find((c) => c.id === imovel.owner_id);
      if (dono) {
        setConta(dono);
        setImovelId(imovel.id);
      }
    }
  };

  const salvar = async (publicar: boolean) => {
    if (!arquivo) return;
    if (!contaId) {
      setErroConta(true);
      toast.error("Escolha a conta do proprietário. Sem conta, peça o cadastro em /cadastro-imovel.");
      return;
    }
    setEnviando(true);
    try {
      const token = gerarTokenCuradoria();
      const caminho = await enviarArquivoCuradoria(token, arquivo);
      const { error } = await tabelaCuradorias().insert({
        owner_id: contaId,
        property_id: imovelId === SEM_IMOVEL ? null : imovelId,
        title: titulo.trim() || "Proposta decorativa",
        status: publicar ? "published" : "draft",
        published_at: publicar ? new Date().toISOString() : null,
        source_filename: arquivo.name,
        created_by: profile?.id ?? null,
        html_path: caminho,
        link_token: token,
        pecas: dados?.pecas ?? null,
        total_amount_cents: dados?.totalCents ?? null,
      });
      if (error) throw error;
      toast.success(publicar ? "Proposta publicada" : "Proposta salva como rascunho");
      onOpenChange(false);
      onCriada();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar a proposta");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova proposta em HTML</DialogTitle>
          <DialogDescription>
            O arquivo fica hospedado no portal, ligado ao proprietário. Rascunho só a equipe abre. Publicada, aparece no
            painel dele e o link passa a abrir sem login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="curadoria-arquivo">Arquivo da proposta</Label>
            <input
              ref={entrada}
              id="curadoria-arquivo"
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              onChange={(e) => {
                void escolherArquivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal py-2 text-left font-normal"
              onClick={() => entrada.current?.click()}
            >
              {arquivo ? <FileCode2 className="h-4 w-4 shrink-0 text-primary" /> : <UploadCloud className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0">
                <span className="block truncate">{arquivo ? arquivo.name : "Escolher o proposta.html"}</span>
                {dados && (
                  <span className="block text-xs text-muted-foreground">
                    {dados.nome} · {dados.pecas} peças ·{" "}
                    {(dados.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} no Pix
                  </span>
                )}
              </span>
            </Button>
          </div>

          <SeletorProprietario
            id="curadoria-conta"
            valor={conta}
            onChange={(v) => {
              setConta(v);
              setImovelId(SEM_IMOVEL);
              setErroConta(false);
            }}
            contas={contas.data ?? []}
            carregando={contas.isLoading}
            erro={erroConta}
            permitirSemConta={false}
          />

          <div className="space-y-1.5">
            <Label htmlFor="curadoria-imovel">Imóvel</Label>
            <Select value={imovelId} onValueChange={setImovelId} disabled={!contaId}>
              <SelectTrigger id="curadoria-imovel" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_IMOVEL}>Sem imóvel específico</SelectItem>
                {imoveis.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="curadoria-titulo">Título</Label>
            <Input id="curadoria-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-11" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={!arquivo || enviando} onClick={() => void salvar(false)}>
            Salvar como rascunho
          </Button>
          <Button type="button" disabled={!arquivo || enviando} onClick={() => void salvar(true)}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publicar para o proprietário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
