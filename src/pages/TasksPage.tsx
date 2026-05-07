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
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Repeat,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
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
import { SearchableFilterSelect } from "@/components/SearchableFilterSelect";
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
import {
  overdueBadgeClass,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
} from "@/lib/badges";
import { useMe } from "@/hooks/useAuth";
import {
  P,
  taskModuleCanCreate,
  taskModuleCanDelete,
  taskModuleCanList,
  taskModuleCanUpdate,
} from "@/lib/permissions";
import {
  legacyQueueToDefaultMyTab,
  normalizeMyTasksTab,
  normalizeTaskQueue,
  type MyTasksTab,
  type TaskQueue,
} from "@/lib/taskQueues";

type TaskRow = {
  id: string;
  title: string;
  priority?: string | null;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string };
  createdFrom: string;
  createdBy: { id: string; name: string; username: string } | null;
  assignedTo: { id: string; name: string; username: string } | null;
  isRecurring?: boolean | null;
  recurrenceSourceTaskId?: string | null;
  meetingId: string | null;
  reviewer: { id: string; name: string; username: string } | null;
  recurrenceGroupId?: string | null;
};
type TeamMemberOption = {
  id: string;
  name: string;
  username: string;
};

type TasksApiResponse = {
  tasks: TaskRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZES = [10, 20, 50] as const;
const LIST_STATE_QUERY_KEYS = [
  "q",
  "statusId",
  "priority",
  "dueFrom",
  "dueTo",
  "sortBy",
  "sortDir",
  "page",
  "pageSize",
  "teamUserId",
  "teamUserIds",
  "teamUsersMode",
  "recurrenceGroupId",
] as const;

/** Cleared when switching task queue or My tasks tab — keeps status & due filters. */
const QUEUE_OR_MY_TAB_NAV_CLEAR_KEYS = [
  "page",
  "pageSize",
  "q",
  "sortBy",
  "sortDir",
  "teamUserId",
  "teamUserIds",
  "teamUsersMode",
  "recurrenceGroupId",
] as const;

const SORT_IDS = [
  "title",
  "status",
  "priority",
  "createdBy",
  "assignedTo",
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
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
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
  const rawQueueParam = searchParams.get("queue");
  const queue: TaskQueue = normalizeTaskQueue(rawQueueParam);
  const defaultSortBy: SortId =
    queue === "recurring" || queue === "given" ? "dueDate" : "updatedAt";
  const defaultSortDir: "asc" | "desc" =
    queue === "recurring" || queue === "given" ? "desc" : "desc";
  const apiSortBy: SortId = explicitSort ? sortByRaw : defaultSortBy;
  const apiSortDir: "asc" | "desc" = explicitSort ? sortDirRaw : defaultSortDir;

  const tableSorting: SortingState = explicitSort
    ? [{ id: sortByRaw, desc: sortDirRaw === "desc" }]
    : [];
  const statusId = searchParams.get("statusId") || "";
  const priority = searchParams.get("priority") || "";
  const dueFrom = searchParams.get("dueFrom") || "";
  const dueTo = searchParams.get("dueTo") || "";
  const teamUserIds = (
    searchParams.get("teamUserIds") ??
    searchParams.get("teamUserId") ??
    ""
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const teamUsersMode =
    searchParams.get("teamUsersMode") === "none" ? "none" : "all_or_custom";
  const myTab: MyTasksTab =
    queue === "my_tasks"
      ? normalizeMyTasksTab(
          searchParams.get("myTab") ??
            legacyQueueToDefaultMyTab(rawQueueParam) ??
            undefined,
        )
      : "assigned";
  const recurrenceGroupId = searchParams.get("recurrenceGroupId") || "";
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
    teamUserIds,
    teamUsersMode,
    myTab,
    recurrenceGroupId,
  };
}

function clearListStateParams(p: URLSearchParams) {
  for (const key of LIST_STATE_QUERY_KEYS) p.delete(key);
}

function clearQueueOrMyTabNavParams(p: URLSearchParams) {
  for (const key of QUEUE_OR_MY_TAB_NAV_CLEAR_KEYS) p.delete(key);
}

function TaskSeriesBadge({
  taskId,
  recurrenceGroupId,
}: {
  taskId: string;
  recurrenceGroupId: string;
}) {
  const seriesQuery = useQuery({
    queryKey: ["task-series", recurrenceGroupId],
    queryFn: async () => {
      const { data } = await api.get(`/api/tasks/series/${recurrenceGroupId}`);
      return data.data.tasks as { id: string; startDate: string }[];
    },
    staleTime: 60000,
  });

  if (!seriesQuery.data) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 ml-2 align-middle">
        <Repeat className="size-2.5" /> RECURRING
      </span>
    );
  }

  const seriesIndex = seriesQuery.data.findIndex((t) => t.id === taskId) + 1;
  const seriesTotal = seriesQuery.data.length;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 ml-2 align-middle">
      <Repeat className="size-2.5" /> RECURRING{" "}
      {seriesIndex > 0 ? `(${seriesIndex} of ${seriesTotal})` : ""}
    </span>
  );
}

export function TasksPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const perms = me.data?.permissions;
  const tenantContextKey =
    me.data?.selectedTenantId ??
    me.data?.user.tenantId ??
    "__no-tenant-context__";
  const isSuperAdminCompanyMode = Boolean(
    me.data?.user.tenantId == null &&
    String(me.data?.user.roleCode ?? "").toUpperCase() === "SUPER_ADMIN" &&
    me.data?.selectedTenantId,
  );

  const canListTasks = isSuperAdminCompanyMode || taskModuleCanList(perms);
  const canCreateTask = isSuperAdminCompanyMode || taskModuleCanCreate(perms);
  const canUpdateTask = isSuperAdminCompanyMode || taskModuleCanUpdate(perms);
  const canDeleteTask = isSuperAdminCompanyMode || taskModuleCanDelete(perms);
  const [searchParams, setSearchParams] = useSearchParams();
  const skipSearchInputSync = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    recurrenceGroupId?: string | null;
    isRecurring?: boolean | null;
  } | null>(null);
  const [deleteScope, setDeleteScope] = useState<"this" | "future" | "all">(
    "this",
  );

  const [editTarget, setEditTarget] = useState<{
    id: string;
    recurrenceGroupId?: string | null;
  } | null>(null);
  const [editScope, setEditScope] = useState<"this" | "future" | "all">("this");

  const listParams = useMemo(
    () => parseTasksUrlParams(searchParams),
    [searchParams],
  );
  const listReturnTo = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  }, [searchParams]);
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
    teamUserIds,
    teamUsersMode,
    myTab,
    recurrenceGroupId,
  } = listParams;

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [teamUsersOpen, setTeamUsersOpen] = useState(false);
  const [teamUsersSearch, setTeamUsersSearch] = useState("");
  const teamUsersDropdownRef = useRef<HTMLDivElement | null>(null);
  const search = useDebouncedValue(searchInput, 350);
  const prevTenantContextKeyRef = useRef<string>(tenantContextKey);

  useEffect(() => {
    const prev = prevTenantContextKeyRef.current;
    if (prev === tenantContextKey) return;
    prevTenantContextKeyRef.current = tenantContextKey;
    // Company switch should not keep stale task/team filters from previous tenant.
    setSearchParams(
      (prevParams) => {
        const p = new URLSearchParams(prevParams);
        clearListStateParams(p);
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams, tenantContextKey]);

  useEffect(() => {
    if (!teamUsersOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!teamUsersDropdownRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!teamUsersDropdownRef.current.contains(target)) {
        setTeamUsersOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [teamUsersOpen]);

  useEffect(() => {
    if (!teamUsersOpen) setTeamUsersSearch("");
  }, [teamUsersOpen]);

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
    queryKey: ["task-statuses", tenantContextKey],
    enabled: canListTasks,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ statuses: { id: string; code: string; label: string }[] }>
      >("/api/tasks/statuses");
      return data.data.statuses;
    },
  });
  const teamMembersQuery = useQuery({
    queryKey: ["team-members", "task-team-options", tenantContextKey],
    enabled: canListTasks && queue === "team",
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<
          TeamMemberOption[],
          { page: number; limit: number; total: number }
        >
      >("/api/team/members", {
        params: {
          page: 1,
          pageSize: 100,
          hierarchyScope: "subordinates",
          sortBy: "name",
          sortDir: "asc",
        },
      });
      return data.data;
    },
  });
  const teamMembers = teamMembersQuery.data ?? [];
  const teamUsersSearchNorm = teamUsersSearch.trim().toLowerCase();
  const filteredTeamMembers = useMemo(() => {
    if (!teamUsersSearchNorm) return teamMembers;
    return teamMembers.filter((u) => {
      const name = (u.name ?? "").toLowerCase();
      const username = (u.username ?? "").toLowerCase();
      return (
        name.includes(teamUsersSearchNorm) ||
        username.includes(teamUsersSearchNorm)
      );
    });
  }, [teamMembers, teamUsersSearchNorm]);
  const allTeamUserIds = teamMembers.map((u) => u.id);
  const allTeamUserIdSet = new Set(allTeamUserIds);
  const validTeamUserIds = teamUserIds.filter((id) => allTeamUserIdSet.has(id));
  const effectiveSelectedTeamUserIds =
    teamUsersMode === "none"
      ? []
      : validTeamUserIds.length > 0
        ? validTeamUserIds
        : allTeamUserIds;
  const isExplicitAllTeamUsersFilter =
    teamUsersMode !== "none" &&
    validTeamUserIds.length > 0 &&
    allTeamUserIds.length > 0 &&
    validTeamUserIds.length === allTeamUserIds.length;
  const isAllTeamUsersSelected =
    allTeamUserIds.length > 0 &&
    effectiveSelectedTeamUserIds.length === allTeamUserIds.length;

  const deleteTask = useMutation({
    mutationFn: async (params: {
      taskId: string;
      recurrenceGroupId?: string | null;
      isRecurring?: boolean | null;
      scope?: "this" | "future" | "all";
    }) => {
      if (params.recurrenceGroupId && params.scope && params.scope !== "this") {
        // Bulk materialized series (has recurrenceGroupId)
        await api.delete(`/api/tasks/series/${params.recurrenceGroupId}`, {
          data: { scope: params.scope, fromTaskId: params.taskId },
        });
      } else if (
        params.isRecurring &&
        !params.recurrenceGroupId &&
        params.scope === "all"
      ) {
        // Live-spawning recurring source: delete source + all children
        await api.delete(`/api/tasks/${params.taskId}`, {
          params: { scope: "all" },
        });
      } else {
        await api.delete(`/api/tasks/${params.taskId}`);
      }
    },
    onSuccess: async (_data, params) => {
      qc.setQueriesData<TasksApiResponse>(
        { queryKey: ["tasks"], exact: false },
        (old) => {
          if (!old?.tasks) return old;
          const nextTasks =
            params.scope === "all" && params.recurrenceGroupId
              ? old.tasks.filter(
                  (t) => t.recurrenceGroupId !== params.recurrenceGroupId,
                )
              : params.scope === "all" && params.isRecurring
                ? old.tasks.filter(
                    (t) =>
                      t.id !== params.taskId &&
                      t.recurrenceSourceTaskId !== params.taskId,
                  )
                : params.scope === "future" && params.recurrenceGroupId
                  ? old.tasks.filter(
                      (t) => t.recurrenceGroupId !== params.recurrenceGroupId,
                    )
                  : old.tasks.filter((t) => t.id !== params.taskId);
          const removed = old.tasks.length - nextTasks.length;
          return {
            ...old,
            tasks: nextTasks,
            total: Math.max(0, old.total - removed),
          };
        },
      );
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["task", params.taskId] });
      toast.success("Task deleted");
      setDeleteTarget(null);
      setDeleteScope("this");
    },
    onError: () => {
      toast.error("Could not delete task.");
    },
  });

  const query = useQuery({
    queryKey: [
      "tasks",
      tenantContextKey,
      queue,
      queue === "my_tasks" ? myTab : null,
      pagination.pageIndex,
      pagination.pageSize,
      statusId,
      priority,
      dueFrom,
      dueTo,
      validTeamUserIds.join(","),
      teamUsersMode,
      search,
      recurrenceGroupId,
      apiSortBy,
      apiSortDir,
    ],
    enabled: canListTasks,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<TaskRow[], { page: number; limit: number; total: number }>
      >("/api/tasks", {
        params: {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          queue,
          ...(queue === "my_tasks" ? { myTab: myTab ?? "assigned" } : {}),
          ...(statusId ? { statusId } : {}),
          ...(priority ? { priority } : {}),
          ...(dueFrom
            ? { dueFrom: new Date(dueFrom + "T00:00:00").toISOString() }
            : {}),
          ...(dueTo ? { dueTo: toEndOfDayIso(dueTo) } : {}),
          ...(teamUsersMode === "none"
            ? { assignedToIds: "__none__" }
            : validTeamUserIds.length && !isExplicitAllTeamUsersFilter
              ? { assignedToIds: validTeamUserIds.join(",") }
              : {}),
          ...(search ? { search } : {}),
          ...(recurrenceGroupId ? { recurrenceGroupId } : {}),
          sortBy: apiSortBy,
          sortDir: apiSortDir,
        },
      });
      return {
        tasks: data.data,
        total: data.meta?.total ?? 0,
        page: data.meta?.page ?? pagination.pageIndex + 1,
        pageSize: data.meta?.limit ?? pagination.pageSize,
      } satisfies TasksApiResponse;
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

  const columns = useMemo<ColumnDef<TaskRow>[]>(() => {
    const cols: ColumnDef<TaskRow>[] = [
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        enableSorting: false,
        cell: ({ row }) => {
          const title = row.original.title;
          const badge = row.original.recurrenceGroupId ? (
            <TaskSeriesBadge
              taskId={row.original.id}
              recurrenceGroupId={row.original.recurrenceGroupId}
            />
          ) : null;

          return canListTasks ? (
            <button
              type="button"
              className="cursor-pointer text-left font-medium text-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                navigate(
                  `/tasks/${row.original.id}?returnTo=${encodeURIComponent(listReturnTo)}`,
                );
              }}
              aria-label={`Open task: ${title}`}
            >
              {title}
              {badge}
            </button>
          ) : (
            <span className="font-medium text-foreground">
              {title}
              {badge}
            </span>
          );
        },
      },
      {
        id: "status",
        accessorFn: (r) => r.status.label,
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <span className={taskStatusBadgeClass(row.original.status.code)}>
            {row.original.status.label}
          </span>
        ),
      },
      {
        id: "priority",
        accessorFn: (r) => String(r.priority ?? "MEDIUM").toUpperCase(),
        header: "Priority",
        enableSorting: false,
        cell: ({ row }) => {
          const priority = String(
            row.original.priority ?? "MEDIUM",
          ).toUpperCase();
          return (
            <span className={taskPriorityBadgeClass(priority)}>{priority}</span>
          );
        },
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
          const isRecurringTask =
            Boolean(row.original.isRecurring) ||
            Boolean(row.original.recurrenceSourceTaskId);
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
          if (isRecurringTask) {
            return (
              <span className="text-muted-foreground">Recurring task</span>
            );
          }
          return <span className="text-muted-foreground">Task</span>;
        },
      },
      {
        id: "createdBy",
        accessorFn: (r) => r.createdBy?.name ?? "",
        header: "Created by",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.createdBy?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "assignedTo",
        accessorFn: (r) => r.assignedTo?.name ?? "",
        header: "Assigned to",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.assignedTo?.name ?? "—"}
          </span>
        ),
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
        enableSorting: false,
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
    ];

    const hideActionsForMyTaskTabs =
      queue === "my_tasks" &&
      (myTab === "assigned" || myTab === "supporting" || myTab === "review");

    // "My team task" is read-only, selected My Tasks tabs hide actions,
    // and users without both update/delete permissions should not see the column at all.
    if (
      queue !== "team" &&
      !hideActionsForMyTaskTabs &&
      (canUpdateTask || canDeleteTask)
    ) {
      cols.push({
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
            {canUpdateTask ? (
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
                        if (row.original.recurrenceGroupId) {
                          setEditScope("this");
                          setEditTarget({
                            id: row.original.id,
                            recurrenceGroupId: row.original.recurrenceGroupId,
                          });
                        } else {
                          navigate(
                            `/tasks/${row.original.id}/edit?returnTo=${encodeURIComponent(listReturnTo)}`,
                          );
                        }
                      }}
                    />
                  }
                >
                  <Pencil className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            ) : null}
            {canDeleteTask ? (
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
                        setDeleteScope("this");
                        setDeleteTarget({
                          id: row.original.id,
                          title: row.original.title,
                          recurrenceGroupId: row.original.recurrenceGroupId,
                          isRecurring: row.original.isRecurring,
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
            ) : null}
          </div>
        ),
      });
    }

    return cols;
  }, [
    navigate,
    canListTasks,
    canUpdateTask,
    canDeleteTask,
    deleteTask.isPending,
    queue,
    myTab,
    listReturnTo,
  ]);

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

  const listEmptyMessage =
    queue === "recurring"
      ? "No recurring tasks yet."
      : queue === "my_tasks"
        ? myTab === "assigned"
          ? "No tasks assigned to you."
          : myTab === "created"
            ? "No tasks created by you."
            : myTab === "supporting"
              ? "No tasks where you are the supporter."
              : "No tasks where you are assigned as reviewer."
        : "No tasks match your filters.";
  const selectedTeamUsers = teamMembers.filter((u) =>
    effectiveSelectedTeamUserIds.includes(u.id),
  );

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
          clearQueueOrMyTabNavParams(p);
          if (next === "my_tasks") {
            p.delete("queue");
          } else {
            p.set("queue", next);
            p.delete("myTab");
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setMyTab = useCallback(
    (tab: MyTasksTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          clearQueueOrMyTabNavParams(p);
          if (tab === "assigned") p.delete("myTab");
          else p.set("myTab", tab);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const queueTabs: { id: TaskQueue; label: string }[] = [
    { id: "my_tasks", label: "My tasks" },
    { id: "given", label: "Given by me" },
    { id: "team", label: "My team task" },
    { id: "recurring", label: "Recurring task" },
  ];

  if (me.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (me.data && !canListTasks) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            Task list and filters require read access.
          </p>
        </div>
        <Card className="border-amber-500/35 bg-muted/30 p-6">
          <div className="flex gap-4">
            <ShieldAlert
              className="size-10 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                You don&apos;t have permission to view tasks
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your role does not include{" "}
                <span className="font-medium text-foreground">
                  Tasks → Read
                </span>{" "}
                (
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {P.TASKS_READ}
                </code>
                ). Ask an administrator to enable it if you need to browse the
                task list.
              </p>
              {canCreateTask ? (
                <p className="text-sm text-muted-foreground">
                  You can still create new tasks.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {canCreateTask ? (
                  <Link
                    to={`/tasks/new?returnTo=${encodeURIComponent(listReturnTo)}`}
                    className={cn(buttonVariants())}
                  >
                    <Plus className="size-4" />
                    New task
                  </Link>
                ) : null}
                <Link
                  to="/"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

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
              {deleteTarget?.recurrenceGroupId || deleteTarget?.isRecurring ? (
                <div className="space-y-3 mt-4">
                  <p className="text-sm font-medium">
                    You are deleting a recurring task. What do you want to
                    delete?
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                      <input
                        type="radio"
                        name="deleteScope"
                        checked={deleteScope === "this"}
                        onChange={() => setDeleteScope("this")}
                      />
                      This task only
                    </label>
                    {deleteTarget?.recurrenceGroupId && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                        <input
                          type="radio"
                          name="deleteScope"
                          checked={deleteScope === "future"}
                          onChange={() => setDeleteScope("future")}
                        />
                        This and future tasks
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                      <input
                        type="radio"
                        name="deleteScope"
                        checked={deleteScope === "all"}
                        onChange={() => setDeleteScope("all")}
                      />
                      All tasks in this series
                    </label>
                  </div>
                </div>
              ) : deleteTarget ? (
                `“${deleteTarget.title}” will be permanently removed. You can’t undo this.`
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTask.isPending}
              onClick={() => {
                if (deleteTarget)
                  deleteTask.mutate({
                    taskId: deleteTarget.id,
                    recurrenceGroupId: deleteTarget.recurrenceGroupId,
                    isRecurring: deleteTarget.isRecurring,
                    scope: deleteScope,
                  });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Recurring Task</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-4 text-left text-foreground">
                <p className="text-sm font-medium">
                  You are editing a recurring task. What do you want to edit?
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                    <input
                      type="radio"
                      name="editScope"
                      checked={editScope === "this"}
                      onChange={() => setEditScope("this")}
                    />
                    This task only
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                    <input
                      type="radio"
                      name="editScope"
                      checked={editScope === "future"}
                      onChange={() => setEditScope("future")}
                    />
                    This and future tasks
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md">
                    <input
                      type="radio"
                      name="editScope"
                      checked={editScope === "all"}
                      onChange={() => setEditScope("all")}
                    />
                    All tasks in this series
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                if (editTarget) {
                  navigate(
                    `/tasks/${editTarget.id}/edit?${new URLSearchParams({
                      ...(editScope !== "this" ? { scope: editScope } : {}),
                      returnTo: listReturnTo,
                    }).toString()}`,
                  );
                  setEditTarget(null);
                }
              }}
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Tasks
          </h1>
        </div>
        {canCreateTask ? (
          <Link
            to={`/tasks/new?returnTo=${encodeURIComponent(listReturnTo)}`}
            className={cn(buttonVariants())}
          >
            <Plus className="size-4" />
            New task
          </Link>
        ) : null}
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

      {queue === "my_tasks" ? (
        <Card className="p-3">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="My tasks views"
          >
            {(
              [
                { id: "assigned" as const, label: "Assigned to me" },
                { id: "created" as const, label: "Created by me" },
                { id: "supporting" as const, label: "Supporting tasks" },
                { id: "review" as const, label: "Need review" },
              ] as const
            ).map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={myTab === id ? "secondary" : "ghost"}
                className={cn(
                  "rounded-full ring-1 ring-transparent transition-colors",
                  myTab === id
                    ? "pointer-events-none bg-[color-mix(in_oklab,var(--brand),transparent_88%)] text-foreground ring-[color-mix(in_oklab,var(--brand),transparent_70%)] dark:bg-[color-mix(in_oklab,var(--brand),transparent_84%)]"
                    : "hover:bg-[color-mix(in_oklab,var(--brand),white_72%)] hover:text-foreground hover:ring-[color-mix(in_oklab,var(--brand),transparent_82%)] dark:hover:bg-[color-mix(in_oklab,var(--brand),transparent_88%)]",
                )}
                aria-pressed={myTab === id}
                onClick={() => setMyTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      {recurrenceGroupId && rows.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-teal-900 dark:border-teal-900/50 dark:bg-teal-900/20 dark:text-teal-200">
          <div className="flex items-center gap-2 font-medium">
            <Repeat className="size-4" />
            <span>
              Showing recurring series: "{rows[0].title}" ({total} tasks)
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-teal-700 hover:text-teal-900 hover:bg-teal-100 dark:text-teal-400 dark:hover:text-teal-200 dark:hover:bg-teal-900/50"
            onClick={() => {
              setSearchParams(
                (prev) => {
                  const p = new URLSearchParams(prev);
                  p.delete("recurrenceGroupId");
                  return p;
                },
                { replace: true },
              );
            }}
          >
            Clear filter &times;
          </Button>
        </div>
      )}

      <Card className="relative z-30 overflow-visible p-4">
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
            <SearchableFilterSelect
              options={(statuses ?? []).map((s) => ({
                value: s.id,
                label: s.label,
              }))}
              value={statusId || "__all__"}
              allValue="__all__"
              allLabel="All statuses"
              onChange={(v) => {
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
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <SearchableFilterSelect
              showSearch={false}
              options={[
                { value: "LOW", label: "Low" },
                { value: "MEDIUM", label: "Medium" },
                { value: "HIGH", label: "High" },
                { value: "URGENT", label: "Urgent" },
              ]}
              value={priority || "__all__"}
              allValue="__all__"
              allLabel="All priorities"
              onChange={(v) => {
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due-from">Due from</Label>
            <Input
              id="due-from"
              type="date"
              className="h-9 w-full"
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
              className="h-9 w-full"
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
          {queue === "team" ? (
            <div className="space-y-2">
              <Label htmlFor="team-user-filter">Team users</Label>
              <div
                id="team-user-filter"
                ref={teamUsersDropdownRef}
                className="relative"
              >
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                  onClick={() => setTeamUsersOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={teamUsersOpen}
                >
                  <span className="truncate text-left">
                    {teamMembersQuery.isLoading
                      ? "Loading users..."
                      : teamUsersMode === "none"
                        ? "No user selected"
                        : selectedTeamUsers.length
                          ? `${selectedTeamUsers.length} user${selectedTeamUsers.length > 1 ? "s" : ""} selected`
                          : "All users selected"}
                  </span>
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      teamUsersOpen && "rotate-90",
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "absolute left-0 top-full z-70 mt-2 max-h-72 w-full overflow-auto rounded-md border border-border bg-card p-2 shadow-lg",
                    !teamUsersOpen && "hidden",
                  )}
                >
                  <div className="sticky top-0 z-10 mb-2 space-y-1 bg-card pb-1">
                    <Input
                      type="search"
                      placeholder="Search by name or username…"
                      value={teamUsersSearch}
                      onChange={(e) => setTeamUsersSearch(e.target.value)}
                      className="h-8 text-sm"
                      aria-label="Search team users"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <label className="mb-2 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60">
                    <input
                      type="checkbox"
                      checked={isAllTeamUsersSelected}
                      onChange={() =>
                        setSearchParams(
                          (prev) => {
                            const p = new URLSearchParams(prev);
                            p.delete("teamUserId");
                            if (
                              !isAllTeamUsersSelected &&
                              allTeamUserIds.length
                            ) {
                              // "All users selected" should behave like no assignee filter.
                              p.delete("teamUserIds");
                              p.delete("teamUsersMode");
                            } else {
                              p.delete("teamUserIds");
                              p.set("teamUsersMode", "none");
                            }
                            p.delete("page");
                            return p;
                          },
                          { replace: true },
                        )
                      }
                    />
                    <span>All users selected</span>
                  </label>
                  {filteredTeamMembers.map((u) => {
                    const selected = effectiveSelectedTeamUserIds.includes(
                      u.id,
                    );
                    return (
                      <label
                        key={u.id}
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/60",
                          selected && "bg-primary/5",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setSearchParams(
                                (prev) => {
                                  const p = new URLSearchParams(prev);
                                  const current = effectiveSelectedTeamUserIds;
                                  const next = selected
                                    ? current.filter((id) => id !== u.id)
                                    : Array.from(new Set([...current, u.id]));
                                  p.delete("teamUserId");
                                  if (next.length) {
                                    p.set("teamUserIds", next.join(","));
                                    p.delete("teamUsersMode");
                                  } else {
                                    p.delete("teamUserIds");
                                    p.set("teamUsersMode", "none");
                                  }
                                  p.delete("page");
                                  return p;
                                },
                                { replace: true },
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {u.name || u.username}
                            </span>
                            {u.name ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {u.username}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {selected ? (
                          <Check className="size-3 text-primary" />
                        ) : null}
                      </label>
                    );
                  })}
                  {!teamMembersQuery.isLoading &&
                  teamMembers.length > 0 &&
                  filteredTeamMembers.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      No users match your search.
                    </div>
                  ) : null}
                  {!teamMembersQuery.isLoading && teamMembers.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      No team users found.
                    </div>
                  ) : null}
                  {teamMembersQuery.isError ? (
                    <div className="px-2 py-1 text-xs text-destructive">
                      Could not load team users.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <DataTable
          table={table}
          columnCount={columns.length}
          sort={tableSorting}
          onChangeSort={onChangeSort}
          isLoading={query.isLoading}
          emptyMessage={listEmptyMessage}
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
