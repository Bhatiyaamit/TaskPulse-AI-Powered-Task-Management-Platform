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
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

  const barData = useMemo(() => {
    const series = taskSummaryQuery.data?.series ?? [];
    return series.map((p) => ({ name: p.status, value: p.value }));
  }, [taskSummaryQuery.data]);

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
              <Select value={companyId} onValueChange={setCompanyId}>
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
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ left: 8, right: 8 }}>
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    formatter={(v: any) => [v, "Tasks"]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((d, i) => (
                      <Cell
                        key={`${d.name}-${i}`}
                        fill={statusChartColor(d.name, i)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
