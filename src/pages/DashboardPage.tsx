import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  spotlightCardContentLayerClass,
  topLeftSpotlightCardClass,
} from "@/lib/cardFx";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { statusChartColor } from "@/lib/chartColors";

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{
          totalTasks: number;
          byStatus: Record<string, number>;
          overdue: number;
        }>
      >("/api/reports/dashboard");
      return data.data;
    },
  });

  const chartData = data
    ? Object.entries(data.byStatus).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-primary">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of your tasks and activities.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={topLeftSpotlightCardClass}>
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Total tasks (visible)
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
          >
            {data?.totalTasks ?? "—"}
          </CardContent>
        </Card>
        <Card className={topLeftSpotlightCardClass}>
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-3xl font-bold text-destructive ${spotlightCardContentLayerClass}`}
          >
            {data?.overdue ?? "—"}
          </CardContent>
        </Card>
        <Card className={topLeftSpotlightCardClass}>
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Statuses
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-sm text-muted-foreground ${spotlightCardContentLayerClass}`}
          >
            {data
              ? Object.entries(data.byStatus).map(([k, v]) => (
                  <div key={k}>
                    {k}: <span className="text-foreground">{v}</span>
                  </div>
                ))
              : "—"}
          </CardContent>
        </Card>
      </div>
      {chartData.length > 0 && (
        <Card className="h-72">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Tasks by status
            </CardTitle>
          </CardHeader>
          <div className="h-52 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
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
                >
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={statusChartColor(d.name, i)} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
