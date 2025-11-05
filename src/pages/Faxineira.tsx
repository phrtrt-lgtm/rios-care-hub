import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import CleanerInspectionForm from '@/components/CleanerInspectionForm';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LogOut } from 'lucide-react';
import { AvatarUpload } from '@/components/AvatarUpload';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

export default function Faxineira() {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);

  useEffect(() => {
    if (!authLoading && profile) {
      fetchProperties();
    }
  }, [authLoading, profile]);

  const fetchProperties = async () => {
    try {
      console.log('Faxineira - User ID:', user?.id);
      console.log('Faxineira - Profile role:', profile?.role);
      
      // For cleaner role, filter by assigned_cleaner_id
      // For team members (admin/agent), show all properties
      let query = supabase
        .from('properties')
        .select('id, name, address, cover_photo_url, assigned_cleaner_id')
        .order('name');

      if (profile?.role === 'cleaner') {
        // Filter by cleaner ID - only show properties assigned to this cleaner
        if (user?.id) {
          console.log('Filtrando por assigned_cleaner_id:', user.id);
          query = query.eq('assigned_cleaner_id', user.id);
        }
      }
      // Admin and agents can see all properties

      const { data, error } = await query;

      console.log('Resultado da query:', data);
      console.log('Erro da query:', error);

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
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4">
            <div className="flex h-16 items-center justify-between gap-3">
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                <img src="/logo.png" alt="RIOS" className="h-6 md:h-8 flex-shrink-0" />
                <h1 className="text-base md:text-xl font-semibold truncate">
                  Vistoria de Faxina
                </h1>
              </div>
              
              <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex items-center gap-2 max-w-[140px] md:max-w-none"
                    >
                      <Badge variant="secondary" className="text-xs hidden sm:flex">
                        Faxineira
                      </Badge>
                      <span className="truncate text-xs md:text-sm">
                        {profile?.name && profile.name.length > 12 
                          ? `${profile.name.substring(0, 12)}...` 
                          : profile?.name
                        }
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Meu Perfil</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      {user && profile && (
                        <AvatarUpload
                          userId={user.id}
                          currentPhotoUrl={photoUrl}
                          userName={profile.name}
                          onUploadComplete={(url) => setPhotoUrl(url)}
                        />
                      )}
                      <div className="mt-6 space-y-4">
                        <div>
                          <span className="text-sm font-medium">Nome:</span>
                          <p className="text-muted-foreground">{profile?.name}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Email:</span>
                          <p className="text-muted-foreground">{profile?.email}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Telefone:</span>
                          <p className="text-muted-foreground">{profile?.phone || 'Não informado'}</p>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Button variant="outline" size="sm" onClick={signOut}>
                  <LogOut className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Sair</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="container max-w-2xl mx-auto p-4">
          <CleanerInspectionForm
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            onBack={() => setSelectedProperty(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <img src="/logo.png" alt="RIOS" className="h-6 md:h-8 flex-shrink-0" />
              <h1 className="text-base md:text-xl font-semibold truncate">
                Minhas Unidades
              </h1>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex items-center gap-2 max-w-[140px] md:max-w-none"
                  >
                    <Badge variant="secondary" className="text-xs hidden sm:flex">
                      Faxineira
                    </Badge>
                    <span className="truncate text-xs md:text-sm">
                      {profile?.name && profile.name.length > 12 
                        ? `${profile.name.substring(0, 12)}...` 
                        : profile?.name
                      }
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Meu Perfil</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    {user && profile && (
                      <AvatarUpload
                        userId={user.id}
                        currentPhotoUrl={photoUrl}
                        userName={profile.name}
                        onUploadComplete={(url) => setPhotoUrl(url)}
                      />
                    )}
                    <div className="mt-6 space-y-4">
                      <div>
                        <span className="text-sm font-medium">Nome:</span>
                        <p className="text-muted-foreground">{profile?.name}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Email:</span>
                        <p className="text-muted-foreground">{profile?.email}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Telefone:</span>
                        <p className="text-muted-foreground">{profile?.phone || 'Não informado'}</p>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold">Escolha o imóvel</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Selecione uma unidade para realizar a vistoria
          </p>
        </div>
        
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
      </main>
    </div>
  );
}
