import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buscarConfigLembrete,
  contarProximaRodada,
  salvarConfigLembrete,
  type ConfigLembrete,
} from "@/lib/lembreteAtraso";

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v || min)));

/**
 * Botão + diálogo do lembrete automático de atraso por WhatsApp. O envio roda
 * todo dia às 10h (cron whatsapp-lembrete-atraso); aqui só se liga/desliga e
 * se define o ritmo. Só admin — a policy da tabela também só aceita admin.
 */
export function LembreteAtrasoConfig() {
  const { profile, user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [config, setConfig] = useState<ConfigLembrete | null>(null);
  const [proxima, setProxima] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setConfig(null);
    setProxima(null);
    buscarConfigLembrete()
      .then(setConfig)
      .catch(() => toast.error("Não foi possível carregar a configuração do lembrete."));
    contarProximaRodada()
      .then(setProxima)
      .catch(() => setProxima(null));
  }, [aberto]);

  if (profile?.role !== "admin") return null;

  const salvar = async () => {
    if (!config) return;
    setSalvando(true);
    try {
      const valores = {
        ativo: config.ativo,
        intervalo_dias: limitar(config.intervalo_dias, 1, 60),
        max_lembretes: limitar(config.max_lembretes, 1, 20),
        max_por_dia: limitar(config.max_por_dia, 1, 40),
      };
      await salvarConfigLembrete(valores, user?.id);
      toast.success(
        valores.ativo
          ? "Lembrete automático ligado. Próxima rodada: amanhã às 10h."
          : "Lembrete automático desligado.",
      );
      setAberto(false);
    } catch {
      toast.error("Não foi possível salvar. Só admin pode alterar.");
    } finally {
      setSalvando(false);
    }
  };

  const campo = (chave: "intervalo_dias" | "max_lembretes" | "max_por_dia", rotulo: string, ajuda: string, max: number) => (
    <div className="grid grid-cols-[1fr_88px] items-center gap-3">
      <div>
        <Label htmlFor={`lembrete-${chave}`}>{rotulo}</Label>
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      </div>
      <Input
        id={`lembrete-${chave}`}
        type="number"
        min={1}
        max={max}
        value={config?.[chave] ?? ""}
        onChange={(e) => config && setConfig({ ...config, [chave]: Number(e.target.value) })}
        disabled={!config}
      />
    </div>
  );

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <AlarmClock className="mr-2 h-4 w-4" />
        Lembrete de atraso
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => !salvando && setAberto(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembrete automático de atraso</DialogTitle>
            <DialogDescription>
              Todo dia às 10h, cada proprietário com cobrança em atraso e WhatsApp ligado recebe{" "}
              <strong>uma mensagem só</strong>, com a quantidade de cobranças, o total e o vencimento mais antigo,
              avisando que o valor pode ser debitado de uma próxima reserva.
            </DialogDescription>
          </DialogHeader>

          {!config ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <Label htmlFor="lembrete-ativo">Envio automático</Label>
                  <p className="text-xs text-muted-foreground">
                    {config.ativo ? "Ligado" : "Desligado — nada é enviado sozinho"}
                  </p>
                </div>
                <Switch
                  id="lembrete-ativo"
                  checked={config.ativo}
                  onCheckedChange={(v) => setConfig({ ...config, ativo: v })}
                />
              </div>
              {campo("intervalo_dias", "Intervalo entre lembretes", "Dias entre um lembrete e o próximo para o mesmo proprietário.", 60)}
              {campo("max_lembretes", "Máximo de lembretes por cobrança", "Depois disso, a cobrança para de gerar lembrete.", 20)}
              {campo("max_por_dia", "Proprietários por dia", "Limite de mensagens por rodada; o resto fica para o dia seguinte.", 40)}

              <p className="rounded-md bg-muted/50 p-3 text-sm">
                {proxima === null
                  ? "Calculando quem receberia..."
                  : `Com a configuração salva, a próxima rodada enviaria para ${proxima} ${proxima === 1 ? "proprietário" : "proprietários"}.`}
                {config.atualizado_em && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Alterado em {format(new Date(config.atualizado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Só recebe quem está com o WhatsApp de cobrança ligado. Ficam de fora cobranças contestadas, com
                comprovante em análise ou já em débito na reserva. O modelo <code>cobranca_atraso_proprietario</code>{" "}
                precisa estar aprovado no Meta.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={!config || salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
