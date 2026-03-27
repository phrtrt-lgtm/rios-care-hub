import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Settings, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ReportFileUpload } from '@/components/report/ReportFileUpload';
import { ReportStepIndicator } from '@/components/report/ReportStepIndicator';
import { ReportReservationsTable } from '@/components/report/ReportReservationsTable';
import { FinancialReportView } from '@/components/report/FinancialReportView';
import { parseReportFile } from '@/lib/report-file-parser';
import { filterReservations, generateReport } from '@/lib/report-calculations';
import { Reservation, ParsedFile, ReportType, ReportData } from '@/lib/report-types';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const STEPS = [
  { id: 1, title: 'Upload', description: 'Importar dados' },
  { id: 2, title: 'Configurar', description: 'Ajustar parâmetros' },
  { id: 3, title: 'Relatório', description: 'Visualizar resultado' },
];

export default function RelatorioFinanceiro() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedFile | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // Config state
  const [selectedProperty, setSelectedProperty] = useState('');
  const [reportType, setReportType] = useState<ReportType>('owner');
  const [commissionPercentage, setCommissionPercentage] = useState(20);
  const [useAllDates, setUseAllDates] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [propertyCommissions, setPropertyCommissions] = useState<Record<string, number>>({});

  const [reportData, setReportData] = useState<ReportData | null>(null);

  const handleFilesSelect = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setParsedData(null);
    setReservations([]);
  }, []);

  const handleProcessFiles = async () => {
    if (files.length === 0) return;
    setIsLoading(true);
    try {
      let allReservations: Reservation[] = [];
      const allProperties = new Set<string>();
      let minDate: Date | null = null;
      let maxDate: Date | null = null;

      for (const file of files) {
        const result = await parseReportFile(file);
        allReservations = [...allReservations, ...result.reservations];
        result.properties.forEach(p => allProperties.add(p));
        if (!minDate || result.dateRange.min < minDate) minDate = result.dateRange.min;
        if (!maxDate || result.dateRange.max > maxDate) maxDate = result.dateRange.max;
      }

      // Deduplicate by guest + checkin + property
      const seen = new Set<string>();
      allReservations = allReservations.filter(r => {
        const key = `${r.property_name}|${r.guest_name}|${new Date(r.checkin_date).toISOString().slice(0, 10)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const parsed: ParsedFile = {
        reservations: allReservations,
        properties: Array.from(allProperties).sort(),
        dateRange: { min: minDate!, max: maxDate! },
      };

      setParsedData(parsed);
      if (parsed.properties.length > 0) setSelectedProperty(parsed.properties[0]);
      toast.success(`${allReservations.length} reservas importadas de ${files.length} arquivo(s)`);
      setStep(2);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar arquivo');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReservations = parsedData
    ? filterReservations(
        parsedData.reservations,
        selectedProperty,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null,
        useAllDates,
        includeCancelled
      )
    : [];

  const handleToggleReservation = useCallback((id: string) => {
    setReservations(prev => {
      const existing = prev.length > 0 ? prev : filteredReservations;
      return existing.map(r => r.id === id ? { ...r, selected: !r.selected } : r);
    });
  }, [filteredReservations]);

  const handleToggleAll = useCallback((selected: boolean) => {
    setReservations(prev => {
      const existing = prev.length > 0 ? prev : filteredReservations;
      return existing.map(r => ({ ...r, selected }));
    });
  }, [filteredReservations]);

  const displayReservations = reservations.length > 0 ? reservations : filteredReservations;

  const handleGenerateReport = () => {
    const selected = displayReservations.filter(r => r.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos uma reserva');
      return;
    }

    const report = generateReport({
      propertyName: selectedProperty,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      useAllDates,
      commissionPercentage,
      reportType,
      selectedReservations: selected,
    }, propertyCommissions);

    setReportData(report);
    setStep(3);
  };

  const reportTypeOptions = isOwner
    ? [{ value: 'owner', label: 'Relatório do Proprietário' }]
    : [
        { value: 'management', label: 'Relatório da Gestão' },
        { value: 'management_cleaning', label: 'Gestão + Limpeza' },
        { value: 'owner', label: 'Relatório do Proprietário' },
        { value: 'owner_management', label: 'Proprietário + Gestão' },
        { value: 'owner_management_cleaning', label: 'Proprietário + Gestão + Limpeza' },
      ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Header */}
        {step !== 3 && (
          <>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Relatório Financeiro</h1>
                <p className="text-sm text-muted-foreground">Gere relatórios a partir de exportações do Talkguest</p>
              </div>
            </div>

            <ReportStepIndicator steps={STEPS} currentStep={step} />
          </>
        )}

        {/* Step 1: Upload */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Importar Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportFileUpload
                onFilesSelect={handleFilesSelect}
                selectedFiles={files}
                onRemoveFile={handleRemoveFile}
                onClear={handleClearFiles}
                isLoading={isLoading}
              />
              <Button
                onClick={handleProcessFiles}
                disabled={files.length === 0 || isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  'Processar Arquivos'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Configure */}
        {step === 2 && parsedData && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5 text-primary" />
                  Configuração do Relatório
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Imóvel</Label>
                    <Select value={selectedProperty} onValueChange={(v) => { setSelectedProperty(v); setReservations([]); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione o imóvel" /></SelectTrigger>
                      <SelectContent>
                        {parsedData.properties.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de Relatório</Label>
                    <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {reportTypeOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Comissão da Gestão (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={commissionPercentage}
                      onChange={e => setCommissionPercentage(Number(e.target.value))}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-6">
                    <Switch checked={includeCancelled} onCheckedChange={setIncludeCancelled} />
                    <Label className="cursor-pointer">Incluir canceladas</Label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={useAllDates} onCheckedChange={setUseAllDates} />
                  <Label className="cursor-pointer">Usar todas as datas</Label>
                </div>

                {!useAllDates && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data Início</Label>
                      <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Data Fim</Label>
                      <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reservations table */}
            {displayReservations.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-foreground">
                  Reservas ({displayReservations.filter(r => r.selected).length} de {displayReservations.length} selecionadas)
                </h3>
                <ReportReservationsTable
                  reservations={displayReservations}
                  onToggleReservation={handleToggleReservation}
                  onToggleAll={handleToggleAll}
                />
              </div>
            )}

            {displayReservations.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhuma reserva encontrada para os filtros selecionados.
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button
                onClick={handleGenerateReport}
                disabled={displayReservations.filter(r => r.selected).length === 0}
                className="flex-1"
              >
                <Eye className="mr-2 h-4 w-4" />
                Gerar Relatório
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Report View */}
        {step === 3 && reportData && (
          <FinancialReportView
            data={reportData}
            onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  );
}
