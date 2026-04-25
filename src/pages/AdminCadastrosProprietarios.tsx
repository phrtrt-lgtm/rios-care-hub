import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, MapPin, Home, Calendar, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Submission {
  id: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  property_address: string;
  property_nickname: string | null;
  bedrooms_count: number;
  living_rooms_count: number;
  bathrooms_count: number;
  suites_count: number;
  max_capacity: number;
  rooms_data: unknown;
  kitchen_items: string[];
  special_amenities: string[];
  condo_amenities: string[];
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  novo: { label: "Novo", variant: "default" },
  em_analise: { label: "Em análise", variant: "secondary" },
  reuniao_agendada: { label: "Reunião agendada", variant: "outline" },
  aprovado: { label: "Aprovado", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
};

export default function AdminCadastrosProprietarios() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("property_intake_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar fichas");
    } else {
      setItems((data as Submission[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("property_intake_submissions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success("Status atualizado");
      load();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Button variant="ghost" onClick={() => navigate("/painel")} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Painel
        </Button>

        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-1">Cadastros de Potenciais Proprietários</h1>
            <p className="text-muted-foreground">Fichas recebidas pelo formulário público</p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.open("/cadastro-imovel", "_blank")}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Ver formulário público
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center">
            <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold mb-1">Nenhuma ficha recebida ainda</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Compartilhe o link <code className="px-2 py-1 bg-muted rounded text-xs">/cadastro-imovel</code> com potenciais proprietários
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((s) => {
              const status = STATUS_LABELS[s.status] || STATUS_LABELS.novo;
              return (
                <Card key={s.id} className="p-6 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[260px]">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{s.owner_name}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <a href={`mailto:${s.owner_email}`} className="flex items-center gap-2 hover:text-primary">
                          <Mail className="h-3.5 w-3.5" />
                          {s.owner_email}
                        </a>
                        {s.owner_phone && (
                          <a href={`tel:${s.owner_phone}`} className="flex items-center gap-2 hover:text-primary">
                            <Phone className="h-3.5 w-3.5" />
                            {s.owner_phone}
                          </a>
                        )}
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.property_nickname ? `${s.property_nickname} — ` : ""}{s.property_address}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(s.created_at).toLocaleString("pt-BR")}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap mt-3 text-xs">
                        <Badge variant="outline">{s.bedrooms_count} quartos</Badge>
                        <Badge variant="outline">{s.suites_count} suítes</Badge>
                        <Badge variant="outline">{s.bathrooms_count} banheiros</Badge>
                        <Badge variant="outline">{s.living_rooms_count} salas</Badge>
                        <Badge variant="outline">Cap. {s.max_capacity}</Badge>
                        {s.kitchen_items?.length > 0 && <Badge variant="secondary">{s.kitchen_items.length} itens cozinha</Badge>}
                        {s.special_amenities?.length > 0 && <Badge variant="secondary">{s.special_amenities.length} comodidades</Badge>}
                        {s.condo_amenities?.length > 0 && <Badge variant="secondary">{s.condo_amenities.length} no condomínio</Badge>}
                      </div>

                      {s.notes && (
                        <div className="mt-3 p-3 rounded bg-muted/50 text-sm">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Observações:</p>
                          <p className="whitespace-pre-wrap">{s.notes}</p>
                        </div>
                      )}
                    </div>

                    <Select value={s.status} onValueChange={(v) => updateStatus(s.id, v)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
