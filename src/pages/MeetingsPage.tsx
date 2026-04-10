import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Ban, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DataTable } from "@/components/data-table";
import { cn } from "@/lib/utils";
import { meetingStatusBadgeClass, taskPriorityBadgeClass } from "@/lib/badges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MeetingRow = {
  id: string;
  title: string;
  agenda: string | null;
  meetingLink: string | null;
  priority: string;
  durationMinutes: number | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  computedStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  datetime: string;
  createdAt: string;
  createdBy: { id: string; name: string; username: string };
  attendees: { userId: string }[];
};

type PaginatedResponse<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 20, 50] as const;
const MEETING_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const MEETING_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

function parseMeetingsUrlParams(p: URLSearchParams) {
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const pageSizeRaw = Number.parseInt(
    p.get("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;
  const search = String(p.get("search") ?? "");
  const priority = (p.get("priority") ?? "") as
    | ""
    | (typeof MEETING_PRIORITIES)[number];
  const status = (p.get("status") ?? "") as
    | ""
    | (typeof MEETING_STATUSES)[number];
  const sortBy = p.get("sortBy") as "datetime" | "title" | "createdAt" | null;
  const sortDir = (p.get("sortDir") ?? "desc") as "asc" | "desc";
  return { page, pageSize, search, priority, status, sortBy, sortDir };
}

export function MeetingsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize, search, priority, status, sortBy, sortDir } =
    parseMeetingsUrlParams(searchParams);
  const [searchInput, setSearchInput] = useState(search);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => setSearchInput(search), [search]);

  useEffect(() => {
    const v = searchInput;
    const t = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (v.trim()) p.set("search", v);
          else p.delete("search");
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput, setSearchParams]);

  const tableSorting: SortingState = useMemo(() => {
    if (!sortBy) return [];
    return [{ id: sortBy, desc: sortDir === "desc" }];
  }, [sortBy, sortDir]);

  const meetingsQuery = useQuery({
    queryKey: [
      "meetings-paginated",
      { page, pageSize, search, priority, status, sortBy, sortDir },
    ],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<MeetingRow>>(
        "/api/meetings",
        {
          params: {
            page,
            pageSize,
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(priority ? { priority } : {}),
            ...(status ? { status } : {}),
            ...(sortBy ? { sortBy, sortDir } : {}),
          },
        },
      );
      return data;
    },
  });

  const rows = meetingsQuery.data?.items ?? [];
  const total = meetingsQuery.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/meetings/${id}`);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
    },
  });

  const cancelMeeting = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/meetings/${id}/cancel`);
    },
    onSuccess: async () => {
      setCancelTarget(null);
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
      await qc.invalidateQueries({ queryKey: ["meeting"], exact: false });
    },
  });

  const columns = useMemo<ColumnDef<MeetingRow>[]>(
    () => [
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <Link
            to={`/meetings/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: "priority",
        id: "priority",
        header: "Priority",
        enableSorting: false,
        cell: ({ row }) => (
          <span className={taskPriorityBadgeClass(row.original.priority)}>
            {row.original.priority}
          </span>
        ),
      },
      {
        accessorKey: "datetime",
        id: "datetime",
        header: "Time & Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.datetime).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "computedStatus",
        id: "computedStatus",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={meetingStatusBadgeClass(row.original.computedStatus)}
          >
            {row.original.computedStatus === "IN_PROGRESS"
              ? "In progress"
              : row.original.computedStatus === "COMPLETED"
                ? "Completed"
                : row.original.computedStatus === "CANCELLED"
                  ? "Cancelled"
                  : "Scheduled"}
          </span>
        ),
      },
      {
        id: "host",
        accessorFn: (r) => r.createdBy.name,
        header: "Host",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.createdBy.name}
          </span>
        ),
      },
      {
        id: "attendees",
        accessorFn: (r) => r.attendees.length,
        header: "Attendees",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.attendees.length}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5">
            <Link to={`/meetings/${row.original.id}`}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="View meeting"
                    />
                  }
                >
                  <Eye className="size-4" />
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
            </Link>
            {row.original.computedStatus !== "SCHEDULED" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Edit meeting (disabled)"
                      disabled
                    />
                  }
                >
                  <Pencil className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            ) : (
              <Link to={`/meetings/${row.original.id}/edit`}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Edit meeting"
                      />
                    }
                  >
                    <Pencil className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              </Link>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Cancel meeting"
                    disabled={
                      cancelMeeting.isPending ||
                      row.original.computedStatus === "CANCELLED" ||
                      row.original.computedStatus === "COMPLETED"
                    }
                    onClick={() =>
                      setCancelTarget({
                        id: row.original.id,
                        title: row.original.title,
                      })
                    }
                  />
                }
              >
                <Ban className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete meeting"
                    onClick={() =>
                      setDeleteTarget({
                        id: row.original.id,
                        title: row.original.title,
                      })
                    }
                    disabled={deleteMeeting.isPending}
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
    [deleteMeeting.isPending, cancelMeeting.isPending],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { sorting: tableSorting },
  });

  function onChangeSort(
    updater: SortingState | ((prev: SortingState) => SortingState),
  ) {
    const next =
      typeof updater === "function" ? updater(tableSorting) : updater;
    const s = next[0];
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!s) {
          p.delete("sortBy");
          p.delete("sortDir");
        } else {
          p.set("sortBy", String(s.id));
          p.set("sortDir", s.desc ? "desc" : "asc");
        }
        p.delete("page");
        return p;
      },
      { replace: true },
    );
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `“${cancelTarget.title}” will be cancelled. Attendees won’t be able to create tasks from it.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancelMeeting.isPending}
              onClick={() => {
                if (cancelTarget) cancelMeeting.mutate(cancelTarget.id);
              }}
            >
              Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
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
              disabled={deleteMeeting.isPending}
              onClick={() => {
                if (deleteTarget) deleteMeeting.mutate(deleteTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Meetings
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule, manage attendees, and capture outcomes.
          </p>
        </div>
        <Link to="/meetings/new" className={cn(buttonVariants())}>
          <Plus className="size-4" /> Create Meeting
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-sm flex flex-col gap-2">
              <Label htmlFor="meeting-search">Search</Label>
              <Input
                id="meeting-search"
                placeholder="Search by title or agenda…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
              <div className="w-full sm:w-48 flex flex-col gap-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (!v) p.delete("status");
                        else p.set("status", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48 flex flex-col gap-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (!v) p.delete("priority");
                        else p.set("priority", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All priorities</SelectItem>
                    {MEETING_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <DataTable
              table={table}
              columnCount={columns.length}
              sort={tableSorting}
              onChangeSort={onChangeSort}
              isLoading={meetingsQuery.isLoading}
              emptyMessage="No meetings match your search."
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {total === 0
                  ? "0 meetings"
                  : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
              </span>
              <span className="hidden sm:inline">·</span>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="meeting-page-size"
                  className="text-muted-foreground"
                >
                  Rows per page
                </Label>
                <Select
                  value={String(pageSize)}
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
                  itemToStringLabel={(vv) => vv}
                >
                  <SelectTrigger id="meeting-page-size" className="h-8 w-18">
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
                disabled={page <= 1 || meetingsQuery.isLoading}
                onClick={() =>
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      const next = Math.max(1, page - 1);
                      if (next <= 1) p.delete("page");
                      else p.set("page", String(next));
                      return p;
                    },
                    { replace: true },
                  )
                }
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= pageCount || meetingsQuery.isLoading}
                onClick={() =>
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      const next = Math.min(pageCount, page + 1);
                      if (next <= 1) p.delete("page");
                      else p.set("page", String(next));
                      return p;
                    },
                    { replace: true },
                  )
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
