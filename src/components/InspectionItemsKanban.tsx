import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wrench, GripVertical, Plus, Import, Check } from 'lucide-react';
import { CreateMaintenanceFromInspectionDialog } from './CreateMaintenanceFromInspectionDialog';

interface InspectionItem {
  id: string;
  inspection_id: string;
  category: string;
  description: string;
  status: 'pending' | 'management' | 'owner' | 'guest' | 'completed';
  order_index: number;
  completed_at: string | null;
  maintenance_ticket_id: string | null;
}

interface InspectionItemsKanbanProps {
  inspectionId: string;
  aiSummary: string | null;
  propertyId: string;
  ownerId: string;
  attachments?: { id: string; file_url: string; file_name?: string; file_type?: string }[];
}

const COLUMNS = [
  { key: 'pending', label: 'Pendente', color: 'bg-muted' },
  { key: 'management', label: 'Gestão', color: 'bg-blue-500/20' },
  { key: 'owner', label: 'Proprietário', color: 'bg-amber-500/20' },
  { key: 'guest', label: 'Hóspede', color: 'bg-purple-500/20' },
  { key: 'completed', label: 'Concluído', color: 'bg-green-500/20' },
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  'PEDREIRO': '🧱',
  'ALVENARIA': '🧱',
  'VIDRACEIRO': '🔷',
  'HIDRÁULICA': '💧',
  'ELÉTRICA': '⚡',
  'MARCENARIA': '🔨',
  'MANUTENÇÃO GERAL': '🔧',
  'REFRIGERAÇÃO': '❄️',
  'LIMPEZA': '🧹',
  'ITENS/REPOSIÇÃO': '📦',
};

export function InspectionItemsKanban({
  inspectionId,
  aiSummary,
  propertyId,
  ownerId,
  attachments = [],
}: InspectionItemsKanbanProps) {
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [inspectionId]);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('inspection_items')
        .select('*')
        .eq('inspection_id', inspectionId)
        .order('order_index');

      if (error) throw error;
      setItems((data as InspectionItem[]) || []);
    } catch (error) {
      console.error('Error fetching inspection items:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseAISummary = (summary: string): { category: string; description: string }[] => {
    const lines = summary.split('\n');
    const result: { category: string; description: string }[] = [];
    let currentCategory = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if it's a category header (starts with emoji and contains category name)
      const categoryMatch = trimmed.match(/^[🧱🔷💧⚡🔨🔧❄️🧹📦]\s*([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ/\s]+):/i);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim().toUpperCase();
        continue;
      }

      // Check if it's a bullet point item
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const description = trimmed.replace(/^[•\-*]\s*/, '').trim();
        if (description && currentCategory) {
          result.push({ category: currentCategory, description });
        }
      }
    }

    return result;
  };

  const handleImportItems = async () => {
    if (!aiSummary) {
      toast.error('Nenhuma análise de IA disponível para importar');
      return;
    }

    setImporting(true);
    try {
      const parsedItems = parseAISummary(aiSummary);
      
      if (parsedItems.length === 0) {
        toast.error('Nenhum item encontrado na análise');
        return;
      }

      // Insert all items
      const itemsToInsert = parsedItems.map((item, index) => ({
        inspection_id: inspectionId,
        category: item.category,
        description: item.description,
        status: 'pending',
        order_index: index,
      }));

      const { error } = await supabase
        .from('inspection_items')
        .insert(itemsToInsert);

      if (error) throw error;

      toast.success(`${parsedItems.length} itens importados com sucesso`);
      fetchItems();
    } catch (error) {
      console.error('Error importing items:', error);
      toast.error('Erro ao importar itens');
    } finally {
      setImporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    const item = items.find(i => i.id === draggedItem);
    if (!item || item.status === targetStatus) {
      setDraggedItem(null);
      return;
    }

    try {
      const updateData: Record<string, unknown> = {
        status: targetStatus,
      };

      if (targetStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from('inspection_items')
        .update(updateData)
        .eq('id', draggedItem);

      if (error) throw error;

      const newCompletedAt = targetStatus === 'completed' ? new Date().toISOString() : null;

      setItems(prev => prev.map(i => 
        i.id === draggedItem 
          ? { ...i, status: targetStatus as InspectionItem['status'], completed_at: newCompletedAt }
          : i
      ));

      toast.success(`Item movido para ${COLUMNS.find(c => c.key === targetStatus)?.label}`);
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Erro ao mover item');
    } finally {
      setDraggedItem(null);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const getItemsByStatus = (status: string) => {
    return items.filter(item => item.status === status);
  };

  const getCategoryEmoji = (category: string) => {
    const upperCategory = category.toUpperCase();
    for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
      if (upperCategory.includes(key)) {
        return emoji;
      }
    }
    return '🔧';
  };

  const getSelectedItemsDescription = () => {
    return items
      .filter(item => selectedItems.has(item.id))
      .map(item => `${getCategoryEmoji(item.category)} ${item.category}: ${item.description}`)
      .join('\n');
  };

  const handleCreateMaintenance = () => {
    if (selectedItems.size === 0) {
      toast.error('Selecione ao menos um item');
      return;
    }
    setMaintenanceDialogOpen(true);
  };

  const handleMaintenanceCreated = async (ticketId: string) => {
    // Update selected items to link them to the maintenance ticket
    try {
      const { error } = await supabase
        .from('inspection_items')
        .update({ maintenance_ticket_id: ticketId })
        .in('id', Array.from(selectedItems));

      if (error) throw error;
      
      setSelectedItems(new Set());
      fetchItems();
    } catch (error) {
      console.error('Error linking items to maintenance:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Triagem de Problemas
          </CardTitle>
          <div className="flex gap-2">
            {items.length === 0 && aiSummary && (
              <Button
                onClick={handleImportItems}
                disabled={importing}
                size="sm"
                variant="outline"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Import className="h-4 w-4 mr-2" />
                )}
                Importar da IA
              </Button>
            )}
            {selectedItems.size > 0 && (
              <Button
                onClick={handleCreateMaintenance}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Manutenção ({selectedItems.size})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {aiSummary ? (
              <p>Clique em "Importar da IA" para extrair os itens da análise</p>
            ) : (
              <p>Nenhuma análise de IA disponível</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {COLUMNS.map(column => (
              <div
                key={column.key}
                className={`rounded-lg p-2 min-h-[200px] ${column.color}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.key)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{column.label}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {getItemsByStatus(column.key).length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {getItemsByStatus(column.key).map(item => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      className={`bg-background rounded-md p-2 shadow-sm cursor-grab active:cursor-grabbing border ${
                        draggedItem === item.id ? 'opacity-50' : ''
                      } ${selectedItems.has(item.id) ? 'ring-2 ring-primary' : ''} ${
                        item.maintenance_ticket_id ? 'border-green-500/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex items-center gap-1 pt-0.5">
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                          {column.key !== 'completed' && !item.maintenance_ticket_id && (
                            <Checkbox
                              checked={selectedItems.has(item.id)}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs">{getCategoryEmoji(item.category)}</span>
                            <span className="text-xs font-medium truncate">{item.category}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {item.description}
                          </p>
                          {item.maintenance_ticket_id && (
                            <div className="flex items-center gap-1 mt-1 text-green-600">
                              <Check className="h-3 w-3" />
                              <span className="text-xs">Manutenção criada</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateMaintenanceFromInspectionDialog
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        inspectionId={inspectionId}
        propertyId={propertyId}
        ownerId={ownerId}
        attachments={attachments}
        prefilledDescription={getSelectedItemsDescription()}
        onMaintenanceCreated={handleMaintenanceCreated}
      />
    </Card>
  );
}
