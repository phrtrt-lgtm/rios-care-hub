import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format";
import { parseBRNumber } from "@/lib/parseBRNumber";
import { CHARGE_CATEGORY_OPTIONS } from "@/constants/chargeCategories";
import { Repeat, Plus, Pencil, Trash2, PlayCircle, CalendarClock, Loader2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecurringCharge {
  id: string;
  owner_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  vendor_name: string | null;
  amount_cents: number;
  management_contribution_cents: number;
  due_day: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  last_generated_period: string | null;
  owner?: { name: string } | null;
  property?: { name: string } | null;
}

interface Owner {
  id: string;
  name: string;
}

interface Property {
  id: string;
  name: string;
  owner_id: string;
}

const emptyForm = {
  owner_id: "",
  property_id: "",
  title: "",
  vendor_name: "",
  category: "",
  description: "",
  amount: "",
  management_contribution: "",
  due_day: "10",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  active: true,
};

export function RecurringChargesPanel() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecurringCharge[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringCharge | null>(null);
  const [runs, setRuns] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [recRes, ownersRes, propsRes, runsRes] = await Promise.all([
        supabase
          .from("recurring_charges")
          .select("*, owner:profiles!recurring_charges_owner_id_fkey(name), property:properties(name)")
          .order("active", { ascending: false })
          .order("due_day", { ascending: true }),
        supabase.from("profiles").select("id, name").in("role", ["owner", "pending_owner"]).order("name"),
        supabase.from("properties").select("id, name, owner_id").order("name"),
        supabase.from("recurring_charge_runs").select("recurring_charge_id"),
      ]);

      if (recRes.error) throw recRes.error;
      setItems((recRes.data || []) as unknown as RecurringCharge[]);
      setOwners((ownersRes.data || []) as Owner[]);
      setProperties((propsRes.data || []) as Property[]);
      const counts: Record<string, number> = {};
      (runsRes.data || []).forEach((r: { recurring_charge_id: string }) => {
        counts[r.recurring_charge_id] = (counts[r.recurring_charge_id] || 0) + 1;
      });
      setRuns(counts);
    } catch (error: unknown) {
      toast({
        title: "Erro ao carregar contas recorrentes",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const ownerProperties = useMemo(
    () => properties.filter((p) => !form.owner_id || p.owner_id === form.owner_id),
    [properties, form.owner_id],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: RecurringCharge) => {
    setEditingId(item.id);
    setForm({
      owner_id: item.owner_id,
      property_id: item.property_id || "",
      title: item.title,
      vendor_name: item.vendor_name || "",
      category: item.category || "",
      description: item.description || "",
      amount: (item.amount_cents / 100).toFixed(2).replace(".", ","),
      management_contribution: item.management_contribution_cents
        ? (item.management_contribution_cents / 100).toFixed(2).replace(".", ",")
        : "",
      due_day: String(item.due_day),
      start_date: item.start_date,
      end_date: item.end_date || "",
      active: item.active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.owner_id || !form.title.trim() || !form.amount) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe proprietário, título e valor mensal.",
        variant: "destructive",
      });
      return;
    }

    const dueDay = Number(form.due_day);
    if (!dueDay || dueDay < 1 || dueDay > 31) {
      toast({ title: "Dia de vencimento inválido", description: "Use um dia entre 1 e 31.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        owner_id: form.owner_id,
        property_id: form.property_id || null,
        title: form.title.trim(),
        vendor_name: form.vendor_name.trim() || null,
        category: form.category || null,
        description: form.description.trim() || null,
        amount_cents: Math.round(parseBRNumber(form.amount) * 100),
        management_contribution_cents: form.management_contribution
          ? Math.round(parseBRNumber(form.management_contribution) * 100)
          : 0,
        due_day: dueDay,
        start_date: form.start_date,
        end_date: form.end_date || null,
        active: form.active,
      };

      if (editingId) {
        const { error } = await supabase.from("recurring_charges").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_charges").insert(payload);
        if (error) throw error;
      }

      toast({ title: editingId ? "Conta recorrente atualizada" : "Conta recorrente criada" });
      setDialogOpen(false);
      fetchAll();
    } catch (error: unknown) {
      toast({ title: "Erro ao salvar", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: RecurringCharge) => {
    const { error } = await supabase
      .from("recurring_charges")
      .update({ active: !item.active })
      .eq("id", item.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("recurring_charges").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conta recorrente removida" });
    setDeleteTarget(null);
    fetchAll();
  };

  const generateNow = async (item?: RecurringCharge) => {
    setRunning(item?.id || "all");
    try {
      const { data, error } = await supabase.functions.invoke("recurring-charges-cron", {
        body: item ? { recurringIds: [item.id], force: true } : {},
      });
      if (error) throw error;
      const created = (data?.results || []).filter((r: { created?: boolean }) => r.created).length;
      toast({
        title: created > 0 ? `${created} cobrança(s) gerada(s)` : "Nada a gerar",
        description:
          created > 0
            ? "As cobranças do mês foram enviadas aos proprietários."
            : "As cobranças deste mês já foram geradas ou ainda não chegou o dia de vencimento.",
      });
      fetchAll();
    } catch (error: unknown) {
      toast({ title: "Erro ao gerar cobranças", description: (error as Error).message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Contas recorrentes</p>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">{items.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => generateNow()} disabled={running !== null}>
            {running === "all" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-2 h-3.5 w-3.5" />}
            Gerar do mês
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Nova conta
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Contas fixas que a RIOS paga pelo proprietário (piscineiro, internet, condomínio...). No dia do vencimento a cobrança
        é criada e enviada automaticamente com o descritivo.
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title="Nenhuma conta recorrente"
          description="Cadastre as contas mensais que você repassa ao proprietário para cobrar automaticamente todo mês."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nova conta
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className={item.active ? "" : "opacity-60"}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{item.title}</p>
                      <Badge variant={item.active ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                        {item.active ? "Ativa" : "Pausada"}
                      </Badge>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Dia {item.due_day}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.owner?.name}
                      {item.property?.name ? ` · ${item.property.name}` : ""}
                      {item.vendor_name ? ` · ${item.vendor_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-success">{formatBRL(item.amount_cents)}</p>
                    {item.management_contribution_cents > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Aporte RIOS {formatBRL(item.management_contribution_cents)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    {runs[item.id] ? `${runs[item.id]} mês(es) gerado(s)` : "Nunca gerada"}
                    {item.last_generated_period
                      ? ` · último: ${format(new Date(`${item.last_generated_period}T12:00:00`), "MMM/yyyy", { locale: ptBR })}`
                      : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1.5 mr-1">
                      <Switch checked={item.active} onCheckedChange={() => toggleActive(item)} />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => generateNow(item)}
                      disabled={running !== null}
                    >
                      {running === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlayCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigate(`/gerenciar-cobrancas`)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar conta recorrente" : "Nova conta recorrente"}</DialogTitle>
            <DialogDescription>
              A cobrança é criada automaticamente todo mês no dia do vencimento escolhido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Proprietário *</Label>
                <Select
                  value={form.owner_id}
                  onValueChange={(v) => setForm({ ...form, owner_id: v, property_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={form.property_id || "none"}
                  onValueChange={(v) => setForm({ ...form, property_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {ownerProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Internet, Piscineiro, Condomínio"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  value={form.vendor_name}
                  onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                  placeholder="Ex: Claro, João Piscinas"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGE_CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descritivo</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Mensalidade do piscineiro (2 visitas semanais) paga pela RIOS e repassada ao proprietário."
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Valor mensal (R$) *</Label>
                <Input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.,]/g, "") })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Aporte RIOS (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={form.management_contribution}
                  onChange={(e) =>
                    setForm({ ...form, management_contribution: e.target.value.replace(/[^0-9.,]/g, "") })
                  }
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Dia venc. *</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativa</p>
                <p className="text-xs text-muted-foreground">Se pausada, nenhuma cobrança é gerada.</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              As cobranças já geradas continuam no sistema. Apenas a recorrência será apagada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
