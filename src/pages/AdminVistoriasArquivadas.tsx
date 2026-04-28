import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Calendar, User, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { ArchiveInspectionButton } from "@/components/ArchiveInspectionButton";
import { Archive } from "lucide-react";

interface Inspection {
  id: string;
  property_id: string;
  cleaner_name: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
  is_routine: boolean | null;
  property: { name: string; cover_photo_url: string | null } | null;
}

export default function AdminVistoriasArquivadas() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile && profile.role !== "admin" && profile.role !== "agent" && profile.role !== "maintenance") {
      navigate("/painel");
    }
  }, [profile, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cleaning_inspections")
        .select("id, property_id, cleaner_name, notes, created_at, archived_at, is_routine, property:properties(name, cover_photo_url)")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      setInspections((data as any) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/admin/vistorias")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Vistorias arquivadas</h1>
              <p className="text-sm text-muted-foreground">
                {loading ? "Carregando..." : `${inspections.length} vistoria(s) arquivada(s)`}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        {loading ? (
          <SectionSkeleton />
        ) : inspections.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-6 w-6" />}
            title="Nenhuma vistoria arquivada"
            description="Vistorias arquivadas aparecem aqui e podem ser restauradas a qualquer momento."
          />
        ) : (
          <div className="space-y-2">
            {inspections.map((insp) => {
              const isOk = insp.notes === "OK";
              return (
                <Card key={insp.id} className="overflow-hidden">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {insp.property?.cover_photo_url ? (
                        <img
                          src={insp.property.cover_photo_url}
                          alt={insp.property.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {insp.property?.name || "Imóvel removido"}
                        </span>
                        {insp.is_routine && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            Rotina
                          </Badge>
                        )}
                        {insp.notes && (
                          <Badge
                            variant={isOk ? "secondary" : "destructive"}
                            className={"text-xs shrink-0 " + (isOk ? "bg-success/20 text-success" : "")}
                          >
                            {insp.notes}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(insp.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                        {insp.cleaner_name && (
                          <span className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{insp.cleaner_name}</span>
                          </span>
                        )}
                        {insp.archived_at && (
                          <span className="flex items-center gap-1">
                            <Archive className="h-3 w-3" />
                            arquivada {format(new Date(insp.archived_at), "dd/MM/yy", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/admin/vistoria/${insp.id}`)}
                        className="h-8 w-8 p-0"
                        title="Abrir vistoria"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <ArchiveInspectionButton
                        inspectionId={insp.id}
                        archived
                        onDone={fetchData}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
