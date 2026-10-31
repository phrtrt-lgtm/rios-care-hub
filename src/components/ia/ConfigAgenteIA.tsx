import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfigIA, useSalvarConfigIA } from "@/hooks/useAssistenteIA";
import { type ConfigIA, CONFIG_IA_PADRAO, EFFORTS_IA, FERRAMENTA_ROTULO, MODELOS_IA, PAPEIS_IA } from "@/lib/iaMeta";

/**
 * Aba "Agente" de /configuracao-ia: liga e desliga o assistente, escolhe
 * modelo e effort, quais perfis o veem, cotas e ferramentas desligadas.
 * Grava em `system_config.ia_agente`; a function `ia-agente` lê a cada chamada.
 */
export function ConfigAgenteIA() {
  const config = useConfigIA(true);
  const salvar = useSalvarConfigIA();
  const [form, setForm] = useState<ConfigIA>(CONFIG_IA_PADRAO);
  const [desligadas, setDesligadas] = useState("");

  useEffect(() => {
    if (config.data) {
      setForm(config.data);
      setDesligadas(config.data.ferramentas_desligadas.join(", "));
    }
  }, [config.data]);

  const atualizar = <K extends keyof ConfigIA>(campo: K, valor: ConfigIA[K]) => setForm((f) => ({ ...f, [campo]: valor }));
  const atualizarCota = (campo: keyof ConfigIA["cotas"], valor: string) =>
    setForm((f) => ({ ...f, cotas: { ...f.cotas, [campo]: Math.max(0, parseInt(valor || "0", 10) || 0) } }));

  const enviar = () => {
    const lista = desligadas
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    salvar.mutate({ ...form, ferramentas_desligadas: lista });
  };

  if (config.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistente nas páginas</CardTitle>
        <CardDescription>
          O botão "I.A" que aparece em todas as páginas. Nasce desligado; ligue depois que a function
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">ia-agente</code>
          estiver publicada e o secret <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> existir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="ia-ativo" className="text-base">Assistente ligado</Label>
            <p className="text-sm text-muted-foreground">Desligado, o botão some e a function recusa qualquer pedido.</p>
          </div>
          <Switch id="ia-ativo" checked={form.ativo} onCheckedChange={(v) => atualizar("ativo", v)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Modelo</Label>
            <Select value={form.modelo} onValueChange={(v) => atualizar("modelo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELOS_IA.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Effort (quanto pensa)</Label>
            <Select value={form.effort} onValueChange={(v) => atualizar("effort", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EFFORTS_IA.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Quem vê o assistente</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {PAPEIS_IA.map((p) => (
              <label key={p.valor} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Checkbox
                  checked={!!form.papeis[p.valor]}
                  onCheckedChange={(v) => atualizar("papeis", { ...form.papeis, [p.valor]: v === true })}
                />
                {p.rotulo}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Proprietário e faxineira ainda não têm ferramentas próprias (Fases 2 e seguintes do plano); ligar agora só expõe as consultas da equipe com a RLS deles.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="cota-equipe">Mensagens/hora (equipe)</Label>
            <Input id="cota-equipe" type="number" min={1} value={form.cotas.mensagens_por_hora_equipe}
              onChange={(e) => atualizarCota("mensagens_por_hora_equipe", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cota-prop">Mensagens/hora (proprietário)</Label>
            <Input id="cota-prop" type="number" min={1} value={form.cotas.mensagens_por_hora_proprietario}
              onChange={(e) => atualizarCota("mensagens_por_hora_proprietario", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cota-tokens">Tokens/dia por pessoa</Label>
            <Input id="cota-tokens" type="number" min={1000} step={10000} value={form.cotas.tokens_por_dia}
              onChange={(e) => atualizarCota("tokens_por_dia", e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="ia-desligadas">Ferramentas desligadas</Label>
          <Textarea
            id="ia-desligadas"
            value={desligadas}
            onChange={(e) => setDesligadas(e.target.value)}
            rows={2}
            placeholder="nomes separados por vírgula, ex.: buscar_proprietario, vistorias_do_imovel"
            className="font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Disponíveis: {Object.keys(FERRAMENTA_ROTULO).join(", ")}.
          </p>
        </div>

        <Button onClick={enviar} disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar configuração do agente
        </Button>
      </CardContent>
    </Card>
  );
}
