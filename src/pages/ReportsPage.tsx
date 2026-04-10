import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { chartColor } from "@/lib/chartColors";

export function ReportsPage() {
  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await api.get<{
        totalTasks: number;
        byStatus: Record<string, number>;
        overdue: number;
      }>("/api/reports/dashboard");
      return data;
    },
  });

  const { data: byUser } = useQuery({
    queryKey: ["reports-by-user"],
    queryFn: async () => {
      const { data } = await api.get<{
        rows: { user: { name: string; username: string }; count: number }[];
      }>("/api/reports/by-assignee");
      return data.rows;
    },
  });

  const chartData = dash
    ? Object.entries(dash.byStatus).map(([name, value]) => ({ name, value }))
    : [];
  const chartTotal = chartData.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold uppercase tracking-wide text-primary">
        Reports
      </h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="h-72">
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <div className="h-52 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const n = typeof value === "number" ? value : Number(value);
                    const pct =
                      chartTotal > 0 && Number.isFinite(n)
                        ? Math.round((n / chartTotal) * 100)
                        : 0;
                    return [`${n} (${pct}%)`, String(name)];
                  }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Legend />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  labelLine={false}
                  label={({ name, value }) => {
                    if (!chartTotal) return String(name);
                    const pct = Math.round(((value || 0) / chartTotal) * 100);
                    return `${name} ${pct}%`;
                  }}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={chartColor(i)} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tasks by assignee</CardTitle>
          </CardHeader>
          <div className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(byUser ?? []).map((r) => (
                  <TableRow key={r.user.username}>
                    <TableCell>{r.user.name}</TableCell>
                    <TableCell>{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
