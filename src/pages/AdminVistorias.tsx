import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InspectionCalendar } from '@/components/InspectionCalendar';
import { Settings, List, Search, ArrowLeft, Building2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

interface Inspection {
  id: string;
  property_id: string;
  notes: string;
  created_at: string;
  property?: Property;
}

interface InspectionCount {
  property_id: string;
  ok_count: number;
  problem_count: number;
}

interface InspectionDate {
  date: string;
  count: number;
  hasProblems: boolean;
}

export default function AdminVistorias() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [inspectionCounts, setInspectionCounts] = useState<Map<string, InspectionCount>>(new Map());
  const [inspectionDates, setInspectionDates] = useState<InspectionDate[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile]);

  useEffect(() => {
    let filtered = properties;
    
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter((property) =>
        property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        property.address?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredProperties(filtered);
  }, [searchTerm, properties]);

  const fetchData = async () => {
    try {
      // Fetch properties
      const { data: propsData, error: propsError } = await supabase
        .from('properties')
        .select('id, name, address, cover_photo_url')
        .order('name');

      if (propsError) throw propsError;
      setProperties(propsData || []);
      setFilteredProperties(propsData || []);

      // Fetch all inspections for counts and calendar
      const { data: inspections, error: inspError } = await supabase
        .from('cleaning_inspections')
        .select('id, property_id, notes, created_at')
        .order('created_at', { ascending: false });

      if (inspError) throw inspError;

      // Store all inspections with property reference
      const propsMap = new Map((propsData || []).map(p => [p.id, p]));
      const inspectionsWithProperty = (inspections || []).map(insp => ({
        ...insp,
        property: propsMap.get(insp.property_id)
      }));
      setAllInspections(inspectionsWithProperty);

      // Calculate counts per property
      const counts = new Map<string, InspectionCount>();
      const dateAggregates = new Map<string, { count: number; hasProblems: boolean }>();

      inspections?.forEach(insp => {
        // Property counts
        const existing = counts.get(insp.property_id) || { property_id: insp.property_id, ok_count: 0, problem_count: 0 };
        if (insp.notes === 'OK') {
          existing.ok_count++;
        } else if (insp.notes === 'NÃO') {
          existing.problem_count++;
        }
        counts.set(insp.property_id, existing);

        // Date aggregates for calendar
        const dateKey = format(new Date(insp.created_at), 'yyyy-MM-dd');
        const dateExisting = dateAggregates.get(dateKey) || { count: 0, hasProblems: false };
        dateExisting.count++;
        if (insp.notes === 'NÃO') {
          dateExisting.hasProblems = true;
        }
        dateAggregates.set(dateKey, dateExisting);
      });

      setInspectionCounts(counts);
      
      const datesArray: InspectionDate[] = [];
      dateAggregates.forEach((value, key) => {
        datesArray.push({ date: key, ...value });
      });
      setInspectionDates(datesArray);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(prev => prev && isSameDay(prev, date) ? undefined : date);
  };

  // Get inspections for selected date
  const selectedDateInspections = useMemo(() => {
    if (!selectedDate) return [];
    return allInspections.filter(insp => 
      isSameDay(new Date(insp.created_at), selectedDate)
    );
  }, [allInspections, selectedDate]);

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/painel')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Vistorias de Faxina</h1>
              <p className="text-sm text-muted-foreground">
                {properties.length} imóveis cadastrados
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/vistorias/todas')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              Ver Todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/vistorias/configuracoes')}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Config
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Properties Grid */}
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Pesquisar imóvel por nome ou endereço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {filteredProperties.length === 0 ? (
              <Card className="p-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum imóvel encontrado com esse termo.' : 'Nenhum imóvel cadastrado.'}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProperties.map((property) => {
                  const counts = inspectionCounts.get(property.id);
                  return (
                    <Card
                      key={property.id}
                      className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] overflow-hidden group"
                      onClick={() => navigate(`/admin/vistorias/imovel/${property.id}`)}
                    >
                      <div className="aspect-video bg-muted overflow-hidden relative">
                        {property.cover_photo_url ? (
                          <img
                            src={property.cover_photo_url}
                            alt={property.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        
                        {/* Status badges overlay */}
                        {counts && (counts.ok_count > 0 || counts.problem_count > 0) && (
                          <div className="absolute bottom-2 right-2 flex gap-1">
                            {counts.ok_count > 0 && (
                              <Badge variant="secondary" className="bg-green-500/90 text-white text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {counts.ok_count}
                              </Badge>
                            )}
                            {counts.problem_count > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {counts.problem_count}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm line-clamp-1">{property.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                          {property.address || 'Sem endereço'}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Calendar Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start space-y-4">
            <InspectionCalendar
              inspectionDates={inspectionDates}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
            />

            {/* Selected Date Inspections List */}
            {selectedDate && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3">
                  Vistorias de {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </h3>
                {selectedDateInspections.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma vistoria neste dia
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {selectedDateInspections.map((insp) => (
                      <div
                        key={insp.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/vistorias/${insp.id}`)}
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                          {insp.property?.cover_photo_url ? (
                            <img
                              src={insp.property.cover_photo_url}
                              alt={insp.property.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {insp.property?.name || 'Imóvel não encontrado'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(insp.created_at), 'HH:mm')}
                          </div>
                        </div>
                        <Badge 
                          variant={insp.notes === 'OK' ? 'secondary' : 'destructive'}
                          className={insp.notes === 'OK' ? 'bg-green-500/20 text-green-700' : ''}
                        >
                          {insp.notes === 'OK' ? 'OK' : 'Problema'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}