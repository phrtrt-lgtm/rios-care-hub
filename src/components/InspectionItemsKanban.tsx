import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wrench, GripVertical, Plus, Import, Check, ChevronDown, ChevronUp, AlertTriangle, Trash2, Send, Sparkles, Pencil, X, CheckCircle2, DollarSign } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { CreateMaintenanceFromInspectionDialog } from './CreateMaintenanceFromInspectionDialog';
import { useNavigate } from 'react-router-dom';

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
  isOwnerView?: boolean; // If true, owner can only select items in 'owner' column and cannot drag
  isAdmin?: boolean; // If true, user can select, delete, and clear items
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
  isOwnerView = false,
  isAdmin = false,
}: PropertyInspectionItemsKanbanProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newProblemText, setNewProblemText] = useState('');
  const [addingProblem, setAddingProblem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [completingItems, setCompletingItems] = useState(false);

  const CATEGORY_OPTIONS = CATEGORY_PATTERNS.map(p => ({ value: p.category, emoji: p.emoji }));

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

  const handleStartEdit = (item: InspectionItem) => {
    setEditingItemId(item.id);
    setEditingText(item.description);
    setEditingCategory(item.category);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingText('');
    setEditingCategory('');
  };

  const handleSaveEdit = async () => {
    if (!editingItemId || !editingText.trim() || !editingCategory) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('inspection_items')
        .update({ 
          description: editingText.trim(),
          category: editingCategory
        })
        .eq('id', editingItemId);
      
      if (error) throw error;
      
      setItems(prev => prev.map(item => 
        item.id === editingItemId 
          ? { ...item, description: editingText.trim(), category: editingCategory } 
          : item
      ));
      toast.success('Item atualizado');
      setEditingItemId(null);
      setEditingText('');
      setEditingCategory('');
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Erro ao atualizar item');
    } finally {
      setSavingEdit(false);
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
      let skippedDuplicates = 0;
      
      // Normalize description for comparison (lowercase, trim, remove extra spaces)
      const normalizeDesc = (desc: string) => desc.toLowerCase().trim().replace(/\s+/g, ' ');
      
      // Get all existing descriptions to check for duplicates (across all statuses)
      const existingDescriptions = new Set(
        items.map(item => normalizeDesc(item.description))
      );
      
      for (const { inspectionId, summary } of summaries) {
        const parsedItems = parseAISummary(summary);
        
        if (parsedItems.length === 0) continue;

        // Filter out duplicates by description (regardless of status)
        const newItems = parsedItems.filter(item => {
          const normalized = normalizeDesc(item.description);
          if (existingDescriptions.has(normalized)) {
            skippedDuplicates++;
            return false;
          }
          existingDescriptions.add(normalized); // Add to set to prevent duplicates within same import
          return true;
        });

        if (newItems.length === 0) continue;

        // Insert only non-duplicate items
        const itemsToInsert = newItems.map((item, index) => ({
          inspection_id: inspectionId,
          category: item.category,
          description: item.description,
          status: 'pending',
          order_index: items.length + index,
        }));

        const { error } = await supabase
          .from('inspection_items')
          .insert(itemsToInsert);

        if (error) throw error;
        totalImported += newItems.length;
      }

      if (totalImported > 0) {
        const msg = skippedDuplicates > 0 
          ? `${totalImported} itens importados (${skippedDuplicates} duplicados ignorados)`
          : `${totalImported} itens importados com sucesso`;
        toast.success(msg);
        fetchItems();
      } else if (skippedDuplicates > 0) {
        toast.info(`Nenhum item novo (${skippedDuplicates} já existentes)`);
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

  const handleAddProblem = async () => {
    if (!newProblemText.trim()) {
      toast.error('Digite a descrição do problema');
      return;
    }

    if (inspections.length === 0) {
      toast.error('Nenhuma vistoria disponível para adicionar o problema');
      return;
    }

    setAddingProblem(true);
    try {
      // Call the AI to parse and categorize the problem(s)
      const { data, error } = await supabase.functions.invoke('parse-inspection-problem', {
        body: { problemText: newProblemText.trim() }
      });

      if (error) throw error;

      if (!data?.success || !data?.items || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error('Falha ao processar o problema');
      }

      // Normalize description for duplicate check
      const normalizeDesc = (desc: string) => desc.toLowerCase().trim().replace(/\s+/g, ' ');
      const existingDescriptions = new Set(items.map(item => normalizeDesc(item.description)));
      
      // Filter out duplicates
      const newItems = data.items.filter((item: { category: string; description: string }) => {
        const normalized = normalizeDesc(item.description);
        if (existingDescriptions.has(normalized)) {
          return false;
        }
        existingDescriptions.add(normalized);
        return true;
      });

      if (newItems.length === 0) {
        toast.error('Todos os problemas já existem no Kanban');
        return;
      }

      // Insert all new items
      const itemsToInsert = newItems.map((item: { category: string; description: string }, index: number) => ({
        inspection_id: inspections[0].id,
        category: item.category,
        description: item.description,
        status: 'pending',
        order_index: items.length + index,
      }));

      const { error: insertError } = await supabase
        .from('inspection_items')
        .insert(itemsToInsert);

      if (insertError) throw insertError;

      setNewProblemText('');
      const skipped = data.items.length - newItems.length;
      const msg = skipped > 0 
        ? `${newItems.length} problema(s) adicionado(s) (${skipped} duplicado(s) ignorado(s))`
        : `${newItems.length} problema(s) adicionado(s) ao Kanban`;
      toast.success(msg);
      fetchItems();
    } catch (error) {
      console.error('Error adding problem:', error);
      toast.error('Erro ao adicionar problema');
    } finally {
      setAddingProblem(false);
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
    const item = items.find(i => i.id === itemId);
    
    // Only admin can select items (except owners can select their own items)
    if (isOwnerView) {
      // Owner can only select items in 'owner' column
      if (item?.status !== 'owner') {
        return;
      }
    } else if (!isAdmin) {
      // Non-admin team members cannot select items
      return;
    }
    
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

  const getSelectedItemsTitle = () => {
    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    // Format: [Item 1] [Item 2] [Item 3]
    return selectedItemsList
      .map(item => {
        // Capitalize first letter and clean up the description
        const desc = item.description.trim();
        const capitalized = desc.charAt(0).toUpperCase() + desc.slice(1);
        return `[${capitalized}]`;
      })
      .join(' ');
  };

  const [filteredAttachments, setFilteredAttachments] = useState<{ id: string; file_url: string; file_name?: string; file_type?: string; inspection_id: string }[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const handleCreateMaintenance = async () => {
    if (selectedItems.size === 0) {
      toast.error('Selecione ao menos um item');
      return;
    }
    
    // Get unique inspection_ids from selected items
    const selectedItemsList = items.filter(item => selectedItems.has(item.id));
    const uniqueInspectionIds = [...new Set(selectedItemsList.map(item => item.inspection_id))];
    
    if (uniqueInspectionIds.length === 0) {
      setMaintenanceDialogOpen(true);
      return;
    }
    
    // Fetch attachments only from those inspections
    setLoadingAttachments(true);
    try {
      const { data: attachments, error } = await supabase
        .from('cleaning_inspection_attachments')
        .select('id, file_url, file_name, file_type, inspection_id')
        .in('inspection_id', uniqueInspectionIds);
      
      if (error) throw error;
      
      setFilteredAttachments(attachments || []);
    } catch (error) {
      console.error('Error fetching attachments:', error);
      setFilteredAttachments([]);
    } finally {
      setLoadingAttachments(false);
      setMaintenanceDialogOpen(true);
    }
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

  // Count items per column for display
  const managementCount = getItemsByStatus('management').length;
  const ownerCount = getItemsByStatus('owner').length;
  const guestCount = getItemsByStatus('guest').length;
  const completedCount = getItemsByStatus('completed').length;

  const getColumnSummary = () => {
    const parts: string[] = [];
    if (pendingCount > 0) parts.push(`${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`);
    if (managementCount > 0) parts.push(`${managementCount} gestão`);
    if (ownerCount > 0) parts.push(`${ownerCount} proprietário`);
    if (guestCount > 0) parts.push(`${guestCount} hóspede`);
    if (completedCount > 0) parts.push(`${completedCount} concluído${completedCount > 1 ? 's' : ''}`);
    return parts.join(' · ');
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="border-primary/30 overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer bg-secondary hover:bg-secondary/90 transition-colors text-secondary-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg text-secondary-foreground">Problemas do Imóvel</CardTitle>
                  <p className="text-sm text-secondary-foreground/70">
                    {totalCount > 0 ? (
                      getColumnSummary()
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
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {totalCount} itens
                  </Badge>
                )}
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-4">
            {/* Add problem input - only for team, not owners */}
            {!isOwnerView && (
              <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Descreva um problema para a IA categorizar e adicionar..."
                    value={newProblemText}
                    onChange={(e) => setNewProblemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !addingProblem) {
                        handleAddProblem();
                      }
                    }}
                    disabled={addingProblem}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={handleAddProblem}
                  disabled={addingProblem || !newProblemText.trim()}
                  size="sm"
                >
                  {addingProblem ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}

            {/* Action buttons - only for team, not owners */}
            <div className="flex flex-wrap gap-2 mb-4">
              {!isOwnerView && hasAISummaries && (
                <Button
                  onClick={handleImportItems}
                  disabled={importing}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                <>
                  <Button
                    onClick={handleCreateMaintenance}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Manutenção ({selectedItems.size})
                  </Button>
                  <Button
                    onClick={async () => {
                      setCompletingItems(true);
                      try {
                        const { error } = await supabase
                          .from('inspection_items')
                          .update({ status: 'completed', completed_at: new Date().toISOString() })
                          .in('id', Array.from(selectedItems));
                        if (error) throw error;
                        setItems(prev => prev.map(i => 
                          selectedItems.has(i.id) 
                            ? { ...i, status: 'completed' as const, completed_at: new Date().toISOString() } 
                            : i
                        ));
                        toast.success(`${selectedItems.size} itens concluídos`);
                        setSelectedItems(new Set());
                      } catch (error) {
                        console.error('Error completing items:', error);
                        toast.error('Erro ao concluir itens');
                      } finally {
                        setCompletingItems(false);
                      }
                    }}
                    size="sm"
                    variant="success"
                    disabled={completingItems}
                  >
                    {completingItems ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Concluir ({selectedItems.size})
                  </Button>
                  <Button
                    onClick={() => {
                      const selectedItemsList = items.filter(item => selectedItems.has(item.id));
                      const description = selectedItemsList
                        .map(item => `${getCategoryEmoji(item.category)} ${item.category}: ${item.description}`)
                        .join('\n');
                      const title = selectedItemsList
                        .map(item => {
                          const desc = item.description.trim();
                          return desc.charAt(0).toUpperCase() + desc.slice(1);
                        })
                        .join(' / ');
                      // Navigate to new charge page with prefilled data
                      navigate(`/nova-cobranca?owner_id=${ownerId}&property_id=${propertyId}&title=${encodeURIComponent(title.substring(0, 100))}&description=${encodeURIComponent(description)}`);
                    }}
                    size="sm"
                    variant="warning"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Cobrar ({selectedItems.size})
                  </Button>
                  {isAdmin && (
                    <Button
                      onClick={async () => {
                        try {
                          const { error } = await supabase
                            .from('inspection_items')
                            .delete()
                            .in('id', Array.from(selectedItems));
                          
                          if (error) throw error;
                          
                          setItems(prev => prev.filter(i => !selectedItems.has(i.id)));
                          setSelectedItems(new Set());
                          toast.success(`${selectedItems.size} itens excluídos`);
                        } catch (error) {
                          console.error('Error deleting items:', error);
                          toast.error('Erro ao excluir itens');
                        }
                      }}
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir ({selectedItems.size})
                    </Button>
                  )}
                </>
              )}
              {isAdmin && items.length > 0 && (
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
                {isOwnerView ? (
                  <p>Nenhum problema identificado nas vistorias</p>
                ) : hasAISummaries ? (
                  <p>Clique em "Importar da IA" para extrair os itens das análises</p>
                ) : (
                  <p>Nenhuma análise de IA disponível nas vistorias</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {COLUMNS.map(column => {
                  // For owners, determine if this column allows selection
                  const canOwnerSelect = column.key === 'owner';
                  
                  return (
                    <div
                      key={column.key}
                      className={`rounded-lg p-2 min-h-[200px] ${column.color}`}
                      onDragOver={isOwnerView ? undefined : handleDragOver}
                      onDrop={isOwnerView ? undefined : (e) => handleDrop(e, column.key)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-sm">{column.label}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {getItemsByStatus(column.key).length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {getItemsByStatus(column.key).map(item => {
                          // Admin can select any item, owner can only select items in 'owner' column
                          const canSelect = isAdmin || (isOwnerView && canOwnerSelect);
                          const showCheckbox = column.key !== 'completed' && !item.maintenance_ticket_id && canSelect;
                          const isEditing = editingItemId === item.id;
                          const canEdit = !isOwnerView && !item.maintenance_ticket_id;
                          
                          return (
                            <div
                              key={item.id}
                              draggable={!isOwnerView && !isEditing}
                              onDragStart={isOwnerView || isEditing ? undefined : (e) => handleDragStart(e, item.id)}
                              className={`bg-background rounded-md p-2 shadow-sm border ${
                                !isOwnerView && !isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                              } ${draggedItem === item.id ? 'opacity-50' : ''} ${
                                selectedItems.has(item.id) ? 'ring-2 ring-primary' : ''
                              } ${item.maintenance_ticket_id ? 'border-green-500/50' : ''}`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="flex flex-col items-center gap-1 pt-0.5">
                                  {!isOwnerView && !isEditing && <GripVertical className="h-3 w-3 text-muted-foreground" />}
                                  {showCheckbox && !isEditing && (
                                    <Checkbox
                                      checked={selectedItems.has(item.id)}
                                      onCheckedChange={() => toggleItemSelection(item.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                  {canEdit && !isEditing && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartEdit(item);
                                      }}
                                      className="p-0.5 rounded hover:bg-muted transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      {/* Category selector */}
                                      <select
                                        value={editingCategory}
                                        onChange={(e) => setEditingCategory(e.target.value)}
                                        className="w-full text-xs border rounded px-2 py-1 bg-background"
                                      >
                                        {CATEGORY_OPTIONS.map(cat => (
                                          <option key={cat.value} value={cat.value}>
                                            {cat.emoji} {cat.value}
                                          </option>
                                        ))}
                                      </select>
                                      <Textarea
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        className="text-xs min-h-[60px] resize-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') {
                                            handleCancelEdit();
                                          } else if (e.key === 'Enter' && e.ctrlKey) {
                                            handleSaveEdit();
                                          }
                                        }}
                                      />
                                      <div className="flex gap-1 justify-end">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs"
                                          onClick={handleCancelEdit}
                                          disabled={savingEdit}
                                        >
                                          <X className="h-3 w-3 mr-1" />
                                          Cancelar
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={handleSaveEdit}
                                          disabled={savingEdit || !editingText.trim()}
                                        >
                                          {savingEdit ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <>
                                              <Check className="h-3 w-3 mr-1" />
                                              Salvar
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1 mb-1">
                                        <span className="text-xs">{getCategoryEmoji(item.category)}</span>
                                        <span className="text-xs font-medium truncate">{item.category}</span>
                                      </div>
                                      <TooltipProvider>
                                        <Tooltip delayDuration={300}>
                                          <TooltipTrigger asChild>
                                            <p className="text-xs text-muted-foreground line-clamp-3 cursor-help">
                                              {item.description}
                                            </p>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="max-w-xs">
                                            <p className="text-sm">{item.description}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      {item.maintenance_ticket_id && (
                                        <div className="flex items-center gap-1 mt-1 text-green-600">
                                          <Check className="h-3 w-3" />
                                          <span className="text-xs">Manutenção criada</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
          attachments={filteredAttachments}
          prefilledDescription={getSelectedItemsDescription()}
          prefilledSubject={getSelectedItemsTitle()}
          onMaintenanceCreated={handleMaintenanceCreated}
        />
      </Card>
    </Collapsible>
  );
}
