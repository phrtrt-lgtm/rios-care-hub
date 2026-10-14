import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { descreverErroDaFunction } from "@/lib/erroFunction";

/** Botão discreto, só admin: recria o webhook da Hostex e guarda o novo token. */
export function ReconectarWebhookHostex() {
  const { profile } = useAuth();
  const [rodando, setRodando] = useState(false);
  if (profile?.role !== "admin") return null;

  const rodar = async () => {
    if (!confirm("Reconectar o webhook da Hostex? O webhook atual será apagado e um novo criado.")) return;
    setRodando(true);
    try {
      const { data, error } = await supabase.functions.invoke("hostex-webhook-registrar", { body: {} });
      if (error) throw new Error(await descreverErroDaFunction(error));
      toast({ title: "Webhook da Hostex reconectado", description: `${(data as any)?.apagados ?? 0} antigo(s) apagado(s).` });
    } catch (e: any) {
      toast({ title: "Não foi possível reconectar", description: e.message, variant: "destructive" });
    } finally {
      setRodando(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" onClick={rodar} disabled={rodando} className="text-muted-foreground">
      <Link2 className="mr-2 h-4 w-4" />
      {rodando ? "Reconectando..." : "Reconectar webhook da Hostex"}
    </Button>
  );
}
