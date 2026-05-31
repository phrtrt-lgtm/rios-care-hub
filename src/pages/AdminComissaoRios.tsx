import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { ArrowLeft, Download, FileSpreadsheet, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { ReportFileUpload } from "@/components/report/ReportFileUpload";
import { parseReportFile } from "@/lib/report-file-parser";
import type { Reservation } from "@/lib/report-types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PropertyMeta = {
  id: string;
  name: string;
  address: string | null;
  pct: number | null;
  owner_name: string | null;
  owner_email: string | null;
};

type Row = {
  unidade: string;
  matched_name: string | null;
  address: string | null;
  owner_name: string | null;
  owner_email: string | null;
  reservas: number;
  base: number;
  pct: number;
  pct_source: "imovel" | "relatorio" | "padrao";
  comissao: number;
};

const DEFAULT_PCT = 22;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminComissaoRios() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [propsByKey, setPropsByKey] = useState<Map<string, PropertyMeta>>(new Map());
  const [reportPctByKey, setReportPctByKey] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const { data: properties, error } = await supabase
          .from("properties")
          .select("id,name,address,default_commission_percentage,owner_id,profiles:owner_id(name,email)")
          .is("archived_at", null);
        if (error) throw error;
        const map = new Map<string, PropertyMeta>();
        (properties || []).forEach((p: any) => {
          map.set(normalize(p.name), {
            id: p.id,
            name: p.name,
            address: p.address,
            pct: p.default_commission_percentage != null ? Number(p.default_commission_percentage) : null,
            owner_name: p.profiles?.name ?? null,
            owner_email: p.profiles?.email ?? null,
          });
        });
        setPropsByKey(map);

        // Fallback: latest financial_report commissionPercentage per property
        const { data: reports } = await supabase
          .from("financial_reports")
          .select("property_id, report_data, created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        const seen = new Set<string>();
        const rmap = new Map<string, number>();
        (reports || []).forEach((r: any) => {
          if (!r.property_id || seen.has(r.property_id)) return;
          seen.add(r.property_id);
          const pct = Number(r?.report_data?.config?.commissionPercentage);
          if (!Number.isFinite(pct)) return;
          const meta = [...map.values()].find((m) => m.id === r.property_id);
          if (meta) rmap.set(normalize(meta.name), pct);
        });
        setReportPctByKey(rmap);
      } catch (e: any) {
        toast.error("Erro ao carregar propriedades: " + e.message);
      } finally {
        setLoadingProps(false);
      }
    })();
  }, []);

  const handleFiles = (newFiles: File[]) => setFiles((prev) => [...prev, ...newFiles]);
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const clearFiles = () => {
    setFiles([]);
    setReservations([]);
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setParsing(true);
    try {
      const all: Reservation[] = [];
      for (const f of files) {
        const parsed = await parseReportFile(f);
        all.push(...parsed.reservations);
      }
      setReservations(all);
      toast.success(`${all.length} reservas importadas de ${files.length} arquivo(s)`);
    } catch (e: any) {
      toast.error("Erro ao processar arquivo: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  const rows: Row[] = useMemo(() => {
    if (reservations.length === 0) return [];
    const agg = new Map<string, { csvName: string; base: number; count: number }>();
    for (const r of reservations) {
      if ((r.status || "").toLowerCase().includes("cancel")) continue;
      const key = normalize(r.property_name);
      const cur = agg.get(key) || { csvName: r.property_name, base: 0, count: 0 };
      cur.base += (r.reservation_value || 0) - (r.channel_commission || 0);
      cur.count += 1;
      agg.set(key, cur);
    }
    const out: Row[] = [];
    agg.forEach((v, key) => {
      const meta = propsByKey.get(key);
      let pct: number;
      let source: Row["pct_source"];
      if (meta?.pct != null) {
        pct = meta.pct;
        source = "imovel";
      } else if (reportPctByKey.has(key)) {
        pct = reportPctByKey.get(key)!;
        source = "relatorio";
      } else {
        pct = DEFAULT_PCT;
        source = "padrao";
      }
      const base = Math.round(v.base * 100) / 100;
      out.push({
        unidade: meta?.name || v.csvName,
        matched_name: meta?.name || null,
        address: meta?.address || null,
        owner_name: meta?.owner_name || null,
        owner_email: meta?.owner_email || null,
        reservas: v.count,
        base,
        pct,
        pct_source: source,
        comissao: Math.round(base * pct) / 100,
      });
    });
    return out;
  }, [reservations, propsByKey, reportPctByKey]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.comissao, 0), [rows]);
  const totalReservas = useMemo(() => rows.reduce((s, r) => s + r.reservas, 0), [rows]);

  const byName = useMemo(() => [...rows].sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR")), [rows]);
  const byPct = useMemo(
    () => [...rows].sort((a, b) => b.pct - a.pct || a.unidade.localeCompare(b.unidade, "pt-BR")),
    [rows]
  );

  const exportXlsx = () => {
    const data: any[] = byName.map((r) => ({
      Unidade: r.unidade,
      Endereço: r.address || "—",
      "Minha comissão (R$)": r.comissao,
    }));
    data.push({
      Unidade: "TOTAL",
      Endereço: "",
      "Minha comissão (R$)": total,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    for (let R = 1; R <= range.e.r; R++) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: 2 })];
      if (c) c.z = '"R$" #,##0.00';
    }
    ws["!cols"] = [{ wch: 22 }, { wch: 50 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comissão RIOS");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `comissao-rios-${today}.xlsx`);
  };

  const unmatched = rows.filter((r) => !r.matched_name);

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/painel")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Comissão RIOS</h1>
          <p className="text-sm text-muted-foreground">
            Importe planilhas Hostex e gere a comissão da gestão por imóvel (com endereço para impostos).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Importar planilha(s) Hostex</CardTitle>
          <CardDescription>
            Aceita o export unificado e por propriedade (.csv / .xlsx). Sem limite de arquivos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReportFileUpload
            onFilesSelect={handleFiles}
            selectedFiles={files}
            onRemoveFile={removeFile}
            onClear={clearFiles}
            isLoading={parsing}
          />
          <div className="flex gap-2">
            <Button onClick={processFiles} disabled={files.length === 0 || parsing}>
              <Calculator className="h-4 w-4 mr-2" />
              {parsing ? "Processando..." : "Calcular comissão"}
            </Button>
            {reservations.length > 0 && (
              <Button variant="outline" onClick={exportXlsx}>
                <Download className="h-4 w-4 mr-2" />
                Exportar .xlsx
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loadingProps ? (
        <SectionSkeleton />
      ) : reservations.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="Nenhuma planilha processada"
          description="Anexe um ou mais arquivos exportados do Hostex e clique em Calcular comissão."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Total de comissão RIOS</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold text-primary">{fmtBRL(total)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Reservas computadas</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold">{totalReservas}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Imóveis</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold">{rows.length}</p></CardContent>
            </Card>
          </div>

          {unmatched.length > 0 && (
            <Alert>
              <AlertDescription>
                <strong>{unmatched.length}</strong> imóvel(eis) sem cadastro correspondente — aplicado padrão {DEFAULT_PCT}% e endereço em branco:{" "}
                {unmatched.map((u) => u.unidade).join(", ")}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Comissão por imóvel</CardTitle>
              <CardDescription>
                Fórmula: base = (Receita quarto + Pets + Extras + Impostos) − |Comissão canal|; comissão = base × % RIOS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="alpha">
                <TabsList>
                  <TabsTrigger value="alpha">Por nome (A→Z)</TabsTrigger>
                  <TabsTrigger value="pct">Por % (maior→menor)</TabsTrigger>
                </TabsList>
                <TabsContent value="alpha"><RowsTable rows={byName} /></TabsContent>
                <TabsContent value="pct"><RowsTable rows={byPct} /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RowsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unidade</TableHead>
            <TableHead>Endereço</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Reservas</TableHead>
            <TableHead className="text-right">Renda base</TableHead>
            <TableHead className="text-right">Minha comissão</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.unidade}>
              <TableCell className="font-medium">{r.unidade}</TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-xs truncate" title={r.address || ""}>
                {r.address || <span className="italic">—</span>}
              </TableCell>
              <TableCell className="text-right">
                {r.pct.toFixed(0)}%
                {r.pct_source !== "imovel" && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({r.pct_source === "relatorio" ? "rel." : "pad."})
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">{r.reservas}</TableCell>
              <TableCell className="text-right">{r.base.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              <TableCell className="text-right font-semibold text-primary">
                {r.comissao.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
