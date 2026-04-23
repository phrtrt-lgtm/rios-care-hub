import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface Property {
  id: string;
  name: string;
}

interface InspectionSettings {
  id?: string;
  property_id: string;
  notify_owner: boolean;
  owner_portal_enabled: boolean;
}

export default function AdminVistoriasConfiguracoes() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [settings, setSettings] = useState<Record<string, InspectionSettings>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile]);

  const fetchData = async () => {
    try {
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, name')
        .order('name');

      if (propError) throw propError;
      setProperties(propData || []);

      const { data: settingsData, error: settingsError } = await supabase
        .from('inspection_settings')
        .select('*');

      if (settingsError) throw settingsError;

      const settingsMap: Record<string, InspectionSettings> = {};
      (propData || []).forEach(prop => {
        const existing = (settingsData || []).find(s => s.property_id === prop.id);
        settingsMap[prop.id] = existing || {
          property_id: prop.id,
          notify_owner: false,
          owner_portal_enabled: false,
        };
      });
      setSettings(settingsMap);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSetting = async (propertyId: string, field: 'notify_owner' | 'owner_portal_enabled') => {
    try {
      const current = settings[propertyId];
      const updated = {
        ...current,
        [field]: !current[field],
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('inspection_settings')
        .upsert(updated, { onConflict: 'property_id' });

      if (error) throw error;

      setSettings(prev => ({
        ...prev,
        [propertyId]: updated,
      }));

      toast.success('Configuração atualizada');
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Erro ao atualizar configuração');
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => goBack(navigate, '/admin/vistorias')}>← Voltar</Button>
        <h1 className="text-2xl font-bold">Configurações de Vistorias</h1>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-center">Notificar proprietário</TableHead>
              <TableHead className="text-center">Exibir no portal do proprietário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((property) => {
              const setting = settings[property.id];
              return (
                <TableRow key={property.id}>
                  <TableCell>{property.name}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={setting?.notify_owner || false}
                      onCheckedChange={() => toggleSetting(property.id, 'notify_owner')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={setting?.owner_portal_enabled || false}
                      onCheckedChange={() => toggleSetting(property.id, 'owner_portal_enabled')}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
