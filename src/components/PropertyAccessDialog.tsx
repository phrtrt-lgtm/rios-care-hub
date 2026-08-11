import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { Users, UserPlus, Trash2 } from "lucide-react";

interface Props {
  propertyId: string;
  propertyName: string;
  trigger?: React.ReactNode;
}

interface MemberRow {
  id: string;
  user_id: string;
  note: string | null
  created_at: string;
  member: { name: string | null; email: string | null } | null;
}

export function PropertyAccessDialog({ propertyId, propertyName, trigger }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["property-members", propertyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_members")
        .select("id, user_id, note, created_at, member:profiles!property_members_user_id_fkey(name, email)")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MemberRow[];
    },
  });

  const invite = async () => {
    if (!email.trim()) {
      toast({ title: "Informe o e-mail", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("property-access-invite", {
        body: { propertyId, email: email.trim(), name: name.trim(), note: note.trim() || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Acesso concedido",
        description: (data as any)?.created
          ? `Conta criada com a senha padrão ${(data as any).defaultPassword}. Avise a pessoa para alterá-la no primeiro acesso.`
          : "A pessoa já tinha conta no portal e agora acompanha esta unidade.",
      });
      setEmail("");
      setName("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["property-members", propertyId] });
    } catch (e) {
      toast({
        title: "Erro ao conceder acesso",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("property_members").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover acesso", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acesso removido" });
    queryClient.invalidateQueries({ queryKey: ["property-members", propertyId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="flex-1">
            <Users className="mr-2 h-3 w-3" />
            Acessos
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acessos de {propertyName}</DialogTitle>
          <DialogDescription>
            Pessoas convidadas acompanham esta unidade com o mesmo acesso do titular: cobranças,
            manutenções, vistorias, relatórios e votações. A pontuação de pagamento permanece no titular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border p-3">
          <div>
            <Label htmlFor="pa-email">E-mail do convidado</Label>
            <Input
              id="pa-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@email.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pa-name">Nome (opcional)</Label>
              <Input id="pa-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pa-note">Observação (opcional)</Label>
              <Input
                id="pa-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: sócio, cônjuge"
              />
            </div>
          </div>
          <Button onClick={invite} disabled={saving} className="w-full">
            <UserPlus className="mr-2 h-4 w-4" />
            {saving ? "Concedendo..." : "Convidar e liberar acesso"}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Pessoas com acesso</h4>
            {members?.length ? <Badge variant="secondary">{members.length}</Badge> : null}
          </div>

          {isLoading ? (
            <SectionSkeleton />
          ) : !members?.length ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Nenhum acesso adicional"
              description="Somente o titular acompanha esta unidade no momento."
            />
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.member?.name ?? "Convidado"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.member?.email}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeMember(m.id)}
                    aria-label="Remover acesso"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
