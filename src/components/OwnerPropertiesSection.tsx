import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Building2, ClipboardCheck, Plus, MapPin, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Property {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
  owner_portal_enabled: boolean;
}

export const OwnerPropertiesSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProperties = async () => {
      if (!user) return;

      try {
        // Buscar propriedades do usuário
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

        // Buscar configurações de acesso ao portal
        const { data: settings, error: settingsError } = await supabase
          .from('inspection_settings')
          .select('property_id, owner_portal_enabled')
          .in('property_id', propertiesData.map(p => p.id));

        if (settingsError) throw settingsError;

        // Mapear propriedades com configurações
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
    <div className="mb-6">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {properties.map((property) => (
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
