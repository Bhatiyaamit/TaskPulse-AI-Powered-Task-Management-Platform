import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { Card, CardContent, } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { Label } from "@/components/ui/label";
import { Link, useSearchParams } from "react-router-dom";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { useMe } from "@/hooks/useAuth";
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
import { tenantStatusBadgeClass } from "@/lib/badges";
import {
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";

type TenantRow = {
  id: string;
  name: string;
  createdAt: string;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  _count: { users: number };
};

type TenantsApiResponse = {
  tenants: TenantRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZES = [10, 20, 50, 100] as const;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const DEFAULT_PAGE_SIZE = 10;

function parseTenantsUrlParams(searchParams: URLSearchParams) {
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
    sortByRaw === "created" &&
    (sortDirRaw === "asc" || sortDirRaw === "desc");

  const apiSortDir: "asc" | "desc" = explicitSort ? sortDirRaw : "desc";

  const tableSorting: SortingState = explicitSort
    ? [{ id: "created", desc: apiSortDir === "desc" }]
    : [{ id: "created", desc: true }];

  const pagination: PaginationState = { pageIndex: page - 1, pageSize };

  const statusRaw = searchParams.get("status") || "";
  const status: "" | "INVITED" | "ACTIVE" | "INACTIVE" =
    statusRaw === "INVITED" ||
    statusRaw === "ACTIVE" ||
    statusRaw === "INACTIVE"
      ? statusRaw
      : "";

  return { page, pagination, tableSorting, apiSortDir, status };
}

export function PlatformTenantsPage() {
  const qc = useQueryClient();
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const skipSearchInputSync = useRef(false);
  const listParams = useMemo(
    () => parseTenantsUrlParams(searchParams),
    [searchParams],
  );
  const { pagination, tableSorting, apiSortDir, status } = listParams;

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

  const tenantsQuery = useQuery({
    queryKey: [
      "tenants",
      pagination.pageIndex,
      pagination.pageSize,
      search,
      status,
      apiSortDir,
    ],
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<TenantRow[], { page: number; limit: number; total: number }>
      >("/api/platform/tenants", {
        params: {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(status ? { status } : {}),
          sortDir: apiSortDir,
        },
      });
      return {
        tenants: data.data,
        total: data.meta?.total ?? 0,
        page: data.meta?.page ?? pagination.pageIndex + 1,
        pageSize: data.meta?.limit ?? pagination.pageSize,
      } satisfies TenantsApiResponse;
    },
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const total = tenantsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  const [confirm, setConfirm] = useState<null | {
    tenantId: string;
    tenantName: string;
    kind: "activate" | "deactivate" | "delete";
  }>(null);

  const setStatus = useMutation({
    mutationFn: async (input: {
      tenantId: string;
      status: "INVITED" | "ACTIVE" | "INACTIVE";
    }) => {
      const { data } = await api.patch<ApiSuccess<{ tenant: TenantRow }>>(
        `/api/platform/tenants/${input.tenantId}/status`,
        { status: input.status },
      );
      return data.data.tenant;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenants"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["platform-dashboard"],
        exact: false,
      });
      toast.success("Company status updated");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.message ??
          e.message)
        : "Could not update company";
      toast.error(String(msg));
    },
  });

  const deleteTenant = useMutation({
    mutationFn: async (tenantId: string) => {
      await api.delete(`/api/platform/tenants/${tenantId}`);
    },
    onSuccess: async (_data, deletedTenantId) => {
      if (me.data?.selectedTenantId === deletedTenantId) {
        await api.delete("/api/platform/tenant-context");
        await qc.invalidateQueries({ queryKey: ["me"] });
      }
      await qc.invalidateQueries({ queryKey: ["tenants"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["platform-tenants", "options"],
        exact: false,
      });
      await qc.invalidateQueries({
        queryKey: ["platform-dashboard"],
        exact: false,
      });
      toast.success("Company deleted");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.message ??
          e.message)
        : "Could not delete company";
      toast.error(String(msg));
    },
  });
  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  const columns = useMemo<ColumnDef<TenantRow>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: "Company",
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            to={`/platform/tenants/${row.original.id}`}
            className="font-medium hover:underline text-primary"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <span className={tenantStatusBadgeClass(row.original.status)}>
            {row.original.status === "INVITED"
              ? "Invited"
              : row.original.status === "ACTIVE"
                ? "Active"
                : "Inactive"}
          </span>
        ),
      },
      {
        id: "users",
        accessorFn: (r) => r._count.users,
        header: "Users",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original._count.users}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "created",
        header: "Created",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original;
          if (t.status === "INVITED") {
            return (
              <div className="flex flex-wrap gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link to={`/platform/tenants/${t.id}/edit`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Edit company"
                          disabled={
                            setStatus.isPending || deleteTenant.isPending
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                    }
                  />
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
                        aria-label="Delete company"
                        disabled={setStatus.isPending || deleteTenant.isPending}
                        onClick={() =>
                          setConfirm({
                            tenantId: t.id,
                            tenantName: t.name,
                            kind: "delete",
                          })
                        }
                      />
                    }
                  >
                    <Trash2 className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            );
          }

          const nextStatus = t.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
          return (
            <div className="flex flex-wrap gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link to={`/platform/tenants/${t.id}/edit`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Edit company"
                        disabled={setStatus.isPending || deleteTenant.isPending}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </Link>
                  }
                />
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={
                        t.status === "INACTIVE"
                          ? "Activate company"
                          : "Deactivate company"
                      }
                      disabled={setStatus.isPending || deleteTenant.isPending}
                      onClick={() =>
                        setConfirm({
                          tenantId: t.id,
                          tenantName: t.name,
                          kind:
                            nextStatus === "ACTIVE" ? "activate" : "deactivate",
                        })
                      }
                    />
                  }
                >
                  {t.status === "INACTIVE" ? (
                    <ToggleLeft className="size-4 text-red-500" />
                  ) : (
                    <ToggleRight className="size-4 text-green-500" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {t.status === "INACTIVE" ? "Activate it" : "Deactivate it"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete company"
                      disabled={setStatus.isPending || deleteTenant.isPending}
                      onClick={() =>
                        setConfirm({
                          tenantId: t.id,
                          tenantName: t.name,
                          kind: "delete",
                        })
                      }
                    />
                  }
                >
                  <Trash2 className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [setStatus.isPending, deleteTenant.isPending],
  );

  const table = useReactTable({
    data: tenants,
    columns,
    state: { pagination, sorting: tableSorting },
    pageCount,
    manualPagination: true,
    manualSorting: true,
    onPaginationChange: (updater) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const cur = parseTenantsUrlParams(p).pagination;
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

  const onChangeSort = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const cur = parseTenantsUrlParams(p).tableSorting;
          const next = typeof updater === "function" ? updater(cur) : updater;
          const first = next[0];
          if (!first) {
            // DataTable cycle emits [] after desc; map to asc on Created.
            p.set("sortBy", "created");
            p.set("sortDir", "asc");
          } else {
            const dir: "asc" | "desc" = first.desc ? "desc" : "asc";
            p.set("sortBy", "created");
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold uppercase tracking-wide text-primary">
            Companies
          </h1>
          <p className="text-sm text-muted-foreground">
            Companies are the entities that own the data and users in the
            platform.
          </p>
        </div>
        <Link to="/platform/tenants/new">
          <Button>
            <Plus className="size-4" />
            Add Company
          </Button>
        </Link>
      </div>

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete"
                ? "Delete company?"
                : confirm?.kind === "activate"
                  ? "Activate company?"
                  : "Deactivate company?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete" ? (
                <>
                  This will permanently delete{" "}
                  <strong>{confirm?.tenantName}</strong> and all related data.
                  Users will no longer be able to log in.
                </>
              ) : confirm?.kind === "activate" ? (
                <>
                  This will allow users of{" "}
                  <strong>{confirm?.tenantName}</strong> to log in again.
                </>
              ) : (
                <>
                  This will prevent all users of{" "}
                  <strong>{confirm?.tenantName}</strong> from logging in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirm) return;
                if (confirm.kind === "delete") {
                  deleteTenant.mutate(confirm.tenantId, {
                    onSettled: () => setConfirm(null),
                  });
                  return;
                }

                const status =
                  confirm.kind === "activate" ? "ACTIVE" : "INACTIVE";
                setStatus.mutate(
                  { tenantId: confirm.tenantId, status },
                  { onSettled: () => setConfirm(null) },
                );
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-sm flex flex-col gap-2">
              <Label htmlFor="tenant-search">Search</Label>
              <Input
                id="tenant-search"
                placeholder="Search by company name…"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                }}
              />
            </div>
            <div className="w-full flex flex-col gap-2 sm:max-w-sm">
              <Label>Status</Label>
              <SearchableSelect
                showSearch={false}
                value={status}
                onChange={(v) => {
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
                options={[
                  { value: "", label: "All statuses" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-border">
            <DataTable
              table={table}
              columnCount={columns.length}
              sort={tableSorting}
              onChangeSort={onChangeSort}
              isLoading={tenantsQuery.isLoading}
              emptyMessage="No companies match your filters."
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {total === 0
                  ? "0 companies"
                  : `Showing ${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                      (pagination.pageIndex + 1) * pagination.pageSize,
                      total,
                    )} of ${total}`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Rows</span>
                <SearchableSelect
                  showSearch={false}
                  openDirection="up"
                  value={String(pagination.pageSize)}
                  onChange={(v) => {
                    const n = Number(v);
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
                  className="w-16"
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
                disabled={pagination.pageIndex <= 0 || tenantsQuery.isLoading}
                onClick={() =>
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      const { page: curPage } = parseTenantsUrlParams(p);
                      const nextPage = Math.max(1, curPage - 1);
                      if (nextPage <= 1) p.delete("page");
                      else p.set("page", String(nextPage));
                      return p;
                    },
                    { replace: true },
                  )
                }
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
                  tenantsQuery.isLoading
                }
                onClick={() =>
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      const { page: curPage } = parseTenantsUrlParams(p);
                      const nextPage = Math.min(pageCount, curPage + 1);
                      if (nextPage <= 1) p.delete("page");
                      else p.set("page", String(nextPage));
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
