import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, CalendarDays, Clock, Wrench, Users, CheckCircle2, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface BlockRequest {
  id: string;
  property_id: string;
  owner_id: string;
  start_date: string;
  end_date: string;
  reason: "maintenance" | "family_visit";
  notes: string | null;
  cleaning_fee_proof_path: string | null;
  status: "pending" | "processed" | "rejected";
  created_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
  property: { name: string; address: string | null } | null;
  owner: { name: string; email: string } | null;
}

const statusConfig = {
  pending: { label: "Pendente", color: "bg-amber-100 text-amber-800 border-amber-200" },
  processed: { label: "Processado", color: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejeitado", color: "bg-red-100 text-red-800 border-red-200" },
};

const reasonConfig = {
  maintenance: { label: "Manutenção", icon: Wrench, color: "text-orange-500" },
  family_visit: { label: "Visita familiar", icon: Users, color: "text-blue-500" },
};

export default function AdminBloqueiosDatas() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<BlockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState<BlockRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const fetchRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("date_block_requests")
        .select(`
          *,
          property:properties(name, address),
          owner:profiles!date_block_requests_owner_id_fkey(name, email)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests((data || []) as unknown as BlockRequest[]);
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao carregar solicitações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleMarkProcessed = async (id: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from("date_block_requests")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Marcado como processado ✓" });
      fetchRequests();
    } catch (err) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from("date_block_requests")
        .update({ status: "rejected", processed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Marcado como rejeitado" });
      fetchRequests();
    } catch (err) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const getProofUrl = (path: string) => {
    const { data } = supabase.storage.from("attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Bloqueios de Datas</h1>
              <p className="text-xs text-muted-foreground">Fila do robô — solicitações de proprietários</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="processed">Processados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            {pendingCount > 0 && statusFilter === "pending" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                <Clock className="h-3 w-3" />
                {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"}
              </span>
            )}
          </div>
        </div>

        {/* Request list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <CalendarDays className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma solicitação encontrada</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => {
              const ReasonIcon = reasonConfig[req.reason].icon;
              const status = statusConfig[req.status];
              return (
                <Card key={req.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex gap-0">
                      {/* Color bar */}
                      <div className={`w-1.5 shrink-0 ${req.status === "pending" ? "bg-amber-400" : req.status === "processed" ? "bg-green-500" : "bg-red-400"}`} />

                      <div className="flex-1 p-4 space-y-3">
                        {/* Header: Property name + Status */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="rounded-md bg-primary/10 p-1.5">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-bold text-base leading-tight">
                                {req.property?.name ?? "Unidade não identificada"}
                              </h3>
                              {req.property?.address && (
                                <p className="text-xs text-muted-foreground mt-0.5">{req.property.address}</p>
                              )}
                            </div>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.color}`}>
                            {status.label}
                          </span>
                        </div>

                        {/* Structured data grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 rounded-lg p-3 text-sm">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Unidade</p>
                            <p className="font-bold text-foreground">{req.property?.name ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Motivo</p>
                            <div className={`flex items-center gap-1 font-medium ${reasonConfig[req.reason].color}`}>
                              <ReasonIcon className="h-3.5 w-3.5" />
                              <span>{reasonConfig[req.reason].label}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Data Início</p>
                            <p className="font-bold text-foreground">
                              {format(new Date(req.start_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Data Fim</p>
                            <p className="font-bold text-foreground">
                              {format(new Date(req.end_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        </div>

                        {/* Owner info */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="h-3 w-3 shrink-0" />
                          <span>Proprietário: <strong className="text-foreground">{req.owner?.name ?? "—"}</strong></span>
                          {req.owner?.email && (
                            <span className="hidden sm:inline">({req.owner.email})</span>
                          )}
                        </div>

                        {/* Notes */}
                        {req.notes && (
                          <div className="bg-muted/50 rounded-md px-3 py-2 border border-border/50">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Observações</p>
                            <p className="text-sm text-foreground">{req.notes}</p>
                          </div>
                        )}

                        {/* Proof + metadata row */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            {req.cleaning_fee_proof_path && (
                              <a
                                href={getProofUrl(req.cleaning_fee_proof_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary font-medium underline-offset-2 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Ver comprovante de limpeza
                              </a>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Solicitado em {format(new Date(req.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              {req.processed_at && ` · Processado em ${format(new Date(req.processed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                            </p>
                          </div>

                          {/* Actions */}
                          {req.status === "pending" && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleMarkProcessed(req.id)}
                                disabled={updatingId === req.id}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Processado
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 px-3 text-xs"
                                onClick={() => handleReject(req.id)}
                                disabled={updatingId === req.id}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
