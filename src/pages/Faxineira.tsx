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
      // For cleaner role, filter by assigned_cleaner_id
      // For team members (admin/agent), show all properties
      let query = supabase
        .from('properties')
        .select('id, name, address, cover_photo_url, assigned_cleaner_id')
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
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <div className="flex items-center gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white px-3 py-2 rounded-lg cursor-pointer transition-colors">
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt={profile?.name || "User"} 
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
                        {profile?.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium hidden sm:inline">{profile?.name}</span>
                  </div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Meu Perfil</DialogTitle>
                  </DialogHeader>
                    <div className="space-y-4 py-4">
                      <AvatarUpload 
                        userId={user?.id || ''}
                        currentPhotoUrl={photoUrl}
                        userName={profile?.name || 'User'}
                        onUploadComplete={(url) => setPhotoUrl(url)}
                      />
                    
                    <div>
                      <label className="text-sm font-medium">Nome</label>
                      <p className="text-base mt-1">{profile?.name}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <p className="text-base mt-1">{profile?.email}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Telefone</label>
                      <p className="text-base mt-1">{profile?.phone || "Não informado"}</p>
                    </div>
                    
                    <Button 
                      variant="destructive"
                      onClick={signOut}
                      className="w-full"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <div className="flex items-center gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white px-3 py-2 rounded-lg cursor-pointer transition-colors">
                  {photoUrl ? (
                    <img 
                      src={photoUrl} 
                      alt={profile?.name || "User"} 
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
                      {profile?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium hidden sm:inline">{profile?.name}</span>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Meu Perfil</DialogTitle>
                </DialogHeader>
                  <div className="space-y-4 py-4">
                    <AvatarUpload 
                      userId={user?.id || ''}
                      currentPhotoUrl={photoUrl}
                      userName={profile?.name || 'User'}
                      onUploadComplete={(url) => setPhotoUrl(url)}
                    />
                  
                  <div>
                    <label className="text-sm font-medium">Nome</label>
                    <p className="text-base mt-1">{profile?.name}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <p className="text-base mt-1">{profile?.email}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Telefone</label>
                    <p className="text-base mt-1">{profile?.phone || "Não informado"}</p>
                  </div>
                  
                  <Button 
                    variant="destructive"
                    onClick={signOut}
                    className="w-full"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
