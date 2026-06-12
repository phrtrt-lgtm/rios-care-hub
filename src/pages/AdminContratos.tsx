import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Search } from "lucide-react";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminContratos() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("contracts")
        .select("id, status, commission_percent, term_months, created_at, updated_at, owner:owner_id(id,name,email), property:property_id(id,name)")
        .order("created_at", { ascending: false });
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      r.owner?.name?.toLowerCase().includes(s) ||
      r.owner?.email?.toLowerCase().includes(s) ||
      r.property?.name?.toLowerCase().includes(s) ||
      r.status?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Contratos
            </h1>
            <p className="text-sm text-muted-foreground">Gestão completa de contratos com proprietários.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/contratos/modelos")}>
              <FileText className="h-4 w-4 mr-1" /> Modelos
            </Button>
            <Button onClick={() => navigate("/admin/contratos/novo")}>
              <Plus className="h-4 w-4 mr-1" /> Novo contrato
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por proprietário, imóvel ou status..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum contrato" description="Crie o primeiro pré-contrato para começar." action={<Button onClick={() => navigate("/admin/contratos/novo")}>Novo contrato</Button>} />
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => (
              <Card key={r.id} className="cursor-pointer hover:border-primary/40 transition" onClick={() => navigate(`/admin/contratos/${r.id}`)}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{r.owner?.name ?? "—"}</p>
                      <ContractStatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.property?.name ?? "Sem imóvel"} · Comissão {r.commission_percent}% · {r.term_months} meses
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
