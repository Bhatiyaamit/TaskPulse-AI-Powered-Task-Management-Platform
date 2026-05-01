import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { chartColor } from "@/lib/chartColors";

type ReportsSummaryResponse = {
  metrics: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    avgCompletionHours: number;
    escalationCount: number;
  };
  completionTrend: {
    label: string;
    created: number;
    completed: number;
  }[];
  assignees: {
    id: string;
    name: string;
    department: string | null;
    assigned: number;
    completed: number;
    pending: number;
    overdue: number;
    timeLoggedMinutes: number;
    avgCompletionHours: number;
  }[];

  topPerformers: {
    rank: number;
    name: string;
    completed: number;
    avgTime: number;
  }[];
  overdueTasks: {
    id: string;
    title: string;
    assignedToName: string | null;
    departmentName: string | null;
    dueDate: string;
    daysOverdue: number;
  }[];
};

type DatePreset = "ALL_TIME" | "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "CUSTOM";

const OVERDUE_PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_OVERDUE_PAGE_SIZE = 10;

function chartTooltipStyle() {
  return {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--popover-foreground))",
  };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function formatHours(value: number | null | undefined) {
  const hours = Number(value ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return "0.0h";
  return `${hours.toFixed(1)}h`;
}

function formatMinutesAsLoggedTime(minutes: number | null | undefined) {
  const total = Number(minutes ?? 0);
  if (!Number.isFinite(total) || total <= 0) return "—";
  if (total < 60) return `${Math.round(total)}m`;
  return `${(total / 60).toFixed(1)}h`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-52 items-center justify-center rounded-lg border border-dashed border-border bg-background/20 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ReportKpiCard({
  icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-300"
        : tone === "danger"
          ? "text-rose-600 dark:text-rose-300"
          : "text-foreground";

  return (
    <Card className="border-border bg-background/30 shadow-sm">
      <CardContent className="flex min-h-32 items-start justify-between gap-3 p-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div
            className={cn("text-2xl font-semibold tracking-tight", valueClass)}
          >
            {value}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {helper}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-2 text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
        {title}
      </CardTitle>
      {description ? (
        <div className="text-xs leading-5 text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const me = useMe();
  const isAdmin =
    me.data?.user?.roleCode === "SUPER_ADMIN" ||
    me.data?.user?.roleCode === "COMPANY_ADMIN";

  const [datePreset, setDatePreset] = useState<DatePreset>("THIS_MONTH");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [assigneeId, setAssigneeId] = useState("ALL");
  const [overduePage, setOverduePage] = useState(1);
  const [overduePageSize, setOverduePageSize] = useState(
    DEFAULT_OVERDUE_PAGE_SIZE,
  );
  const showCustomRange = datePreset === "CUSTOM";

  const dateParams = useMemo(() => {
    let start = "";
    let end = "";
    const now = new Date();

    if (datePreset === "TODAY") {
      start = now.toISOString().split("T")[0];
      end = start;
    } else if (datePreset === "THIS_WEEK") {
      const first = now.getDate() - now.getDay();
      const firstDay = new Date(now.setDate(first));
      start = firstDay.toISOString().split("T")[0];
      const lastDay = new Date(now.setDate(first + 6));
      end = lastDay.toISOString().split("T")[0];
    } else if (datePreset === "THIS_MONTH") {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];
    } else if (datePreset === "CUSTOM") {
      start = customStart;
      end = customEnd;
    }

    return { startDate: start, endDate: end };
  }, [datePreset, customStart, customEnd]);

  const orgQuery = useQuery({
    queryKey: ["org-team-hierarchy"],
    queryFn: async () => {
      const { data } = await api.get<{ data: any[] }>("/api/team/members", {
        params: { pageSize: 100 },
      });
      return data.data;
    },
  });

  const depsQuery = useQuery({
    queryKey: ["org-departments"],
    queryFn: async () => {
      const { data } = await api.get<{ data: any[] }>("/api/org/departments", {
        params: { pageSize: 100 },
      });
      return data.data;
    },
    enabled: isAdmin,
  });

  const subordinateOptions = useMemo(() => {
    if (!orgQuery.data || !me.data) return [];
    if (isAdmin) return orgQuery.data;

    function getDescendants(members: any[], rootId: string): any[] {
      const children = members.filter((member) => member.managerId === rootId);
      return children.reduce((acc, child) => {
        return [...acc, child, ...getDescendants(members, child.id)];
      }, [] as any[]);
    }

    return getDescendants(orgQuery.data, me.data.user.id);
  }, [orgQuery.data, me.data, isAdmin]);

  const q = useQuery({
    queryKey: ["reports-summary", dateParams, departmentId, assigneeId],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (dateParams.startDate) params.startDate = dateParams.startDate;
      if (dateParams.endDate) params.endDate = dateParams.endDate;
      if (departmentId !== "ALL") params.departmentId = departmentId;
      if (assigneeId !== "ALL") params.assigneeId = assigneeId;

      const { data } = await api.get<ApiSuccess<ReportsSummaryResponse>>(
        "/api/reports/summary",
        { params },
      );
      return data.data;
    },
  });

  const data = q.data;

  useEffect(() => {
    setOverduePage(1);
  }, [datePreset, customStart, customEnd, departmentId, assigneeId]);

  const overdueTasksAll = data?.overdueTasks ?? [];
  const overdueTotal = overdueTasksAll.length;
  const overduePageCount = Math.max(
    1,
    Math.ceil(overdueTotal / overduePageSize),
  );

  useEffect(() => {
    setOverduePage((p) => Math.min(Math.max(1, p), overduePageCount));
  }, [overduePageCount]);

  const overdueTasksPage = useMemo(() => {
    const start = (overduePage - 1) * overduePageSize;
    return overdueTasksAll.slice(start, start + overduePageSize);
  }, [overdueTasksAll, overduePage, overduePageSize]);

  const overdueRangeLabel = useMemo(() => {
    if (overdueTotal === 0) return "0 tasks";
    const from = (overduePage - 1) * overduePageSize + 1;
    const to = Math.min(overduePage * overduePageSize, overdueTotal);
    return `Showing ${from}–${to} of ${overdueTotal}`;
  }, [overduePage, overduePageSize, overdueTotal]);

  const { completionDonutData, completionDonutTotal } = useMemo((): {
    completionDonutData: { name: string; value: number; fill: string }[] | null;
    completionDonutTotal: number;
  } => {
    if (!data?.completionTrend?.length) {
      return { completionDonutData: null, completionDonutTotal: 0 };
    }
    const totalCreated = data.completionTrend.reduce(
      (s, r) => s + (r.created || 0),
      0,
    );
    const totalCompleted = data.completionTrend.reduce(
      (s, r) => s + (r.completed || 0),
      0,
    );
    if (totalCreated === 0 && totalCompleted === 0) {
      return { completionDonutData: null, completionDonutTotal: 0 };
    }
    const completionDonutData = [
      { name: "Created", value: totalCreated, fill: chartColor(0) },
      { name: "Completed", value: totalCompleted, fill: chartColor(1) },
    ];
    const completionDonutTotal = totalCreated + totalCompleted;
    return { completionDonutData, completionDonutTotal };
  }, [data]);

  if (me.isPending) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
          Advanced Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Performance metrics, workflow friction, escalation pressure, and
          recurring work in one report view.
        </p>
      </div>

      <Card className="border-border bg-background/30 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Date Range
              </Label>
              <SearchableSelect
                showSearch={false}
                value={datePreset}
                onChange={(value) => setDatePreset(value as DatePreset)}
                options={[
                  { value: "ALL_TIME", label: "All Time" },
                  { value: "TODAY", label: "Today" },
                  { value: "THIS_WEEK", label: "This Week" },
                  { value: "THIS_MONTH", label: "This Month" },
                  { value: "CUSTOM", label: "Custom" },
                ]}
              />
            </div>

            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Department
                </Label>
                <SearchableSelect
                  value={departmentId}
                  onChange={setDepartmentId}
                  showSearch={(depsQuery.data?.length ?? 0) > 5}
                  options={[
                    { value: "ALL", label: "All Departments" },
                    ...(depsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              </div>
            ) : null}

            {subordinateOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Assignee
                </Label>
                <SearchableSelect
                  value={assigneeId}
                  onChange={setAssigneeId}
                  showSearch={subordinateOptions.length > 5}
                  options={[
                    { value: "ALL", label: "All Assignees" },
                    ...subordinateOptions.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              </div>
            ) : null}
          </div>

          {showCustomRange ? (
            <div className="grid gap-4 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="reports-custom-start"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Start
                </Label>
                <Input
                  id="reports-custom-start"
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 bg-background/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="reports-custom-end"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  End
                </Label>
                <Input
                  id="reports-custom-end"
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 bg-background/60"
                />
              </div>
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            Every section below follows the same filter set. Use Custom when you
            need an exact reporting window.
          </div>
        </CardContent>
      </Card>

      {!data ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {q.isLoading ? "Loading report data..." : "No data available."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ReportKpiCard
              icon={<CheckCircle2 className="size-4" />}
              label="Completion Rate"
              value={formatPercent(data.metrics.completionRate)}
              helper={`${data.metrics.completedTasks} completed out of ${data.metrics.totalTasks} tasks in scope.`}
              tone="good"
            />
            <ReportKpiCard
              icon={<Clock3 className="size-4" />}
              label="Avg Time"
              value={formatHours(data.metrics.avgCompletionHours)}
              helper="Average completion time for finished work in this report set."
            />
            <ReportKpiCard
              icon={<AlertTriangle className="size-4" />}
              label="Overdue Tasks"
              value={String(data.overdueTasks.length)}
              helper="Tasks currently running past their deadline in this report set."
              tone={data.overdueTasks.length > 0 ? "danger" : "default"}
            />
          </div>

          <div className="grid gap-6">
            <Card className="border-border bg-background/30 shadow-sm">
              <CardHeader className="border-b border-border/60">
                <SectionTitle
                  title="Completion Trend"
                  description="Created versus completed work in the selected reporting window (totals and share)."
                />
              </CardHeader>
              <CardContent className="h-80 p-4">
                {completionDonutData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={chartTooltipStyle()}
                        formatter={(value: unknown, name: unknown) => {
                          const n =
                            typeof value === "number" ? value : Number(value);
                          const tot = completionDonutTotal;
                          const pct =
                            tot > 0 && Number.isFinite(n)
                              ? Math.round((n / tot) * 100)
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
                        data={completionDonutData}
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
                        {completionDonutData.map((d, i) => (
                          <Cell key={`${d.name}-${i}`} fill={d.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyPanel>
                    No trend data is available for the selected filters.
                  </EmptyPanel>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            {" "}
            <Card className="border-border bg-background/30 shadow-sm">
              <CardHeader className="border-b border-border/60">
                <SectionTitle
                  title="Tasks by Assignee"
                  description="Pending load and logged effort alongside delivery speed."
                />
              </CardHeader>
              <CardContent className="p-4">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">User</TableHead>
                      <TableHead className="w-[20%]">Department</TableHead>
                      <TableHead className="text-center">Assigned</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-right">Time Logged</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.assignees.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No users found matching filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.assignees.map((assignee) => (
                        <TableRow key={assignee.id}>
                          <TableCell className="font-medium">
                            {assignee.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {assignee.department || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {assignee.assigned}
                          </TableCell>
                          <TableCell className="text-center">
                            {assignee.pending}
                          </TableCell>
                          <TableCell className="text-center">
                            {assignee.completed}
                          </TableCell>
                          <TableCell className="text-center text-rose-500">
                            {assignee.overdue > 0 ? assignee.overdue : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMinutesAsLoggedTime(
                              assignee.timeLoggedMinutes,
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatHours(assignee.avgCompletionHours)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            <Card className="border-rose-500/25 bg-rose-500/5 shadow-sm">
              <CardHeader className="border-b border-rose-500/20">
                <SectionTitle
                  title="Overdue Hitlist"
                  description="Longest-running overdue tasks in the current report set."
                />
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[25%]">Task</TableHead>
                      <TableHead className="w-[20%]">Department</TableHead>
                      <TableHead className="w-[25%]">Assignee</TableHead>
                      <TableHead className="w-[20%]">Due</TableHead>
                      <TableHead className="w-[10%] text-right">
                        Overdue
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueTotal === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Great job. No overdue tasks match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      overdueTasksPage.map((task) => (
                        <TableRow
                          key={task.id}
                          className="transition-colors hover:bg-rose-500/10"
                        >
                          <TableCell className="whitespace-normal">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/tasks/${task.id}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {task.title}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {task.departmentName || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {task.assignedToName || "Unassigned"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(task.dueDate)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-300">
                            {task.daysOverdue}d
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {overdueTotal > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {overdueRangeLabel}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="overdue-hitlist-page-size"
                          className="text-xs text-muted-foreground whitespace-nowrap"
                        >
                          Rows per page
                        </Label>
                        <Select
                          value={String(overduePageSize)}
                          onValueChange={(v) => {
                            const n = Number(v) as (typeof OVERDUE_PAGE_SIZES)[number];
                            setOverduePageSize(n);
                            setOverduePage(1);
                          }}
                        >
                          <SelectTrigger
                            id="overdue-hitlist-page-size"
                            className="h-8 w-18"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OVERDUE_PAGE_SIZES.map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={overduePage <= 1 || q.isLoading}
                          onClick={() =>
                            setOverduePage((p) => Math.max(1, p - 1))
                          }
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          Page {overduePage} / {overduePageCount}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            overduePage >= overduePageCount || q.isLoading
                          }
                          onClick={() =>
                            setOverduePage((p) =>
                              Math.min(overduePageCount, p + 1),
                            )
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
