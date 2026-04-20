import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiSuccess } from "@/api/types";
import {
  spotlightCardContentLayerClass,
  topLeftSpotlightCardClass,
} from "@/lib/cardFx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatformTenantsOptions } from "@/hooks/useTenantContext";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { statusChartColor } from "@/lib/chartColors";

type PlatformDashboard = {
  tenantsTotal: number;
  usersTotal: number;
  tenantsByStatus: { active: number; inactive: number };
  tenantsCreatedLast7Days: number;
};

type TaskStatusSummary = {
  tenantId: string | null;
  series: { status: string; value: number }[];
};

export function PlatformDashboardPage() {
  const [companyId, setCompanyId] = useState<string>("__all__");
  const tenantOptionsQuery = usePlatformTenantsOptions(true);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-dashboard"],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<PlatformDashboard>>(
        "/api/platform/dashboard",
      );
      return data.data;
    },
  });

  const taskSummaryQuery = useQuery({
    queryKey: ["platform-task-status-summary", companyId],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<TaskStatusSummary>>(
        "/api/platform/task-status-summary",
        {
          params: companyId === "__all__" ? {} : { tenantId: companyId },
        },
      );
      return data.data;
    },
  });

  const chartDataAll = useMemo(() => {
    const series = taskSummaryQuery.data?.series ?? [];
    return series.map((p) => ({ name: p.status, value: p.value }));
  }, [taskSummaryQuery.data]);
  const chartData = useMemo(
    () => chartDataAll.filter((d) => (d.value ?? 0) > 0),
    [chartDataAll],
  );
  const chartTotal = useMemo(
    () => chartData.reduce((sum, d) => sum + (d.value || 0), 0),
    [chartData],
  );
  const companyLabelForValue = (value: string) => {
    if (value === "__all__") return "All companies";
    return (
      (tenantOptionsQuery.data ?? []).find((t) => t.id === value)?.name ?? value
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Overview of platform metrics and tenant activity.
          </p>
        </div>
      </div>

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You may not have permission to view platform metrics.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-primary">
                  Total companies
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
              >
                {isLoading ? "—" : (data?.tenantsTotal ?? "—")}
              </CardContent>
            </Card>

            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-primary">
                  Active companies
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
              >
                {isLoading ? "—" : (data?.tenantsByStatus?.active ?? "—")}
              </CardContent>
            </Card>

            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-primary">
                  Inactive companies
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
              >
                {isLoading ? "—" : (data?.tenantsByStatus?.inactive ?? "—")}
              </CardContent>
            </Card>

            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wide text-primary">
                  Total tenant users
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
              >
                {isLoading ? "—" : (data?.usersTotal ?? "—")}
              </CardContent>
            </Card>
          </div>

          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base uppercase tracking-wide text-primary">
                Tasks by status
              </CardTitle>
              <Select
                value={companyId}
                onValueChange={setCompanyId}
                itemToStringLabel={companyLabelForValue}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="__all__">All companies</SelectItem>
                  {(tenantOptionsQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-72">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No task data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const n =
                          typeof value === "number" ? value : Number(value);
                        const pct =
                          chartTotal > 0 && Number.isFinite(n)
                            ? Math.round((n / chartTotal) * 100)
                            : 0;
                        return [`${n} (${pct}%)`, String(name)];
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ fontSize: 11, lineHeight: "14px" }}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="44%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {chartData.map((d, i) => (
                        <Cell
                          key={`${d.name}-${i}`}
                          fill={statusChartColor(d.name, i)}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
              {taskSummaryQuery.isLoading ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Loading chart…
                </div>
              ) : taskSummaryQuery.isError ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Could not load task chart.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
