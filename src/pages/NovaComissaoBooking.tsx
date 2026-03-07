import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Calculator, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format";

interface Owner { id: string; name: string; email: string; }
interface Property { id: string; name: string; owner_id: string; }

export default function NovaComissaoBooking() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [form, setForm] = useState({
    owner_id: "",
    property_id: "",
    guest_name: "",
    check_in: "",
    check_out: "",
    reservation_amount: "",
    commission_percent: "",
    cleaning_fee: "",
    due_date: "",
    notes: "",
  });

  const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");

  useEffect(() => {
    if (!isTeam) { navigate("/"); return; }
    fetchOwners();
  }, []);

  useEffect(() => {
    if (form.owner_id) fetchProperties(form.owner_id);
    else setProperties([]);
  }, [form.owner_id]);

  const fetchOwners = async () => {
    const { data } = await supabase
      .from("profiles").select("id, name, email")
      .eq("role", "owner").eq("status", "approved").order("name");
    setOwners(data || []);
  };

  const fetchProperties = async (ownerId: string) => {
    const { data } = await supabase
      .from("properties").select("id, name, owner_id")
      .eq("owner_id", ownerId).order("name");
    setProperties(data || []);
  };

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Calculated preview
  const reservationCents = Math.round(parseFloat(form.reservation_amount || "0") * 100);
  const commissionPercent = parseFloat(form.commission_percent || "0");
  const cleaningFeeCents = Math.round(parseFloat(form.cleaning_fee || "0") * 100);
  const commissionCents = Math.round(reservationCents * commissionPercent / 100);
  const totalDueCents = commissionCents + cleaningFeeCents;

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    if (!form.owner_id || !form.check_in || !form.check_out || !form.reservation_amount || !form.commission_percent) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("booking_commissions")
        .insert({
          owner_id: form.owner_id,
          property_id: form.property_id || null,
          guest_name: form.guest_name || null,
          check_in: form.check_in,
          check_out: form.check_out,
          reservation_amount_cents: reservationCents,
          commission_percent: commissionPercent,
          cleaning_fee_cents: cleaningFeeCents,
          due_date: form.due_date || null,
          notes: form.notes || null,
          status: asDraft ? "draft" : "sent",
          created_by: profile?.id,
        })
        .select().single();

      if (error) throw error;

      toast({
        title: asDraft ? "Rascunho salvo!" : "Comissão criada!",
        description: asDraft ? "Salva como rascunho." : "Cobrança enviada ao proprietário.",
      });
      navigate("/booking-comissoes");
    } catch (err: any) {
      toast({ title: "Erro ao criar comissão", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/booking-comissoes")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Nova Comissão Booking
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Registre a comissão (%) + taxa de limpeza de uma reserva recebida diretamente pelo proprietário
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Proprietário */}
              <div className="space-y-2">
                <Label>Proprietário *</Label>
                <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o proprietário" /></SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name} ({o.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Imóvel */}
              <div className="space-y-2">
                <Label>Imóvel</Label>
                <Select value={form.property_id} onValueChange={(v) => set("property_id", v)} disabled={!form.owner_id}>
                  <SelectTrigger>
                    <SelectValue placeholder={form.owner_id ? "Selecione o imóvel (opcional)" : "Selecione o proprietário primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hóspede */}
              <div className="space-y-2">
                <Label>Nome do Hóspede</Label>
                <Input
                  value={form.guest_name}
                  onChange={(e) => set("guest_name", e.target.value)}
                  placeholder="Ex: João Silva"
                />
              </div>

              {/* Datas Check-in / Check-out */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check-in *</Label>
                  <Input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Check-out *</Label>
                  <Input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} required />
                </div>
              </div>

              {/* Valor da Reserva */}
              <div className="space-y-2">
                <Label>Valor Total da Reserva (R$) *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.reservation_amount}
                  onChange={(e) => set("reservation_amount", e.target.value)}
                  placeholder="0,00"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Valor que o proprietário recebeu da Booking
                </p>
              </div>

              {/* Comissão % + Taxa Limpeza */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Comissão (%) *</Label>
                  <Input
                    type="number" step="0.01" min="0" max="100"
                    value={form.commission_percent}
                    onChange={(e) => set("commission_percent", e.target.value)}
                    placeholder="Ex: 15"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Taxa de Limpeza (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={form.cleaning_fee}
                    onChange={(e) => set("cleaning_fee", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Preview do cálculo */}
              {(reservationCents > 0 || cleaningFeeCents > 0) && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold text-primary">Cálculo Automático</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reserva:</span>
                        <span>{formatBRL(reservationCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Comissão ({commissionPercent}%):</span>
                        <span>{formatBRL(commissionCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxa de limpeza:</span>
                        <span>{formatBRL(cleaningFeeCents)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-primary border-t pt-1 mt-1">
                        <span>Total a Cobrar:</span>
                        <span>{formatBRL(totalDueCents)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vencimento */}
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Detalhes adicionais sobre a reserva ou cobrança..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate("/booking-comissoes")}>
                  Cancelar
                </Button>
                <Button
                  type="button" variant="secondary"
                  disabled={loading}
                  onClick={(e) => handleSubmit(e, true)}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Rascunho
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar e Enviar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
