import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Headphones, Paperclip } from 'lucide-react';

interface Property {
  id: string;
  name: string;
  address: string;
  cover_photo_url?: string;
}

interface Inspection {
  id: string;
  created_at: string;
  cleaner_name?: string;
  cleaner_phone?: string;
  audio_url?: string;
  notes?: string;
  transcript?: string;
}

export default function AdminVistoriasImovel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<Inspection[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | "ok" | "nao">("todos");

  useEffect(() => {
    if (!authLoading) {
      if (profile?.role !== 'admin' && profile?.role !== 'agent') {
        navigate('/');
        return;
      }
      fetchData();
    }
  }, [authLoading, profile, id]);

  useEffect(() => {
    let filtered = inspections;
    
    if (statusFilter === "ok") {
      filtered = filtered.filter((insp) => insp.notes === "OK");
    } else if (statusFilter === "nao") {
      filtered = filtered.filter((insp) => insp.notes === "NÃO");
    }
    
    setFilteredInspections(filtered);
  }, [statusFilter, inspections]);

  const fetchData = async () => {
    try {
      // Fetch property
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, name, address, cover_photo_url')
        .eq('id', id)
        .single();

      if (propError) throw propError;
      setProperty(propData);

      // Fetch inspections
      const { data: inspData, error: inspError } = await supabase
        .from('cleaning_inspections')
        .select('*')
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      if (inspError) throw inspError;
      setInspections(inspData || []);

      // Fetch attachment counts
      if (inspData && inspData.length > 0) {
        const { data: attachData, error: attachError } = await supabase
          .from('cleaning_inspection_attachments')
          .select('inspection_id')
          .in('inspection_id', inspData.map(i => i.id));

        if (!attachError && attachData) {
          const counts: Record<string, number> = {};
          attachData.forEach(att => {
            counts[att.inspection_id] = (counts[att.inspection_id] || 0) + 1;
          });
          setAttachmentCounts(counts);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  if (!property) {
    return (
      <div className="container mx-auto p-4">
        <p>Imóvel não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/admin/vistorias')}>← Voltar</Button>
        <h1 className="text-2xl font-bold">Vistorias – {property.name}</h1>
      </div>

      <Card className="p-4 flex items-center gap-4">
        <div className="w-24 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
          {property.cover_photo_url ? (
            <img src={property.cover_photo_url} alt={property.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
              Sem foto
            </div>
          )}
        </div>
        <div>
          <h3 className="font-medium">{property.name}</h3>
          <p className="text-sm text-muted-foreground">{property.address}</p>
        </div>
      </Card>

      {/* Filtros de status */}
      <div className="flex gap-2">
        <Button
          variant={statusFilter === "todos" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("todos")}
        >
          Todos
        </Button>
        <Button
          variant={statusFilter === "ok" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("ok")}
          className={statusFilter === "ok" ? "bg-green-600 hover:bg-green-700" : ""}
        >
          OK
        </Button>
        <Button
          variant={statusFilter === "nao" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("nao")}
          className={statusFilter === "nao" ? "bg-red-600 hover:bg-red-700" : ""}
        >
          NÃO
        </Button>
      </div>

      {filteredInspections.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {statusFilter !== "todos" 
              ? `Nenhuma vistoria com status "${statusFilter === "ok" ? "OK" : "NÃO"}" encontrada.`
              : "Nenhuma vistoria registrada para este imóvel."}
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data da vistoria</TableHead>
                <TableHead>Faxineira</TableHead>
                <TableHead>OK OU NÃO</TableHead>
                <TableHead className="text-center">Áudio</TableHead>
                <TableHead className="text-center">Anexos</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInspections.map((inspection) => (
                <TableRow key={inspection.id}>
                  <TableCell>{formatDateTime(inspection.created_at)}</TableCell>
                  <TableCell className="text-sm">
                    {inspection.cleaner_name || '-'}
                    {inspection.cleaner_phone && <span className="text-muted-foreground"> ({inspection.cleaner_phone})</span>}
                  </TableCell>
                  <TableCell>
                    {inspection.notes ? (
                      <span className={`text-sm font-bold px-2 py-1 rounded ${
                        inspection.notes === "OK" 
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" 
                          : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                      }`}>
                        {inspection.notes}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inspection.audio_url ? <Headphones className="h-4 w-4 inline" /> : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm flex items-center justify-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {attachmentCounts[inspection.id] || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/vistorias/${inspection.id}`)}
                    >
                      Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
