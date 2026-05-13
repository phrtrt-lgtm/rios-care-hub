import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Search,
  Wrench,
  ChevronRight,
  Building2,
  Users,
  DollarSign,
  ArrowUpDown,
} from "lucide-react";
import { formatBRL } from "@/lib/format";

interface OwnerSummary {
  id: string;
  name: string;
  email: string;
  total_properties: number;
  total_maintenances: number;
  current_year_total_cents: number;
  current_year_owner_cents: number;
  pending_count: number;
}

export default function AdminRelatoriosManutencoes() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortOption, setSortOption] = useState<string>("value_desc");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31T23:59:59`;

        const [{ data: ownersData }, { data: propsData }, { data: chargesData }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id, name, email")
              .eq("role", "owner")
              .order("name"),
            supabase
              .from("properties")
              .select("id, owner_id")
              .is("archived_at", null),
            supabase
              .from("charges")
              .select("owner_id, amount_cents, management_contribution_cents, status, created_at")
              .is("archived_at", null)
              .gte("created_at", yearStart)
              .lte("created_at", yearEnd),
          ]);

        const propCountByOwner = new Map<string, number>();
        (propsData || []).forEach((p) => {
          propCountByOwner.set(p.owner_id, (propCountByOwner.get(p.owner_id) || 0) + 1);
        });

        const summaries: OwnerSummary[] = (ownersData || []).map((owner) => {
          const ownerCharges = (chargesData || []).filter((c) => c.owner_id === owner.id);
          const totalCents = ownerCharges.reduce((s, c) => s + (c.amount_cents || 0), 0);
          const ownerCents = ownerCharges.reduce(
            (s, c) => s + ((c.amount_cents || 0) - (c.management_contribution_cents || 0)),
            0,
          );
          const pendingCount = ownerCharges.filter((c) =>
            ["draft", "pending", "sent"].includes(c.status as string),
          ).length;

          return {
            id: owner.id,
            name: owner.name,
            email: owner.email,
            total_properties: propCountByOwner.get(owner.id) || 0,
            total_maintenances: ownerCharges.length,
            current_year_total_cents: totalCents,
            current_year_owner_cents: ownerCents,
            pending_count: pendingCount,
          };
        });

        summaries.sort((a, b) => {
          if (b.total_maintenances !== a.total_maintenances)
            return b.total_maintenances - a.total_maintenances;
          return a.name.localeCompare(b.name);
        });

        setOwners(summaries);
      } catch (err) {
        console.error("Error loading maintenance owners:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = term
      ? owners.filter(
          (o) =>
            o.name.toLowerCase().includes(term) ||
            o.email.toLowerCase().includes(term),
        )
      : [...owners];

    result.sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "value_asc":
          return a.current_year_total_cents - b.current_year_total_cents;
        case "value_desc":
          return b.current_year_total_cents - a.current_year_total_cents;
        default:
          return b.current_year_total_cents - a.current_year_total_cents;
      }
    });

    return result;
  }, [owners, search, sortOption]);

  const totalMaint = owners.reduce((s, o) => s + o.total_maintenances, 0);
  const totalSpent = owners.reduce((s, o) => s + o.current_year_total_cents, 0);
  const ownersWithMaint = owners.filter((o) => o.total_maintenances > 0).length;

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/painel")}
              aria-label="Voltar ao painel"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">Relatórios de Manutenções</h1>
              <p className="text-xs text-muted-foreground truncate">
                Consulte manutenções por proprietário
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Proprietários
              </div>
              <p className="text-2xl font-bold mt-1">{owners.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wrench className="h-3.5 w-3.5" /> Manutenções {currentYear}
              </div>
              <p className="text-2xl font-bold mt-1">{totalMaint}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" /> Total {currentYear}
              </div>
              <p className="text-xl font-bold mt-1">{formatBRL(totalSpent)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {ownersWithMaint} com manutenções
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do proprietário ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={search ? "Nenhum proprietário encontrado" : "Nenhum proprietário cadastrado"}
            description={
              search
                ? "Tente buscar por outro nome ou email."
                : "Cadastre proprietários para começar."
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((owner) => (
              <Card
                key={owner.id}
                className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30"
                onClick={() => navigate(`/admin/relatorios-manutencoes/${owner.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{owner.name}</CardTitle>
                      <CardDescription className="text-xs truncate mt-0.5">
                        {owner.email}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {owner.total_properties}{" "}
                      {owner.total_properties === 1 ? "imóvel" : "imóveis"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <Wrench className="h-3 w-3" />
                      {owner.total_maintenances}{" "}
                      {owner.total_maintenances === 1 ? "manutenção" : "manutenções"}
                    </Badge>
                    {owner.pending_count > 0 && (
                      <Badge variant="outline" className="gap-1 text-warning border-warning/40">
                        {owner.pending_count} pendente
                        {owner.pending_count > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {owner.current_year_total_cents > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        Total {currentYear}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {formatBRL(owner.current_year_total_cents)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Proprietário: {formatBRL(owner.current_year_owner_cents)}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
