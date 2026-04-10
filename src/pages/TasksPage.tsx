import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { overdueBadgeClass } from "@/lib/badges";
import { useMe } from "@/hooks/useAuth";

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string };
  createdFrom: string;
  meetingId: string | null;
  reviewer: { id: string; name: string; username: string } | null;
};

type TasksApiResponse = {
  tasks: TaskRow[];
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

function toEndOfDayIso(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date(dateStr).toISOString();
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const DEFAULT_PAGE_SIZE = 10;

const TASK_QUEUES = ["all", "my", "given", "support", "review"] as const;
type TaskQueue = (typeof TASK_QUEUES)[number];

function isTaskQueue(s: string | null): s is TaskQueue {
  return s != null && (TASK_QUEUES as readonly string[]).includes(s);
}

function parseTasksUrlParams(searchParams: URLSearchParams) {
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get("page") || "1", 10) || 1,
  );
  const pageSizeRaw = Number.parseInt(
    searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;
  const sortByRaw = searchParams.get("sortBy");
  const sortDirRaw = searchParams.get("sortDir");
  const explicitSort =
    sortByRaw != null &&
    sortByRaw !== "" &&
    isSortId(sortByRaw) &&
    (sortDirRaw === "asc" || sortDirRaw === "desc");

  const apiSortBy: SortId = explicitSort ? sortByRaw : "updatedAt";
  const apiSortDir: "asc" | "desc" = explicitSort ? sortDirRaw : "desc";

  const tableSorting: SortingState = explicitSort
    ? [{ id: sortByRaw, desc: sortDirRaw === "desc" }]
    : [];
  const statusId = searchParams.get("statusId") || "";
  const priorityRaw = searchParams.get("priority") || "";
  const priority = PRIORITIES.includes(
    priorityRaw as (typeof PRIORITIES)[number],
  )
    ? priorityRaw
    : "";
  const dueFrom = searchParams.get("dueFrom") || "";
  const dueTo = searchParams.get("dueTo") || "";
  const queueRaw = searchParams.get("queue");
  const queue: TaskQueue = isTaskQueue(queueRaw) ? queueRaw : "all";
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize,
  };
  return {
    page,
    pagination,
    tableSorting,
    apiSortBy,
    apiSortDir,
    queue,
    statusId,
    priority,
    dueFrom,
    dueTo,
  };
}

export function TasksPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const skipSearchInputSync = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const listParams = useMemo(
    () => parseTasksUrlParams(searchParams),
    [searchParams],
  );
  const {
    page,
    pagination,
    tableSorting,
    apiSortBy,
    apiSortDir,
    queue,
    statusId,
    priority,
    dueFrom,
    dueTo,
  } = listParams;

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("q") ?? "",
  );
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

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/api/tasks/${taskId}`);
    },
    onSuccess: async (_data, taskId) => {
      qc.setQueriesData<TasksApiResponse>(
        { queryKey: ["tasks"], exact: false },
        (old) => {
          if (!old?.tasks) return old;
          const nextTasks = old.tasks.filter((t) => t.id !== taskId);
          const removed = old.tasks.length - nextTasks.length;
          return {
            ...old,
            tasks: nextTasks,
            total: Math.max(0, old.total - removed),
          };
        },
      );
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success("Task deleted");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Could not delete task.");
    },
  });

  const query = useQuery({
    queryKey: [
      "tasks",
      queue,
      pagination.pageIndex,
      pagination.pageSize,
      statusId,
      priority,
      dueFrom,
      dueTo,
      search,
      apiSortBy,
      apiSortDir,
    ],
    queryFn: async () => {
      const { data } = await api.get<TasksApiResponse>("/api/tasks", {
        params: {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          ...(queue !== "all" ? { queue } : {}),
          ...(queue === "review" && me.data?.user?.id
            ? { reviewerId: me.data.user.id }
            : {}),
          ...(statusId ? { statusId } : {}),
          ...(priority ? { priority } : {}),
          ...(dueFrom
            ? { dueFrom: new Date(dueFrom + "T00:00:00").toISOString() }
            : {}),
          ...(dueTo ? { dueTo: toEndOfDayIso(dueTo) } : {}),
          ...(search ? { search } : {}),
          sortBy: apiSortBy,
          sortDir: apiSortDir,
        },
      });
      return data;
    },
  });

  const rows = query.data?.tasks ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  useEffect(() => {
    if (query.isLoading || !query.data) return;
    const maxPage = Math.max(1, Math.ceil(total / pagination.pageSize));
    if (page > maxPage) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (maxPage <= 1) p.delete("page");
          else p.set("page", String(maxPage));
          return p;
        },
        { replace: true },
      );
    }
  }, [
    query.isLoading,
    query.data,
    total,
    pagination.pageSize,
    page,
    setSearchParams,
  ]);

  const getTaskRowProps = useCallback(
    (_row: Row<TaskRow>) => ({
      className: "cursor-default",
    }),
    [],
  );

  const columns = useMemo<ColumnDef<TaskRow>[]>(
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
          <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs">
            {row.original.status.label}
          </span>
        ),
      },
      {
        id: "overdue",
        header: "Overdue",
        enableSorting: false,
        accessorFn: (r) => {
          if (!r.dueDate) return 0;
          const due = new Date(r.dueDate).getTime();
          if (Number.isNaN(due)) return 0;
          const isDone = String(r.status.code).toUpperCase() === "DONE";
          return !isDone && due < Date.now() ? 1 : 0;
        },
        cell: ({ row }) => {
          const dueDate = row.original.dueDate;
          if (!dueDate) return <span className="text-muted-foreground">—</span>;
          const due = new Date(dueDate).getTime();
          if (Number.isNaN(due))
            return <span className="text-muted-foreground">—</span>;
          const isDone =
            String(row.original.status.code).toUpperCase() === "DONE";
          const isOverdue = !isDone && due < Date.now();
          return isOverdue ? (
            <span className={overdueBadgeClass()}>Overdue</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "createdFrom",
        header: "Created from",
        enableSorting: false,
        accessorFn: (r) => r.createdFrom,
        cell: ({ row }) => {
          const cf = String(row.original.createdFrom ?? "TASK").toUpperCase();
          if (cf === "MEETING" && row.original.meetingId) {
            return (
              <Link
                to={`/meetings/${row.original.meetingId}`}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Meeting
              </Link>
            );
          }
          return <span className="text-muted-foreground">Task</span>;
        },
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
        id: "reviewer",
        accessorFn: (r) => r.reviewer?.name ?? "",
        header: "Reviewer",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.reviewer?.name ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: "Last update",
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
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
            role="group"
            aria-label="Task actions"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="View task"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/tasks/${row.original.id}`);
                    }}
                  />
                }
              >
                <Eye className="size-4" />
              </TooltipTrigger>
              <TooltipContent>View</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Edit task"
                    isLoading={deleteTask.isPending}
                    disabled={deleteTask.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/tasks/${row.original.id}/edit`);
                    }}
                  />
                }
              >
                <Pencil className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete task"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({
                        id: row.original.id,
                        title: row.original.title,
                      });
                    }}
                    isLoading={deleteTask.isPending}
                    disabled={deleteTask.isPending}
                  />
                }
              >
                <Trash2 className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [navigate],
  );

  const onChangeSort = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const cur = parseTasksUrlParams(p).tableSorting;
          const next = typeof updater === "function" ? updater(cur) : updater;
          const first = next[0];
          if (!first) {
            p.delete("sortBy");
            p.delete("sortDir");
          } else {
            const id = isSortId(String(first.id))
              ? (first.id as SortId)
              : "updatedAt";
            const dir: "asc" | "desc" = first.desc ? "desc" : "asc";
            p.set("sortBy", id);
            p.set("sortDir", dir);
          }
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const table = useReactTable({
    data: rows,
    columns,
    pageCount,
    state: { pagination, sorting: tableSorting },
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: true,
    onSortingChange: () => {},
    onPaginationChange: (updater) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const cur = parseTasksUrlParams(p).pagination;
          const next = typeof updater === "function" ? updater(cur) : updater;
          const pageNum = next.pageIndex + 1;
          if (pageNum <= 1) p.delete("page");
          else p.set("page", String(pageNum));
          if (next.pageSize === DEFAULT_PAGE_SIZE) p.delete("pageSize");
          else p.set("pageSize", String(next.pageSize));
          return p;
        },
        { replace: true },
      );
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const fromIdx =
    total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const toIdx = Math.min(
    (pagination.pageIndex + 1) * pagination.pageSize,
    total,
  );

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

  const goPrev = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const { page: curPage } = parseTasksUrlParams(p);
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
        const { page: curPage } = parseTasksUrlParams(p);
        const nextPage = Math.min(pageCount, curPage + 1);
        if (nextPage <= 1) p.delete("page");
        else p.set("page", String(nextPage));
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams, pageCount]);

  const setQueue = useCallback(
    (next: TaskQueue) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "all") p.delete("queue");
          else p.set("queue", next);
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const queueTabs: { id: TaskQueue; label: string }[] = [
    { id: "all", label: "All" },
    { id: "my", label: "My tasks" },
    { id: "given", label: "Given by me" },
    { id: "support", label: "Supporting" },
    { id: "review", label: "Review queue" },
  ];

  return (
    <div className="space-y-6">
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be permanently removed. You can’t undo this.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTask.isPending}
              onClick={() => {
                if (deleteTarget) deleteTask.mutate(deleteTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            Open a task for the full lifecycle. Sort columns and filter the
            list.
          </p>
        </div>
        <Link to="/tasks/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          New task
        </Link>
      </div>

      <Card className="p-3">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Task queue"
        >
          {queueTabs.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={queue === id ? "secondary" : "ghost"}
              className={cn(
                "rounded-full ring-1 ring-transparent transition-colors",
                queue === id
                  ? "pointer-events-none bg-[color-mix(in_oklab,var(--brand),transparent_88%)] text-foreground ring-[color-mix(in_oklab,var(--brand),transparent_70%)] dark:bg-[color-mix(in_oklab,var(--brand),transparent_84%)]"
                  : "hover:bg-[color-mix(in_oklab,var(--brand),white_72%)] hover:text-foreground hover:ring-[color-mix(in_oklab,var(--brand),transparent_82%)] dark:hover:bg-[color-mix(in_oklab,var(--brand),transparent_88%)]",
              )}
              aria-pressed={queue === id}
              onClick={() => setQueue(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="task-search">Search</Label>
            <Input
              id="task-search"
              placeholder="Title or description…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusId || "__all__"}
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
              value={priority || "__all__"}
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
          <div className="space-y-2">
            <Label htmlFor="due-from">Due from</Label>
            <Input
              id="due-from"
              type="date"
              value={dueFrom}
              onChange={(e) => {
                const v = e.target.value;
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    if (v) p.set("dueFrom", v);
                    else p.delete("dueFrom");
                    p.delete("page");
                    return p;
                  },
                  { replace: true },
                );
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due-to">Due to</Label>
            <Input
              id="due-to"
              type="date"
              value={dueTo}
              onChange={(e) => {
                const v = e.target.value;
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    if (v) p.set("dueTo", v);
                    else p.delete("dueTo");
                    p.delete("page");
                    return p;
                  },
                  { replace: true },
                );
              }}
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <DataTable
          table={table}
          columnCount={columns.length}
          sort={tableSorting}
          onChangeSort={onChangeSort}
          isLoading={query.isLoading}
          emptyMessage="No tasks match your filters."
          getRowProps={getTaskRowProps}
        />

        <div className="flex flex-col gap-4 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {total === 0
                ? "0 tasks"
                : `Showing ${fromIdx}–${toIdx} of ${total}`}
            </span>
            <span className="hidden sm:inline">·</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="page-size" className="text-muted-foreground">
                Rows per page
              </Label>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(v) => {
                  const n = Number(v) as (typeof PAGE_SIZES)[number];
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      if (n === DEFAULT_PAGE_SIZE) p.delete("pageSize");
                      else p.set("pageSize", String(n));
                      p.delete("page");
                      return p;
                    },
                    { replace: true },
                  );
                }}
                itemToStringLabel={(v) => v}
              >
                <SelectTrigger id="page-size" className="h-8 w-18">
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
              size="sm"
              onClick={goPrev}
              disabled={pagination.pageIndex <= 0 || query.isLoading}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goNext}
              disabled={
                pagination.pageIndex >= pageCount - 1 || query.isLoading
              }
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
