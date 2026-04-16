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
          byStatus: { status: string; count: number }[];
          overdue: number;
        }>
      >("/api/reports/dashboard");
      return data.data;
    },
  });

  const chartDataAll = data
    ? data.byStatus.map((r) => ({ name: r.status, value: r.count }))
    : [];
  // Keep API returning all statuses (including 0), but don't clutter the pie chart UI.
  const chartData = chartDataAll.filter((d) => (d.value ?? 0) > 0);
  const chartTotal = chartData.reduce((sum, d) => sum + (d.value || 0), 0);

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
            {data ? (
              chartData.length ? (
                chartData
                  .sort((a, b) => (b.value || 0) - (a.value || 0))
                  .map((r) => (
                    <div key={r.name}>
                      {r.name}: <span className="text-foreground">{r.value}</span>
                    </div>
                  ))
              ) : (
                "—"
              )
            ) : (
              "—"
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="h-72">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
            Tasks by status
          </CardTitle>
        </CardHeader>
        <div className="h-52 px-2">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No task data yet.
            </div>
          ) : (
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
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{
                    fontSize: 11,
                    lineHeight: "14px",
                    paddingTop: 6,
                  }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  labelLine={false}
                  label={({ name, value }) => {
                    if (!chartTotal) return null;
                    const pct = Math.round(((value || 0) / chartTotal) * 100);
                    if (pct < 6) return null;
                    return `${name} ${pct}%`;
                  }}
                >
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={statusChartColor(d.name, i)} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
