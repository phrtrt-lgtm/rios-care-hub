import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Search, Upload, CheckCircle2, AlertCircle, Building2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FichaEditorDialog } from "@/components/fichas/FichaEditorDialog";
import { FichaViewerPanel } from "@/components/fichas/FichaViewerPanel";
import { BulkUploadFichasDialog } from "@/components/fichas/BulkUploadFichasDialog";
import { BulkAIEditDialog } from "@/components/fichas/BulkAIEditDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PropertyWithFile {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
  owner_name: string;
  file?: {
    id: string;
    content_md: string;
    version: number;
    updated_at: string;
    has_content: boolean;
  };
}

const AdminFichasImoveis = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [properties, setProperties] = useState<PropertyWithFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [viewingPropertyId, setViewingPropertyId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAIOpen, setBulkAIOpen] = useState(false);

  useEffect(() => {
    if (!user || !["admin", "agent", "maintenance"].includes(profile?.role || "")) {
      navigate("/");
      return;
    }
    fetchData();
  }, [user, profile, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: propsData, error: propsError } = await supabase
        .from("properties")
        .select("id, name, address, cover_photo_url, owner_id")
        .order("name");
      if (propsError) throw propsError;

      const ownerIds = Array.from(new Set((propsData || []).map((p) => p.owner_id)));
      const { data: ownersData } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);

      const { data: filesData, error: filesError } = await supabase
        .from("property_files")
        .select("id, property_id, content_md, version, updated_at");
      if (filesError) throw filesError;

      const enriched: PropertyWithFile[] = (propsData || []).map((p) => {
        const file = filesData?.find((f) => f.property_id === p.id);
        const owner = ownersData?.find((o) => o.id === p.owner_id);
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          cover_photo_url: p.cover_photo_url,
          owner_name: owner?.name || "—",
          file: file
            ? {
                id: file.id,
                content_md: file.content_md,
                version: file.version,
                updated_at: file.updated_at,
                has_content: !!file.content_md && file.content_md.trim().length > 0,
              }
            : undefined,
        };
      });
      setProperties(enriched);
    } catch (error: any) {
      console.error("Erro ao carregar fichas:", error);
      toast({
        title: "Erro ao carregar fichas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address || "").toLowerCase().includes(q) ||
        p.owner_name.toLowerCase().includes(q)
    );
  }, [properties, search]);

  const stats = useMemo(() => {
    const total = properties.length;
    const filled = properties.filter((p) => p.file?.has_content).length;
    return { total, filled, empty: total - filled };
  }, [properties]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando fichas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate("/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Fichas dos Imóveis</h1>
            <p className="text-sm text-muted-foreground">
              Documentação completa de cada unidade em Markdown — usada como contexto pela IA.
            </p>
          </div>
          <Button
            onClick={() => setBulkAIOpen(true)}
            variant="outline"
            disabled={stats.filled === 0}
            title={stats.filled === 0 ? "Nenhuma ficha preenchida ainda" : ""}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Editar com IA em massa
          </Button>
          <Button onClick={() => setBulkOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Upload em massa
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total de imóveis</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-success" /> Com ficha
              </div>
              <div className="text-2xl font-bold text-success">{stats.filled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3 text-warning" /> Sem ficha
              </div>
              <div className="text-2xl font-bold text-warning">{stats.empty}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por imóvel, endereço ou proprietário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid gap-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-colors hover:bg-accent/30"
              onClick={() => (p.file?.has_content ? setViewingPropertyId(p.id) : setEditingPropertyId(p.id))}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    {p.file?.has_content ? (
                      <Badge variant="secondary" className="bg-success/10 text-success hover:bg-success/10">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> v{p.file.version}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-warning/10 text-warning hover:bg-warning/10">
                        <AlertCircle className="mr-1 h-3 w-3" /> Sem ficha
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.owner_name}
                    {p.address ? ` • ${p.address}` : ""}
                  </p>
                  {p.file?.has_content && (
                    <p className="text-[11px] text-muted-foreground">
                      Atualizada {formatDistanceToNow(new Date(p.file.updated_at), { locale: ptBR, addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.file?.has_content && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingPropertyId(p.id);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Ver
                    </Button>
                  )}
                  <Button
                    variant={p.file?.has_content ? "outline" : "default"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingPropertyId(p.id);
                    }}
                  >
                    {p.file?.has_content ? "Editar" : "Criar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum imóvel encontrado.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {editingPropertyId && (
        <FichaEditorDialog
          propertyId={editingPropertyId}
          open={!!editingPropertyId}
          onOpenChange={(open) => {
            if (!open) setEditingPropertyId(null);
          }}
          onSaved={fetchData}
        />
      )}

      <FichaViewerPanel
        propertyId={viewingPropertyId}
        open={!!viewingPropertyId}
        onOpenChange={(open) => {
          if (!open) setViewingPropertyId(null);
        }}
        onEdit={(id) => {
          setViewingPropertyId(null);
          setEditingPropertyId(id);
        }}
      />

      <BulkUploadFichasDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        onCompleted={fetchData}
      />

      <BulkAIEditDialog
        open={bulkAIOpen}
        onOpenChange={setBulkAIOpen}
        propertyIds={properties.filter((p) => p.file?.has_content).map((p) => p.id)}
        onApplied={fetchData}
      />
    </div>
  );
};

export default AdminFichasImoveis;
