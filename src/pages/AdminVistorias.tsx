import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

export default function AdminVistorias() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent') {
        navigate('/');
        return;
      }
      fetchProperties();
    }
  }, [authLoading, profile]);

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, address, cover_photo_url')
        .order('name');

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

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Vistorias por Imóvel</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/admin/vistorias/configuracoes')}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Configurações
        </Button>
      </div>

      {properties.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum imóvel cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {properties.map((property) => (
            <Card
              key={property.id}
              className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
              onClick={() => navigate(`/admin/vistorias/imovel/${property.id}`)}
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
