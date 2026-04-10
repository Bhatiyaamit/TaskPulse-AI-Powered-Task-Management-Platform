import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, Eye, Pencil, Plus } from "lucide-react";
import {
  overdueBadgeClass,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
} from "@/lib/badges";
import { FormBackLink } from "@/components/layout/CenteredFormPage";
import { DataTable } from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MeetingTaskRow = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string };
  reviewer: { id: string; name: string; username: string } | null;
};

type TasksApiResponse = {
  tasks: MeetingTaskRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const PAGE_SIZES = [10, 20, 50] as const;

const SORT_IDS = [
  "title",
  "priority",
  "status",
  "overdue",
  "dueDate",
  "reviewer",
  "updatedAt",
] as const;
type SortId = (typeof SORT_IDS)[number];

function isSortId(id: string): id is SortId {
  return (SORT_IDS as readonly string[]).includes(id);
}

function formatDay(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function priorityClass(p: string) {
  const u = p.toUpperCase();
  if (u === "URGENT")
    return "border-destructive/50 bg-destructive/15 text-destructive";
  if (u === "HIGH")
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (u === "LOW")
    return "border-muted-foreground/30 bg-muted text-muted-foreground";
  return "border-border bg-muted/60 text-foreground";
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function parseMeetingTasksUrlParams(p: URLSearchParams) {
  const pageRaw = Number(p.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const pageSizeRaw = Number(p.get("pageSize") ?? "10");
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? (pageSizeRaw as (typeof PAGE_SIZES)[number])
    : 10;

  const q = p.get("q") ?? "";
  const statusId = p.get("statusId") ?? "";
  const priorityRaw = p.get("priority") ?? "";
  const priority = PRIORITIES.includes(priorityRaw as any) ? priorityRaw : "";

  const sortByRaw = p.get("sortBy");
  const sortDirRaw = p.get("sortDir");
  const sortBy =
    sortByRaw && sortByRaw !== "" && isSortId(sortByRaw)
      ? (sortByRaw as SortId)
      : null;
  const sortDir =
    sortBy && (sortDirRaw === "asc" || sortDirRaw === "desc")
      ? sortDirRaw
      : null;

  const sorting: SortingState =
    sortBy && sortDir ? [{ id: sortBy, desc: sortDir === "desc" }] : [];
  const pagination: PaginationState = { pageIndex: page - 1, pageSize };

  return {
    page,
    pageSize,
    q,
    statusId,
    priority,
    sortBy,
    sortDir,
    sorting,
    pagination,
  };
}

export function MeetingDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useQuery({
    queryKey: ["meeting", id],
    queryFn: async () => {
      const { data } = await api.get<{ meeting: unknown }>(
        `/api/meetings/${id}`,
      );
      return data.meeting as {
        id: string;
        title: string;
        agenda: string | null;
        meetingLink: string | null;
        preparationNotes: string | null;
        priority: string;
        durationMinutes: number | null;
        computedStatus?:
          | "SCHEDULED"
          | "IN_PROGRESS"
          | "COMPLETED"
          | "CANCELLED";
        datetime: string;
        createdBy: { id: string; name: string; username: string };
        attendees: { user: { id: string; name: string; username: string } }[];
        outcomes: {
          id: string;
          outcomeText: string;
          task: { id: string; title: string } | null;
        }[];
      };
    },
  });

  const meetingTasksQuery = useQuery({
    enabled: Boolean(id) && data?.computedStatus === "COMPLETED",
    queryKey: ["meeting-tasks", id, searchParams.toString()],
    queryFn: async () => {
      const parsed = parseMeetingTasksUrlParams(searchParams);
      const apiSortBy =
        parsed.sortBy && parsed.sortDir
          ? parsed.sortBy === "overdue"
            ? "dueDate"
            : parsed.sortBy
          : undefined;
      const { data } = await api.get<TasksApiResponse>("/api/tasks", {
        params: {
          meetingId: String(id),
          page: parsed.pagination.pageIndex + 1,
          pageSize: parsed.pagination.pageSize,
          ...(parsed.statusId ? { statusId: parsed.statusId } : {}),
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.q ? { search: parsed.q } : {}),
          ...(apiSortBy && parsed.sortDir
            ? { sortBy: apiSortBy, sortDir: parsed.sortDir }
            : {}),
        },
      });
      return data;
    },
  });

  const markCompleted = useMutation({
    mutationFn: async () => {
      return api.post(`/api/meetings/${id}/complete`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
    },
  });

  const returnTo =
    id && String(id).trim()
      ? `/meetings/${encodeURIComponent(String(id))}`
      : "/meetings";

  const meeting = data;
  const parsed = useMemo(
    () => parseMeetingTasksUrlParams(searchParams),
    [searchParams],
  );
  const pagination = parsed.pagination;
  const tableSorting = parsed.sorting;

  const rows = meetingTasksQuery.data?.tasks ?? [];
  const total = meetingTasksQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  const skipSearchInputSync = useRef(false);
  const [searchInput, setSearchInput] = useState(parsed.q);
  const search = useDebouncedValue(searchInput, 350);

  useEffect(() => {
    if (skipSearchInputSync.current) {
      skipSearchInputSync.current = false;
      return;
    }
    setSearchInput(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const currentQ = prev.get("q") ?? "";
        if (currentQ === (search || "")) return prev;
        skipSearchInputSync.current = true;
        const next = new URLSearchParams(prev);
        if (search) next.set("q", search);
        else next.delete("q");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [search, setSearchParams]);

  const { data: statuses } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: async () => {
      const { data } = await api.get<{
        statuses: { id: string; code: string; label: string }[];
      }>("/api/tasks/statuses");
      return data.statuses;
    },
  });

  function statusFilterLabel(v: string) {
    if (v === "__all__") return "All statuses";
    const s = statuses?.find((x) => x.id === v);
    return s?.label ?? v;
  }

  function priorityFilterLabel(v: string) {
    if (v === "__all__") return "All priorities";
    if (!v) return "";
    return v.charAt(0) + v.slice(1).toLowerCase();
  }

  const columns = useMemo<ColumnDef<MeetingTaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: "priority",
        id: "priority",
        header: "Priority",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
              priorityClass(row.original.priority),
            )}
          >
            {row.original.priority}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (r) => r.status.label,
        header: "Status",
        cell: ({ row }) => (
          <span className={taskStatusBadgeClass(row.original.status.code)}>
            {row.original.status.label}
          </span>
        ),
      },
      {
        id: "overdue",
        header: "Overdue",
        accessorFn: (r) => {
          const isDone = String(r.status.code).toUpperCase() === "DONE";
          const d = r.dueDate ? new Date(r.dueDate).getTime() : NaN;
          return !isDone && Number.isFinite(d) && d < Date.now()
            ? "Overdue"
            : "";
        },
        cell: ({ row }) => {
          const isDone =
            String(row.original.status.code).toUpperCase() === "DONE";
          const d = row.original.dueDate
            ? new Date(row.original.dueDate).getTime()
            : NaN;
          const overdue = !isDone && Number.isFinite(d) && d < Date.now();
          return overdue ? (
            <span className={overdueBadgeClass()}>Overdue</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "dueDate",
        id: "dueDate",
        header: "Due date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDay(row.original.dueDate)}
          </span>
        ),
      },
      {
        accessorKey: "reviewer",
        id: "reviewer",
        header: "Reviewer",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.reviewer?.name ||
              row.original.reviewer?.username ||
              "—"}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: "Last updated",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    to={`/tasks/${row.original.id}?returnTo=${encodeURIComponent(
                      returnTo,
                    )}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="View task"
                    >
                      <Eye className="size-4" />
                    </Button>
                  </Link>
                }
              >
                <span />
              </TooltipTrigger>
              <TooltipContent>View</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    to={`/tasks/${row.original.id}/edit?returnTo=${encodeURIComponent(
                      returnTo,
                    )}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Edit task"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </Link>
                }
              >
                <span />
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [returnTo],
  );

  const goPrev = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const { page: curPage } = parseMeetingTasksUrlParams(p);
        const nextPage = Math.max(1, curPage - 1);
        if (nextPage <= 1) p.delete("page");
        else p.set("page", String(nextPage));
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const goNext = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const { page: curPage } = parseMeetingTasksUrlParams(p);
        const nextPage = Math.min(pageCount, curPage + 1);
        if (nextPage <= 1) p.delete("page");
        else p.set("page", String(nextPage));
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams, pageCount]);

  const onChangeSort = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const next =
        typeof updater === "function" ? updater(tableSorting) : updater;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const first = next[0];
          if (!first) {
            p.delete("sortBy");
            p.delete("sortDir");
          } else if (isSortId(String(first.id))) {
            const id = first.id as SortId;
            const dir: "asc" | "desc" = first.desc ? "desc" : "asc";
            p.set("sortBy", id);
            p.set("sortDir", dir);
          } else {
            p.delete("sortBy");
            p.delete("sortDir");
          }
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    },
    [tableSorting, setSearchParams],
  );

  const table = useReactTable({
    data: rows,
    columns,
    pageCount,
    state: { pagination, sorting: tableSorting },
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: true,
    onPaginationChange: (updater) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const cur = parseMeetingTasksUrlParams(p).pagination;
          const next = typeof updater === "function" ? updater(cur) : updater;
          const pageNum = next.pageIndex + 1;
          if (pageNum <= 1) p.delete("page");
          else p.set("page", String(pageNum));
          if (next.pageSize === 10) p.delete("pageSize");
          else p.set("pageSize", String(next.pageSize));
          return p;
        },
        { replace: true },
      );
    },
    getCoreRowModel: getCoreRowModel(),
  });

  if (!meeting) return <div className="text-muted-foreground">Loading…</div>;
  const canMarkCompleted =
    meeting.computedStatus !== "COMPLETED" &&
    meeting.computedStatus !== "CANCELLED";
  const canEditMeeting = meeting.computedStatus === "SCHEDULED";
  const isCompleted = meeting.computedStatus === "COMPLETED";

  return (
    <div className="space-y-2">
      <div className="flex justify-start items-center">
        <FormBackLink to="/meetings">Back to meetings</FormBackLink>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            {meeting.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(meeting.datetime).toLocaleString()} ·{" "}
            {meeting.durationMinutes ?? 30} min ·{" "}
            <span className={taskPriorityBadgeClass(meeting.priority)}>
              {meeting.priority}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted ? null : (
            <>
              {canEditMeeting ? (
                <Link to={`/meetings/${meeting.id}/edit`}>
                  <Button variant="outline">
                    <Pencil className="size-3" />
                    Edit
                  </Button>
      </Link>
              ) : (
                <Button variant="outline" disabled>
                  <Pencil className="size-3" />
                  Edit
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                isLoading={markCompleted.isPending}
                disabled={!canMarkCompleted || markCompleted.isPending}
                onClick={() => markCompleted.mutate()}
              >
                <CheckCircle2 className="size-4" />
                <span>Mark as completed</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Host</div>
            <div className="text-foreground">
              {meeting.createdBy.name}{" "}
              <span className="text-muted-foreground">
                · {meeting.createdBy.username}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Attendees</div>
            <div className="text-foreground">
              {(meeting.attendees ?? []).length
                ? meeting.attendees.map((a) => a.user.name).join(", ")
                : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Meeting link</div>
            {meeting.meetingLink ? (
              <a
                href={meeting.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open link <ExternalLink className="size-4" />
              </a>
            ) : (
              <div className="text-muted-foreground">—</div>
            )}
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Agenda</div>
            <div className="whitespace-pre-wrap text-muted-foreground">
              {meeting.agenda ?? "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">
              Preparation notes
            </div>
            <div className="whitespace-pre-wrap text-muted-foreground">
              {meeting.preparationNotes ?? "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {isCompleted ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Meeting tasks</CardTitle>
              <Link
                to={`/tasks/new?meetingId=${encodeURIComponent(
                  String(id ?? ""),
                )}&returnTo=${encodeURIComponent(returnTo)}`}
              >
                <Button>
                  <Plus className="size-4" />
                  Add task
                </Button>
                </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="meeting-task-search">Search</Label>
                <Input
                  id="meeting-task-search"
                  placeholder="Title…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={parsed.statusId || "__all__"}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (v === "__all__") p.delete("statusId");
                        else p.set("statusId", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                  itemToStringLabel={statusFilterLabel}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    {(statuses ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={parsed.priority || "__all__"}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (v === "__all__") p.delete("priority");
                        else p.set("priority", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                  itemToStringLabel={priorityFilterLabel}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All priorities</SelectItem>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border">
              <DataTable
                table={table}
                columnCount={columns.length}
                sort={tableSorting}
                onChangeSort={onChangeSort}
                isLoading={meetingTasksQuery.isLoading}
                emptyMessage="No tasks for this meeting yet."
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {total === 0
                    ? "0 tasks"
                    : `Showing ${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                        (pagination.pageIndex + 1) * pagination.pageSize,
                        total,
                      )} of ${total}`}
                </span>
                <span className="hidden sm:inline">·</span>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="meeting-task-page-size"
                    className="text-muted-foreground"
                  >
                    Rows per page
                  </Label>
                  <Select
                    value={String(pagination.pageSize)}
                    onValueChange={(v) => {
                      const n = Number(v) as (typeof PAGE_SIZES)[number];
                      setSearchParams(
                        (prev) => {
                          const p = new URLSearchParams(prev);
                          if (n === 10) p.delete("pageSize");
                          else p.set("pageSize", String(n));
                          p.delete("page");
                          return p;
                        },
                        { replace: true },
                      );
                    }}
                    itemToStringLabel={(vv) => vv}
                  >
                    <SelectTrigger
                      id="meeting-task-page-size"
                      className="h-8 w-18"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    pagination.pageIndex <= 0 || meetingTasksQuery.isLoading
                  }
                  onClick={goPrev}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {pagination.pageIndex + 1} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    pagination.pageIndex >= pageCount - 1 ||
                    meetingTasksQuery.isLoading
                  }
                  onClick={goNext}
                >
                  Next
          </Button>
              </div>
            </div>
          </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
