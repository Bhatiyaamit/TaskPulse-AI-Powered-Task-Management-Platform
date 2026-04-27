import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { isAxiosError } from "axios";
import { useMe } from "@/hooks/useAuth";
import {
  meetingModuleCanUpdate,
  taskModuleCanCreate,
  taskModuleCanDelete,
  taskModuleCanList,
  taskModuleCanUpdate,
} from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  CheckCircle2,
  ExternalLink,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/SearchableSelect";

type MeetingTaskRow = {
  id: string;
  title: string;
  priority?: string | null;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string };
  createdBy: { id: string; name: string; username: string } | null;
  assignedTo: { id: string; name: string; username: string } | null;
  reviewer: { id: string; name: string; username: string } | null;
};

type TaskStatus = { id: string; code: string; label: string };

type MeetingDetailResponse = {
  id: string;
  title: string;
  agenda: string | null;
  momNotes: string | null;
  meetingType: "ONLINE" | "OFFLINE";
  meetingLink: string | null;
  meetingLocation: string | null;
  preparationNotes: string | null;
  priority: string;
  durationMinutes: number | null;
  computedStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  datetime: string;
  createdBy: { id: string; name: string; username: string };
  attendees: { user: { id: string; name: string; username: string } }[];
  outcomes: {
    id: string;
    outcomeText: string;
    task: { id: string; title: string } | null;
  }[];
  // Embedded tasks + statuses from the single API call
  tasks: MeetingTaskRow[];
  tasksMeta: { page: number; pageSize: number; total: number };
  taskStatuses: TaskStatus[];
};

const PAGE_SIZES = [10, 20, 50] as const;

const SORT_IDS = [
  "title",
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
  const me = useMe();
  const perms = me.data?.permissions;
  const canUpdateMeeting = meetingModuleCanUpdate(perms);
  const canListMeetingTasks = taskModuleCanList(perms);
  const canCreateTask = taskModuleCanCreate(perms);
  const canUpdateTask = taskModuleCanUpdate(perms);
  const canDeleteTask = taskModuleCanDelete(perms);
  const [momNotesDraft, setMomNotesDraft] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<null | {
    taskId: string;
    taskTitle: string;
  }>(null);

  const { data, isLoading: isMeetingLoading } = useQuery({
    queryKey: ["meeting", id, searchParams.toString()],
    enabled: Boolean(id),
    queryFn: async () => {
      const parsed = parseMeetingTasksUrlParams(searchParams);
      const apiSortBy =
        parsed.sortBy && parsed.sortDir
          ? parsed.sortBy === "overdue"
            ? "dueDate"
            : parsed.sortBy
          : undefined;
      const { data } = await api.get<
        ApiSuccess<{ meeting: MeetingDetailResponse }>
      >(`/api/meetings/${id}`, {
        params: {
          page: parsed.pagination.pageIndex + 1,
          pageSize: parsed.pagination.pageSize,
          ...(parsed.statusId ? { statusId: parsed.statusId } : {}),
          ...(parsed.q ? { search: parsed.q } : {}),
          ...(apiSortBy && parsed.sortDir
            ? { sortBy: apiSortBy, sortDir: parsed.sortDir }
            : {}),
        },
      });
      return data.data.meeting;
    },
  });

  useEffect(() => {
    setMomNotesDraft(data?.momNotes ?? "");
  }, [data?.momNotes]);

  const startMeeting = useMutation({
    mutationFn: async () => api.post(`/api/meetings/${id}/start`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
      toast.success("Meeting started — you can now add tasks.");
    },
    onError: (e) => {
      const message = isAxiosError(e)
        ? String(e.response?.data?.message ?? e.message)
        : "Could not start meeting";
      toast.error(message);
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
      toast.success("Meeting marked as completed");
    },
    onError: (e) => {
      const message = isAxiosError(e)
        ? String(e.response?.data?.message ?? e.message)
        : "Could not complete meeting";
      toast.error(message);
    },
  });
  const saveMomNotes = useMutation({
    mutationFn: async (momNotes: string) =>
      api.patch(`/api/meetings/${id}`, { momNotes }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      toast.success("MOM saved");
    },
    onError: (e) => {
      const message = isAxiosError(e)
        ? String(e.response?.data?.message ?? e.message)
        : "Could not save MOM";
      toast.error(message);
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/api/tasks/${taskId}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      toast.success("Task deleted");
      setDeleteConfirm(null);
    },
    onError: (e) => {
      const message = isAxiosError(e)
        ? String(e.response?.data?.error?.message ?? e.response?.data?.message ?? e.message)
        : "Could not delete task";
      toast.error(message);
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

  const rows = data?.tasks ?? [];
  const total = data?.tasksMeta?.total ?? 0;
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

  const statuses = data?.taskStatuses ?? [];


  const columns = useMemo<ColumnDef<MeetingTaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <Link
            to={`/tasks/${row.original.id}?returnTo=${encodeURIComponent(returnTo)}`}
            className="font-medium text-foreground hover:underline underline-offset-4"
          >
            {row.original.title}
          </Link>
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
        id: "priority",
        accessorFn: (r) => String(r.priority ?? "MEDIUM").toUpperCase(),
        header: "Priority",
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
        accessorKey: "assignedTo",
        id: "assignedTo",
        header: "Assigned to",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.assignedTo?.name ||
              row.original.assignedTo?.username ||
              "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdBy",
        id: "createdBy",
        header: "Created by",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.createdBy?.name ||
              row.original.createdBy?.username ||
              "—"}
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
            {canUpdateTask ? (
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
                      onClick={() =>
                        setDeleteConfirm({
                          taskId: row.original.id,
                          taskTitle: row.original.title,
                        })
                      }
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
      },
    ],
    [returnTo, canUpdateTask, canDeleteTask],
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
  const hasMomNotes = Boolean((momNotesDraft ?? "").trim());
  const isScheduled = meeting.computedStatus === "SCHEDULED";
  const isInProgress = meeting.computedStatus === "IN_PROGRESS";
  const isCompleted = meeting.computedStatus === "COMPLETED";
  const isCancelled = meeting.computedStatus === "CANCELLED";
  // Tasks are unlocked permanently once play is clicked (meeting started).
  const canCreateTasksFromMeeting = isInProgress || isCompleted;

  return (
    <div className="space-y-3">
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
          {/* SCHEDULED: Edit + Start meeting */}
          {isScheduled && canUpdateMeeting ? (
            <>
              <Link to={`/meetings/${meeting.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="size-3" />
                  Edit
                </Button>
              </Link>
              <Button
                type="button"
                isLoading={startMeeting.isPending}
                disabled={startMeeting.isPending}
                onClick={() => startMeeting.mutate()}
              >
                <Play className="size-4" />
                Start meeting
              </Button>
            </>
          ) : null}

          {/* IN_PROGRESS: Mark as completed only */}
          {isInProgress && canUpdateMeeting ? (
            <Button
              type="button"
              variant="default"
              isLoading={markCompleted.isPending}
              disabled={markCompleted.isPending || !hasMomNotes}
              onClick={async () => {
                if (!hasMomNotes) {
                  toast.warning(
                    "Please add MOM before marking meeting as completed.",
                  );
                  return;
                }
                if ((momNotesDraft ?? "") !== (meeting.momNotes ?? "")) {
                  await saveMomNotes.mutateAsync(momNotesDraft);
                }
                markCompleted.mutate();
              }}
            >
              <CheckCircle2 className="size-4" />
              Mark as completed
            </Button>
          ) : null}

          {/* COMPLETED / CANCELLED: nothing */}
          {isCompleted || isCancelled ? null : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 lg:h-[360px]">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-56px)] overflow-y-auto space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Host</div>
                <div className="text-foreground">
                  {meeting.createdBy.name}{" "}
                  <span className="text-muted-foreground">
                    · {meeting.createdBy.username}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {meeting.meetingType === "OFFLINE"
                    ? "Meeting location"
                    : "Meeting link"}
                </div>
                {meeting.meetingType === "OFFLINE" ? (
                  <div className="text-foreground">
                    {meeting.meetingLocation?.trim() || "—"}
                  </div>
                ) : meeting.meetingLink ? (
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

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Attendees</div>
                <div className="text-foreground">
                  {(meeting.attendees ?? []).length
                    ? meeting.attendees.map((a) => a.user.name).join(", ")
                    : "—"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Agenda</div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {meeting.agenda ?? "—"}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <div className="text-xs text-muted-foreground">
                  Preparation notes
                </div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {meeting.preparationNotes ?? "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:h-[360px]">
          <CardHeader>
            <CardTitle>MOM</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-56px)] flex-col gap-2">
            <Textarea
              value={momNotesDraft}
              onChange={(e) => setMomNotesDraft(e.target.value)}
              placeholder="Add meeting MOM (minutes of meeting)..."
              className="h-full min-h-0 resize-none overflow-y-auto"
              readOnly={!canUpdateMeeting}
            />
            {canUpdateMeeting ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveMomNotes.mutate(momNotesDraft)}
                  isLoading={saveMomNotes.isPending}
                  disabled={saveMomNotes.isPending}
                >
                  Save MOM
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* SCHEDULED: show lock hint with Start meeting CTA */}
      {isScheduled && !isCancelled ? (
        <Card className="border-amber-400/40 bg-amber-400/5">
          <CardContent className="flex flex-wrap items-center gap-4 py-5">
            <Play className="size-7 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-semibold text-foreground">
                Start the meeting to unlock task creation
              </p>
              <p className="text-sm text-muted-foreground">
                Click <strong>Start meeting</strong> once — you can add and
                manage tasks for this meeting at any time after that.
              </p>
            </div>
            {/* {canUpdateMeeting ? (
              <Button
                type="button"
                className="shrink-0 gap-2"
                isLoading={startMeeting.isPending}
                disabled={startMeeting.isPending}
                onClick={() => startMeeting.mutate()}
              >
                <Play className="size-4" />
                Start meeting
              </Button>
            ) : null} */}
          </CardContent>
        </Card>
      ) : null}

      {canCreateTasksFromMeeting && canListMeetingTasks ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Meeting tasks</CardTitle>
              {canCreateTask ? (
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
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                <SearchableSelect
                  showSearch={false}
                  value={parsed.statusId || "__all__"}
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
                  options={[
                    { value: "__all__", label: "All statuses" },
                    ...(statuses ?? []).map((s) => ({ value: s.id, label: s.label })),
                  ]}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border">
              <DataTable
                table={table}
                columnCount={columns.length}
                sort={tableSorting}
                onChangeSort={onChangeSort}
                isLoading={isMeetingLoading}
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
                  disabled={pagination.pageIndex <= 0 || isMeetingLoading}
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
                    pagination.pageIndex >= pageCount - 1 || isMeetingLoading
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

      <AlertDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong>{deleteConfirm?.taskTitle}</strong>. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTask.isPending}
              onClick={() => {
                if (!deleteConfirm) return;
                deleteTask.mutate(deleteConfirm.taskId);
              }}
            >
              {deleteTask.isPending ? "Deleting…" : "Confirm delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
