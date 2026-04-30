import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";
import { FormBackButton } from "@/components/layout/CenteredFormPage";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";
import { chartColor, statusChartColor } from "@/lib/chartColors";
import {
  overdueBadgeClass,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
} from "@/lib/badges";

type DashboardRange = "today" | "week" | "month" | "all" | "custom";
type DashboardChartType = "kpi" | "donut" | "bar" | "table";
type DashboardWidgetSize = "small" | "medium" | "large" | "full";
type DashboardWidgetType = "KPI" | "CHART" | "TABLE";

type DashboardWidgetCatalogItem = {
  key: string;
  title: string;
  description: string;
  type: DashboardWidgetType;
  defaultChartType: DashboardChartType;
  supportedChartTypes: DashboardChartType[];
  defaultSize: DashboardWidgetSize;
  defaultVisible: boolean;
};

type DashboardWidgetLayout = {
  id: string;
  widgetKey: string;
  title: string;
  chartType: DashboardChartType;
  size: DashboardWidgetSize;
  visible: boolean;
  order: number;
};

type DashboardFilters = {
  range: DashboardRange;
  customStart?: string | null;
  customEnd?: string | null;
};

type DashboardWidgetData = {
  id: string;
  widgetKey: string;
  title: string;
  type: DashboardWidgetType;
  chartType: DashboardChartType;
  size: DashboardWidgetSize;
  data: unknown;
};

type DashboardResponse = {
  catalog: DashboardWidgetCatalogItem[];
  layout: DashboardWidgetLayout[];
  filters: DashboardFilters;
  widgets: DashboardWidgetData[];
};

type ChartRow = {
  key?: string;
  label: string;
  value: number;
};

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string; isTerminal?: boolean };
  assignedTo: { id: string; name: string; username: string } | null;
  overdue: boolean;
};

const RANGE_LABELS: Record<DashboardRange, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "All time",
  custom: "Custom",
};

const ALLOWED_WIDGET_KEYS = new Set<string>([
  "total_tasks",
  "overdue_tasks",
  "completed_today",
  "pending_review",
  "tasks_by_status",
  "tasks_by_priority",
]);

function widgetSizeClass(size: DashboardWidgetSize) {
  switch (size) {
    case "small":
      return "md:col-span-1 xl:col-span-1";
    case "medium":
      return "md:col-span-1 xl:col-span-2";
    case "large":
      return "md:col-span-2 xl:col-span-3";
    case "full":
      return "md:col-span-2 xl:col-span-4";
  }
}

function cardHeightClass(widget: DashboardWidgetData) {
  if (widget.type === "KPI") return "min-h-35";
  if (widget.type === "TABLE") return "min-h-80";
  return "min-h-88";
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return "-";
  }
}

function normalizeChartRows(data: unknown): ChartRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map<ChartRow | null>((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as { key?: unknown; label?: unknown; value?: unknown };
      const value = Number(r.value ?? 0);
      return {
        key: r.key == null ? undefined : String(r.key),
        label: String(r.label ?? r.key ?? "Unknown"),
        value: Number.isFinite(value) ? value : 0,
      };
    })
    .filter((row): row is ChartRow => row != null);
}

function normalizeTaskRows(data: unknown): TaskRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as TaskRow;
      return r.id && r.title ? r : null;
    })
    .filter((row): row is TaskRow => row != null);
}

function chartTooltipStyle() {
  return {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    color: "hsl(var(--popover-foreground))",
  };
}

function isStatusWidget(widgetKey: string) {
  return widgetKey === "tasks_by_status";
}

function colorForRow(widgetKey: string, row: ChartRow, index: number) {
  return isStatusWidget(widgetKey)
    ? statusChartColor(row.key ?? row.label, index)
    : chartColor(index);
}

function startOfMonthInputValue(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function todayInputValue(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizeFiltersForCompare(filters: DashboardFilters): DashboardFilters {
  if (filters.range !== "custom") {
    return { range: filters.range };
  }
  return {
    range: "custom",
    customStart: filters.customStart ?? null,
    customEnd: filters.customEnd ?? null,
  };
}

function DashboardChart({ widget }: { widget: DashboardWidgetData }) {
  const rows = normalizeChartRows(widget.data).filter((row) => row.value > 0);
  if (!rows.length)
    return <EmptyWidgetText>No chart data yet.</EmptyWidgetText>;

  if (widget.chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={12} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={chartTooltipStyle()} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {rows.map((row, index) => (
              <Cell
                key={`${row.label}-${index}`}
                fill={colorForRow(widget.widgetKey, row, index)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          formatter={(value: unknown, name: unknown) => {
            const n = typeof value === "number" ? value : Number(value);
            const pct =
              total > 0 && Number.isFinite(n)
                ? Math.round((n / total) * 100)
                : 0;
            return [`${n} (${pct}%)`, String(name)];
          }}
          contentStyle={chartTooltipStyle()}
        />
        <Legend
          layout="horizontal"
          verticalAlign="bottom"
          align="center"
          wrapperStyle={{ fontSize: 11, lineHeight: "14px", paddingTop: 6 }}
        />
        <Pie
          data={rows}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="45%"
          innerRadius={50}
          outerRadius={78}
          paddingAngle={2}
          stroke="hsl(var(--background))"
          strokeWidth={2}
          labelLine={false}
          label={({ label, value }) => {
            if (!total) return null;
            const pct = Math.round(((value || 0) / total) * 100);
            if (pct < 7) return null;
            return `${label} ${pct}%`;
          }}
        >
          {rows.map((row, index) => (
            <Cell
              key={`${row.label}-${index}`}
              fill={colorForRow(widget.widgetKey, row, index)}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyWidgetText({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function KpiWidget({ widget }: { widget: DashboardWidgetData }) {
  const data = widget.data as
    | { value?: unknown; label?: unknown; tone?: unknown }
    | null
    | undefined;
  const value = Number(data?.value ?? 0);
  const tone = String(data?.tone ?? "default");
  const valueClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-300"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-300"
          : "text-foreground";
  return (
    <div className="flex min-h-20 flex-col justify-end gap-2">
      <div className={cn("text-4xl font-semibold tracking-tight", valueClass)}>
        {Number.isFinite(value) ? value : "-"}
      </div>
      <div className="text-sm text-muted-foreground">
        {String(data?.label ?? "")}
      </div>
    </div>
  );
}

function TaskTableWidget({ widget }: { widget: DashboardWidgetData }) {
  const rows = normalizeTaskRows(widget.data);
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-background/30 px-3 py-8 text-center text-sm text-muted-foreground">
        No tasks for this widget.
      </div>
    );
  }
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-160 text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Task</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Assigned to</th>
            <th className="px-3 py-2 text-left">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => (
            <tr key={task.id} className="border-t border-border/70">
              <td className="max-w-72 px-3 py-2">
                <Link
                  to={`/tasks/${task.id}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {task.title}
                </Link>
                {task.overdue ? (
                  <span className={cn("ml-2", overdueBadgeClass())}>
                    Overdue
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <span className={taskPriorityBadgeClass(task.priority)}>
                  {task.priority}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={taskStatusBadgeClass(task.status.code)}>
                  {task.status.label}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {task.assignedTo?.name ?? "-"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(task.dueDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardWidgetCard({ widget }: { widget: DashboardWidgetData }) {
  return (
    <Card
      className={cn(
        "border-border/80 bg-background/45",
        widgetSizeClass(widget.size),
        cardHeightClass(widget),
      )}
    >
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
          {widget.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {widget.type === "KPI" ? (
          <KpiWidget widget={widget} />
        ) : widget.type === "TABLE" ? (
          <TaskTableWidget widget={widget} />
        ) : (
          <div className="h-68">
            <DashboardChart widget={widget} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function reorderLayout(
  layout: DashboardWidgetLayout[],
  widgetKey: string,
  direction: -1 | 1,
) {
  const next = [...layout].sort((a, b) => a.order - b.order);
  const index = next.findIndex((item) => item.widgetKey === widgetKey);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return layout;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next.map((row, order) => ({ ...row, order }));
}

export function DashboardPage() {
  const qc = useQueryClient();
  const [customize, setCustomize] = useState(false);
  const [draftLayout, setDraftLayout] = useState<DashboardWidgetLayout[]>([]);
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>({
    range: "month",
  });

  const dashboardQuery = useQuery({
    queryKey: ["dynamic-dashboard"],
    queryFn: async () => {
      const { data } =
        await api.get<ApiSuccess<DashboardResponse>>("/api/dashboard");
      return data.data;
    },
  });

  useEffect(() => {
    if (!dashboardQuery.data) return;
    setDraftLayout(
      dashboardQuery.data.layout.filter((item) =>
        ALLOWED_WIDGET_KEYS.has(item.widgetKey),
      ),
    );
    setDraftFilters(dashboardQuery.data.filters);
  }, [dashboardQuery.data]);

  const saveDashboard = useMutation({
    mutationFn: async (payload?: {
      layout?: DashboardWidgetLayout[];
      filters?: DashboardFilters;
      successMessage?: string;
      silent?: boolean;
    }) => {
      const { data } = await api.put<ApiSuccess<DashboardResponse>>(
        "/api/dashboard",
        {
          layout: payload?.layout ?? draftLayout,
          filters: payload?.filters ?? draftFilters,
        },
      );
      return data.data;
    },
    onSuccess: async (_result, payload) => {
      await qc.invalidateQueries({ queryKey: ["dynamic-dashboard"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (!payload?.silent) {
        toast.success(
          payload?.successMessage ??
            (customize ? "Dashboard layout updated" : "Dashboard filter applied"),
        );
      }
    },
    onError: () => toast.error("Could not save dashboard"),
  });

  const resetDashboard = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiSuccess<DashboardResponse>>(
        "/api/dashboard/reset",
      );
      return data.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dynamic-dashboard"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Dashboard reset");
    },
    onError: () => toast.error("Could not reset dashboard"),
  });

  const data = dashboardQuery.data;
  const catalog = useMemo(
    () =>
      (data?.catalog ?? []).filter((item) => ALLOWED_WIDGET_KEYS.has(item.key)),
    [data?.catalog],
  );
  const widgetDataByKey = useMemo(() => {
    return new Map(
      (data?.widgets ?? [])
        .filter((widget) => ALLOWED_WIDGET_KEYS.has(widget.widgetKey))
        .map((widget) => [widget.widgetKey, widget]),
    );
  }, [data?.widgets]);

  const sortedDraftLayout = useMemo(
    () => [...draftLayout].sort((a, b) => a.order - b.order),
    [draftLayout],
  );

  const visibleWidgets = useMemo(() => {
    return sortedDraftLayout
      .filter((layout) => layout.visible)
      .map((layout) => {
        const serverWidget = widgetDataByKey.get(layout.widgetKey);
        const catalogItem = catalog.find(
          (item) => item.key === layout.widgetKey,
        );
        if (!serverWidget || !catalogItem) return null;
        return {
          ...serverWidget,
          id: layout.id,
          title: layout.title,
          chartType: layout.chartType,
          size: layout.size,
        };
      })
      .filter((widget): widget is DashboardWidgetData => widget != null);
  }, [catalog, sortedDraftLayout, widgetDataByKey]);

  const savedState = useMemo(() => {
    if (!data) return "";
    return JSON.stringify({
      layout: data.layout
        .filter((item) => ALLOWED_WIDGET_KEYS.has(item.widgetKey))
        .sort((a, b) => a.order - b.order),
      filters: normalizeFiltersForCompare(data.filters),
    });
  }, [data]);
  const draftState = useMemo(
    () =>
      JSON.stringify({
        layout: sortedDraftLayout,
        filters: normalizeFiltersForCompare(draftFilters),
      }),
    [draftFilters, sortedDraftLayout],
  );
  const isDirty = Boolean(data) && savedState !== draftState;
  const showUnsavedBanner = customize && isDirty;

  function patchLayout(
    widgetKey: string,
    patch: Partial<DashboardWidgetLayout>,
  ) {
    setDraftLayout((prev) =>
      prev.map((item) =>
        item.widgetKey === widgetKey ? { ...item, ...patch } : item,
      ),
    );
  }

  function applyAndPersistFilters(nextFilters: DashboardFilters) {
    setDraftFilters(nextFilters);
    if (customize) return;
    saveDashboard.mutate({
      layout: draftLayout,
      filters: nextFilters,
      silent: true,
    });
  }

  if (dashboardQuery.isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading dashboard...</div>
    );
  }

  if (dashboardQuery.isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Could not load dashboard analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {customize ? (
          <FormBackButton onClick={() => setCustomize(false)}>
            Back to dashboard
          </FormBackButton>
        ) : (
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Customizable task analytics for web and mobile views.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!customize ? (
            <>
              <SearchableSelect
                className="w-40"
                showSearch={false}
                value={draftFilters.range}
                onChange={(value) => {
                  const next = (() => {
                    const range = value as DashboardRange;
                    if (range === "custom") {
                      const prev = draftFilters;
                      return {
                        range,
                        customStart: prev.customStart ?? startOfMonthInputValue(),
                        customEnd: prev.customEnd ?? todayInputValue(),
                      };
                    }
                    return { range };
                  })();
                  applyAndPersistFilters(next);
                }}
                options={[
                  { value: "today", label: "Today" },
                  { value: "week", label: "This week" },
                  { value: "month", label: "This month" },
                  { value: "all", label: "All time" },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {draftFilters.range === "custom" ? (
                <div className="flex items-center gap-2">
                  <Input
                    id="dashboard-custom-start"
                    type="date"
                    value={draftFilters.customStart ?? ""}
                    onChange={(e) => {
                      applyAndPersistFilters({
                        ...draftFilters,
                        customStart: e.target.value,
                      });
                    }}
                    className="w-36"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    id="dashboard-custom-end"
                    type="date"
                    value={draftFilters.customEnd ?? ""}
                    onChange={(e) => {
                      applyAndPersistFilters({
                        ...draftFilters,
                        customEnd: e.target.value,
                      });
                    }}
                    className="w-36"
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {customize ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCustomize(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saveDashboard.isPending}
                isLoading={saveDashboard.isPending}
                onClick={async () => {
                  await saveDashboard.mutateAsync({});
                  setCustomize(false);
                }}
              >
                <Save className="size-4" />
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCustomize(true)}
              >
                <Settings2 className="size-4" />
                Customize
              </Button>
            </>
          )}
        </div>
      </div>

      {customize ? (
        <Card className="border-primary/25 bg-background/45">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Dashboard builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedDraftLayout.map((layout, index) => {
                const item = catalog.find((w) => w.key === layout.widgetKey);
                if (!item) return null;
                const showChartControl = item.type !== "KPI";
                const hideSizeControl =
                  layout.widgetKey === "tasks_by_status" ||
                  layout.widgetKey === "tasks_by_priority";
                return (
                  <div
                    key={layout.widgetKey}
                    className="rounded-lg border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">
                          {layout.title}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border",
                          layout.visible
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/30 text-muted-foreground",
                        )}
                        onClick={() =>
                          patchLayout(layout.widgetKey, {
                            visible: !layout.visible,
                          })
                        }
                        aria-label={
                          layout.visible ? "Hide widget" : "Show widget"
                        }
                      >
                        {layout.visible ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </button>
                    </div>

                    <div
                      className={cn(
                        "mt-3 grid gap-2",
                        showChartControl && !hideSizeControl
                          ? "sm:grid-cols-2"
                          : "sm:grid-cols-1",
                      )}
                    >
                      {!hideSizeControl ? (
                        <div className="space-y-1">
                          <Label>Size</Label>
                          <SearchableSelect
                            showSearch={false}
                            value={layout.size}
                            onChange={(value) =>
                              patchLayout(layout.widgetKey, {
                                size: value as DashboardWidgetSize,
                              })
                            }
                            options={[
                              { value: "small", label: "Small" },
                              { value: "medium", label: "Medium" },
                              { value: "large", label: "Large" },
                              { value: "full", label: "Full width" },
                            ]}
                          />
                        </div>
                      ) : null}

                      {showChartControl ? (
                        <div className="space-y-1">
                          <Label>Chart</Label>
                          <Select
                            value={layout.chartType}
                            disabled={item.supportedChartTypes.length <= 1}
                            onValueChange={(value) =>
                              patchLayout(layout.widgetKey, {
                                chartType: value as DashboardChartType,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {item.supportedChartTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        Position {index + 1}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={index === 0}
                          onClick={() =>
                            setDraftLayout((prev) =>
                              reorderLayout(prev, layout.widgetKey, -1),
                            )
                          }
                          aria-label="Move widget up"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={index === sortedDraftLayout.length - 1}
                          onClick={() =>
                            setDraftLayout((prev) =>
                              reorderLayout(prev, layout.widgetKey, 1),
                            )
                          }
                          aria-label="Move widget down"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Saved layout is shared by web and mobile clients through the
                same dashboard API. Mobile can render these widgets in one
                column.
              </p>
              <Button
                type="button"
                variant="outline"
                isLoading={resetDashboard.isPending}
                disabled={resetDashboard.isPending}
                onClick={() => resetDashboard.mutate()}
              >
                <RotateCcw className="size-4" />
                Reset default
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showUnsavedBanner ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          You have unsaved dashboard changes. Save to refresh analytics for the
          selected layout and range.
        </div>
      ) : null}

      {!customize ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleWidgets.length ? (
              visibleWidgets.map((widget) => (
                <DashboardWidgetCard key={widget.widgetKey} widget={widget} />
              ))
            ) : (
              <Card className="md:col-span-2 xl:col-span-4">
                <CardHeader>
                  <CardTitle>No widgets selected</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Turn on at least one widget in Customize mode.
                </CardContent>
              </Card>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Current range: {RANGE_LABELS[data.filters.range]}. Use Customize to
            control which widgets appear for this account.
          </div>
        </>
      ) : null}
    </div>
  );
}
