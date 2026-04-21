import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AlertCircle, TrendingUp } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// --- Types ---
type ReportsSummaryResponse = {
  assignees: {
    id: string;
    name: string;
    department: string | null;
    assigned: number;
    completed: number;
    overdue: number;
    avgCompletionHours: number;
  }[];
  departmentPerformance?: { name: string; completionPercentage: number }[];
  sla?: {
    withinTarget: number;
    breached: number;
    table: {
      ruleName: string;
      total: number;
      breached: number;
      compliancePercentage: number;
    }[];
  };
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
    dueDate: string;
    daysOverdue: number;
    priority: string | null;
  }[];
};

export function ReportsPage() {
  const me = useMe();
  const isAdmin =
    me.data?.user?.roleCode === "SUPER_ADMIN" ||
    me.data?.user?.roleCode === "COMPANY_ADMIN";

  // Filter States
  const [datePreset, setDatePreset] = useState("THIS_MONTH");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [assigneeId, setAssigneeId] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const showCustomRange = datePreset === "CUSTOM";

  // Format Dates for Query
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

  // Options Data
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
      const children = members.filter((m) => m.managerId === rootId);
      return children.reduce((acc, child) => {
        return [...acc, child, ...getDescendants(members, child.id)];
      }, [] as any[]);
    }
    return getDescendants(orgQuery.data, me.data.user.id);
  }, [orgQuery.data, me.data, isAdmin]);

  // Main Report Data
  const q = useQuery({
    queryKey: [
      "reports-summary",
      dateParams,
      departmentId,
      assigneeId,
      priority,
    ],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (dateParams.startDate) params.startDate = dateParams.startDate;
      if (dateParams.endDate) params.endDate = dateParams.endDate;
      if (departmentId !== "ALL") params.departmentId = departmentId;
      if (assigneeId !== "ALL") params.assigneeId = assigneeId;
      if (priority !== "ALL") params.priority = priority;

      const { data } = await api.get<ApiSuccess<ReportsSummaryResponse>>(
        "/api/reports/summary",
        { params },
      );
      return data.data;
    },
  });

  if (me.isPending) return <div className="p-6">Loading...</div>;

  const r = q.data;

  const slaData = r?.sla
    ? [
        { name: "Within Target", value: r.sla.withinTarget },
        { name: "Breached", value: r.sla.breached },
      ]
    : [];
  const totalCompletedTasks = r?.assignees.reduce((sum, row) => sum + row.completed, 0) ?? 0;

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
          Advanced Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Review task performance, department delivery, and overdue pressure in one place.
        </p>
      </div>

      <Card className="border-border bg-background/30 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Date Range
              </Label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="h-9 w-full bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_TIME">All Time</SelectItem>
                  <SelectItem value="TODAY">Today</SelectItem>
                  <SelectItem value="THIS_WEEK">This Week</SelectItem>
                  <SelectItem value="THIS_MONTH">This Month</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Department
                </Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="h-9 w-full bg-background/60">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Departments</SelectItem>
                    {depsQuery.data?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {subordinateOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Assignee
                </Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="h-9 w-full bg-background/60">
                    <SelectValue placeholder="All Assignees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Assignees</SelectItem>
                    {subordinateOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Priority
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9 w-full bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Priorities</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            Use Custom when you need an exact reporting window. All filters apply to the same report set.
          </div>
        </CardContent>
      </Card>

      {!r ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {q.isLoading ? "Loading report data..." : "No data available."}
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* 10. Top Performers */}
            <Card className="col-span-1 border-t-4 border-t-primary lg:col-span-3">
              <CardHeader className="flex flex-col gap-2 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary" /> Top Performers
                  (Completed Tasks)
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  Ranked by completed work, with faster average completion breaking ties.
                </div>
              </CardHeader>
              <CardContent>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead className="w-[40%]">Name</TableHead>
                      <TableHead className="w-28 text-right">Completed</TableHead>
                      <TableHead className="w-28 text-right">Share</TableHead>
                      <TableHead className="w-32 text-right">
                        Avg Time (hrs)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.topPerformers.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No performance data to display in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      r.topPerformers.map((p) => {
                        const completedShare =
                          totalCompletedTasks > 0
                            ? (p.completed / totalCompletedTasks) * 100
                            : 0;
                        return (
                          <TableRow key={p.name}>
                            <TableCell className="font-semibold">
                              {p.rank}
                            </TableCell>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              {p.completed}
                            </TableCell>
                            <TableCell className="text-right font-medium text-primary">
                              {completedShare.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              {p.avgTime.toFixed(1)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* 7. Department Performance (Admins & Directors Only) */}
            {r.departmentPerformance && r.departmentPerformance.length > 0 && (
              <Card className="col-span-1 lg:col-span-3">
                <CardHeader>
                  <CardTitle>Department-wise Completion Rating</CardTitle>
                </CardHeader>
                <CardContent className="h-75">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={r.departmentPerformance}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `${val}%`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(val: number) => `${val.toFixed(1)}%`}
                      />
                      <Bar
                        dataKey="completionPercentage"
                        name="Completion Rate %"
                        radius={[0, 4, 4, 0]}
                      >
                        {r.departmentPerformance.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.completionPercentage > 70
                                ? "#22c55e"
                                : entry.completionPercentage > 40
                                  ? "#eab308"
                                  : "#ef4444"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* 6. Tasks by Assignee Table */}
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader>
                <CardTitle>Tasks by Assignee / Direct Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-center">Assigned</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-right">
                        Avg Time (hrs)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.assignees.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No users found matching filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      r.assignees.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {u.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.department || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {u.assigned}
                          </TableCell>
                          <TableCell className="text-center">
                            {u.completed}
                          </TableCell>
                          <TableCell className="text-center text-rose-500">
                            {u.overdue > 0 ? u.overdue : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {u.avgCompletionHours.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* 8. SLA Compliance Widgets */}
            {r.sla && (
              <>
                <Card className="col-span-1 border-t-4 border-t-purple-500">
                  <CardHeader>
                    <CardTitle>SLA Compliance</CardTitle>
                  </CardHeader>
                  <CardContent className="h-62.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend verticalAlign="bottom" />
                        <Pie
                          data={slaData}
                          cx="50%"
                          cy="45%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          labelLine={false}
                        >
                          <Cell fill="#22c55e" /> {/* Within Target: Green */}
                          <Cell fill="#ef4444" /> {/* Breached: Red */}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="col-span-1 lg:col-span-2">
                  <CardHeader>
                    <CardTitle>SLA Rule Breaches</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rule Name</TableHead>
                          <TableHead className="text-center">
                            Total Tasks
                          </TableHead>
                          <TableHead className="text-center">
                            Breached
                          </TableHead>
                          <TableHead className="text-right">
                            Compliance %
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.sla.table.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="py-6 text-center text-muted-foreground"
                            >
                              No SLA data available.
                            </TableCell>
                          </TableRow>
                        ) : (
                          r.sla.table.map((rule) => (
                            <TableRow key={rule.ruleName}>
                              <TableCell className="font-medium">
                                {rule.ruleName}
                              </TableCell>
                              <TableCell className="text-center">
                                {rule.total}
                              </TableCell>
                              <TableCell className="text-center text-rose-500">
                                {rule.breached}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span
                                  className={
                                    rule.compliancePercentage >= 95
                                      ? "text-green-600"
                                      : rule.compliancePercentage >= 80
                                        ? "text-amber-500"
                                        : "text-rose-500"
                                  }
                                >
                                  {rule.compliancePercentage.toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}

            {/* 9. Overdue Hitlist */}
            <Card className="col-span-1 border-rose-500/25 bg-rose-500/5 lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-600">
                  <AlertCircle className="size-5" /> Overdue Tasks Hitlist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Title</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Priority</TableHead>
                      <TableHead className="text-right">Days Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.overdueTasks.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-6 text-center text-muted-foreground"
                        >
                          Great job! No overdue tasks matching criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      r.overdueTasks.map((t) => (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer transition-colors hover:bg-rose-500/10"
                        >
                          <TableCell>
                            <Link
                              to={`/tasks/${t.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {t.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.assignedToName || "Unassigned"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: "medium",
                            }).format(new Date(t.dueDate))}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">
                            {t.priority}
                          </TableCell>
                          <TableCell className="text-right font-bold text-rose-600">
                            {t.daysOverdue} days
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
