import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveScrollPosition } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClipboardCheck, Wrench, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { QuickInspectionAttachmentButton } from "./QuickInspectionAttachmentButton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreateMaintenanceFromInspectionDialog } from "./CreateMaintenanceFromInspectionDialog";
import {
  BotaoLinha,
  CaixaCarregando,
  CaixaOperacao,
  CaixaVazia,
  GrupoCaixa,
  LinhaCaixa,
  SeloContagem,
} from "@/components/painel/CaixaOperacao";

interface Property {
  id: string;
  name: string;
  cover_photo_url?: string;
  owner_id: string;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
}

interface Inspection {
  id: string;
  property_id: string;
  notes: string;
  created_at: string;
  transcript_summary?: string;
  property?: Property;
  attachments?: Attachment[];
}

const COLLAPSED_PROBLEM_LIMIT = 3;
const COLLAPSED_OK_LIMIT = 2;
const EXPANDED_LIMIT = 20;

export function VistoriasKanbanPreview() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetchInspections();
  }, []);

  const fetchInspections = async () => {
    try {
      const { data, error } = await supabase
        .from("cleaning_inspections")
        .select(`
          id, property_id, notes, created_at, transcript_summary,
          property:properties(id, name, cover_photo_url, owner_id)
        `)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) throw error;

      const inspectionIds = (data || []).map((i) => i.id);
      const attachmentsMap = new Map<string, Attachment[]>();

      if (inspectionIds.length > 0) {
        const { data: attachmentsData } = await supabase
          .from("cleaning_inspection_attachments")
          .select("id, file_url, file_name, file_type, inspection_id, maintenance_ticket_id")
          .in("inspection_id", inspectionIds);

        (attachmentsData || []).forEach((att) => {
          const existing = attachmentsMap.get(att.inspection_id) || [];
          existing.push({
            id: att.id,
            file_url: att.file_url,
            file_name: att.file_name || undefined,
            file_type: att.file_type || undefined,
          });
          attachmentsMap.set(att.inspection_id, existing);
        });
      }

      const inspectionsWithAttachments = (data || []).map((insp) => ({
        ...insp,
        property: insp.property as unknown as Property,
        attachments: attachmentsMap.get(insp.id) || [],
      }));

      setInspections(inspectionsWithAttachments);
    } catch (error) {
      console.error("Error fetching inspections:", error);
    } finally {
      setLoading(false);
    }
  };

  const okInspections = inspections.filter((i) => i.notes === "OK");
  const problemInspections = inspections.filter((i) => i.notes === "NÃO");

  const handleNewMaintenance = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setMaintenanceDialogOpen(true);
  };

  const renderRow = (inspection: Inspection, problema: boolean) => (
    <LinhaCaixa
      key={inspection.id}
      titulo={inspection.property?.name || "Imóvel"}
      subtitulo={format(new Date(inspection.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
      tom={problema ? "destructive" : "neutral"}
      tingida={problema}
      onClick={() =>
        (saveScrollPosition(pathname), navigate(`/admin/vistoria/${inspection.id}`, { state: { from: pathname } }))
      }
      acoes={
        <>
          <QuickInspectionAttachmentButton inspectionId={inspection.id} onSuccess={fetchInspections} />
          <BotaoLinha
            rotulo="Criar manutenção a partir da vistoria"
            texto="Manutenção"
            tom="warning"
            onClick={() => handleNewMaintenance(inspection)}
          >
            <Wrench />
          </BotaoLinha>
        </>
      }
    />
  );

  if (loading) {
    return <CaixaCarregando icone={<ClipboardCheck />} titulo="Vistorias" tom="secondary" />;
  }

  const hasMoreItems =
    problemInspections.length > COLLAPSED_PROBLEM_LIMIT || okInspections.length > COLLAPSED_OK_LIMIT;

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CaixaOperacao
          icone={<ClipboardCheck />}
          titulo="Vistorias"
          tom="secondary"
          selos={
            inspections.length > 0 && (
              <SeloContagem title="As vistorias mais recentes, não o total">{inspections.length} recentes</SeloContagem>
            )
          }
          acoes={
            <>
              {hasMoreItems && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Recolher" : "Expandir"}
                  </Button>
                </CollapsibleTrigger>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/vistorias")}
                className="h-7 gap-1 px-2 text-xs text-secondary hover:text-secondary"
              >
                <span className="hidden sm:inline">Ver todas</span>
                <span className="sm:hidden">Ver</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          }
        >
          {inspections.length === 0 ? (
            <CaixaVazia icone={<ClipboardCheck className="h-5 w-5" />} titulo="Nenhuma vistoria recente" />
          ) : (
            <div className="space-y-3">
              {/* Problemas primeiro - sempre visíveis (colapsado) */}
              {problemInspections.length > 0 && (
                <GrupoCaixa titulo="Problemas" quantidade={problemInspections.length} tom="destructive">
                  {problemInspections.slice(0, COLLAPSED_PROBLEM_LIMIT).map((i) => renderRow(i, true))}
                  <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {problemInspections.slice(COLLAPSED_PROBLEM_LIMIT, EXPANDED_LIMIT).map((i) => renderRow(i, true))}
                  </CollapsibleContent>
                </GrupoCaixa>
              )}

              {/* OK - sempre visíveis (colapsado) */}
              {okInspections.length > 0 && (
                <GrupoCaixa titulo="OK" quantidade={okInspections.length} tom="success">
                  {okInspections.slice(0, COLLAPSED_OK_LIMIT).map((i) => renderRow(i, false))}
                  <CollapsibleContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {okInspections.slice(COLLAPSED_OK_LIMIT, EXPANDED_LIMIT).map((i) => renderRow(i, false))}
                  </CollapsibleContent>
                </GrupoCaixa>
              )}
            </div>
          )}
        </CaixaOperacao>
      </Collapsible>

      {selectedInspection && selectedInspection.property && (
        <CreateMaintenanceFromInspectionDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          propertyId={selectedInspection.property.id}
          propertyName={selectedInspection.property.name}
          ownerId={selectedInspection.property.owner_id}
          inspectionId={selectedInspection.id}
          attachments={selectedInspection.attachments || []}
          transcriptSummary={selectedInspection.transcript_summary}
        />
      )}
    </>
  );
}
