import { ReportData, CalculatedReservation } from '@/lib/report-types';
import { formatReportCurrency, formatReportDate, getReportTypeLabel } from '@/lib/report-calculations';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, TrendingUp, Download, Home, Moon, DollarSign, BarChart3, Calendar, Ticket, BedDouble, Star, Percent, Wallet, Sparkles, Users, Diamond } from 'lucide-react';
import logo from '@/assets/logo-rios.png';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { exportElementAsPdf } from '@/lib/report-export-pdf';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ReportViewProps {
  data: ReportData;
  onBack: () => void;
  hideBackButton?: boolean;
  forcePrintMode?: boolean;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  shortLabel: string;
  reservations: CalculatedReservation[];
  totals: {
    totalManagementCommission: number;
    totalOwnerNet: number;
    totalCleaning: number;
    totalBase: number;
    totalGeneral: number;
    reservationCount: number;
  };
}

const CHART_PRINT_W = 700;
const CHART_PRINT_H = 220;

const formatBarLabel = (v: number) => 'R$ ' + (v / 1000).toFixed(1) + 'k';
const formatYAxis = (v: number) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v);

const SectionSeparator = ({ title }: { title: string }) => (
  <div className="flex items-center gap-0 mb-4">
    <div className="w-12 h-px" style={{ backgroundColor: '#C0522B' }} />
    <div className="flex items-center justify-center w-5">
      <Diamond className="h-2.5 w-2.5" style={{ color: '#C0522B', fill: '#C0522B' }} />
    </div>
    <h3 className="px-3 whitespace-nowrap" style={{ fontVariant: 'small-caps', letterSpacing: '1.5px', color: '#8B3A1F', fontWeight: 700, fontSize: '12px' }}>{title}</h3>
    <div className="flex items-center justify-center w-5">
      <Diamond className="h-2.5 w-2.5" style={{ color: '#C0522B', fill: '#C0522B' }} />
    </div>
    <div className="flex-1 h-px bg-border" />
  </div>
);

const formatFooterDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const SUMMARY_ICON_MAP: Record<string, React.ComponentType<any>> = {
  'Total Comissão Gestão': Percent,
  'Total da Comissão da Gestão': Percent,
  'Total Líquido Proprietário': Wallet,
  'Total Limpeza': Sparkles,
  'Receita Total': DollarSign,
  'Total Base (Diárias Líquidas)': DollarSign,
  'Total Geral': DollarSign,
};

// Mobile card for a single reservation row
const ReservationCard = ({ reservation, reportType, getNights }: { reservation: CalculatedReservation; reportType: string; getNights: (r: CalculatedReservation) => number }) => {
  const nights = getNights(reservation);
  if (reportType === 'owner') {
    return (
      <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-card">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-foreground truncate mr-2">{reservation.guest_name || '—'}</span>
          <span className="font-bold text-sm shrink-0" style={{ color: '#C0522B' }}>{formatReportCurrency(reservation.ownerNet)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{formatReportDate(reservation.checkin_date)} → {formatReportDate(reservation.checkout_date)}</span>
          <span>{nights} noite{nights !== 1 ? 's' : ''}</span>
          <span>{reservation.channel || 'Direto'}</span>
        </div>
      </div>
    );
  }
  // Non-owner types
  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatReportDate(reservation.checkin_date)} → {formatReportDate(reservation.checkout_date)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Vlr Reserva: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.reservation_value)}</span></div>
        <div><span className="text-muted-foreground">Com. Canal: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.channel_commission)}</span></div>
        <div><span className="text-muted-foreground">Tx Limp.: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.cleaning_fee)}</span></div>
        <div><span className="text-muted-foreground">Base: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.base)}</span></div>
        {(reportType === 'management' || reportType === 'management_cleaning' || reportType === 'owner_management' || reportType === 'owner_management_cleaning') && (
          <div><span className="text-muted-foreground">Com. Gestão: </span><span className="font-bold" style={{ color: '#C0522B' }}>{formatReportCurrency(reservation.managementCommission)}</span></div>
        )}
        {(reportType === 'owner_management' || reportType === 'owner_management_cleaning') && (
          <div><span className="text-muted-foreground">Líq. Prop.: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.ownerNet)}</span></div>
        )}
        {(reportType === 'management_cleaning' || reportType === 'owner_management_cleaning') && (
          <div><span className="text-muted-foreground">Limpeza: </span><span className="font-medium text-foreground">{formatReportCurrency(reservation.cleaning)}</span></div>
        )}
      </div>
      {(reportType === 'owner_management' || reportType === 'owner_management_cleaning') && (
        <div className="text-right pt-1 border-t border-border/30">
          <span className="text-xs text-muted-foreground mr-1">Total:</span>
          <span className="font-bold text-sm" style={{ color: '#C0522B' }}>
            {formatReportCurrency(reportType === 'owner_management_cleaning' ? reservation.totalGeneral : reservation.totalBase)}
          </span>
        </div>
      )}
    </div>
  );
};

export function FinancialReportView({ data, onBack, hideBackButton = false, forcePrintMode = false }: ReportViewProps) {
  const { config, reservations, totals, generatedAt } = data;
  const reportContentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [_isPrinting, setIsPrinting] = useState(false);
  const [observation, setObservation] = useState('');
  const isPrinting = forcePrintMode || _isPrinting;
  const useStaticExportLayout = forcePrintMode;

  useEffect(() => {
    const before = () => setIsPrinting(true);
    const after = () => setIsPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const handlePrint = () => {
    setIsPrinting(true);
    requestAnimationFrame(() => { requestAnimationFrame(() => { window.print(); }); });
  };

  const handleExportPdf = async () => {
    if (!reportContentRef.current) return;
    setIsExporting(true);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise(r => setTimeout(r, 200));
    try {
      const safeName = config.propertyName.replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '_');
      await exportElementAsPdf(reportContentRef.current, `Relatorio_${safeName}.pdf`, (msg) => toast.loading(msg, { id: 'pdf-export' }));
      toast.success('PDF exportado com sucesso!', { id: 'pdf-export' });
    } catch {
      toast.error('Erro ao gerar PDF', { id: 'pdf-export' });
    } finally {
      setIsExporting(false);
    }
  };

  const actualDateRange = useMemo(() => {
    if (reservations.length === 0) return { start: '', end: '' };
    const dates = reservations.map(r => new Date(r.checkin_date)).sort((a, b) => a.getTime() - b.getTime());
    return { start: formatReportDate(dates[0]), end: formatReportDate(dates[dates.length - 1]) };
  }, [reservations]);

  const monthGroups = useMemo(() => {
    const groups: Record<string, MonthGroup> = {};
    reservations.forEach(r => {
      const date = new Date(r.checkin_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const shortLabel = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
      if (!groups[monthKey]) {
        groups[monthKey] = { monthKey, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), shortLabel, reservations: [], totals: { totalManagementCommission: 0, totalOwnerNet: 0, totalCleaning: 0, totalBase: 0, totalGeneral: 0, reservationCount: 0 } };
      }
      groups[monthKey].reservations.push(r);
      groups[monthKey].totals.totalManagementCommission += r.managementCommission;
      groups[monthKey].totals.totalOwnerNet += r.ownerNet;
      groups[monthKey].totals.totalCleaning += r.cleaning;
      groups[monthKey].totals.totalBase += r.base;
      groups[monthKey].totals.totalGeneral += r.totalGeneral;
      groups[monthKey].totals.reservationCount += 1;
    });
    return Object.values(groups).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [reservations]);

  const kpis = useMemo(() => {
    const nightsPerRes = reservations.map(r => {
      const n = Math.round((new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / 86400000);
      return n > 0 ? n : 1;
    });
    const totalNights = nightsPerRes.reduce((s, n) => s + n, 0);
    const avgStay = totals.reservationCount > 0 ? +(totalNights / totals.reservationCount).toFixed(1) : 0;
    const mainRevenue = (() => {
      switch (config.reportType) {
        case 'management': return totals.totalManagementCommission;
        case 'management_cleaning': return totals.totalManagementCommission + totals.totalCleaning;
        case 'owner': return totals.totalOwnerNet;
        case 'owner_management': return totals.totalBase;
        case 'owner_management_cleaning': return totals.totalGeneral;
        default: return 0;
      }
    })();
    const avgNightly = totalNights > 0 ? mainRevenue / totalNights : 0;
    const avgPerBooking = totals.reservationCount > 0 ? mainRevenue / totals.reservationCount : 0;
    const sorted = [...reservations].sort((a, b) => new Date(a.checkin_date).getTime() - new Date(b.checkin_date).getTime());
    const periodDays = sorted.length > 0 ? Math.max(1, Math.round((new Date(sorted[sorted.length - 1].checkout_date).getTime() - new Date(sorted[0].checkin_date).getTime()) / 86400000)) : 1;
    const occupancy = Math.min(100, Math.round((totalNights / periodDays) * 100));
    const revpar = periodDays > 0 ? mainRevenue / periodDays : 0;
    const bestMonth = monthGroups.length > 0 ? [...monthGroups].sort((a, b) => {
      const getVal = (g: MonthGroup) => { switch(config.reportType) { case 'management': return g.totals.totalManagementCommission; case 'owner': return g.totals.totalOwnerNet; default: return g.totals.totalGeneral; } };
      return getVal(b) - getVal(a);
    })[0] : null;
    const channelMap: Record<string, { revenue: number; count: number; nights: number }> = {};
    reservations.forEach((r, i) => {
      const ch = r.channel || 'Direto';
      if (!channelMap[ch]) channelMap[ch] = { revenue: 0, count: 0, nights: 0 };
      channelMap[ch].revenue += r.ownerNet;
      channelMap[ch].count += 1;
      channelMap[ch].nights += nightsPerRes[i];
    });
    const channels = Object.entries(channelMap).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue);
    const topChannel = channels.length > 0 ? channels[0] : null;
    return { totalNights, avgNightly, avgPerBooking, occupancy, avgStay, revpar, bestMonth, topChannel, channels, periodDays, mainRevenue };
  }, [reservations, totals, monthGroups, config]);

  const chartData = useMemo(() => {
    return monthGroups.map(group => {
      let value = 0;
      switch (config.reportType) {
        case 'management': value = group.totals.totalManagementCommission; break;
        case 'management_cleaning': value = group.totals.totalManagementCommission + group.totals.totalCleaning; break;
        case 'owner': value = group.totals.totalOwnerNet; break;
        case 'owner_management': value = group.totals.totalBase; break;
        case 'owner_management_cleaning': value = group.totals.totalGeneral; break;
      }
      const totalNights = group.reservations.reduce((sum, r) => {
        const n = Math.round((new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / 86400000);
        return sum + (n > 0 ? n : 1);
      }, 0);
      return { name: group.shortLabel, fullName: group.monthLabel, value, reservations: group.totals.reservationCount, avgNightly: totalNights > 0 ? value / totalNights : 0, totalNights };
    });
  }, [monthGroups, config.reportType]);

  const getMainValueLabel = () => {
    switch (config.reportType) {
      case 'management': return 'Comissão Gestão';
      case 'management_cleaning': return 'Gestão + Limpeza';
      case 'owner': return 'Receita';
      case 'owner_management': return 'Total Base';
      case 'owner_management_cleaning': return 'Total Geral';
      default: return 'Total';
    }
  };

  const getColumns = () => {
    switch (config.reportType) {
      case 'management': return ['CHECK-IN', 'CHECK-OUT', 'VLR RESERVA', 'COM. CANAL', 'TX LIMP.', 'BASE', 'COM. GESTAO'];
      case 'management_cleaning': return ['CHECK-IN', 'CHECK-OUT', 'VLR RESERVA', 'COM. CANAL', 'TX LIMP.', 'COM. GESTAO', 'LIMPEZA'];
      case 'owner': return ['HOSPEDE', 'CHECK-IN', 'CHECK-OUT', 'NOITES', 'CANAL', 'RECEITA'];
      case 'owner_management': return ['CHECK-IN', 'CHECK-OUT', 'VLR RESERVA', 'COM. CANAL', 'TX LIMP.', 'COM. GESTAO', 'LIQ. PROP.', 'TOTAL'];
      case 'owner_management_cleaning': return ['CHECK-IN', 'CHECK-OUT', 'VLR RESERVA', 'COM. CANAL', 'TX LIMP.', 'COM. GESTAO', 'LIQ. PROP.', 'LIMPEZA', 'TOTAL'];
      default: return [];
    }
  };

  const getNights = (r: CalculatedReservation): number => {
    const diff = new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime();
    const nights = Math.round(diff / (1000 * 60 * 60 * 24));
    return nights > 0 ? nights : 1;
  };

  const getRowValues = (r: CalculatedReservation) => {
    const base = [formatReportDate(r.checkin_date), formatReportDate(r.checkout_date), formatReportCurrency(r.reservation_value), formatReportCurrency(r.channel_commission), formatReportCurrency(r.cleaning_fee)];
    switch (config.reportType) {
      case 'management': return [...base, formatReportCurrency(r.base), formatReportCurrency(r.managementCommission)];
      case 'management_cleaning': return [...base, formatReportCurrency(r.managementCommission), formatReportCurrency(r.cleaning)];
      case 'owner': return [r.guest_name || '—', formatReportDate(r.checkin_date), formatReportDate(r.checkout_date), `${getNights(r)} noite${getNights(r) !== 1 ? 's' : ''}`, r.channel || '—', formatReportCurrency(r.ownerNet)];
      case 'owner_management': return [...base, formatReportCurrency(r.managementCommission), formatReportCurrency(r.ownerNet), formatReportCurrency(r.totalBase)];
      case 'owner_management_cleaning': return [...base, formatReportCurrency(r.managementCommission), formatReportCurrency(r.ownerNet), formatReportCurrency(r.cleaning), formatReportCurrency(r.totalGeneral)];
      default: return base;
    }
  };

  const getMonthTotal = (monthTotals: MonthGroup['totals']) => {
    switch (config.reportType) {
      case 'management': return { label: 'Comissão Gestão', value: monthTotals.totalManagementCommission };
      case 'management_cleaning': return { label: 'Gestão + Limpeza', value: monthTotals.totalManagementCommission + monthTotals.totalCleaning };
      case 'owner': return { label: 'Receita', value: monthTotals.totalOwnerNet };
      case 'owner_management': return { label: 'Total Base', value: monthTotals.totalBase };
      case 'owner_management_cleaning': return { label: 'Total Geral', value: monthTotals.totalGeneral };
      default: return { label: 'Total', value: 0 };
    }
  };

  const getSummary = () => {
    switch (config.reportType) {
      case 'management': return [{ label: 'Total da Comissão da Gestão', value: totals.totalManagementCommission, highlight: true }];
      case 'management_cleaning': return [{ label: 'Total Comissão Gestão', value: totals.totalManagementCommission }, { label: 'Total Limpeza', value: totals.totalCleaning }, { label: 'Total Recebido (Gestão + Limpeza)', value: totals.totalManagementCommission + totals.totalCleaning, highlight: true }];
      case 'owner': return [{ label: 'Receita Total', value: totals.totalOwnerNet, highlight: true }];
      case 'owner_management': return [{ label: 'Total Comissão Gestão', value: totals.totalManagementCommission }, { label: 'Total Líquido Proprietário', value: totals.totalOwnerNet }, { label: 'Total Base (Diárias Líquidas)', value: totals.totalBase, highlight: true }];
      case 'owner_management_cleaning': return [{ label: 'Total Comissão Gestão', value: totals.totalManagementCommission }, { label: 'Total Líquido Proprietário', value: totals.totalOwnerNet }, { label: 'Total Limpeza', value: totals.totalCleaning }, { label: 'Total Geral', value: totals.totalGeneral, highlight: true }];
      default: return [];
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-card border rounded-xl px-5 py-4 shadow-xl" style={{ borderColor: 'rgba(192, 82, 43, 0.3)' }}>
          <p className="font-bold text-sm mb-2" style={{ color: '#8B3A1F' }}>{d.fullName}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-6"><span className="text-xs text-muted-foreground">Receita</span><span className="text-sm font-bold">{formatReportCurrency(d.value)}</span></div>
            <div className="flex justify-between gap-6"><span className="text-xs text-muted-foreground">Reservas</span><span className="text-sm font-semibold">{d.reservations}</span></div>
            <div className="flex justify-between gap-6"><span className="text-xs text-muted-foreground">Diária Média</span><span className="text-sm font-semibold" style={{ color: '#C0522B' }}>{formatReportCurrency(d.avgNightly)}</span></div>
            <div className="flex justify-between gap-6"><span className="text-xs text-muted-foreground">Noites</span><span className="text-sm font-semibold">{d.totalNights}</span></div>
          </div>
        </div>
      );
    }
    return null;
  };

  const columns = getColumns();
  const summary = getSummary();
  const dateRangeText = reservations.length > 0 ? `${actualDateRange.start} a ${actualDateRange.end}` : 'Sem reservas';
  const getGrandTotal = () => {
    switch (config.reportType) {
      case 'management': return totals.totalManagementCommission;
      case 'management_cleaning': return totals.totalManagementCommission + totals.totalCleaning;
      case 'owner': return totals.totalOwnerNet;
      case 'owner_management': return totals.totalBase;
      case 'owner_management_cleaning': return totals.totalGeneral;
      default: return 0;
    }
  };
  const maxChartIdx = chartData.reduce((best, d, i) => (d.value > (chartData[best]?.value ?? 0) ? i : best), 0);
  const CHART_COLOR_SOLID = '#C0522B';
  const CHART_COLOR_LIGHT = 'rgba(192, 82, 43, 0.35)';
  const getBarColor = (index: number) => index === maxChartIdx ? CHART_COLOR_SOLID : CHART_COLOR_LIGHT;

  const renderChart = () => {
    if (chartData.length <= 1) return null;
    return (
      <div className="mb-8">
        <SectionSeparator title={config.reportType === 'owner' ? 'Receita por Mês' : 'Desempenho Mensal'} />
        <div className="rounded-xl" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderRadius: '12px', overflow: 'hidden' }}>
          <div className={isPrinting ? '' : 'h-64 w-full'}>
            {isPrinting ? (
              <BarChart width={CHART_PRINT_W} height={CHART_PRINT_H} data={chartData} margin={{ top: 25, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={formatYAxis} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" fontSize={10} fill="#8B3A1F" formatter={formatBarLabel} />
                  {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={getBarColor(index)} />)}
                </Bar>
              </BarChart>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 25, right: 5, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" position="top" fontSize={9} fill="#8B3A1F" formatter={formatBarLabel} />
                    {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={getBarColor(index)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  };

  const isOwnerType = config.reportType === 'owner';

  return (
    <div className="min-h-screen bg-background">
      {!hideBackButton && (
        <div className="no-print sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
          <div className="container max-w-5xl px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Voltar</span></Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="h-4 w-4" /><span className="hidden sm:inline">Imprimir</span></Button>
                <Button size="sm" onClick={handleExportPdf} disabled={isExporting} className="gap-1.5">
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">Salvar PDF</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-5xl px-2 sm:px-6 py-4 sm:py-8">
        <div ref={reportContentRef} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          {isOwnerType ? (
            <>
              {/* Owner header - mobile stacked */}
              <div className="px-4 sm:px-8 py-5 sm:py-7 bg-foreground text-background">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-background/10 rounded-xl p-2"><img src={logo} alt="Rios Hospedagens" className="h-7 sm:h-9 w-auto" /></div>
                    <div><h1 className="text-lg sm:text-xl font-bold text-background">Rios Hospedagens</h1><p className="text-xs sm:text-sm text-background/60">Extrato do Proprietário</p></div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest px-2 sm:px-3 py-1 rounded-full border border-background/20" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>Confidencial</span>
                    <div className="text-right text-xs sm:text-sm"><p className="text-background/60">Emitido em</p><p className="font-semibold text-background">{formatReportDate(generatedAt)}</p></div>
                  </div>
                </div>
              </div>
              {/* Property & period bar */}
              <div className="px-4 sm:px-8 py-4 sm:py-5 bg-primary/5 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0"><Home className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /></div>
                    <div><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Imóvel</p><p className="text-base sm:text-lg font-bold text-foreground">{config.propertyName}</p></div>
                  </div>
                  <div className="sm:ml-auto text-left sm:text-right"><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Período</p><p className="font-semibold text-sm sm:text-base text-foreground">{dateRangeText}</p></div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Non-owner header */}
              <div className="bg-primary px-4 sm:px-8 py-5 sm:py-6 text-primary-foreground">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary-foreground rounded-lg p-2"><img src={logo} alt="Rios Hospedagens" className="h-7 sm:h-8 w-auto" /></div>
                    <div><h1 className="text-lg sm:text-xl font-bold">Rios Hospedagens</h1><p className="text-xs sm:text-sm text-primary-foreground/80">Relatórios Financeiros</p></div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest px-2 sm:px-3 py-1 rounded-full border border-primary-foreground/20" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>Confidencial</span>
                    <div className="text-right text-xs sm:text-sm"><p className="text-primary-foreground/80">Gerado em</p><p className="font-medium">{formatReportDate(generatedAt)}</p></div>
                  </div>
                </div>
              </div>
              {/* Non-owner meta bar */}
              <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border bg-muted/30">
                <div className="rounded-lg p-3 sm:p-4 bg-muted/50">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-0">
                    <div className="sm:px-4 sm:first:pl-0"><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Imóvel</p><p className="font-semibold text-sm sm:text-base text-foreground mt-0.5">{config.propertyName}</p></div>
                    <div className="sm:px-4 sm:border-l sm:border-border"><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Período</p><p className="font-medium text-sm sm:text-base text-foreground mt-0.5">{dateRangeText}</p></div>
                    <div className="sm:px-4 sm:border-l sm:border-border"><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Comissão Gestão</p><p className="font-semibold text-sm sm:text-base text-foreground mt-0.5">{config.commissionPercentage}%</p></div>
                    <div className="sm:px-4 sm:border-l sm:border-border"><p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Tipo</p><p className="font-medium text-sm sm:text-base text-foreground mt-0.5">{getReportTypeLabel(config.reportType)}</p></div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Executive Summary */}
          <div data-pdf-section="summary" className="px-4 sm:px-8 py-6 sm:py-8 border-b border-border">
            {isOwnerType ? (
              <>
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className="p-2 bg-primary/10 rounded-lg"><TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /></div>
                  <div><h2 className="text-base sm:text-lg font-semibold text-foreground">Resumo do Período</h2><p className="text-xs sm:text-sm text-muted-foreground">Receita líquida das suas reservas</p></div>
                </div>
                {/* Main revenue card */}
                <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 sm:p-6 mb-5">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Receita Total do Período</p>
                    <p className="text-3xl sm:text-4xl font-bold text-foreground">{formatReportCurrency(totals.totalOwnerNet)}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">{totals.reservationCount} reservas · {dateRangeText}</p>
                  </div>
                </div>
                {/* KPI grid - 2 cols on mobile, 3 on desktop */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
                  {[
                    { label: 'Diária Média (ADR)', value: formatReportCurrency(kpis.avgNightly), sub: 'receita / noite', icon: DollarSign },
                    { label: 'RevPAR', value: formatReportCurrency(kpis.revpar), sub: 'receita / dia disponível', icon: BarChart3 },
                    { label: 'Ticket Médio', value: formatReportCurrency(kpis.avgPerBooking), sub: 'por reserva', icon: Ticket },
                    { label: 'Estadia Média', value: `${kpis.avgStay} noites`, sub: 'por hóspede', icon: BedDouble },
                    { label: 'Total Noites', value: `${kpis.totalNights}`, sub: `de ${kpis.periodDays} dias no período`, icon: Calendar },
                    ...(kpis.topChannel ? [{ label: 'Canal Top', value: kpis.topChannel.name, sub: `${kpis.topChannel.count} reservas · ${formatReportCurrency(kpis.topChannel.revenue)}`, icon: Star }] : []),
                  ].map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                      <div key={i} className="rounded-xl border border-border bg-card p-3 sm:p-4 relative" style={{ borderLeft: '4px solid #C0522B', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 rounded-lg p-1 sm:p-1.5" style={{ backgroundColor: 'rgba(192, 82, 43, 0.08)' }}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: '#C0522B' }} /></div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 sm:mb-1 pr-6">{kpi.label}</p>
                        <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{kpi.value}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{kpi.sub}</p>
                      </div>
                    );
                  })}
                </div>
                {/* Channels */}
                {kpis.channels.length > 1 && (
                  <div className="mb-6 sm:mb-8">
                    <SectionSeparator title="Receita por Canal" />
                    <div className="space-y-2">
                      {kpis.channels.map(ch => {
                        const pct = kpis.mainRevenue > 0 ? Math.round((ch.revenue / kpis.mainRevenue) * 100) : 0;
                        return (
                          <div key={ch.name} className="flex items-center gap-2 sm:gap-3">
                            <span className="text-xs sm:text-sm font-medium text-foreground w-16 sm:w-24 shrink-0 truncate">{ch.name}</span>
                            <div className="flex-1 h-2.5 sm:h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                            <span className="text-[10px] sm:text-sm text-muted-foreground shrink-0 text-right">{formatReportCurrency(ch.revenue)} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Best month */}
                {kpis.bestMonth && monthGroups.length > 1 && (
                  <div className="rounded-xl border border-border bg-accent/10 p-3 sm:p-4 mb-6 sm:mb-8 flex items-center gap-3">
                    <span className="text-xl sm:text-2xl">🏆</span>
                    <div><p className="text-xs sm:text-sm font-semibold text-foreground">Melhor mês: {kpis.bestMonth.monthLabel}</p><p className="text-[10px] sm:text-xs text-muted-foreground">{kpis.bestMonth.totals.reservationCount} reservas · {formatReportCurrency(kpis.bestMonth.totals.totalOwnerNet)}</p></div>
                  </div>
                )}
                {renderChart()}
                {/* Month summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {monthGroups.map((group) => {
                    const monthTotal = getMonthTotal(group.totals);
                    const monthNights = group.reservations.reduce((sum, r) => { const n = Math.round((new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / 86400000); return sum + (n > 0 ? n : 1); }, 0);
                    return (
                      <div key={group.monthKey} className="rounded-xl border border-border bg-card p-3 sm:p-4" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                        <div className="flex items-center gap-2 mb-2 sm:mb-3"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#C0522B' }} /><p className="font-semibold text-sm sm:text-base text-foreground">{group.monthLabel}</p></div>
                        <p className="text-xl sm:text-2xl font-bold text-foreground">{formatReportCurrency(monthTotal.value)}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(192, 82, 43, 0.1)', color: '#C0522B' }}>{group.totals.reservationCount} reservas</span>
                          <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(192, 82, 43, 0.1)', color: '#C0522B' }}><span className="inline-flex items-center gap-1"><Moon className="h-3 w-3" />{monthNights} noites</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5 sm:mb-6"><div className="p-2 bg-primary/10 rounded-lg"><TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /></div><div><h2 className="text-base sm:text-lg font-semibold text-foreground">Resumo Executivo</h2><p className="text-xs sm:text-sm text-muted-foreground">Desempenho mês a mês</p></div></div>
                <div className="bg-primary rounded-xl p-4 sm:p-6 text-primary-foreground mb-6 sm:mb-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div><p className="text-primary-foreground/80 text-xs sm:text-sm">{getMainValueLabel()} - Total do Período</p><p className="text-2xl sm:text-3xl font-bold mt-1">{formatReportCurrency(getGrandTotal())}</p><p className="text-primary-foreground/70 text-xs sm:text-sm mt-1">{totals.reservationCount} reservas</p></div>
                    <div className="sm:text-right"><p className="text-primary-foreground/80 text-xs sm:text-sm">Período</p><p className="font-medium text-sm sm:text-base mt-0.5">{dateRangeText}</p></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
                  {[
                    { label: 'Diária Média', value: formatReportCurrency(kpis.avgNightly), sub: 'por noite', icon: DollarSign },
                    { label: 'Estadia Média', value: `${kpis.avgStay} noites`, sub: 'por hóspede', icon: BedDouble },
                    { label: 'Ticket Médio', value: formatReportCurrency(kpis.avgPerBooking), sub: 'por reserva', icon: Ticket },
                  ].map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                      <div key={i} className="rounded-lg p-3 sm:p-4 border border-border/50 bg-card relative" style={{ borderLeft: '4px solid #C0522B', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 rounded-lg p-1 sm:p-1.5" style={{ backgroundColor: 'rgba(192, 82, 43, 0.08)' }}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: '#C0522B' }} /></div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-0.5 sm:mb-1 pr-6">{kpi.label}</p>
                        <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{kpi.value}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">{kpi.sub}</p>
                      </div>
                    );
                  })}
                </div>
                {renderChart()}
                <div>
                  <SectionSeparator title="Totais por Mês" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {monthGroups.map((group) => {
                      const monthTotal = getMonthTotal(group.totals);
                      return (
                        <div key={group.monthKey} className="bg-muted/50 p-3 sm:p-4 border border-border/50 rounded-xl" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                          <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#C0522B' }} /><p className="font-medium text-sm sm:text-base text-foreground">{group.monthLabel}</p></div>
                          <p className="text-xl sm:text-2xl font-bold text-foreground">{formatReportCurrency(monthTotal.value)}</p>
                          <span className="inline-block text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full mt-2" style={{ backgroundColor: 'rgba(192, 82, 43, 0.1)', color: '#C0522B' }}>{group.totals.reservationCount} reservas</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* General Summary */}
          <div data-pdf-section="resumo-geral" className="px-4 sm:px-8 py-5 sm:py-6 border-b border-border">
            <SectionSeparator title={`Resumo Geral (${totals.reservationCount} reservas)`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {summary.map((item, idx) => {
                const SummaryIcon = SUMMARY_ICON_MAP[item.label];
                return (
                  <div key={idx} className={`rounded-lg p-3 sm:p-4 relative ${item.highlight ? 'text-white' : 'bg-muted/50'}`}
                    style={item.highlight ? { background: 'linear-gradient(135deg, #C0522B 0%, #A8431F 100%)', boxShadow: '0 4px 12px rgba(192, 82, 43, 0.3)' } : { borderTop: '3px solid #C0522B', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    {!item.highlight && SummaryIcon && <div className="absolute top-2 right-2 sm:top-3 sm:right-3"><SummaryIcon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#C0522B', opacity: 0.3 }} /></div>}
                    <p className={`text-[10px] sm:text-xs ${item.highlight ? 'text-white/80' : 'text-muted-foreground'}`}>{item.label}</p>
                    <p className={`text-lg sm:text-xl font-bold mt-1 ${item.highlight ? 'text-white' : 'text-foreground'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatReportCurrency(item.value)}</p>
                    {item.highlight && <div className="flex items-center gap-1 mt-1.5 sm:mt-2" style={{ opacity: 0.8 }}><Users className="h-3.5 w-3.5 text-white" /><span className="text-[10px] sm:text-xs text-white">{totals.reservationCount} reservas</span></div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed table by month */}
          <div className="px-4 sm:px-8 py-5 sm:py-6">
            <div data-pdf-section="detalhamento-title"><SectionSeparator title="Detalhamento por Mês" /></div>
            {monthGroups.map((group) => {
              const monthTotal = getMonthTotal(group.totals);
              return (
                <div key={group.monthKey} data-pdf-section={`month-${group.monthKey}`} style={{ marginBottom: '28px' }}>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-1 h-7 sm:h-8 rounded-full" style={{ backgroundColor: '#C0522B' }} />
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#C0522B' }} />
                      <div><h3 className="text-base sm:text-lg font-semibold text-foreground">{group.monthLabel}</h3><p className="text-xs sm:text-sm text-muted-foreground">{group.totals.reservationCount} reservas</p></div>
                    </div>
                  </div>

                  {/* Desktop: table | Mobile: cards */}
                  <div className={isPrinting ? 'block' : 'hidden sm:block'}>
                    <div className="border border-border rounded-lg w-full overflow-x-auto">
                      <table className="w-full table-fixed border-collapse" style={{ fontSize: '10px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'hsl(var(--muted))' }}>
                            {columns.map((col, idx) => (
                              <th key={idx} className={`px-1 py-1 font-semibold border-b border-border text-[10px] uppercase tracking-tight whitespace-nowrap ${isOwnerType ? (idx === columns.length - 1 ? 'text-right' : idx >= 3 ? 'text-right' : 'text-left') : (idx >= 2 ? 'text-right' : 'text-left')}`}
                                style={{ color: '#8B3A1F', ...(idx === columns.length - 1 ? { fontWeight: 700, color: '#C0522B' } : {}), ...(idx === 0 ? { borderLeft: '3px solid #C0522B' } : {}) }}>
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.reservations.map((reservation, rIdx) => {
                            const values = getRowValues(reservation);
                            return (
                              <tr key={reservation.id} className="border-b border-border/30 last:border-0" style={{ backgroundColor: rIdx % 2 === 0 ? 'transparent' : 'hsl(var(--muted) / 0.3)' }}>
                                {values.map((val, vIdx) => {
                                  const isLastCol = vIdx === values.length - 1;
                                  return (
                                    <td key={vIdx} className={`px-1 py-1 text-[10px] ${isOwnerType ? (vIdx === 0 ? 'font-semibold text-foreground' : isLastCol ? 'text-right' : vIdx >= 3 ? 'text-right text-muted-foreground' : 'text-muted-foreground') : `${vIdx >= 2 ? 'text-right' : ''} ${vIdx === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}`}
                                      style={{ fontVariantNumeric: 'tabular-nums', ...(isLastCol ? { fontWeight: 700, color: '#C0522B' } : {}), ...(vIdx === 0 ? { borderLeft: '3px solid #C0522B' } : {}) }}>
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile: card layout */}
                  <div className={isPrinting ? 'hidden' : 'sm:hidden space-y-2'}>
                    {group.reservations.map((reservation) => (
                      <ReservationCard key={reservation.id} reservation={reservation} reportType={config.reportType} getNights={getNights} />
                    ))}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <div className="inline-flex items-center gap-3 sm:gap-4 text-white" style={{ background: 'linear-gradient(135deg, #C0522B 0%, #A8431F 100%)', borderRadius: '8px', padding: '10px 16px', boxShadow: '0 2px 6px rgba(192,82,43,0.3)' }}>
                      <span className="text-xs sm:text-sm font-semibold text-white/90">Total {group.monthLabel}:</span>
                      <span className="text-base sm:text-lg font-bold text-white">{formatReportCurrency(monthTotal.value)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isOwnerType && (
            <div className="px-4 sm:px-8 py-5 sm:py-6 border-t border-border">
              <p className="text-sm font-semibold text-foreground mb-2">Observações</p>
              {isPrinting ? (
                <p className="text-sm text-foreground whitespace-pre-line">{observation.trim() || <span className="text-muted-foreground italic">Sem observações.</span>}</p>
              ) : (
                <textarea className="w-full rounded-lg border border-border bg-background px-3 sm:px-4 py-2 sm:py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[80px]" placeholder="Escreva uma observação para incluir no relatório…" value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} />
              )}
            </div>
          )}

          <div className="px-4 sm:px-8 py-4 border-t border-border bg-muted/30">
            <div style={{ width: '60px', height: '2px', backgroundColor: '#C0522B', margin: '0 auto 8px auto' }} />
            <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.5px' }} className="text-center">
              Rios Hospedagens · Relatório gerado em {formatFooterDate(generatedAt)} · Documento confidencial
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
