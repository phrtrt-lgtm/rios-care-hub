import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Building2, ClipboardCheck, Plus, MapPin } from "lucide-react";
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
    <div className="mb-8">
      <div className="mb-6">
        <h3 className="text-2xl md:text-3xl font-bold text-foreground">Minhas Unidades</h3>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Suas propriedades gerenciadas pela RIOS
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => (
          <Card 
            key={property.id}
            className="overflow-hidden hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20"
          >
            <CardHeader className="pb-3 space-y-3">
              {property.cover_photo_url ? (
                <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
                  <img
                    src={property.cover_photo_url}
                    alt={property.name}
                    className="w-full h-full object-cover"
                  />
                </AspectRatio>
              ) : (
                <AspectRatio ratio={16 / 9} className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg flex items-center justify-center">
                  <Building2 className="h-12 w-12 text-muted-foreground" />
                </AspectRatio>
              )}
              
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                  {property.name}
                </CardTitle>
                {property.address && (
                  <p className="text-sm text-muted-foreground mt-2 flex items-start gap-1">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{property.address}</span>
                  </p>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-2">
              <Button
                onClick={() => navigate(`/novo-ticket?property=${property.id}`)}
                className="w-full"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Chamado
              </Button>
              
              {property.owner_portal_enabled && (
                <Button
                  onClick={() => navigate(`/vistorias?property=${property.id}`)}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Ver Vistorias
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
