import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import CleanerInspectionForm from '@/components/CleanerInspectionForm';
import { Card } from '@/components/ui/card';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

export default function Faxineira() {
  const { user, profile, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && profile) {
      fetchProperties();
    }
  }, [authLoading, profile]);

  const fetchProperties = async () => {
    try {
      // For cleaner role, filter by assigned_cleaner_id
      // For team members (admin/agent), show all properties
      let query = supabase
        .from('properties')
        .select('id, name, address, cover_photo_url')
        .order('name');

      if (profile?.role === 'cleaner') {
        // Filter by cleaner ID - only show properties assigned to this cleaner
        if (user?.id) {
          query = query.eq('assigned_cleaner_id', user.id);
        }
      }
      // Admin and agents can see all properties

      const { data, error } = await query;

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (selectedProperty) {
    return (
      <div className="container max-w-2xl mx-auto p-4">
        <CleanerInspectionForm
          propertyId={selectedProperty.id}
          propertyName={selectedProperty.name}
          onBack={() => setSelectedProperty(null)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Escolha o imóvel</h1>
      
      {properties.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum imóvel atribuído.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {properties.map((property) => (
            <Card
              key={property.id}
              className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
              onClick={() => setSelectedProperty(property)}
            >
              <div className="aspect-video bg-muted overflow-hidden">
                {property.cover_photo_url ? (
                  <img
                    src={property.cover_photo_url}
                    alt={property.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                    Sem foto
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-medium text-sm line-clamp-2">{property.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                  {property.address}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
