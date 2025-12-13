import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ArrowLeft, Calendar, Search, Building2, User } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface Inspection {
  id: string;
  property_id: string;
  cleaner_name: string | null;
  cleaner_phone: string | null;
  notes: string | null;
  transcript: string | null;
  audio_url: string | null;
  created_at: string;
  monday_item_id: string | null;
  property: {
    name: string;
    cover_photo_url: string | null;
  };
}

export default function AdminVistoriasTodas() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ok" | "nao">("todos");

  useEffect(() => {
    if (profile?.role !== "admin" && profile?.role !== "agent" && profile?.role !== "maintenance") {
      navigate("/painel");
      return;
    }
    fetchInspections();
  }, [profile, navigate]);

  useEffect(() => {
    let filtered = inspections;
    
    // Filtro por busca
    if (searchTerm.trim() !== "") {
      filtered = filtered.filter((insp) =>
        insp.property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        insp.cleaner_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Filtro por status
    if (statusFilter === "ok") {
      filtered = filtered.filter((insp) => insp.notes === "OK");
    } else if (statusFilter === "nao") {
      filtered = filtered.filter((insp) => insp.notes === "NÃO");
    }
    
    setFilteredInspections(filtered);
  }, [searchTerm, statusFilter, inspections]);

  const fetchInspections = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("cleaning_inspections")
        .select(`
          *,
          property:properties!inner(name, cover_photo_url)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setInspections(data || []);
      setFilteredInspections(data || []);
    } catch (error) {
      console.error("Erro ao carregar vistorias:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/vistorias")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Todas as Vistorias</h1>
              <p className="text-sm text-muted-foreground">
                Visão completa ordenada por data
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Barra de pesquisa e filtros */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Pesquisar por imóvel ou faxineira..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Filtros de status */}
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("todos")}
            >
              Todos
            </Button>
            <Button
              variant={statusFilter === "ok" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("ok")}
              className={statusFilter === "ok" ? "bg-green-600 hover:bg-green-700" : ""}
            >
              OK
            </Button>
            <Button
              variant={statusFilter === "nao" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("nao")}
              className={statusFilter === "nao" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              NÃO
            </Button>
          </div>
        </div>

        {/* Contador */}
        <div className="mb-4 text-sm text-muted-foreground">
          {filteredInspections.length} {filteredInspections.length === 1 ? "vistoria encontrada" : "vistorias encontradas"}
        </div>

        {/* Lista de vistorias */}
        <div className="space-y-3">
          {filteredInspections.map((inspection) => (
            <Card
              key={inspection.id}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-4">
                  {/* Foto do imóvel */}
                  <div className="w-32 flex-shrink-0">
                    <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
                      {inspection.property.cover_photo_url ? (
                        <img
                          src={inspection.property.cover_photo_url}
                          alt={inspection.property.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </AspectRatio>
                  </div>

                  {/* Informações */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg">{inspection.property.name}</CardTitle>
                      {inspection.notes && (
                        <span className={`text-sm font-bold px-2 py-1 rounded ${
                          inspection.notes === "OK" 
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" 
                            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                        }`}>
                          {inspection.notes}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDateTime(inspection.created_at)}
                      </div>
                      
                      {inspection.cleaner_name && (
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {inspection.cleaner_name}
                          {inspection.cleaner_phone && ` (${inspection.cleaner_phone})`}
                        </div>
                      )}
                    </div>

                    {(inspection.transcript || inspection.notes) && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {inspection.transcript || inspection.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {inspection.audio_url && (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Com áudio
                        </span>
                      )}
                      {inspection.monday_item_id && (
                        <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                          Monday: {inspection.monday_item_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {filteredInspections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma vistoria encontrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchTerm
                  ? "Tente ajustar sua pesquisa"
                  : "As vistorias aparecerão aqui quando forem registradas"}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
