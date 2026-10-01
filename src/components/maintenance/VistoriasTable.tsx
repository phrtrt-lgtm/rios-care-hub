import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FileAudio,
  Loader2,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getRowHandlers } from "@/lib/row-interaction";
import type { InspectionItem, SortDirection } from "./listaTipos";

// ===== AUDIO PLAYER MINI COMPONENT =====
function AudioPlayerMini({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
        title={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
        className="p-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 text-primary" />
        ) : (
          <Play className="h-3 w-3 text-primary" />
        )}
      </button>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  );
}

// ===== VISTORIAS SORT =====
type InspectionSortField = "property" | "created_at" | "cleaner_name" | "status";

// ===== VISTORIAS TABLE COMPONENT =====
interface VistoriasTableProps {
  cleanerInspections: InspectionItem[];
  teamInspections: InspectionItem[];
  cleanerExpanded: boolean;
  teamExpanded: boolean;
  onToggleCleaner: () => void;
  onToggleTeam: () => void;
  onOpenAttachments: (inspection: InspectionItem) => void;
  onGenerateSummary: (inspection: InspectionItem) => void;
  onCreateMaintenance: (inspection: InspectionItem) => void;
  onEditInspection: (inspection: InspectionItem) => void;
  generatingIds: Set<string>;
  selectedInspectionIds: Set<string>;
  onToggleInspectionSelection: (id: string, shiftKey: boolean) => void;
  onArchiveInspections: () => void;
  archivingInspections: boolean;
  onOpenSheet: (id: string) => void;
}

export function VistoriasTable({
  cleanerInspections,
  teamInspections,
  cleanerExpanded,
  teamExpanded,
  onToggleCleaner,
  onToggleTeam,
  onOpenAttachments,
  onGenerateSummary,
  onCreateMaintenance,
  onEditInspection,
  generatingIds,
  selectedInspectionIds,
  onToggleInspectionSelection,
  onArchiveInspections,
  archivingInspections,
  onOpenSheet,
}: VistoriasTableProps) {
  const [sortField, setSortField] = useState<InspectionSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = useCallback((field: InspectionSortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  const sortInspections = useCallback((items: InspectionItem[]) => {
    if (!sortField || !sortDirection) return items;
    
    return [...items].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortField) {
        case "property":
          aValue = (a.property?.name || "").toLowerCase();
          bValue = (b.property?.name || "").toLowerCase();
          break;
        case "created_at":
          aValue = a.created_at;
          bValue = b.created_at;
          break;
        case "cleaner_name":
          aValue = (a.cleaner_name || "").toLowerCase();
          bValue = (b.cleaner_name || "").toLowerCase();
          break;
        case "status": {
          const aHasProblems = a.notes?.toLowerCase().includes('não') ||
                               a.transcript_summary?.toLowerCase().includes('problema');
          const bHasProblems = b.notes?.toLowerCase().includes('não') ||
                               b.transcript_summary?.toLowerCase().includes('problema');
          aValue = aHasProblems ? "nao" : "ok";
          bValue = bHasProblems ? "nao" : "ok";
          break;
        }
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [sortField, sortDirection]);

  const sortedCleanerInspections = useMemo(() => sortInspections(cleanerInspections), [cleanerInspections, sortInspections]);
  const sortedTeamInspections = useMemo(() => sortInspections(teamInspections), [teamInspections, sortInspections]);

  const renderSortableHeader = (label: string, field: InspectionSortField, className?: string) => {
    const isActive = sortField === field;
    return (
      <th 
        className={cn("px-2 py-2 font-medium cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          {isActive ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-primary" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
          )}
        </div>
      </th>
    );
  };

  const renderInspectionRow = (inspection: InspectionItem, showCleanerColumn: boolean) => {
    const hasProblems = inspection.notes?.toLowerCase().includes('não') ||
                        inspection.transcript_summary?.toLowerCase().includes('problema') ||
                        (inspection.transcript && inspection.transcript.length > 0 && !inspection.transcript_summary?.toLowerCase().includes('sem problema'));
    const isSelected = selectedInspectionIds.has(inspection.id);
    
    return (
      <tr 
        key={inspection.id}
        className={cn(
          "border-b hover:bg-muted/30 transition-colors h-12 cursor-pointer",
          isSelected && "bg-primary/5"
        )}
        {...getRowHandlers(`/admin/vistoria/${inspection.id}`, () => onOpenSheet(inspection.id))}
      >
        {/* Checkbox */}
        <td 
          className="p-0 w-[40px] cursor-pointer" 
          onClick={(e) => {
            e.stopPropagation();
            onToggleInspectionSelection(inspection.id, e.shiftKey);
          }}
        >
          <div className="flex items-center justify-center px-2 py-2">
            <Checkbox
              checked={isSelected}
              className="pointer-events-none"
            />
          </div>
        </td>

        {/* Imóvel */}
        <td className="p-0 max-w-[150px]">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-2 py-2 text-sm font-medium truncate">
                  {inspection.property?.name || "—"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{inspection.property?.name || "—"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>

        {/* Data */}
        <td className="p-0 w-[100px]">
          <div className="px-2 py-2 text-sm text-center text-muted-foreground">
            {format(new Date(inspection.created_at), "dd MMM", { locale: ptBR })}
          </div>
        </td>

        {/* Faxineira/Equipe */}
        <td className="p-0 max-w-[120px]">
          <div className="px-2 py-2 text-sm truncate">
            {showCleanerColumn ? (inspection.cleaner_name || "—") : (inspection.cleaner_name || inspection.owner_name || "Equipe")}
          </div>
        </td>

        {/* OK ou NÃO */}
        <td className="p-0 w-[80px]">
          <div className="flex justify-center px-2 py-2">
            <Badge 
              variant={hasProblems ? "destructive" : "secondary"}
              className={hasProblems ? "" : "bg-success/10 text-success"}
            >
              {hasProblems ? "NÃO" : "OK"}
            </Badge>
          </div>
        </td>

        {/* Audio (transcript) */}
        <td className="p-0 w-[250px]">
          <div className="px-2 py-2 flex items-center gap-2">
            {inspection.audio_url && (
              <AudioPlayerMini url={inspection.audio_url} />
            )}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs text-muted-foreground truncate max-w-[200px] cursor-default">
                    {inspection.transcript 
                      ? `${inspection.transcript.substring(0, 60)}...` 
                      : inspection.notes || "—"}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-sm whitespace-pre-wrap">
                    {inspection.transcript || inspection.notes || "—"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </td>

        {/* Arquivos */}
        <td className="p-0 w-[80px]">
          <div className="flex items-center justify-center gap-1 px-1 py-2">
            <button
              type="button"
              aria-label="Ver arquivos da vistoria"
              title="Ver arquivos da vistoria"
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors",
                inspection.attachments.length > 0
                  ? "hover:bg-primary/10 cursor-pointer text-primary"
                  : "text-muted-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (inspection.attachments.length > 0) {
                  onOpenAttachments(inspection);
                }
              }}
              disabled={inspection.attachments.length === 0}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span>{inspection.attachments.length}</span>
            </button>
            {inspection.audio_url && (
              <FileAudio className="h-3.5 w-3.5 text-info" />
            )}
          </div>
        </td>

        {/* Summarize */}
        <td className="p-0 w-[300px]">
          <div className="px-2 py-2 flex items-center gap-2">
            {inspection.transcript_summary ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-xs truncate max-w-[220px] cursor-default flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        Resumo
                      </Badge>
                      <span>{inspection.transcript_summary.substring(0, 50)}...</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-md">
                    <p className="text-sm whitespace-pre-wrap">
                      {inspection.transcript_summary}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : inspection.transcript ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateSummary(inspection);
                }}
                disabled={generatingIds.has(inspection.id)}
              >
                {generatingIds.has(inspection.id) ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Gerar resumo
                  </>
                )}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </td>

        {/* Ações */}
        <td className="p-0 w-[80px]">
          <div className="flex justify-center gap-1 px-1 py-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditInspection(inspection);
                    }}
                    aria-label="Editar vistoria"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar vistoria</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateMaintenance(inspection);
                    }}
                    aria-label="Nova manutenção a partir da vistoria"
                  >
                    <Wrench className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Nova manutenção</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Card className="overflow-hidden mb-4">
      {/* Archive button when items selected */}
      {selectedInspectionIds.size > 0 && (
        <div className="bg-muted/50 p-2 flex items-center justify-between border-b">
          <span className="text-sm text-muted-foreground">
            {selectedInspectionIds.size} vistoria(s) selecionada(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onArchiveInspections}
            disabled={archivingInspections}
          >
            {archivingInspections ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            Arquivar
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-muted text-muted-foreground">
            <tr className="h-10">
              <th className="w-[40px] px-2 py-2"></th>
              {renderSortableHeader("Imóvel", "property", "text-left w-[150px]")}
              {renderSortableHeader("Data", "created_at", "text-center w-[100px]")}
              {renderSortableHeader("Responsável", "cleaner_name", "text-left w-[120px]")}
              {renderSortableHeader("Status", "status", "text-center w-[80px]")}
              <th className="text-left px-2 py-2 font-medium w-[250px]">Áudio</th>
              <th className="text-center px-2 py-2 font-medium w-[80px]">Arquivos</th>
              <th className="text-left px-2 py-2 font-medium w-[300px]">Resumo</th>
              <th className="text-center px-2 py-2 font-medium w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {/* Vistorias Faxineiras Group Header */}
            <tr 
              className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4 border-l-warning"
              onClick={onToggleCleaner}
            >
              <td colSpan={9} className="p-2">
                <div className="flex items-center gap-2 font-medium">
                  {cleanerExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span>Vistorias de Faxineiras</span>
                  <Badge variant="secondary" className="ml-2">
                    {cleanerInspections.length}
                  </Badge>
                </div>
              </td>
            </tr>

            {/* Cleaner Inspection Rows */}
            {cleanerExpanded && sortedCleanerInspections.map((inspection) => renderInspectionRow(inspection, true))}

            {/* Vistorias Equipe Group Header */}
            <tr 
              className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-l-4 border-l-success"
              onClick={onToggleTeam}
            >
              <td colSpan={9} className="p-2">
                <div className="flex items-center gap-2 font-medium">
                  {teamExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span>Vistorias de Equipe</span>
                  <Badge variant="secondary" className="ml-2">
                    {teamInspections.length}
                  </Badge>
                </div>
              </td>
            </tr>

            {/* Team Inspection Rows */}
            {teamExpanded && sortedTeamInspections.map((inspection) => renderInspectionRow(inspection, false))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
