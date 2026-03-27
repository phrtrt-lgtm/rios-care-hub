import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportFileUpload } from '@/components/report/ReportFileUpload';
import { ReportStepIndicator } from '@/components/report/ReportStepIndicator';
import { ReportReservationsTable } from '@/components/report/ReportReservationsTable';
import { FinancialReportView } from '@/components/report/FinancialReportView';
import { ReportOwnerAssociation } from '@/components/report/ReportOwnerAssociation';
import { parseReportFile } from '@/lib/report-file-parser';
import { filterReservations, generateReport, getReportTypeLabel } from '@/lib/report-calculations';
import { ParsedFile, Reservation, ReportType, ReportData } from '@/lib/report-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { CalendarIcon, ChevronRight, ChevronLeft, Loader2, FileText, Building2, Settings, BarChart3, FileArchive, Check, Pencil, X, ArrowLeft, Send, Eye } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useAuth } from '@/hooks/useAuth';

const STEPS = [
  { id: 1, title: 'Upload', description: 'Carregar arquivo' },
  { id: 2, title: 'Configuração', description: 'Filtros e comissão' },
  { id: 3, title: 'Relatório', description: 'Visualizar resultado' },
  { id: 4, title: 'Associar', description: 'Vincular proprietários' },
];

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: 'management', label: 'Relatório da Gestão', description: 'Somente sua comissão' },
  { value: 'management_cleaning', label: 'Gestão + Limpeza', description: 'Comissão + taxa de limpeza' },
  { value: 'owner', label: 'Relatório do Proprietário', description: 'Somente líquido do proprietário' },
  { value: 'owner_management', label: 'Proprietário + Gestão', description: 'Visão completa sem limpeza' },
  { value: 'owner_management_cleaning', label: 'Proprietário + Gestão + Limpeza', description: 'Visão total da reserva' },
];

type ReportMode = 'combined' | 'separate_zip';

export default function RelatorioFinanceiro() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [propertyCommissions, setPropertyCommissions] = useState<Record<string, number>>({});
  const [editingPropertyCommission, setEditingPropertyCommission] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [useAllDates, setUseAllDates] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>('combined');

  // Step 2 state
  const [commissionPercentage, setCommissionPercentage] = useState(22);
  const [reportType, setReportType] = useState<ReportType>('owner');
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);

  // Step 3 state
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [multipleReportsData, setMultipleReportsData] = useState<ReportData[]>([]);
  const [currentReportIndex, setCurrentReportIndex] = useState(0);
  const reportViewRef = useRef<HTMLDivElement>(null);

  const getReservationKey = (r: Reservation) => {
    const checkin = r.checkin_date instanceof Date ? r.checkin_date.toISOString().split('T')[0] : new Date(r.checkin_date).toISOString().split('T')[0];
    const checkout = r.checkout_date instanceof Date ? r.checkout_date.toISOString().split('T')[0] : new Date(r.checkout_date).toISOString().split('T')[0];
    return `${r.property_name}|${checkin}|${checkout}|${r.guest_name}|${r.reservation_value}`;
  };

  const deduplicateReservations = (reservations: Reservation[]) => {
    const seen = new Set<string>();
    return reservations.filter(r => {
      const key = getReservationKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleFilesSelect = async (files: File[]) => {
    const newFiles = [...selectedFiles, ...files];
    setSelectedFiles(newFiles);
    setIsLoading(true);
    try {
      const allReservations: Reservation[] = [];
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      const allProperties = new Set<string>();

      for (const file of newFiles) {
        const parsed = await parseReportFile(file);
        allReservations.push(...parsed.reservations);
        parsed.properties.forEach(p => allProperties.add(p));
        if (!minDate || parsed.dateRange.min < minDate) minDate = parsed.dateRange.min;
        if (!maxDate || parsed.dateRange.max > maxDate) maxDate = parsed.dateRange.max;
      }

      const uniqueReservations = deduplicateReservations(allReservations);
      const duplicatesRemoved = allReservations.length - uniqueReservations.length;

      const combined: ParsedFile = {
        reservations: uniqueReservations,
        properties: Array.from(allProperties).sort(),
        dateRange: { min: minDate || new Date(), max: maxDate || new Date() },
      };

      setParsedFile(combined);
      setStartDate(combined.dateRange.min);
      setEndDate(combined.dateRange.max);

      if (combined.properties.length === 1) {
        setSelectedProperties([combined.properties[0]]);
      }

      const msg = duplicatesRemoved > 0
        ? `${newFiles.length} arquivo(s) carregado(s)! ${uniqueReservations.length} reservas (${duplicatesRemoved} duplicatas removidas).`
        : `${newFiles.length} arquivo(s) carregado(s)! ${uniqueReservations.length} reservas encontradas.`;
      toast.success(msg);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar arquivo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFile = async (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    if (newFiles.length === 0) {
      setParsedFile(null);
      setSelectedProperties([]);
      setStartDate(undefined);
      setEndDate(undefined);
      return;
    }
    setIsLoading(true);
    try {
      const allReservations: Reservation[] = [];
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      const allProperties = new Set<string>();
      for (const file of newFiles) {
        const parsed = await parseReportFile(file);
        allReservations.push(...parsed.reservations);
        parsed.properties.forEach(p => allProperties.add(p));
        if (!minDate || parsed.dateRange.min < minDate) minDate = parsed.dateRange.min;
        if (!maxDate || parsed.dateRange.max > maxDate) maxDate = parsed.dateRange.max;
      }
      const uniqueReservations = deduplicateReservations(allReservations);
      const combined: ParsedFile = {
        reservations: uniqueReservations,
        properties: Array.from(allProperties).sort(),
        dateRange: { min: minDate || new Date(), max: maxDate || new Date() },
      };
      setParsedFile(combined);
      setStartDate(combined.dateRange.min);
      setEndDate(combined.dateRange.max);
      setSelectedProperties(prev => prev.filter(p => combined.properties.includes(p)));
      toast.success(`${uniqueReservations.length} reservas restantes.`);
    } catch {
      toast.error('Erro ao reprocessar arquivos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    setParsedFile(null);
    setSelectedProperties([]);
    setPropertyCommissions({});
    setStartDate(undefined);
    setEndDate(undefined);
    setUseAllDates(true);
  };

  const handleToggleProperty = (property: string) => {
    setSelectedProperties(prev =>
      prev.includes(property) ? prev.filter(p => p !== property) : [...prev, property]
    );
  };

  const handleSelectAllProperties = () => {
    if (parsedFile) setSelectedProperties(parsedFile.properties);
  };

  const handleDeselectAllProperties = () => setSelectedProperties([]);

  const handleSetPropertyCommission = (property: string, commission: number) => {
    setPropertyCommissions(prev => ({ ...prev, [property]: commission }));
    setEditingPropertyCommission(null);
  };

  const getPropertyCommission = (property: string): number => {
    return propertyCommissions[property] ?? commissionPercentage;
  };

  const handleAdvanceToStep2 = () => {
    if (!parsedFile || selectedProperties.length === 0) {
      toast.error('Selecione pelo menos um imóvel para continuar');
      return;
    }
    let allFiltered: Reservation[] = [];
    for (const property of selectedProperties) {
      const filtered = filterReservations(
        parsedFile.reservations,
        property,
        useAllDates ? null : (startDate || null),
        useAllDates ? null : (endDate || null),
        useAllDates,
        includeCancelled
      );
      allFiltered = [...allFiltered, ...filtered];
    }
    if (allFiltered.length === 0) {
      toast.error('Nenhuma reserva confirmada encontrada para os filtros selecionados');
      return;
    }
    setFilteredReservations(allFiltered.map(r => ({ ...r, selected: true })));
    setCurrentStep(2);
  };

  const handleToggleReservation = useCallback((id: string) => {
    setFilteredReservations(prev => prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }, []);

  const handleToggleAllReservations = useCallback((selected: boolean) => {
    setFilteredReservations(prev => prev.map(r => ({ ...r, selected })));
  }, []);

  const handleGenerateReport = () => {
    const selectedReservations = filteredReservations.filter(r => r.selected);
    if (selectedReservations.length === 0) {
      toast.error('Selecione pelo menos uma reserva');
      return;
    }

    if (reportMode === 'combined' || selectedProperties.length === 1) {
      const propertyName = selectedProperties.length === 1
        ? selectedProperties[0]
        : `${selectedProperties.length} imóveis`;
      const report = generateReport({
        propertyName,
        startDate: useAllDates ? null : (startDate || null),
        endDate: useAllDates ? null : (endDate || null),
        useAllDates,
        commissionPercentage,
        reportType,
        selectedReservations,
      }, propertyCommissions);
      setReportData(report);
      setMultipleReportsData([]);
      setCurrentStep(3);
    } else {
      const reports: ReportData[] = [];
      for (const property of selectedProperties) {
        const propertyReservations = selectedReservations.filter(r => r.property_name === property);
        if (propertyReservations.length > 0) {
          const propCommission = getPropertyCommission(property);
          const report = generateReport({
            propertyName: property,
            startDate: useAllDates ? null : (startDate || null),
            endDate: useAllDates ? null : (endDate || null),
            useAllDates,
            commissionPercentage: propCommission,
            reportType,
            selectedReservations: propertyReservations,
          });
          reports.push(report);
        }
      }
      setMultipleReportsData(reports);
      setReportData(null);
      setCurrentReportIndex(0);
      setCurrentStep(3);
    }
  };

  const handleDownloadZip = async () => {
    if (multipleReportsData.length === 0) return;
    setIsLoading(true);
    const toastId = 'zip-export';
    toast.loading(`Gerando PDFs (0/${multipleReportsData.length})...`, { id: toastId });
    try {
      const zip = new JSZip();
      for (let i = 0; i < multipleReportsData.length; i++) {
        const report = multipleReportsData[i];
        toast.loading(`Gerando PDF ${i + 1}/${multipleReportsData.length}: ${report.config.propertyName}`, { id: toastId });
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1080px;background:white;z-index:-1;';
        document.body.appendChild(container);
        const { createRoot } = await import('react-dom/client');
        const React = (await import('react')).default;
        const { FinancialReportView } = await import('@/components/report/FinancialReportView');
        await new Promise<void>((resolve) => {
          const root = createRoot(container);
          root.render(React.createElement(FinancialReportView, { data: report, onBack: () => {}, hideBackButton: true, forcePrintMode: true }));
          setTimeout(resolve, 500);
        });
        const canvas = await html2canvas(container.firstElementChild as HTMLElement || container, {
          scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 5000,
        });
        document.body.removeChild(container);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const usableW = pageW - margin * 2;
        const usableH = pageH - margin * 2;
        const imgW = canvas.width;
        const imgH = canvas.height;
        const ratio = usableW / (imgW / 3.7795);
        const scaledH = (imgH / 3.7795) * ratio;
        let yOffset = 0;
        let page = 0;
        while (yOffset < scaledH) {
          if (page > 0) pdf.addPage();
          const srcY = (yOffset / scaledH) * imgH;
          const sliceH = Math.min(usableH, scaledH - yOffset);
          const srcH = (sliceH / scaledH) * imgH;
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = imgW;
          sliceCanvas.height = srcH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', margin, margin, usableW, sliceH);
          yOffset += usableH;
          page++;
        }
        const pdfBytes = pdf.output('arraybuffer');
        const safeName = report.config.propertyName.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '_');
        zip.file(`${safeName}.pdf`, pdfBytes);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorios_${format(new Date(), 'yyyy-MM-dd')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${multipleReportsData.length} PDFs exportados com sucesso!`, { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar PDFs', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
    setFilteredReservations([]);
  };

  const handleBackToStep2 = () => {
    setCurrentStep(2);
    setReportData(null);
    setMultipleReportsData([]);
  };

  const handleNewReport = () => {
    setCurrentStep(1);
    setSelectedFiles([]);
    setParsedFile(null);
    setSelectedProperties([]);
    setPropertyCommissions({});
    setStartDate(undefined);
    setEndDate(undefined);
    setUseAllDates(true);
    setFilteredReservations([]);
    setReportData(null);
    setMultipleReportsData([]);
  };

  const selectedCount = filteredReservations.filter(r => r.selected).length;

  // Build reports array for association step
  const getReportsForAssociation = () => {
    if (multipleReportsData.length > 0) {
      return multipleReportsData.map(rd => ({ propertyName: rd.config.propertyName, reportData: rd }));
    }
    if (reportData) {
      // If combined with multiple properties, create separate reports for association
      if (selectedProperties.length > 1 && reportData) {
        return selectedProperties.map(prop => {
          const propReservations = reportData.reservations.filter(r => r.property_name === prop);
          if (propReservations.length === 0) return null;
          const propReport = generateReport({
            propertyName: prop,
            startDate: reportData.config.startDate,
            endDate: reportData.config.endDate,
            useAllDates: reportData.config.useAllDates,
            commissionPercentage: getPropertyCommission(prop),
            reportType: reportData.config.reportType,
            selectedReservations: propReservations,
          });
          return { propertyName: prop, reportData: propReport };
        }).filter(Boolean) as { propertyName: string; reportData: ReportData }[];
      }
      return [{ propertyName: reportData.config.propertyName, reportData }];
    }
    return [];
  };

  const reportTypeOptions = isOwner
    ? REPORT_TYPES.filter(t => t.value === 'owner')
    : REPORT_TYPES;

  // Step 3: Show report(s)
  if (currentStep === 3) {
    if (reportData) {
      return (
        <div className="min-h-screen bg-background">
          <FinancialReportView data={reportData} onBack={handleBackToStep2} />
          {!isOwner && (
            <div className="mx-auto max-w-5xl px-4 pb-8">
              <div className="flex justify-end">
                <Button onClick={() => setCurrentStep(4)} size="lg">
                  <Send className="mr-2 h-4 w-4" />
                  Continuar para Publicação
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (multipleReportsData.length > 0) {
      return (
        <div className="min-h-screen bg-background">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
            <div className="container max-w-5xl py-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <Button variant="outline" onClick={handleBackToStep2} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Voltar
                </Button>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {currentReportIndex + 1} de {multipleReportsData.length} relatórios
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={currentReportIndex === 0} onClick={() => setCurrentReportIndex(prev => prev - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={currentReportIndex === multipleReportsData.length - 1} onClick={() => setCurrentReportIndex(prev => prev + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleDownloadZip} disabled={isLoading} variant="outline" className="gap-2">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
                    Baixar todos (.zip)
                  </Button>
                  {!isOwner && (
                    <Button onClick={() => setCurrentStep(4)} className="gap-2">
                      <Send className="h-4 w-4" />
                      Publicar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div ref={reportViewRef}>
            <FinancialReportView data={multipleReportsData[currentReportIndex]} onBack={handleBackToStep2} hideBackButton />
          </div>
        </div>
      );
    }
  }

  // Step 4: Owner Association
  if (currentStep === 4) {
    const reportsForAssoc = getReportsForAssociation();
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setCurrentStep(3)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Publicar Relatórios</h1>
              <p className="text-sm text-muted-foreground">Associe cada relatório ao proprietário correto</p>
            </div>
          </div>
          <ReportStepIndicator steps={STEPS} currentStep={4} />
          <ReportOwnerAssociation
            reports={reportsForAssoc}
            onBack={() => setCurrentStep(3)}
            onPublished={() => {
              toast.success('Relatório(s) publicado(s) com sucesso!');
              handleNewReport();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => currentStep === 1 ? navigate(-1) : (currentStep === 2 ? handleBackToStep1() : handleBackToStep2())}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatório Financeiro</h1>
            <p className="text-sm text-muted-foreground">Gere relatórios a partir de exportações do Talkguest</p>
          </div>
        </div>

        <ReportStepIndicator steps={STEPS} currentStep={currentStep} />

        {/* Step 1: Upload and Selection */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Upload card */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Upload dos Arquivos</h2>
                  <p className="text-sm text-muted-foreground">Carregue os arquivos exportados da Talkguest (múltiplos permitidos)</p>
                </div>
              </div>
              <ReportFileUpload
                onFilesSelect={handleFilesSelect}
                selectedFiles={selectedFiles}
                onRemoveFile={handleRemoveFile}
                onClear={handleClearFiles}
                isLoading={isLoading}
              />
            </div>

            {/* Property and date selection */}
            {parsedFile && (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Seleção de Imóveis e Período</h2>
                    <p className="text-sm text-muted-foreground">
                      {parsedFile.properties.length} imóveis encontrados • {parsedFile.reservations.length} reservas
                    </p>
                  </div>
                </div>

                <div className="grid gap-6">
                  {/* Property selection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Imóveis (selecione um ou mais)</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={handleSelectAllProperties} className="text-xs">
                          Selecionar todos
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDeselectAllProperties} className="text-xs">
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1">
                      {parsedFile.properties.map((property) => {
                        const isSelected = selectedProperties.includes(property);
                        const reservationCount = parsedFile.reservations.filter(r => r.property_name === property).length;
                        const customCommission = propertyCommissions[property];
                        const isEditing = editingPropertyCommission === property;

                        return (
                          <div
                            key={property}
                            className={cn(
                              'flex flex-col p-3 rounded-lg border transition-all',
                              isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/50'
                            )}
                          >
                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleToggleProperty(property)}>
                              <div className={cn(
                                'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                                isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                              )}>
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{property}</p>
                                <p className="text-xs text-muted-foreground">{reservationCount} reservas</p>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                {isEditing ? (
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      defaultValue={customCommission ?? commissionPercentage}
                                      className="h-7 w-20 text-sm"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const value = parseFloat((e.target as HTMLInputElement).value);
                                          if (!isNaN(value) && value >= 0 && value <= 100) handleSetPropertyCommission(property, value);
                                        } else if (e.key === 'Escape') setEditingPropertyCommission(null);
                                      }}
                                      onBlur={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value >= 0 && value <= 100) handleSetPropertyCommission(property, value);
                                        else setEditingPropertyCommission(null);
                                      }}
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingPropertyCommission(null)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div
                                    className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1"
                                    onClick={(e) => { e.stopPropagation(); setEditingPropertyCommission(property); }}
                                  >
                                    <span className="text-xs text-muted-foreground">
                                      Comissão:
                                      <span className={cn("ml-1 font-medium", customCommission !== undefined ? "text-primary" : "text-foreground")}>
                                        {customCommission ?? commissionPercentage}%
                                      </span>
                                      {customCommission !== undefined && <span className="ml-1 text-primary">(personalizada)</span>}
                                    </span>
                                    <Pencil className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selectedProperties.length > 0 && (
                      <p className="text-sm text-primary font-medium">
                        {selectedProperties.length} imóvel(is) selecionado(s)
                      </p>
                    )}
                  </div>

                  {/* Report mode selection */}
                  {selectedProperties.length > 1 && (
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                      <Label>Como deseja gerar os relatórios?</Label>
                      <RadioGroup value={reportMode} onValueChange={(v) => setReportMode(v as ReportMode)} className="space-y-2">
                        <div
                          className={cn(
                            'flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                            reportMode === 'combined' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                          )}
                          onClick={() => setReportMode('combined')}
                        >
                          <RadioGroupItem value="combined" id="combined" />
                          <div className="flex-1">
                            <Label htmlFor="combined" className="cursor-pointer font-medium">Relatório único combinado</Label>
                            <p className="text-xs text-muted-foreground">Todos os imóveis em um único relatório</p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                            reportMode === 'separate_zip' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                          )}
                          onClick={() => setReportMode('separate_zip')}
                        >
                          <RadioGroupItem value="separate_zip" id="separate_zip" />
                          <div className="flex-1">
                            <Label htmlFor="separate_zip" className="cursor-pointer font-medium flex items-center gap-2">
                              Relatórios separados
                              <FileArchive className="h-4 w-4 text-muted-foreground" />
                            </Label>
                            <p className="text-xs text-muted-foreground">Um relatório por imóvel, com opção de baixar em .zip</p>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {/* Filters */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="includeCancelled" checked={includeCancelled} onCheckedChange={(checked) => setIncludeCancelled(!!checked)} />
                      <Label htmlFor="includeCancelled" className="cursor-pointer">Incluir reservas canceladas</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="useAllDates" checked={useAllDates} onCheckedChange={(checked) => setUseAllDates(!!checked)} />
                      <Label htmlFor="useAllDates" className="cursor-pointer">Usar todas as datas do arquivo</Label>
                    </div>
                    {!useAllDates && (
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Data início (check-in)</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {startDate ? format(startDate, 'dd/MM/yyyy') : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>Data fim (check-in)</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {endDate ? format(endDate, 'dd/MM/yyyy') : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button onClick={handleAdvanceToStep2} disabled={selectedProperties.length === 0} className="gap-2">
                    Avançar
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configuration */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Configuração do Relatório</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedProperties.length === 1
                      ? selectedProperties[0]
                      : `${selectedProperties.length} imóveis selecionados`}
                  </p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="commission">Percentual de comissão da gestão (%)</Label>
                  <Input
                    id="commission"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={commissionPercentage}
                    onChange={(e) => setCommissionPercentage(parseFloat(e.target.value) || 0)}
                    className="max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">Ex.: 22 para 22% de comissão</p>
                </div>

                <div className="space-y-3">
                  <Label>Tipo de relatório</Label>
                  <RadioGroup value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="space-y-2">
                    {reportTypeOptions.map((type) => (
                      <div
                        key={type.value}
                        className={cn(
                          'flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                          reportType === type.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        )}
                        onClick={() => setReportType(type.value)}
                      >
                        <RadioGroupItem value={type.value} id={type.value} />
                        <div className="flex-1">
                          <Label htmlFor={type.value} className="cursor-pointer font-medium">{type.label}</Label>
                          <p className="text-xs text-muted-foreground">{type.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Reservas Confirmadas</h2>
                  <p className="text-sm text-muted-foreground">{selectedCount} de {filteredReservations.length} selecionadas</p>
                </div>
              </div>
              <ReportReservationsTable
                reservations={filteredReservations}
                onToggleReservation={handleToggleReservation}
                onToggleAll={handleToggleAllReservations}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleBackToStep1} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleGenerateReport} disabled={selectedCount === 0} className="gap-2">
                <Eye className="h-4 w-4" />
                Gerar Relatório{selectedProperties.length > 1 && reportMode === 'separate_zip' ? 's' : ''}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
