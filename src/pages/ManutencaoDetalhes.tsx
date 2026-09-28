import { useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMaintenance } from "@/hooks/useMaintenances";
import { useAuth } from "@/hooks/useAuth";
import { MaintenancePaymentForm } from "@/components/MaintenancePaymentForm";
import { MaintenanceUpdatesThread } from "@/components/MaintenanceUpdatesThread";
import { MaintenanceServiceLog } from "@/components/MaintenanceServiceLog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { MediaGallery } from "@/components/MediaGallery";
import { EditMaintenanceDialog } from "@/components/EditMaintenanceDialog";
import { deleteAttachmentRow, type AttachmentTable } from "@/lib/deleteAttachment";
import { preloadMediaUrls } from "@/hooks/useMediaCache";
import { formatDateTime } from "@/lib/format";
import { estaResolvida, formatarBRL, formatarData, valorDevido } from "@/lib/cobrancaMeta";
import { detectMediaKind, type MediaKind } from "@/lib/mediaType";
import { cn } from "@/lib/utils";
import { CHARGE_CATEGORIES, rotuloResponsavelCusto, rotulosServico } from "@/constants/chargeCategories";
import { CabecalhoPagina, PaginaInterna } from "@/components/painel/PaginaInterna";
import { CaixaCarregando, CaixaOperacao, CaixaVazia, SeloContagem } from "@/components/painel/CaixaOperacao";
import { Definicao, ListaDefinicoes } from "@/components/painel/Definicoes";
import { EtiquetaStatusCobranca } from "@/components/cobrancas/EtiquetaStatusCobranca";
import { EtiquetaStatusTicket } from "@/components/tickets/EtiquetasTicket";
import { ResumoValorCobranca } from "@/components/cobrancas/ResumoValorCobranca";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  FileText,
  Paperclip,
  Pencil,
  Tag,
  Trash2,
  User,
  Wrench,
} from "lucide-react";

interface ManutencaoDetalhesProps {
  /** When provided, render without page chrome (for use inside a Dialog). */
  embedded?: boolean;
  /** Optional id override (when used in a Dialog without router params). */
  idOverride?: string;
}

/**
 * O status vem da cobrança (source = "charge") ou do ticket (source =
 * "ticket"); ver useMaintenances.ts. Cada um tem o próprio vocabulário.
 */
function EtiquetaStatusManutencao({ source, status }: { source: "charge" | "ticket"; status: string }) {
  return source === "charge" ? <EtiquetaStatusCobranca status={status} /> : <EtiquetaStatusTicket status={status} />;
}

/** O nome real do arquivo nunca aparece: só o tipo. */
const ROTULO_ANEXO: Record<MediaKind, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  pdf: "PDF",
  other: "Documento",
};

const ehMidia = (a: { file_type?: string | null; file_name?: string | null; file_url?: string | null }) => {
  const kind = detectMediaKind(a.file_type, a.file_name, a.file_url);
  return kind === "image" || kind === "video";
};

const tamanhoKB = (bytes?: number | null) => (bytes ? `${(bytes / 1024).toFixed(1)} KB` : "");

export default function ManutencaoDetalhes({ embedded = false, idOverride }: ManutencaoDetalhesProps = {}) {
  const params = useParams();
  const id = idOverride ?? params.id;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: maintenance, isLoading } = useMaintenance(id);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [anexoParaExcluir, setAnexoParaExcluir] = useState<{ id: string } | null>(null);
  const [excluindoAnexo, setExcluindoAnexo] = useState(false);
  const queryClient = useQueryClient();

  const isOwner = profile?.role === "owner";
  const isTeam = profile?.role === "admin" || profile?.role === "agent" || profile?.role === "maintenance";
  const voltarPara = isOwner ? "/minha-caixa" : "/admin/manutencoes-lista";

  // Preload attachments when maintenance loads
  useEffect(() => {
    if (maintenance?.attachments && maintenance.attachments.length > 0) {
      const mediaUrls = maintenance.attachments
        .filter((a: any) => a.file_type?.startsWith("image/") || a.file_type?.startsWith("video/"))
        .map((a: any) => a.file_url)
        .filter(Boolean);
      if (mediaUrls.length > 0) {
        preloadMediaUrls(mediaUrls);
      }
    }
  }, [maintenance]);

  // Casco: página inteira, ou só o miolo quando está dentro do diálogo do proprietário.
  const cabecalho = (titulo: string, subtitulo?: string, acoes?: ReactNode) =>
    embedded ? (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
      </div>
    ) : (
      <CabecalhoPagina titulo={titulo} subtitulo={subtitulo} icone={<Wrench />} tom="primary" voltarPara={voltarPara} acoes={acoes} />
    );

  const envolver = (topo: ReactNode, conteudo: ReactNode) =>
    embedded ? (
      <div className="space-y-4">
        {topo}
        {conteudo}
      </div>
    ) : (
      <PaginaInterna largura="media" comNavInferior cabecalho={topo}>
        {conteudo}
      </PaginaInterna>
    );

  if (isLoading) {
    return envolver(
      cabecalho("Manutenção"),
      <>
        <CaixaCarregando icone={<FileText />} titulo="Dados" tom="primary" linhas={4} />
        <CaixaCarregando icone={<DollarSign />} titulo="Financeiro" tom="success" linhas={3} />
      </>,
    );
  }

  if (!maintenance) {
    return envolver(
      cabecalho("Manutenção"),
      <Card className="rounded-xl border-border/70">
        <EmptyState
          ilustracao="manutencoes"
          title="Manutenção não encontrada"
          description="Ela pode ter sido excluída ou você não tem acesso a ela."
          action={
            !embedded && (
              <Button variant="outline" onClick={() => navigate(voltarPara, { replace: true })}>
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )
          }
        />
      </Card>,
    );
  }

  const source: "charge" | "ticket" = maintenance.source === "charge" ? "charge" : "ticket";
  const payments: any[] = maintenance.payments ?? [];
  const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount_cents, 0);
  const total = maintenance.amount_cents || 0;
  const remaining = Math.max(0, valorDevido(maintenance) - totalPaid);

  const hasFinancials = total > 0 || source !== "ticket" || !!maintenance.charge_id;
  const ticketIdForUpdates: string | null = source === "ticket" ? maintenance.id : maintenance.ticket_id ?? null;
  const chargeIdForUpdates: string | null = source === "charge" ? maintenance.id : maintenance.charge_id ?? null;
  // Registrar pagamento: só a equipe, só com cobrança, e nunca numa cobrança já resolvida.
  const podeRegistrarPagamento = isTeam && !!chargeIdForUpdates && (source !== "charge" || !estaResolvida(maintenance.status));

  const tabelaAnexos: AttachmentTable = source === "charge" ? "charge_attachments" : "ticket_attachments";
  const anexos: any[] = maintenance.attachments ?? [];
  const midia = anexos.filter(ehMidia);
  const outros = anexos.filter((a) => !ehMidia(a));
  const servicos = rotulosServico(maintenance.service_type);
  const categoria = maintenance.category
    ? CHARGE_CATEGORIES[maintenance.category as keyof typeof CHARGE_CATEGORIES] || maintenance.category
    : null;
  const descricao = maintenance.description || maintenance.ticket_description;

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["maintenance", id] });

  const excluirAnexo = async () => {
    if (!anexoParaExcluir) return;
    setExcluindoAnexo(true);
    try {
      const ok = await deleteAttachmentRow(tabelaAnexos, anexoParaExcluir.id);
      if (ok) {
        setAnexoParaExcluir(null);
        recarregar();
      }
    } finally {
      setExcluindoAnexo(false);
    }
  };

  const acoesCabecalho = isTeam ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
      onClick={() => setEditOpen(true)}
      aria-label="Editar manutenção"
      title="Editar manutenção"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  ) : undefined;

  return envolver(
    cabecalho(maintenance.title || "Manutenção", maintenance.property?.name || undefined, acoesCabecalho),
    <>
      {/* Dados */}
      <CaixaOperacao icone={<FileText />} titulo="Dados" tom="primary">
        <ListaDefinicoes colunas={2}>
          <Definicao rotulo="Status" valor={<EtiquetaStatusManutencao source={source} status={maintenance.status} />} />
          <Definicao rotulo="Imóvel" icone={<Building2 />} valor={maintenance.property?.name} />
          <Definicao rotulo="Aberta em" icone={<Calendar />} valor={formatDateTime(maintenance.created_at)} />
          {categoria && <Definicao rotulo="Categoria" icone={<Tag />} valor={categoria} />}
          {servicos.length > 0 && <Definicao rotulo="Tipo de serviço" icone={<Tag />} valor={servicos.join(", ")} />}
          <Definicao
            rotulo="Responsável pelo custo"
            valor={rotuloResponsavelCusto(maintenance.cost_responsible, maintenance.split_owner_percent)}
          />
          {maintenance.service_provider?.name && (
            <Definicao rotulo="Profissional" icone={<User />} valor={maintenance.service_provider.name} />
          )}
          {maintenance.scheduled_at && (
            <Definicao rotulo="Execução" icone={<Calendar />} valor={formatarData(maintenance.scheduled_at)} />
          )}
          {maintenance.due_date && (
            <Definicao rotulo="Vencimento" icone={<Calendar />} valor={formatarData(maintenance.due_date)} destaque />
          )}
          {isTeam && (
            <Definicao
              rotulo="Proprietário"
              icone={<User />}
              valor={
                maintenance.owner?.name ? (
                  <>
                    {maintenance.owner.name}
                    {maintenance.owner.email && (
                      <span className="block text-xs text-muted-foreground">{maintenance.owner.email}</span>
                    )}
                  </>
                ) : undefined
              }
            />
          )}
        </ListaDefinicoes>
        {descricao && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Descrição do serviço</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{descricao}</p>
          </div>
        )}
      </CaixaOperacao>

      {/* Financeiro */}
      {hasFinancials && (
        <CaixaOperacao icone={<DollarSign />} titulo="Financeiro" tom="success">
          <ResumoValorCobranca cobranca={maintenance} />
          <ListaDefinicoes colunas={2} className="mt-3">
            <Definicao rotulo="Pago" valor={<span className="tabular-nums text-success">{formatarBRL(totalPaid)}</span>} />
            <Definicao
              rotulo="Restante"
              valor={<span className={cn("tabular-nums", remaining > 0 && "text-warning")}>{formatarBRL(remaining)}</span>}
            />
            {maintenance.paid_at && <Definicao rotulo="Pago em" valor={formatDateTime(maintenance.paid_at)} />}
            {maintenance.contested_at && <Definicao rotulo="Contestada em" valor={formatDateTime(maintenance.contested_at)} />}
            {maintenance.debited_at && <Definicao rotulo="Debitada em" valor={formatDateTime(maintenance.debited_at)} />}
          </ListaDefinicoes>
        </CaixaOperacao>
      )}

      {/* Registro do serviço: descrições e comentários da equipe */}
      <MaintenanceServiceLog notes={maintenance.ticket_notes} isTeam={isTeam} />

      {/* Pagamentos (apenas quando há cobrança) */}
      {hasFinancials && (
        <CaixaOperacao
          icone={<CreditCard />}
          titulo="Pagamentos"
          tom="info"
          selos={payments.length > 0 ? <SeloContagem tom="info">{payments.length}</SeloContagem> : undefined}
        >
          {payments.length > 0 ? (
            <div className="space-y-2">
              {payments.map((payment: any) => (
                <div key={payment.id} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-medium tabular-nums">{formatarBRL(payment.amount_cents)}</div>
                    <div className="text-sm text-muted-foreground">{formatDateTime(payment.payment_date)}</div>
                  </div>
                  <ListaDefinicoes colunas={2}>
                    <Definicao rotulo="Método" valor={payment.method || undefined} />
                    <Definicao rotulo="Aplica-se a" valor={payment.applies_to || undefined} />
                  </ListaDefinicoes>
                  {payment.note && <p className="mt-2 text-sm text-muted-foreground">{payment.note}</p>}
                  {payment.attachments && payment.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {payment.attachments.map((attachment: any, idx: number) => (
                        <a
                          key={attachment.id}
                          href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/maintenance-payment-proofs/${attachment.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          Comprovante {payment.attachments.length > 1 ? idx + 1 : ""}
                        </a>
                      ))}
                    </div>
                  )}
                  {payment.proof_file_url && (
                    <div className="mt-2">
                      <a
                        href={payment.proof_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Ver comprovante
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <CaixaVazia icone={<CreditCard className="h-5 w-5" />} titulo="Nenhum pagamento registrado" />
          )}

          {podeRegistrarPagamento && (
            <div className="mt-4 border-t border-border/60 pt-4">
              <p className="mb-3 text-sm font-medium">Registrar novo pagamento</p>
              <MaintenancePaymentForm maintenanceId={chargeIdForUpdates!} onSuccess={recarregar} />
            </div>
          )}
        </CaixaOperacao>
      )}

      {/* Anexos: o nome do arquivo nunca aparece */}
      {anexos.length > 0 && (
        <CaixaOperacao icone={<Paperclip />} titulo="Anexos" selos={<SeloContagem>{anexos.length}</SeloContagem>}>
          <div className="space-y-3">
            {midia.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {midia.map((attachment: any, idx: number) => (
                  <div
                    key={attachment.id}
                    className={cn("relative shrink-0", attachment.from_inspection && "rounded ring-1 ring-info/30")}
                    title={attachment.from_inspection ? "Anexo vindo da vistoria" : "Anexo"}
                  >
                    <MediaThumbnail
                      src={attachment.file_url}
                      fileType={attachment.file_type}
                      fileName={attachment.file_name}
                      size="md"
                      onClick={() => {
                        setGalleryStartIndex(idx);
                        setGalleryOpen(true);
                      }}
                    />
                    {attachment.from_inspection && (
                      <div className="pointer-events-none absolute left-0.5 top-0.5 rounded-full bg-info p-0.5 text-info-foreground shadow-sm">
                        <ClipboardCheck className="h-2.5 w-2.5" aria-hidden="true" />
                      </div>
                    )}
                    {isTeam && !attachment.from_inspection && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -right-1 -top-1 z-10 h-6 w-6 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnexoParaExcluir({ id: attachment.id });
                        }}
                        aria-label="Excluir anexo"
                        title="Excluir anexo"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {midia.some((a: any) => a.from_inspection) && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClipboardCheck className="h-3 w-3 text-info" aria-hidden="true" />
                Anexos com este ícone vieram da vistoria de origem
              </p>
            )}

            {outros.length > 0 && (
              <div className="divide-y divide-border/60">
                {outros.map((attachment: any) => (
                  <div key={attachment.id} className="flex items-center gap-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {ROTULO_ANEXO[detectMediaKind(attachment.file_type, attachment.file_name, attachment.file_url)]}
                      </div>
                      <div className="text-xs text-muted-foreground">{tamanhoKB(attachment.size_bytes)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                          Ver
                        </a>
                      </Button>
                      {isTeam && !attachment.from_inspection && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setAnexoParaExcluir({ id: attachment.id })}
                          aria-label="Excluir anexo"
                          title="Excluir anexo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <MediaGallery
              items={midia.map((a: any) => ({
                id: a.id,
                file_url: a.file_url,
                file_name: a.file_name,
                file_type: a.file_type,
                size_bytes: a.size_bytes,
              }))}
              initialIndex={galleryStartIndex}
              open={galleryOpen}
              onOpenChange={setGalleryOpen}
              onDelete={
                isTeam
                  ? async (item) => {
                      if (midia.find((a: any) => a.id === item.id)?.from_inspection) {
                        toast.error("Este anexo pertence à vistoria; exclua-o por lá.");
                        return;
                      }
                      const ok = await deleteAttachmentRow(tabelaAnexos, item.id);
                      if (ok) recarregar();
                    }
                  : undefined
              }
            />
          </div>
        </CaixaOperacao>
      )}

      {/* Atualizações (timeline da equipe → proprietário) */}
      <MaintenanceUpdatesThread ticketId={ticketIdForUpdates} chargeId={chargeIdForUpdates} />

      {isTeam && (
        <EditMaintenanceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editId={maintenance.id}
          type={source === "charge" ? "charge" : "maintenance"}
          onSaved={() => {
            recarregar();
            queryClient.invalidateQueries({ queryKey: ["maintenances"] });
            queryClient.invalidateQueries({ queryKey: ["maintenance-list-view"] });
            queryClient.invalidateQueries({ queryKey: ["pending-charges-list"] });
          }}
        />
      )}

      <ConfirmationDialog
        open={!!anexoParaExcluir}
        onOpenChange={(o) => !o && setAnexoParaExcluir(null)}
        title="Excluir anexo?"
        description="Esta ação é permanente e não pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        loading={excluindoAnexo}
        onConfirm={excluirAnexo}
      />
    </>,
  );
}
