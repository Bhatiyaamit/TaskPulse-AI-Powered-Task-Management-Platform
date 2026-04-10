import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Eye, Plus } from "lucide-react";
import { api } from "@/api/client";
import { P } from "@/lib/permissions";
import { useMe } from "@/hooks/useAuth";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { DataTable } from "@/components/data-table";
import { cn } from "@/lib/utils";
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

type PaginatedResponse<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

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
  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const canOrg =
    perms.has(P.DEPARTMENTS_READ) ||
    perms.has(P.DEPARTMENTS_CREATE) ||
    perms.has(P.DEPARTMENTS_UPDATE) ||
    perms.has(P.DEPARTMENTS_DELETE);

  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize, search, sortBy, sortDir } =
    parseDepartmentsUrlParams(searchParams);
  const [searchInput, setSearchInput] = useState(search);

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

  const departmentsQuery = useQuery({
    enabled: canOrg,
    queryKey: [
      "org-departments-paginated",
      { page, pageSize, search, sortBy, sortDir },
    ],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<DepartmentRow>>(
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
      return data;
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
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              badgeColorClass(row.original.id),
            )}
          >
            {row.original.name}
          </span>
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
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
              new Date(row.original.createdAt),
            )}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to={`/team?departmentId=${encodeURIComponent(row.original.id)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 w-8 p-0",
                  )}
                  aria-label={`View team members in ${row.original.name}`}
                >
                  <Eye className="size-4" />
                </Link>
              }
            />
            <TooltipContent>View</TooltipContent>
          </Tooltip>
        ),
      },
    ],
    [],
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

  if (!canOrg) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            You don’t have access to manage departments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage departments for your organization.
          </p>
        </div>
        <Link to="/departments/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          Add department
        </Link>
      </div>

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
                  <SelectTrigger id="department-page-size" className="h-8 w-18">
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
    </div>
  );
}
