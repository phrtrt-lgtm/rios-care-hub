import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Building2, ClipboardCheck, Plus, MapPin, Wrench, CalendarX, FileText, ChevronRight, Calendar, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DateBlockRequestDialog } from "@/components/DateBlockRequestDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Property {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
  owner_portal_enabled: boolean;
}

interface FinancialReport {
  id: string;
  property_name: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  report_data: any;
}

const formatPeriodLabel = (start: string | null, end: string | null): string => {
  if (!start) return "Sem período";
  try {
    const d = new Date(start + 'T00:00:00');
    return format(d, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
  } catch {
    return "Sem período";
  }
};

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export const OwnerPropertiesSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockDialogProperty, setBlockDialogProperty] = useState<Property | null>(null);
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});
  const [reportsByProperty, setReportsByProperty] = useState<Record<string, FinancialReport[]>>({});
  const [loadingReports, setLoadingReports] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchProperties = async () => {
      if (!user) return;

      try {
        const { data: propertiesData, error: propError } = await supabase
          .from('properties')
          .select('id, name, address, cover_photo_url')
          .eq('owner_id', user.id)
          .order('name');

        if (propError) throw propError;

        if (!propertiesData || propertiesData.length === 0) {
          setProperties([]);
          setLoading(false);
          return;
        }

        const { data: settings, error: settingsError } = await supabase
          .from('inspection_settings')
          .select('property_id, owner_portal_enabled')
          .in('property_id', propertiesData.map(p => p.id));

        if (settingsError) throw settingsError;

        const propertiesWithSettings = propertiesData.map(prop => ({
          ...prop,
          owner_portal_enabled: settings?.find(s => s.property_id === prop.id)?.owner_portal_enabled || false
        }));

        setProperties(propertiesWithSettings);
      } catch (error) {
        console.error('Error fetching properties:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, [user]);

  const toggleReports = async (propertyId: string) => {
    const isOpen = expandedReports[propertyId];
    
    if (isOpen) {
      setExpandedReports(prev => ({ ...prev, [propertyId]: false }));
      return;
    }

    setExpandedReports(prev => ({ ...prev, [propertyId]: true }));

    // Fetch reports if not already loaded
    if (!reportsByProperty[propertyId]) {
      setLoadingReports(prev => ({ ...prev, [propertyId]: true }));
      try {
        const { data, error } = await supabase
          .from('financial_reports')
          .select('id, property_name, report_type, period_start, period_end, created_at, report_data')
          .eq('property_id', propertyId)
          .eq('status', 'published')
          .order('period_start', { ascending: false });

        if (error) throw error;
        setReportsByProperty(prev => ({ ...prev, [propertyId]: data || [] }));
      } catch (error) {
        console.error('Error fetching reports:', error);
        setReportsByProperty(prev => ({ ...prev, [propertyId]: [] }));
      } finally {
        setLoadingReports(prev => ({ ...prev, [propertyId]: false }));
      }
    }
  };

  if (loading) {
    return (
      <div className="mb-8">
        <h3 className="text-2xl font-bold mb-4">Minhas Unidades</h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="w-full aspect-video rounded-lg" />
                <Skeleton className="h-6 w-3/4 mt-4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 overflow-hidden">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-w-0">
        {properties.map((property) => {
          const isReportsOpen = expandedReports[property.id];
          const reports = reportsByProperty[property.id] || [];
          const isLoadingReports = loadingReports[property.id];

          // Group reports by year
          const reportsByYear: Record<string, FinancialReport[]> = {};
          reports.forEach(r => {
            const year = r.period_start ? new Date(r.period_start + 'T00:00:00').getFullYear().toString() : 'Outros';
            if (!reportsByYear[year]) reportsByYear[year] = [];
            reportsByYear[year].push(r);
          });

          return (
            <Card 
              key={property.id}
              className="overflow-hidden hover:shadow-md transition-all duration-300 hover:border-primary/20"
            >
              <CardHeader className="p-2 sm:p-3 space-y-2">
                <div className="w-full mx-auto">
                  {property.cover_photo_url ? (
                    <AspectRatio ratio={16 / 9} className="bg-muted rounded-md overflow-hidden">
                      <img
                        src={property.cover_photo_url}
                        alt={property.name}
                        className="w-full h-full object-cover"
                      />
                    </AspectRatio>
                  ) : (
                    <AspectRatio ratio={16 / 9} className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-md flex items-center justify-center">
                      <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    </AspectRatio>
                  )}
                </div>
                
                <div>
                  <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
                    <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                    <span className="truncate">{property.name}</span>
                  </CardTitle>
                  {property.address && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex items-start gap-1 line-clamp-2">
                      <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{property.address}</span>
                    </p>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="p-2 sm:p-3 pt-0 space-y-1.5 sm:space-y-2">
                <Button
                  onClick={() => navigate(`/novo-ticket?property=${property.id}`)}
                  className="w-full text-xs sm:text-sm h-8 sm:h-9"
                  size="sm"
                >
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Novo Chamado
                </Button>
                
                {property.owner_portal_enabled && (
                  <Button
                    onClick={() => navigate(`/vistorias?property=${property.id}`)}
                    variant="outline"
                    className="w-full text-xs sm:text-sm h-8 sm:h-9"
                    size="sm"
                  >
                    <ClipboardCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Ver Vistorias
                  </Button>
                )}

                <Button
                  onClick={() => navigate(`/manutencoes?property=${property.id}`)}
                  variant="outline"
                  className="w-full text-xs sm:text-sm h-8 sm:h-9"
                  size="sm"
                >
                  <Wrench className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Manutenções
                </Button>

                <Button
                  onClick={() => setBlockDialogProperty(property)}
                  variant="outline"
                  className="w-full text-xs sm:text-sm h-8 sm:h-9 border-dashed"
                  size="sm"
                >
                  <CalendarX className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Solicitar Bloqueio
                </Button>

                {/* Relatórios Financeiros */}
                <Button
                  onClick={() => toggleReports(property.id)}
                  variant="outline"
                  className={`w-full text-xs sm:text-sm h-8 sm:h-9 ${isReportsOpen ? 'border-primary/40 bg-primary/5' : ''}`}
                  size="sm"
                >
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Relatórios Financeiros
                  <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${isReportsOpen ? 'rotate-180' : ''}`} />
                </Button>

                {/* Reports expanded area */}
                {isReportsOpen && (
                  <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
                    {isLoadingReports ? (
                      <div className="space-y-2 py-1">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : reports.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Nenhum relatório publicado ainda.
                      </p>
                    ) : (
                      Object.entries(reportsByYear)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .map(([year, yearReports]) => (
                          <div key={year}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                              {year}
                            </p>
                            <div className="space-y-1">
                              {yearReports.map(report => {
                                const ownerNet = report.report_data?.totals?.totalOwnerNet || 0;
                                const isAnnual = report.report_type === 'anual';
                                
                                return (
                                  <div
                                    key={report.id}
                                    onClick={() => navigate(`/relatorio-financeiro/${report.id}`)}
                                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-xs ${
                                      isAnnual 
                                        ? 'bg-primary/10 hover:bg-primary/15 border border-primary/20' 
                                        : 'bg-background hover:bg-accent/50 border'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className={`h-3.5 w-3.5 flex-shrink-0 ${isAnnual ? 'text-primary' : 'text-muted-foreground'}`} />
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">
                                          {isAnnual ? `Relatório Anual ${year}` : formatPeriodLabel(report.period_start, report.period_end)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {ownerNet > 0 && (
                                        <span className="font-semibold text-emerald-600 text-[11px]">
                                          {formatCurrency(ownerNet)}
                                        </span>
                                      )}
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {blockDialogProperty && (
        <DateBlockRequestDialog
          open={!!blockDialogProperty}
          onOpenChange={(open) => { if (!open) setBlockDialogProperty(null); }}
          propertyId={blockDialogProperty.id}
          propertyName={blockDialogProperty.name}
        />
      )}
    </div>
  );
};
