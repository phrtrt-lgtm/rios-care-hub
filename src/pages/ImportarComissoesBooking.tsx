import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, Sparkles, Building2, ChevronRight, SkipForward, Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/format";
import { format } from "date-fns";
import { parseSpreadsheet, ParsedReservation } from "@/lib/spreadsheetParser";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SystemProperty {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
}

interface PropertyMapping {
  spreadsheetName: string;
  systemPropertyId: string | null; // null = skip
  commissionPercent: number;
  autoMatched: boolean;
}

// Normalize para matching: lowercase + sem acentos
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Step = 1 | 2 | 3;

export default function ImportarComissoesBooking() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);

  // Dados da planilha
  const [reservations, setReservations] = useState<ParsedReservation[]>([]);
  const [systemProperties, setSystemProperties] = useState<SystemProperty[]>([]);
  const [mappings, setMappings] = useState<PropertyMapping[]>([]);

  // Filtros da etapa 2
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);

  // Etapa 3
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const isTeam = ["admin", "agent", "maintenance"].includes(profile?.role || "");

  // ─── Etapa 1: Upload ───────────────────────────────────────────
  const handleFile = async (f: File) => {
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleProcess = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const result = await parseSpreadsheet(file);
      if (result.reservations.length === 0) {
        toast({ title: "Nenhuma reserva encontrada", description: "Verifique se a planilha está no formato correto.", variant: "destructive" });
        return;
      }
      setReservations(result.reservations);

      // Buscar imóveis do sistema
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, owner_id")
        .order("name");

      const propIds = (props || []).map(p => p.owner_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", propIds);

      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.name]));

      const sysProps: SystemProperty[] = (props || []).map(p => ({
        id: p.id,
        name: p.name,
        owner_id: p.owner_id,
        owner_name: profileMap[p.owner_id] || "N/A",
      }));
      setSystemProperties(sysProps);

      // Auto-matching
      const newMappings: PropertyMapping[] = result.propertyNames.map(name => {
        const normName = normalizeForMatch(name);
        const matched = sysProps.find(sp => normalizeForMatch(sp.name) === normName);
        return {
          spreadsheetName: name,
          systemPropertyId: matched ? matched.id : null,
          commissionPercent: 22,
          autoMatched: !!matched,
        };
      });
      setMappings(newMappings);
      setStep(2);
    } catch (err: any) {
      toast({ title: "Erro ao processar planilha", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  // ─── Filtros ───────────────────────────────────────────────────
  const filteredReservations = reservations.filter(r => {
    const statusNorm = r.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isConfirmed = statusNorm.includes("confirm");
    if (!includeCancelled && !isConfirmed) return false;
    if (dateFrom && r.checkin_date < dateFrom) return false;
    if (dateTo && r.checkin_date > dateTo) return false;
    return true;
  });

  // ─── Cálculos por imóvel ──────────────────────────────────────
  const getPropertyStats = (spreadsheetName: string) => {
    const mapping = mappings.find(m => m.spreadsheetName === spreadsheetName);
    const propReservations = filteredReservations.filter(r => r.property_name === spreadsheetName);
    const totalBruto = propReservations.reduce((acc, r) => acc + r.reservation_amount, 0);
    const commissionPercent = mapping?.commissionPercent || 0;
    const totalCommission = propReservations.reduce((acc, r) => {
      const netAmount = r.reservation_amount - r.channel_commission;
      return acc + (netAmount * commissionPercent / 100) + r.cleaning_fee;
    }, 0);
    return {
      count: propReservations.length,
      totalBruto,
      totalCommission,
    };
  };

  const getSystemProperty = (id: string | null) => systemProperties.find(p => p.id === id);

  const updateMapping = (spreadsheetName: string, updates: Partial<PropertyMapping>) => {
    setMappings(prev =>
      prev.map(m => m.spreadsheetName === spreadsheetName ? { ...m, ...updates } : m)
    );
  };

  // Totais do rodapé
  const linkedMappings = mappings.filter(m => m.systemPropertyId !== "skip" && m.systemPropertyId !== null);
  const totalToGenerate = filteredReservations.filter(r =>
    linkedMappings.some(m => m.spreadsheetName === r.property_name)
  ).length;

  const totalCommissionValue = linkedMappings.reduce((acc, m) => {
    const stats = getPropertyStats(m.spreadsheetName);
    return acc + stats.totalCommission;
  }, 0);

  // ─── Etapa 3: Gerar cobranças ──────────────────────────────────
  const handleGenerate = async () => {
    if (!profile?.id) return;
    setGenerating(true);
    try {
  type CommissionInsert = {
    property_id: string;
    owner_id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    reservation_amount_cents: number;
    commission_percent: number;
    cleaning_fee_cents: number;
    status: string;
    created_by: string;
    due_date: null;
    notes: string | null;
  };
  const inserts: CommissionInsert[] = [];

      for (const mapping of linkedMappings) {
        if (!mapping.systemPropertyId || mapping.systemPropertyId === "skip") continue;
        const sysProp = getSystemProperty(mapping.systemPropertyId);
        if (!sysProp) continue;

        const propReservations = filteredReservations.filter(r => r.property_name === mapping.spreadsheetName);
        for (const r of propReservations) {
          // reservation_amount_cents deve ser o valor líquido (bruto - comissão canal)
          // para que o trigger calcule: commission = net * % + limpeza
          const netAmount = r.reservation_amount - r.channel_commission;
          inserts.push({
            property_id: sysProp.id,
            owner_id: sysProp.owner_id,
            guest_name: r.guest_name || null,
            check_in: r.checkin_date,
            check_out: r.checkout_date,
            reservation_amount_cents: Math.round(netAmount * 100),
            commission_percent: mapping.commissionPercent,
            cleaning_fee_cents: Math.round(r.cleaning_fee * 100),
            status: "sent",
            created_by: profile.id,
            due_date: null,
            notes: r.channel ? `Canal: ${r.channel}` : null,
          });
        }
      }

      if (inserts.length === 0) {
        toast({ title: "Nenhuma cobrança para gerar", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("booking_commissions").insert(inserts);
      if (error) throw error;

      setGenerated(true);
      setStep(3);
    } catch (err: any) {
      toast({ title: "Erro ao gerar cobranças", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (!isTeam) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/booking-comissoes")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importar Planilha Talkguest
            </h1>
          </div>
          {/* Steps indicator */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${step === s ? "bg-primary text-primary-foreground" :
                    step > s ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                  {step > s ? "✓" : s}
                </div>
                {s < 3 && <ChevronRight className="h-3 w-3" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-6">

        {/* ── ETAPA 1: Upload ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Etapa 1 — Upload da Planilha
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecione o arquivo XLSX, XLS ou CSV exportado do Talkguest
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/30"}`}
              >
                <FileSpreadsheet className={`h-12 w-12 mx-auto mb-3 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
                {file ? (
                  <div>
                    <p className="font-semibold text-primary">{file.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB · Clique para trocar
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
                    <p className="text-sm text-muted-foreground mt-1">XLSX, XLS ou CSV</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {/* Info sobre colunas esperadas */}
              <div className="flex gap-2 p-3 rounded-lg bg-accent border border-border">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Colunas detectadas automaticamente:</p>
                  <p>Alojamento · Estado · Hóspede · Checkin · Checkout · Valor Reserva · Comissão Canal · Taxa de Limpeza · Canal</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleProcess} disabled={!file || parsing} size="lg">
                  {parsing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Processar Planilha
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── ETAPA 2: Revisão por imóvel ── */}
        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Etapa 2 — Revisão por Imóvel
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {reservations.length} reservas encontradas em {mappings.length} imóvel(is). Vincule cada imóvel e defina a % de comissão.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-xs">Check-in a partir de</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Check-in até</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch
                      id="include-cancelled"
                      checked={includeCancelled}
                      onCheckedChange={setIncludeCancelled}
                    />
                    <Label htmlFor="include-cancelled" className="text-sm cursor-pointer">
                      Incluir canceladas
                    </Label>
                  </div>
                </div>

                {/* Resumo de filtros ativos */}
                <p className="text-sm text-muted-foreground">
                  {filteredReservations.length} reservas no período selecionado
                </p>

                {/* Tabela de imóveis */}
                <div className="space-y-3">
                  {mappings.map((mapping) => {
                    const stats = getPropertyStats(mapping.spreadsheetName);
                    const sysProp = getSystemProperty(mapping.systemPropertyId);
                    const isSkipped = mapping.systemPropertyId === "skip";

                    return (
                      <Card
                        key={mapping.spreadsheetName}
                        className={`border ${isSkipped ? "opacity-50 bg-muted/20" : mapping.autoMatched ? "border-green-500/40" : "border-yellow-500/40"}`}
                      >
                        <CardContent className="py-4 px-4">
                          <div className="flex flex-col gap-3">
                            {/* Linha 1: Nome planilha + badge + match */}
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-sm">{mapping.spreadsheetName}</p>
                                  {mapping.autoMatched && !isSkipped && (
                                    <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Vinculado automaticamente
                                    </Badge>
                                  )}
                                  {!mapping.autoMatched && !isSkipped && (
                                    <Badge variant="outline" className="text-xs">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      Vincular manualmente
                                    </Badge>
                                  )}
                                  {isSkipped && (
                                    <Badge className="bg-muted text-muted-foreground text-xs">
                                      <SkipForward className="h-3 w-3 mr-1" />
                                      Pulando
                                    </Badge>
                                  )}
                                </div>
                                {sysProp && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Sistema: <span className="font-medium text-foreground">{sysProp.name}</span>
                                    {" · "}<span>{sysProp.owner_name}</span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground">{stats.count} reserva{stats.count !== 1 ? "s" : ""}</p>
                                <p>Bruto: {formatBRL(Math.round(stats.totalBruto * 100))}</p>
                              </div>
                            </div>

                            {/* Linha 2: Vincular imóvel */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Imóvel no Sistema</Label>
                                <Select
                                  value={mapping.systemPropertyId || "skip"}
                                  onValueChange={(v) => updateMapping(mapping.spreadsheetName, {
                                    systemPropertyId: v === "skip" ? "skip" : v,
                                    autoMatched: false,
                                  })}
                                >
                                  <SelectTrigger className="text-sm">
                                    <SelectValue placeholder="Selecionar imóvel..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="skip">
                                      <span className="flex items-center gap-2">
                                        <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                                        Pular este imóvel
                                      </span>
                                    </SelectItem>
                                    {systemProperties.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name} · {p.owner_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs">% Comissão</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    placeholder="0"
                                    value={mapping.commissionPercent || ""}
                                    onChange={e => updateMapping(mapping.spreadsheetName, {
                                      commissionPercent: parseFloat(e.target.value) || 0,
                                    })}
                                    disabled={isSkipped}
                                    className="text-sm"
                                  />
                                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                                </div>
                                {!isSkipped && mapping.commissionPercent > 0 && (
                                  <p className="text-xs text-primary font-medium">
                                    Comissão devida: {formatBRL(Math.round(stats.totalCommission * 100))}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Rodapé com totais */}
            <Card className="border-primary/20 bg-primary/5 sticky bottom-4">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Cobranças a gerar: </span>
                      <span className="font-bold text-foreground">{totalToGenerate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total comissões: </span>
                      <span className="font-bold text-primary">{formatBRL(Math.round(totalCommissionValue * 100))}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                      Voltar
                    </Button>
                    <Button
                      size="sm"
                      disabled={totalToGenerate === 0 || generating}
                      onClick={handleGenerate}
                    >
                      {generating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Gerar {totalToGenerate} cobrança{totalToGenerate !== 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ETAPA 3: Sucesso ── */}
        {step === 3 && generated && (
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-10 pb-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Cobranças geradas!</h2>
                <p className="text-muted-foreground mt-1">
                  {totalToGenerate} cobrança{totalToGenerate !== 1 ? "s" : ""} de comissão Booking foram criadas com sucesso.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Todas as cobranças estão com status <strong>Enviada</strong> e disponíveis para os proprietários.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Button variant="outline" onClick={() => {
                  setStep(1);
                  setFile(null);
                  setReservations([]);
                  setMappings([]);
                  setGenerated(false);
                }}>
                  Importar outra planilha
                </Button>
                <Button onClick={() => navigate("/booking-comissoes")}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Ver Comissões Booking
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
