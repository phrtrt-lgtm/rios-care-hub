import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { ServiceTypeChart } from "@/components/ServiceTypeChart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface ServiceTypeData {
  service_type: string;
  total_amount: number;
  charge_count: number;
}

interface MaintenanceChartsProps {
  charts: {
    monthly: Array<{ month: number; total_cents: number; owner_cents: number; management_cents: number }>;
    pie: Array<{ name: string; value: number }>;
    line: Array<{ month: number; ytd_cents: number }>;
  } | null;
  serviceTypeData: ServiceTypeData[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))'];

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function MaintenanceCharts({ charts, serviceTypeData }: MaintenanceChartsProps) {
  if (!charts) return null;

  const monthlyData = charts.monthly.map(m => ({
    ...m,
    monthName: MONTH_NAMES[m.month - 1],
  }));

  const pieLabels: Record<string, string> = {
    owner: 'Proprietário',
    management: 'Gestão',
    split: 'Dividido',
  };

  const pieData = charts.pie.map(p => ({
    ...p,
    name: pieLabels[p.name] || p.name,
  }));

  const lineData = charts.line.map(l => ({
    ...l,
    monthName: MONTH_NAMES[l.month - 1],
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Barras mensais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="monthName" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                tickFormatter={(v) => formatBRL(v)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip 
                formatter={(v: number, name: string) => [formatBRL(v), name === 'owner_cents' ? 'Proprietário' : 'Gestão']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Legend formatter={(value) => value === 'owner_cents' ? 'Proprietário' : 'Gestão'} />
              <Bar dataKey="owner_cents" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} name="owner_cents" />
              <Bar dataKey="management_cents" stackId="a" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="management_cents" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pizza por responsável */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por Responsável</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => `${entry.name}: ${formatBRL(entry.value)}`}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(v: number) => formatBRL(v)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Linha acumulada YTD */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acumulado YTD</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="monthName"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                tickFormatter={(v) => formatBRL(v)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip 
                formatter={(v: number) => formatBRL(v)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="ytd_cents" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Tipos de Serviço */}
      {serviceTypeData && serviceTypeData.length > 0 && (
        <ServiceTypeChart data={serviceTypeData} />
      )}
    </div>
  );
}
