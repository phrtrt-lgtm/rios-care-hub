import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { InspectionCalendar } from "@/components/InspectionCalendar";
import { ArrowLeft, Calendar, User, Building2, CheckCircle2, AlertTriangle, Headphones, Paperclip } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingScreen } from "@/components/LoadingScreen";

interface Inspection {
  id: string;
  property_id: string;
  cleaner_name: string | null;
  cleaner_phone: string | null;
  notes: string | null;
  transcript: string | null;
  audio_url: string | null;
  created_at: string;
  property: {
    name: string;
    cover_photo_url: string | null;
  };
}

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

export default function Vistorias() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchInspections();
  }, [user, navigate, searchParams]);

  const fetchInspections = async () => {
    try {
      setLoading(true);
      
      const propertyParam = searchParams.get('property');
      
      // Buscar propriedades do usuário
      let propertiesQuery = supabase
        .from('properties')
        .select('id')
        .eq('owner_id', user!.id);
      
      // Se houver parâmetro de propriedade, filtrar apenas ela
      if (propertyParam) {
        propertiesQuery = propertiesQuery.eq('id', propertyParam);
      }
      
      const { data: properties, error: propError } = await propertiesQuery;

      if (propError) throw propError;

      if (!properties || properties.length === 0) {
        setInspections([]);
        setLoading(false);
        return;
      }

      // Verificar quais propriedades têm acesso habilitado
      const { data: settings, error: settingsError } = await supabase
        .from('inspection_settings')
        .select('property_id')
        .in('property_id', properties.map(p => p.id))
        .eq('owner_portal_enabled', true);

      if (settingsError) throw settingsError;

      if (!settings || settings.length === 0) {
        setInspections([]);
        setLoading(false);
        return;
      }

      const allowedPropertyIds = settings.map(s => s.property_id);

      // Buscar vistorias
      const { data, error } = await supabase
        .from("cleaning_inspections")
        .select(`
          *,
          property:properties!inner(name, cover_photo_url)
        `)
        .in('property_id', allowedPropertyIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setInspections(data || []);
    } catch (error) {
      console.error("Erro ao carregar vistorias:", error);
    } finally {
      setLoading(false);
    }
  };

  // Build calendar data
  const inspectionDates = useMemo(() => {
    const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();
    
    inspections.forEach(insp => {
      const dateKey = format(new Date(insp.created_at), 'yyyy-MM-dd');
      const existing = dateAggregates.get(dateKey) || { count: 0, hasProblems: false };
      existing.count++;
      if (insp.notes === 'NÃO') {
        existing.hasProblems = true;
      }
      dateAggregates.set(dateKey, existing);
    });

    const datesArray: InspectionDate[] = [];
    dateAggregates.forEach((value, key) => {
      datesArray.push({ date: key, ...value });
    });
    return datesArray;
  }, [inspections]);

  // Filter inspections by selected date
  const filteredInspections = useMemo(() => {
    if (!selectedDate) return inspections;
    return inspections.filter(insp => 
      isSameDay(new Date(insp.created_at), selectedDate)
    );
  }, [inspections, selectedDate]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(prev => prev && isSameDay(prev, date) ? undefined : date);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const okCount = inspections.filter(i => i.notes === 'OK').length;
  const problemCount = inspections.filter(i => i.notes === 'NÃO').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/minha-caixa")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Minhas Vistorias</h1>
              <p className="text-sm text-muted-foreground">
                {inspections.length} vistorias registradas
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="bg-success/20 text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {okCount}
              </Badge>
              <Badge variant="secondary" className="bg-destructive/20 text-destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {problemCount}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Inspections List */}
          <div className="space-y-4">
            {selectedDate && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>
                  Limpar filtro
                </Button>
              </div>
            )}

            {filteredInspections.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma vistoria encontrada</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedDate 
                      ? 'Nenhuma vistoria registrada neste dia'
                      : 'As vistorias dos seus imóveis aparecerão aqui quando forem registradas'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((inspection) => {
                  const isOk = inspection.notes === 'OK';
                  return (
                    <Card
                      key={inspection.id}
                      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                      onClick={() => navigate(`/vistoria/${inspection.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Property Photo */}
                          <div className="w-24 flex-shrink-0">
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

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h3 className="font-semibold line-clamp-1">{inspection.property.name}</h3>
                              <Badge 
                                variant={isOk ? "secondary" : "destructive"}
                                className={isOk ? "bg-success/20 text-success flex-shrink-0" : "flex-shrink-0"}
                              >
                                {isOk ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                {inspection.notes || '—'}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {format(new Date(inspection.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </div>
                              
                              {inspection.cleaner_name && (
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  {inspection.cleaner_name}
                                </div>
                              )}

                              {inspection.audio_url && (
                                <div className="flex items-center gap-1">
                                  <Headphones className="h-4 w-4" />
                                  Áudio
                                </div>
                              )}
                            </div>

                            {inspection.transcript && (
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {inspection.transcript}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Calendar Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <InspectionCalendar
              inspectionDates={inspectionDates}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </main>
    </div>
  );
}