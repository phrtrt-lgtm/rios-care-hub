import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ArrowLeft, Calendar, User, Building2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
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

export default function Vistorias() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/minha-caixa")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Minhas Vistorias</h1>
              <p className="text-sm text-muted-foreground">
                Acompanhe as vistorias de faxina dos seus imóveis
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {inspections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma vistoria encontrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                As vistorias dos seus imóveis aparecerão aqui quando forem registradas
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {inspections.map((inspection) => (
              <Card
                key={inspection.id}
                className="cursor-pointer transition-all hover:shadow-md"
                onClick={() => navigate(`/vistoria/${inspection.id}`)}
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
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
