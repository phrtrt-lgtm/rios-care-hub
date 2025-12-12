import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wrench, GripVertical, Plus, Import, Check, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react';
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

interface InspectionWithSummary {
  id: string;
  transcript_summary: string | null;
}

interface PropertyInspectionItemsKanbanProps {
  propertyId: string;
  ownerId: string;
  inspections: InspectionWithSummary[];
  attachments?: { id: string; file_url: string; file_name?: string; file_type?: string }[];
}

const COLUMNS = [
  { key: 'pending', label: 'Pendente', color: 'bg-muted' },
  { key: 'management', label: 'Gestão', color: 'bg-blue-500/20' },
  { key: 'owner', label: 'Proprietário', color: 'bg-amber-500/20' },
  { key: 'guest', label: 'Hóspede', color: 'bg-purple-500/20' },
  { key: 'completed', label: 'Concluído', color: 'bg-green-500/20' },
] as const;

const CATEGORY_PATTERNS: { pattern: RegExp; category: string; emoji: string }[] = [
  { pattern: /PEDREIRO|ALVENARIA/i, category: 'PEDREIRO/ALVENARIA', emoji: '🧱' },
  { pattern: /VIDRACEIRO/i, category: 'VIDRACEIRO', emoji: '🔷' },
  { pattern: /HIDR[ÁA]ULICA/i, category: 'HIDRÁULICA', emoji: '💧' },
  { pattern: /EL[ÉE]TRICA/i, category: 'ELÉTRICA', emoji: '⚡' },
  { pattern: /MARCENARIA/i, category: 'MARCENARIA', emoji: '🔨' },
  { pattern: /MANUTEN[ÇC][ÃA]O\s*GERAL/i, category: 'MANUTENÇÃO GERAL', emoji: '🔧' },
  { pattern: /REFRIGERA[ÇC][ÃA]O/i, category: 'REFRIGERAÇÃO', emoji: '❄️' },
  { pattern: /LIMPEZA/i, category: 'LIMPEZA', emoji: '🧹' },
  { pattern: /ITENS|REPOSI[ÇC][ÃA]O/i, category: 'ITENS/REPOSIÇÃO', emoji: '📦' },
];

export function PropertyInspectionItemsKanban({
  propertyId,
  ownerId,
  inspections,
  attachments = [],
}: PropertyInspectionItemsKanbanProps) {
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [propertyId]);

  const fetchItems = async () => {
    try {
      // Get all inspection IDs for this property
      const inspectionIds = inspections.map(i => i.id);
      if (inspectionIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('inspection_items')
        .select('*')
        .in('inspection_id', inspectionIds)
        .order('order_index');

      if (error) throw error;
      setItems((data as InspectionItem[]) || []);
    } catch (error) {
      console.error('Error fetching inspection items:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseAISummary = (summary: string): { category: string; description: string; emoji: string }[] => {
    const lines = summary.split('\n');
    const result: { category: string; description: string; emoji: string }[] = [];
    let currentCategory = '';
    let currentEmoji = '🔧';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Check if this line is a category header (contains a category name followed by colon)
      let foundCategory = false;
      for (const { pattern, category, emoji } of CATEGORY_PATTERNS) {
        if (pattern.test(trimmed) && trimmed.includes(':')) {
          currentCategory = category;
          currentEmoji = emoji;
          foundCategory = true;
          break;
        }
      }
      
      if (foundCategory) continue;

      // Check if it's a bullet point item
      if ((trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) && currentCategory) {
        const description = trimmed.replace(/^[•\-*]\s*/, '').trim();
        if (description) {
          result.push({ category: currentCategory, description, emoji: currentEmoji });
        }
      }
    }

    return result;
  };

  const handleImportItems = async () => {
    // Collect all AI summaries from all inspections with problems
    const summaries = inspections
      .filter(i => i.transcript_summary)
      .map(i => ({ inspectionId: i.id, summary: i.transcript_summary! }));

    if (summaries.length === 0) {
      toast.error('Nenhuma análise de IA disponível para importar');
      return;
    }

    setImporting(true);
    try {
      let totalImported = 0;
      
      for (const { inspectionId, summary } of summaries) {
        const parsedItems = parseAISummary(summary);
        
        if (parsedItems.length === 0) continue;

        // Check if items already exist for this inspection
        const existingItems = items.filter(item => item.inspection_id === inspectionId);
        if (existingItems.length > 0) continue; // Skip if already imported

        // Insert all items for this inspection
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
        totalImported += parsedItems.length;
      }

      if (totalImported > 0) {
        toast.success(`${totalImported} itens importados com sucesso`);
        fetchItems();
      } else {
        toast.info('Nenhum item novo para importar');
      }
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
    for (const { pattern, emoji } of CATEGORY_PATTERNS) {
      if (pattern.test(upperCategory)) {
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

  // Check if there are any AI summaries available for import
  const hasAISummaries = inspections.some(i => i.transcript_summary);
  const pendingCount = getItemsByStatus('pending').length;
  const totalCount = items.length;

  if (loading) {
    return (
      <Card className="border-amber-500/30">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="border-amber-500/30">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Problemas do Imóvel</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {totalCount > 0 ? (
                      <>{totalCount} itens identificados • {pendingCount} pendentes</>
                    ) : hasAISummaries ? (
                      <>Importe os itens das análises de IA</>
                    ) : (
                      <>Nenhum item cadastrado</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {totalCount > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-700">
                    {pendingCount} pendentes
                  </Badge>
                )}
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {hasAISummaries && (
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
              {items.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar Kanban
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar todos os itens?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação irá excluir todos os {items.length} itens do Kanban. 
                        Você poderá reimportar os itens da análise de IA novamente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            const inspectionIds = inspections.map(i => i.id);
                            const { error } = await supabase
                              .from('inspection_items')
                              .delete()
                              .in('inspection_id', inspectionIds);
                            
                            if (error) throw error;
                            
                            setItems([]);
                            setSelectedItems(new Set());
                            toast.success('Itens excluídos com sucesso');
                          } catch (error) {
                            console.error('Error deleting items:', error);
                            toast.error('Erro ao excluir itens');
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir tudo
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {hasAISummaries ? (
                  <p>Clique em "Importar da IA" para extrair os itens das análises</p>
                ) : (
                  <p>Nenhuma análise de IA disponível nas vistorias</p>
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
        </CollapsibleContent>

        <CreateMaintenanceFromInspectionDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          inspectionId={inspections[0]?.id || ''}
          propertyId={propertyId}
          ownerId={ownerId}
          attachments={attachments}
          prefilledDescription={getSelectedItemsDescription()}
          onMaintenanceCreated={handleMaintenanceCreated}
        />
      </Card>
    </Collapsible>
  );
}
