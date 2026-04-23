import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  ArrowLeft, Calendar, Search, Building2, User,
  ChevronDown, ChevronUp, Headphones, FileText,
  Image, CheckCircle2, AlertTriangle, Loader2, ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ListFilters } from "@/components/list/ListFilters";
import { useListFilters } from "@/hooks/useListFilters";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

const PAGE_SIZE = 50;

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
  is_routine: boolean | null;
  property: {
    name: string;
    cover_photo_url: string | null;
  };
}

interface Attachment {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
}

interface ExpandedData {
  attachments: Attachment[];
  loaded: boolean;
}

export default function AdminVistoriasTodas() {
  useScrollRestoration();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ok" | "nao">("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedData>>({});
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null);
  const filtersHook = useListFilters("filters:admin-vistorias-todas");
  const { filters, debouncedSearch } = filtersHook;

  useEffect(() => {
    if (profile?.role !== "admin" && profile?.role !== "agent" && profile?.role !== "maintenance") {
      navigate("/painel");
    }
  }, [profile, navigate]);

  useEffect(() => {
    fetchInspections();
    setExpandedId(null);
  }, [currentPage, searchTerm, statusFilter]);

  // Sync ListFilters debounced search → server search
  useEffect(() => {
    setSearchTerm(debouncedSearch);
    setSearchInput(debouncedSearch);
    setCurrentPage(1);
  }, [debouncedSearch]);

  const fetchInspections = async () => {
    try {
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("cleaning_inspections")
        .select(`*, property:properties!inner(name, cover_photo_url)`, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (searchTerm.trim()) {
        query = query.ilike("properties.name", `%${searchTerm}%`);
      }
      if (statusFilter === "ok") {
        query = query.eq("notes", "OK");
      } else if (statusFilter === "nao") {
        query = query.neq("notes", "OK").not("notes", "is", null);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setInspections(data || []);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error("Erro ao carregar vistorias:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleToggle = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (expandedData[id]?.loaded) return;

    setLoadingExpand(id);
    try {
      const { data } = await supabase
        .from("cleaning_inspection_attachments")
        .select("*")
        .eq("inspection_id", id);
      setExpandedData(prev => ({ ...prev, [id]: { attachments: data || [], loaded: true } }));
    } catch {
      setExpandedData(prev => ({ ...prev, [id]: { attachments: [], loaded: true } }));
    } finally {
      setLoadingExpand(null);
    }
  }, [expandedId, expandedData]);

  const handleFilterChange = (f: "todos" | "ok" | "nao") => {
    setStatusFilter(f);
    setCurrentPage(1);
  };

  // Generate page numbers to show
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    if (currentPage > 3) pages.push("ellipsis");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/admin/vistorias")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Todas as Vistorias</h1>
              <p className="text-sm text-muted-foreground">
                {loading ? "Carregando..." : `${totalCount} vistorias • página ${currentPage} de ${totalPages || 1}`}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        {/* Filtros */}
        <div className="mb-4">
          <ListFilters
            {...filtersHook}
            searchPlaceholder="Pesquisar por imóvel..."
            showDateRange={false}
            totalCount={totalCount}
            filteredCount={inspections.length}
            extra={
              <div className="flex gap-2 flex-wrap col-span-full">
                {(["todos", "ok", "nao"] as const).map((f) => (
                  <Button
                    key={f}
                    variant={statusFilter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleFilterChange(f)}
                    className={
                      statusFilter === f && f === "ok" ? "bg-success hover:bg-success" :
                      statusFilter === f && f === "nao" ? "bg-destructive hover:bg-destructive" : ""
                    }
                  >
                    {f === "todos" ? "Todos" : f === "ok" ? "✓ OK" : "✗ Problemas"}
                  </Button>
                ))}
              </div>
            }
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {inspections.map((inspection) => {
                const isOk = inspection.notes === "OK";
                const isExpanded = expandedId === inspection.id;
                const data = expandedData[inspection.id];
                const isLoadingThis = loadingExpand === inspection.id;

                const imageCount = data?.attachments.filter(a => a.file_type?.startsWith("image/")).length ?? 0;
                const videoCount = data?.attachments.filter(a => a.file_type?.startsWith("video/")).length ?? 0;
                const audioCount = data?.attachments.filter(a => a.file_type?.startsWith("audio/")).length ?? 0;

                return (
                  <Card key={inspection.id} className="overflow-hidden transition-shadow hover:shadow-md">
                    <CardContent className="p-0">
                      <button
                        className="w-full text-left"
                        onClick={() => handleToggle(inspection.id)}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            {inspection.property.cover_photo_url ? (
                              <img
                                src={inspection.property.cover_photo_url}
                                alt={inspection.property.name}
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
                              <span className="font-medium text-sm truncate">{inspection.property.name}</span>
                              {inspection.is_routine && (
                                <Badge variant="outline" className="text-xs shrink-0">Rotina</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(inspection.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                              </span>
                              {inspection.cleaner_name && (
                                <span className="flex items-center gap-1 truncate">
                                  <User className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{inspection.cleaner_name}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {inspection.notes ? (
                              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                isOk
                                  ? "bg-success/10 text-success dark:bg-green-900/50"
                                  : "bg-destructive/10 text-destructive dark:bg-red-900/50"
                              }`}>
                                {isOk
                                  ? <CheckCircle2 className="h-3 w-3" />
                                  : <AlertTriangle className="h-3 w-3" />
                                }
                                {inspection.notes}
                              </span>
                            ) : null}
                            {isLoadingThis
                              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              : isExpanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
                          {inspection.transcript && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                <FileText className="h-3.5 w-3.5" />
                                Transcrição / Resumo
                              </div>
                              <p className={`text-sm whitespace-pre-wrap rounded-lg p-3 ${
                                isOk
                                  ? "bg-success/10 border border-success/30/20"
                                  : "bg-destructive/10 border border-destructive/20"
                              }`}>
                                {inspection.transcript}
                              </p>
                            </div>
                          )}

                          {inspection.audio_url && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                <Headphones className="h-3.5 w-3.5" />
                                Áudio
                              </div>
                              <audio controls src={inspection.audio_url} className="w-full h-10" />
                            </div>
                          )}

                          {data?.loaded && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                <Image className="h-3.5 w-3.5" />
                                Anexos
                              </div>
                              {data.attachments.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhum anexo</p>
                              ) : (
                                <div className="flex gap-2 flex-wrap">
                                  {imageCount > 0 && (
                                    <span className="text-xs bg-info/10 text-info dark:bg-blue-900/40 dark:text-blue-300 px-2 py-1 rounded-full">
                                      🖼 {imageCount} foto{imageCount > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {videoCount > 0 && (
                                    <span className="text-xs bg-primary/10 text-primary dark:bg-purple-900/40 dark:text-purple-300 px-2 py-1 rounded-full">
                                      🎬 {videoCount} vídeo{videoCount > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {audioCount > 0 && (
                                    <span className="text-xs bg-warning/10 text-warning dark:bg-orange-900/40 dark:text-orange-300 px-2 py-1 rounded-full">
                                      🎵 {audioCount} áudio{audioCount > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => navigate(`/admin/vistoria/${inspection.id}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Ver vistoria completa
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {inspections.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">Nenhuma vistoria encontrada</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {searchTerm ? "Tente ajustar sua pesquisa" : "As vistorias aparecerão aqui quando forem registradas"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="mt-6 pb-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (currentPage > 1) setCurrentPage(p => p - 1); }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {pageNumbers.map((page, i) =>
                      page === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={currentPage === page}
                            onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(p => p + 1); }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
