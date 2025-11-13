import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { formatBRL } from "@/lib/format";

interface ServiceTypeData {
  service_type: string;
  total_amount: number;
  charge_count: number;
}

interface ServiceTypePieChartProps {
  data: ServiceTypeData[];
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export const ServiceTypePieChart = ({ data }: ServiceTypePieChartProps) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gastos por Tipo de Serviço</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    name: item.service_type || 'Sem classificação',
    value: item.total_amount / 100,
    count: item.charge_count,
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por Tipo de Serviço</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-sm">
                      <div className="grid gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">
                            {data.name}
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {formatBRL(data.value * 100)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {data.count} cobrança{data.count !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {((data.value / total) * 100).toFixed(1)}% do total
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{formatBRL(total * 100)}</p>
        </div>
      </CardContent>
    </Card>
  );
};
