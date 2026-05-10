import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  CheckCircle2,
  Clock,
  FileText,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import riosLogo from "@/assets/rios-logo.png";

type CurationItem = {
  name?: string;
  link?: string | null;
  price?: string;
  price_cents?: number;
  category?: string;
  why?: string;
  priority?: string;
};

type CurationCategory = {
  key?: string;
  emoji?: string;
  desc?: string;
  items?: CurationItem[];
};

type Curation = {
  id: string;
  owner_id: string;
  title: string | null;
  status: string;
  total_amount_cents: number | null;
  paid_at: string | null;
  published_at: string | null;
  created_at: string;
  categories: CurationCategory[] | null;
  selected_items: CurationItem[] | null;
  owner: { name: string | null; email: string | null } | null;
};

type OwnerGroup = {
  owner_id: string;
  name: string;
  email: string;
  curations: Curation[];
};

const formatBRL = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function statusBadge(status: string) {
  switch (status) {
    case "paid":
      return (
        <Badge className="border-success/30 bg-success/15 text-success hover:bg-success/15">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Paga
        </Badge>
      );
    case "published":
      return (
        <Badge className="border-info/30 bg-info/15 text-info hover:bg-info/15">
          <Sparkles className="mr-1 h-3 w-3" /> Publicada
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="outline" className="border-muted text-muted-foreground">
          <Clock className="mr-1 h-3 w-3" /> Rascunho
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminCuradoriasLista() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [curations, setCurations] = useState<Curation[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("owner_curations")
        .select(
          "id, owner_id, title, status, total_amount_cents, paid_at, published_at, created_at, categories, selected_items, owner:profiles!owner_curations_owner_id_fkey(name, email)"
        )
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback sem o alias da FK caso não exista
        const { data: data2 } = await supabase
          .from("owner_curations")
          .select("id, owner_id, title, status, total_amount_cents, paid_at, published_at, created_at, categories, selected_items")
          .order("created_at", { ascending: false });
        const ids = Array.from(new Set((data2 ?? []).map((c: any) => c.owner_id)));
        const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", ids);
        const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
        setCurations(
          ((data2 ?? []) as any[]).map((c) => ({ ...c, owner: byId.get(c.owner_id) ?? null })) as Curation[]
        );
      } else {
        setCurations((data ?? []) as any);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return curations;
    return curations.filter((c) => {
      const hay = [c.owner?.name, c.owner?.email, c.title].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [curations, search]);

  const groups = useMemo<OwnerGroup[]>(() => {
    const map = new Map<string, OwnerGroup>();
    for (const c of filtered) {
      const key = c.owner_id;
      if (!map.has(key)) {
        map.set(key, {
          owner_id: key,
          name: c.owner?.name ?? "Proprietário",
          email: c.owner?.email ?? "",
          curations: [],
        });
      }
      map.get(key)!.curations.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/curadoria/p/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  // Itens efetivamente comprados/selecionados ou todos os itens da curadoria
  const itemsOf = (c: Curation): CurationItem[] => {
    if (c.selected_items && c.selected_items.length > 0) return c.selected_items;
    const all: CurationItem[] = [];
    (c.categories ?? []).forEach((cat) =>
      (cat.items ?? []).forEach((it) =>
        all.push({ ...it, category: it.category ?? cat.emoji ? `${cat.emoji ?? ""} ${cat.key ?? ""}`.trim() : cat.key })
      )
    );
    return all;
  };

  const itemsByCategory = (items: CurationItem[]) => {
    const map = new Map<string, CurationItem[]>();
    items.forEach((it) => {
      const k = it.category || "Outros";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries());
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-secondary text-secondary-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-info/25 blur-[140px]" />
      </div>

      <div className="sticky top-0 z-50 border-b border-white/10 bg-secondary/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">Curadorias RIOS — histórico interno</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-secondary-foreground/80 hover:bg-white/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">Acervo interno</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Curadorias por proprietário</h1>
            <p className="mt-2 text-sm text-secondary-foreground/70">
              Consulte tudo que foi enviado e comprado. Itens pagos aparecem com link para reposição.
            </p>
          </div>
          <img src={riosLogo} alt="RIOS" className="h-8 brightness-0 invert md:h-10" />
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search className="h-4 w-4 text-secondary-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por proprietário, e-mail ou título..."
            className="border-0 bg-transparent text-secondary-foreground placeholder:text-secondary-foreground/50 focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <SectionSkeleton />
        ) : groups.length === 0 ? (
          <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nenhuma curadoria encontrada" description="Crie a primeira em Admin → Curadoria nova." />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.owner_id} className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
                <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">{g.name}</h2>
                    <p className="text-xs text-secondary-foreground/60">{g.email}</p>
                  </div>
                  <Badge variant="outline" className="border-white/15 text-secondary-foreground/80">
                    {g.curations.length} {g.curations.length === 1 ? "curadoria" : "curadorias"}
                  </Badge>
                </header>

                <ul className="divide-y divide-white/10">
                  {g.curations.map((c) => {
                    const isOpen = !!expanded[c.id];
                    const items = itemsOf(c);
                    const grouped = itemsByCategory(items);
                    return (
                      <li key={c.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => toggle(c.id)}
                            className="flex flex-1 items-center gap-3 text-left"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-secondary-foreground/60" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-secondary-foreground/60" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{c.title || "Curadoria RIOS"}</span>
                                {statusBadge(c.status)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary-foreground/60">
                                <span>Criada em {formatDate(c.created_at)}</span>
                                {c.paid_at && <span>· Paga em {formatDate(c.paid_at)}</span>}
                                <span>· {items.length} itens</span>
                                <span>· {formatBRL(c.total_amount_cents)}</span>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-secondary-foreground/80 hover:bg-white/10"
                              onClick={() => copyLink(c.id)}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" /> Link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-secondary-foreground/80 hover:bg-white/10"
                              onClick={() => navigate(`/curadoria/p/${c.id}`)}
                            >
                              <FileText className="mr-1 h-3.5 w-3.5" /> Abrir
                            </Button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="mt-4 space-y-5 rounded-xl border border-white/10 bg-secondary/40 p-4">
                            {grouped.length === 0 ? (
                              <p className="text-sm text-secondary-foreground/60">Sem itens registrados.</p>
                            ) : (
                              grouped.map(([cat, list]) => (
                                <div key={cat}>
                                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                                    {cat}
                                  </h4>
                                  <ul className="space-y-2">
                                    {list.map((it, idx) => (
                                      <li
                                        key={idx}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm font-medium">{it.name}</p>
                                          {it.why && (
                                            <p className="mt-0.5 line-clamp-2 text-xs text-secondary-foreground/60">
                                              {it.why}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <span className="text-sm font-semibold text-secondary-foreground/90">
                                            {it.price ?? formatBRL(it.price_cents)}
                                          </span>
                                          {it.link && (
                                            <a
                                              href={it.link}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-secondary-foreground/90 hover:bg-white/10"
                                            >
                                              Abrir <ExternalLink className="h-3 w-3" />
                                            </a>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
