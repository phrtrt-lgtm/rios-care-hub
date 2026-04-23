import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Calendar, BarChart3, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, TrendingUp, TrendingDown, BrainCircuit, Wrench, DollarSign, AlertTriangle, FileText
} from "lucide-react";
import { format, differenceInDays, eachDayOfInterval, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface Reservation {
  id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
}

interface Property {
  id: string;
  name: string;
}

type SortField = "name" | "vacant_days" | "occupancy";
type SortDir = "asc" | "desc";

export default function Insights() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const today = new Date();

  const [startDate, setStartDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [sortField, setSortField] = useState<SortField>("vacant_days");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Quick period selectors
  const setPeriod = (months: number) => {
    const start = subMonths(today, months - 1);
    setStartDate(format(startOfMonth(start), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
  };

  const setCurrentMonth = () => {
    setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
  };

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ["insights-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as Property[];
    },
  });

  // Fetch reservations for the date range
  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["insights-reservations", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, property_id, check_in, check_out, guest_name")
        .gte("check_out", startDate)
        .lte("check_in", endDate)
        .order("check_in");
      if (error) throw error;
      return data as Reservation[];
    },
  });

  // Calculate occupancy per property
  const occupancyData = useMemo(() => {
    if (!properties.length) return [];

    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const totalDays = differenceInDays(end, start) + 1;
    if (totalDays <= 0) return [];

    const allDays = eachDayOfInterval({ start, end });

    return properties.map((property) => {
      const propertyReservations = reservations.filter(r => r.property_id === property.id);
      
      // Count occupied days
      const occupiedDays = allDays.filter(day => {
        return propertyReservations.some(r => {
          const checkIn = parseISO(r.check_in);
          const checkOut = parseISO(r.check_out);
          return isWithinInterval(day, { start: checkIn, end: checkOut });
        });
      }).length;

      const vacantDays = totalDays - occupiedDays;
      const occupancyRate = totalDays > 0 ? (occupiedDays / totalDays) * 100 : 0;
      const hasIcal = propertyReservations.length > 0;

      return {
        property,
        totalDays,
        occupiedDays,
        vacantDays,
        occupancyRate,
        reservationCount: propertyReservations.length,
        hasIcal,
      };
    });
  }, [properties, reservations, startDate, endDate]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...occupancyData].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.property.name.localeCompare(b.property.name);
      else if (sortField === "vacant_days") cmp = a.vacantDays - b.vacantDays;
      else if (sortField === "occupancy") cmp = a.occupancyRate - b.occupancyRate;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [occupancyData, sortField, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    const withIcal = occupancyData.filter(d => d.hasIcal);
    const totalVacant = withIcal.reduce((s, d) => s + d.vacantDays, 0);
    const avgOccupancy = withIcal.length > 0
      ? withIcal.reduce((s, d) => s + d.occupancyRate, 0) / withIcal.length
      : 0;
    const worstProperty = withIcal.length > 0
      ? withIcal.reduce((w, d) => d.vacantDays > w.vacantDays ? d : w, withIcal[0])
      : null;
    const bestProperty = withIcal.length > 0
      ? withIcal.reduce((b, d) => d.occupancyRate > b.occupancyRate ? d : b, withIcal[0])
      : null;

    return { withIcalCount: withIcal.length, totalVacant, avgOccupancy, worstProperty, bestProperty };
  }, [occupancyData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 70) return "text-success";
    if (rate >= 40) return "text-warning";
    return "text-destructive";
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 70) return "bg-success";
    if (rate >= 40) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 pb-20 md:pb-0">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center px-4 gap-3">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Insights</h1>
          </div>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/fichas-imoveis")}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Fichas dos Imóveis</span>
              <span className="sm:hidden">Fichas</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        <Tabs defaultValue="occupancy">
          <TabsList className="w-full">
            <TabsTrigger value="occupancy" className="flex-1 gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Ocupação
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-1 gap-1.5" onClick={() => navigate("/calendario-reservas")}>
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
          </TabsList>

          <TabsContent value="occupancy" className="space-y-4 mt-4">
            {/* Period Selector */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Período de Análise</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={setCurrentMonth}>Este mês</Button>
                  <Button size="sm" variant="outline" onClick={() => setPeriod(3)}>3 meses</Button>
                  <Button size="sm" variant="outline" onClick={() => setPeriod(6)}>6 meses</Button>
                  <Button size="sm" variant="outline" onClick={() => setPeriod(12)}>12 meses</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fim</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Imóveis c/ iCal</p>
                  <p className="text-2xl font-bold">{summary.withIcalCount}</p>
                  <p className="text-xs text-muted-foreground">de {properties.length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-yellow-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Ocupação Média</p>
                  <p className={`text-2xl font-bold ${getOccupancyColor(summary.avgOccupancy)}`}>
                    {summary.avgOccupancy.toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Melhor Imóvel</p>
                  <p className="text-sm font-bold truncate">{summary.bestProperty?.property.name || "-"}</p>
                  <p className="text-xs text-success">{summary.bestProperty?.occupancyRate.toFixed(0)}% ocupado</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Mais Vago</p>
                  <p className="text-sm font-bold truncate">{summary.worstProperty?.property.name || "-"}</p>
                  <p className="text-xs text-destructive">{summary.worstProperty?.vacantDays || 0} dias vagos</p>
                </CardContent>
              </Card>
            </div>

            {/* Sortable Table */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Dias Vagos por Imóvel</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {differenceInDays(parseISO(endDate), parseISO(startDate)) + 1} dias no período
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3">
                            <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort("name")}>
                              Imóvel
                              {sortField === "name" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          </th>
                          <th className="text-center p-3">
                            <button className="flex items-center gap-1 font-medium mx-auto" onClick={() => toggleSort("occupancy")}>
                              Ocupação
                              {sortField === "occupancy" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          </th>
                          <th className="text-center p-3">
                            <button className="flex items-center gap-1 font-medium mx-auto" onClick={() => toggleSort("vacant_days")}>
                              Dias Vagos
                              {sortField === "vacant_days" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          </th>
                          <th className="text-center p-3 hidden sm:table-cell">Reservas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedData.map((item) => (
                          <tr key={item.property.id} className="border-t hover:bg-accent/50 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium truncate">{item.property.name}</span>
                                {!item.hasIcal && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">Sem iCal</Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-sm font-bold ${getOccupancyColor(item.occupancyRate)}`}>
                                  {item.occupancyRate.toFixed(0)}%
                                </span>
                                <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${getProgressColor(item.occupancyRate)}`}
                                    style={{ width: `${item.occupancyRate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${item.vacantDays > item.totalDays * 0.5 ? "text-destructive" : "text-foreground"}`}>
                                {item.vacantDays}
                              </span>
                              <span className="text-muted-foreground text-xs">/{item.totalDays}</span>
                            </td>
                            <td className="p-3 text-center hidden sm:table-cell text-muted-foreground">
                              {item.reservationCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Future Insights Placeholder */}
            <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
              <CardContent className="py-6 px-4 text-center space-y-2">
                <BrainCircuit className="h-8 w-8 text-primary mx-auto" />
                <p className="text-sm font-medium text-primary">Mais Insights em breve</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Custo médio de manutenção por imóvel, score de saúde do portfólio, alertas inteligentes de preços e mais.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <MobileBottomNav />
    </div>
  );
}
