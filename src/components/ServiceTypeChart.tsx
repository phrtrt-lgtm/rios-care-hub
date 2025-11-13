import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatBRL } from "@/lib/format";

interface ServiceTypeData {
  service_type: string;
  total_amount: number;
  charge_count: number;
}

interface ServiceTypeChartProps {
  data: ServiceTypeData[];
}

const TERRA_COLOR = 'hsl(var(--rios-terra))';

const SERVICE_TYPES = [
  'Estrutural',
  'Hidráulica',
  'Elétrica',
  'Marcenaria',
  'Itens',
  'Refrigeração'
];

export const ServiceTypeChart = ({ data }: ServiceTypeChartProps) => {
  // Criar um map dos dados recebidos
  const dataMap = new Map(
    data.map(item => [item.service_type, { value: item.total_amount / 100, count: item.charge_count }])
  );

  // Criar chartData com todos os tipos, na ordem definida
  const chartData = SERVICE_TYPES.map(type => ({
    name: type,
    value: dataMap.get(type)?.value || 0,
    count: dataMap.get(type)?.count || 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por Tipo de Serviço</CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="name" 
              className="text-xs"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis 
              className="text-xs"
              tickFormatter={(value) => formatBRL(value * 100)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="grid gap-2">
                        <div className="flex flex-col">
                          <span className="text-[0.70rem] uppercase text-muted-foreground">
                            {data.name}
                          </span>
                          <span className="font-bold text-foreground">
                            {formatBRL(data.value * 100)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {data.count} cobrança{data.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={TERRA_COLOR} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
