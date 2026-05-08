import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import {
  P,
  departmentModuleCanAccessDepartmentsNav,
  departmentModuleCanCreate,
  departmentModuleCanDelete,
  departmentModuleCanList,
  departmentModuleCanUpdate,
  userModuleCanList,
} from "@/lib/permissions";
import { useMe } from "@/hooks/useAuth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";
import type { ApiSuccess } from "@/api/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type DepartmentRow = {
  id: string;
  name: string;
  code: string | null;
  branchId: string | null;
  createdAt: string;
  branch: { id: string; name: string } | null;
  usersCount: number;
};

type DepartmentListResponse = ApiSuccess<
  DepartmentRow[],
  { page: number; limit: number; total: number }
>;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 20, 50] as const;

function parseDepartmentsUrlParams(p: URLSearchParams) {
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const pageSizeRaw = Number.parseInt(
    p.get("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;
  const search = String(p.get("search") ?? "");
  const sortBy = p.get("sortBy") as "createdAt" | "name" | "code" | null;
  const sortDir = (p.get("sortDir") ?? "desc") as "asc" | "desc";
  return { page, pageSize, search, sortBy, sortDir };
}

function badgeColorClass(seed: string) {
  const n = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const palette = [
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  ];
  return palette[n % palette.length]!;
}

export function DepartmentsPage() {
  const qc = useQueryClient();
  const me = useMe();
  const perms = me.data?.permissions;
  const canAccess = departmentModuleCanAccessDepartmentsNav(perms);
  const canListDepts = departmentModuleCanList(perms);
  const canFetchList = canListDepts;
  const canCreateDept = departmentModuleCanCreate(perms);
  const canUpdateDept = departmentModuleCanUpdate(perms);
  const canDeleteDept = departmentModuleCanDelete(perms);
  const canViewTeamByDept = userModuleCanList(perms);

  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize, search, sortBy, sortDir } =
    parseDepartmentsUrlParams(searchParams);
  const [searchInput, setSearchInput] = useState(search);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const tableSorting: SortingState = useMemo(() => {
    if (!sortBy) return [];
    return [{ id: sortBy, desc: sortDir === "desc" }];
  }, [sortBy, sortDir]);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const v = searchInput;
    const t = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const normalized = v.trim();
          const current = (prev.get("search") ?? "").trim();
          if (normalized === current) return prev;
          const p = new URLSearchParams(prev);
          if (normalized) p.set("search", v);
          else p.delete("search");
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput, setSearchParams]);

  const departmentsQuery = useQuery({
    enabled: canFetchList,
    queryKey: [
      "org-departments-paginated",
      { page, pageSize, search, sortBy, sortDir },
    ],
    queryFn: async () => {
      const { data } = await api.get<DepartmentListResponse>(
        "/api/org/departments",
        {
          params: {
            page,
            pageSize,
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(sortBy ? { sortBy, sortDir } : {}),
          },
        },
      );
      const total = data.meta?.total ?? 0;
      const limit = data.meta?.limit ?? pageSize;
      return {
        items: data.data ?? [],
        meta: {
          page: data.meta?.page ?? page,
          pageSize: limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
        },
      };
    },
  });

  const deleteDepartment = useMutation({
    mutationFn: async (departmentId: string) => {
      await api.delete(`/api/org/departments/${departmentId}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["org-departments"],
        exact: false,
      });
      await qc.invalidateQueries({
        queryKey: ["org-departments-paginated"],
        exact: false,
      });
      toast.success("Department deleted");
      setDeleteTarget(null);
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? String(
            (e.response?.data as { error?: string } | undefined)?.error ??
              e.message,
          )
        : "Could not delete department";
      toast.error(msg);
    },
  });

  const rows = departmentsQuery.data?.items ?? [];
  const total = departmentsQuery.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<ColumnDef<DepartmentRow>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: "Department",
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            to={`/team?departmentId=${encodeURIComponent(row.original.id)}`}
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity",
              badgeColorClass(row.original.id),
            )}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "usersCount",
        id: "usersCount",
        header: "Users",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {row.original.usersCount}
          </span>
        ),
      },
      {
        accessorKey: "code",
        id: "code",
        header: "Code",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.code ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      ...((canUpdateDept || canDeleteDept)
        ? ([
            {
              id: "actions",
              header: "Action",
              enableSorting: false,
              cell: ({ row }) => (
                <div className="flex items-center gap-0.5">
                  {canUpdateDept ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link
                            to={`/departments/${encodeURIComponent(row.original.id)}/edit`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-8 w-8 p-0",
                            )}
                            aria-label={`Edit ${row.original.name}`}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        }
                      />
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {canDeleteDept ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            aria-label={`Delete ${row.original.name}`}
                            onClick={() =>
                              setDeleteTarget({
                                id: row.original.id,
                                name: row.original.name,
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              ),
            } satisfies ColumnDef<DepartmentRow>,
          ] as ColumnDef<DepartmentRow>[])
        : []),
    ],
    [canViewTeamByDept, canUpdateDept, canDeleteDept],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { sorting: tableSorting },
  });

  const onChangeSort = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
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
    },
    [tableSorting, setSearchParams],
  );

  if (me.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (me.data && !canAccess) {
    return <Navigate to="/" replace />;
  }

  const showCreateOnlyHint =
    Boolean(me.data) && canAccess && !canListDepts && canCreateDept;

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
            <AlertDialogTitle>Delete this department?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” will be permanently removed. This may fail if users are still assigned.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteDepartment.isPending}
              onClick={() => {
                if (deleteTarget) deleteDepartment.mutate(deleteTarget.id);
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
            Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage departments for your organization.
          </p>
        </div>
        {canCreateDept ? (
          <Link to="/departments/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            Add department
          </Link>
        ) : null}
      </div>

      {showCreateOnlyHint ? (
        <Card className="border-amber-500/35 bg-muted/30 p-6">
          <div className="flex gap-4">
            <ShieldAlert
              className="size-10 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                You don&apos;t have permission to browse the department list
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your role does not include{" "}
                <span className="font-medium text-foreground">
                  Departments → Read
                </span>{" "}
                (
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {P.DEPARTMENTS_READ}
                </code>
                ), or update/delete departments. You can still add a department
                if{" "}
                <span className="font-medium text-foreground">
                  Departments → Create
                </span>{" "}
                is allowed.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link to="/departments/new" className={cn(buttonVariants())}>
                  <Plus className="size-4" />
                  Add department
                </Link>
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
      ) : null}

      {canFetchList ? (
        <Card>
          <CardHeader>
            <CardTitle>Department list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-sm flex flex-col gap-2">
                <Label htmlFor="department-search">Search</Label>
                <Input
                  id="department-search"
                  placeholder="Search by name or code…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-auto rounded-md border border-border">
              <DataTable
                table={table}
                columnCount={columns.length}
                sort={tableSorting}
                onChangeSort={onChangeSort}
                isLoading={departmentsQuery.isLoading}
                emptyMessage="No departments match your search."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {total === 0
                    ? "0 departments"
                    : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
                </span>
                <span className="hidden sm:inline">·</span>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="department-page-size"
                    className="text-muted-foreground"
                  >
                    Rows per page
                  </Label>
                  <SearchableSelect
                    id="department-page-size"
                    showSearch={false}
                    openDirection="up"
                    value={String(pageSize)}
                    onChange={(v) => {
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
                    className="w-18"
                    options={PAGE_SIZES.map((n) => ({
                      value: String(n),
                      label: String(n),
                    }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1 || departmentsQuery.isLoading}
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
                  disabled={page >= pageCount || departmentsQuery.isLoading}
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
      ) : null}

      {canFetchList &&
      canListDepts &&
      !canUpdateDept &&
      !canCreateDept &&
      !canDeleteDept ? (
        <p className="text-xs text-muted-foreground">
          You have read-only access to departments. Ask an admin for Create,
          Update, or Delete if you need to change them.
        </p>
      ) : null}
    </div>
  );
}
