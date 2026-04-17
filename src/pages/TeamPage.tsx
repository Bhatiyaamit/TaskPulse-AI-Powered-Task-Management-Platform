import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { canCreateUsers } from "@/lib/userCreationRoles";
import { P, userModuleCanList } from "@/lib/permissions";
import {
  Eye,
  Pencil,
  Plus,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
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
import { userStatusBadgeClass } from "@/lib/badges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TeamMemberRow = {
  id: string;
  username: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  employeeCode: string | null;
  phone: string | null;
  birthDate: string | null;
  createdAt: string;
  role: { id: string; code: string; name: string };
};

type PaginatedResponse<T> = ApiSuccess<T[], { page: number; limit: number; total: number }>;

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 20, 50, 100] as const;

type RoleOption = { id: string; code: string; name: string };

function dedupeRolesByDisplayName(roles: RoleOption[]): RoleOption[] {
  const byName = new Map<string, RoleOption>();
  for (const r of roles) {
    const key = r.name.trim();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, r);
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function parseTeamUrlParams(p: URLSearchParams) {
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const pageSize = Math.max(
    1,
    Math.min(
      100,
      Number(p.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) ||
        DEFAULT_PAGE_SIZE,
    ),
  );
  const search = String(p.get("search") ?? "");
  const departmentId = String(p.get("departmentId") ?? "");
  const roleName = String(p.get("roleName") ?? "").trim();
  const legacyRoleId = String(p.get("roleId") ?? "");
  const status = (p.get("status") ?? "") as "" | "active" | "inactive";
  const sortBy = (p.get("sortBy") ?? "createdAt") as
    | "createdAt"
    | "name"
    | "username"
    | "employeeCode";
  const sortDir = (p.get("sortDir") ?? "desc") as "asc" | "desc";
  return {
    page,
    pageSize,
    search,
    departmentId,
    roleName,
    legacyRoleId,
    status,
    sortBy,
    sortDir,
  };
}

export function TeamPage() {
  const qc = useQueryClient();
  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const canListTeam = true; // No restriction on viewing user directory
  const canEditUsers = perms.has(P.USERS_UPDATE);
  const canDeleteUsers = perms.has(P.USERS_DELETE);
  const canAddUser = canCreateUsers(me.data);
  const canMutateUsers = canAddUser || canEditUsers || canDeleteUsers;
  const myUserId = me.data?.user.id;

  const [searchParams, setSearchParams] = useSearchParams();
  const {
    page,
    pageSize,
    search,
    departmentId,
    roleName,
    legacyRoleId,
    status,
    sortBy,
    sortDir,
  } = parseTeamUrlParams(searchParams);
  const [searchInput, setSearchInput] = useState(search);

  const tableSorting: SortingState = useMemo(() => {
    if (!sortBy) return [];
    return [{ id: sortBy, desc: sortDir === "desc" }];
  }, [sortBy, sortDir]);

  const membersQuery = useQuery({
    queryKey: [
      "team-members",
      {
        page,
        pageSize,
        search,
        departmentId,
        roleName,
        legacyRoleId,
        status,
        sortBy,
        sortDir,
      },
    ],
    enabled: canListTeam,
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<TeamMemberRow>>(
        "/api/team/members",
        {
          params: {
            page,
            pageSize,
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(roleName
              ? { roleName }
              : legacyRoleId
                ? { roleId: legacyRoleId }
                : {}),
            ...(status ? { status } : {}),
            sortBy,
            sortDir,
          },
        },
      );
      return {
        items: data.data,
        meta: {
          page: data.meta?.page ?? page,
          pageSize: data.meta?.limit ?? pageSize,
          total: data.meta?.total ?? 0,
          totalPages: Math.max(
            1,
            Math.ceil((data.meta?.total ?? 0) / (data.meta?.limit ?? pageSize)),
          ),
        },
      };
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["org-departments", "options"],
    enabled: canListTeam,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ departments: { id: string; name: string; code: string | null }[] }>
      >("/api/org/departments");
      return data.data.departments;
    },
  });
  const departmentOptions = departmentsQuery.data ?? [];

  const rolesQuery = useQuery({
    queryKey: ["tenant-roles", "assignment-options"],
    enabled: canListTeam,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ roles: RoleOption[] }>>(
        "/api/tenant/roles",
        { params: { for: "assignment" } },
      );
      return data.data.roles;
    },
  });
  const roleOptions = rolesQuery.data ?? [];
  const roleFilterOptions = useMemo(
    () => dedupeRolesByDisplayName(roleOptions),
    [roleOptions],
  );

  useEffect(() => {
    if (roleName || !legacyRoleId) return;
    const roles = rolesQuery.data;
    if (!roles?.length) return;
    const found = roles.find((x) => x.id === legacyRoleId);
    if (!found) return;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("roleId");
        p.set("roleName", found.name.trim());
        return p;
      },
      { replace: true },
    );
  }, [legacyRoleId, roleName, rolesQuery.data, setSearchParams]);

  function deptBadge(seed: string) {
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

  const members = membersQuery.data?.items ?? [];
  const total = membersQuery.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const v = searchInput;
    const t = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const normalized = v.trim();
          const currentSearch = (prev.get("search") ?? "").trim();
          if (currentSearch === normalized) return prev;
          const p = new URLSearchParams(prev);
          if (normalized) p.set("search", normalized);
          else p.delete("search");
          p.delete("page");
          return p;
        },
        { replace: true },
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput, setSearchParams]);

  const [confirm, setConfirm] = useState<null | {
    userId: string;
    userName: string;
    next: boolean;
  }>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<null | {
    userId: string;
    userName: string;
  }>(null);

  const setUserStatus = useMutation({
    mutationFn: async (input: { userId: string; isActive: boolean }) => {
      const { data } = await api.patch<
        ApiSuccess<{ user: { id: string; isActive: boolean } }>
      >(`/api/tenant/users/${input.userId}/status`, {
        isActive: input.isActive,
      });
      return data.data.user;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      toast.success("User updated");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.message ??
          e.message)
        : "Could not update user";
      toast.error(String(msg));
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/api/tenant/users/${userId}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      toast.success("User deleted");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.message ??
          e.message)
        : "Could not delete user";
      toast.error(String(msg));
    },
  });

  const columns = useMemo<ColumnDef<TeamMemberRow>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.username}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "employeeCode",
        id: "employeeCode",
        header: "Employee code",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.employeeCode ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "role",
        id: "role",
        header: "Role",
        cell: ({ row }) => (
          <span className="text-xs font-medium text-primary">
            {row.original.role?.name ?? row.original.role?.code ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "department",
        id: "department",
        header: "Department",
        cell: ({ row }) => {
          const d = row.original.department;
          if (!d) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                deptBadge(d.id),
              )}
            >
              {d.name}
            </span>
          );
        },
      },
      {
        accessorKey: "isActive",
        id: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span className={userStatusBadgeClass(row.original.isActive)}>
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const isSelf = Boolean(myUserId && row.original.id === myUserId);
          const isCompanyAdminRole =
            row.original.role?.code?.toUpperCase() === "COMPANY_ADMIN";
          return (
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link to={`/team/${row.original.id}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="View user details"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </Link>
                  }
                ></TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>

              {canEditUsers ? (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        isCompanyAdminRole ? (
                          <span className="inline-flex cursor-not-allowed rounded-md">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 pointer-events-none opacity-50"
                              disabled
                              aria-label="Edit user (not available for company admin)"
                            >
                              <Pencil className="size-4 text-muted-foreground" />
                            </Button>
                          </span>
                        ) : (
                          <Link to={`/team/${row.original.id}/edit`}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Edit user"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </Link>
                        )
                      }
                    ></TooltipTrigger>
                    <TooltipContent>
                      {isCompanyAdminRole
                        ? "Company admin users cannot be edited from Team"
                        : "Edit"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        isSelf || isCompanyAdminRole ? (
                          <span className="inline-flex cursor-not-allowed rounded-md">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 pointer-events-none opacity-50"
                              disabled
                              aria-label={
                                isCompanyAdminRole
                                  ? row.original.isActive
                                    ? "Deactivate user (not available for company admin)"
                                    : "Activate user (not available for company admin)"
                                  : row.original.isActive
                                    ? "Deactivate user (not available for your account)"
                                    : "Activate user (not available for your account)"
                              }
                            >
                              {row.original.isActive ? (
                                <ToggleRight className="size-5 text-muted-foreground" />
                              ) : (
                                <ToggleLeft className="size-5 text-muted-foreground" />
                              )}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={
                              row.original.isActive
                                ? "Deactivate user"
                                : "Activate user"
                            }
                            onClick={() =>
                              setConfirm({
                                userId: row.original.id,
                                userName: row.original.name,
                                next: !row.original.isActive,
                              })
                            }
                          >
                            {row.original.isActive ? (
                              <ToggleRight className="size-5 text-green-500" />
                            ) : (
                              <ToggleLeft className="size-5 text-red-500" />
                            )}
                          </Button>
                        )
                      }
                    ></TooltipTrigger>
                    <TooltipContent>
                      {isCompanyAdminRole
                        ? "Company admin user status cannot be changed from Team"
                        : isSelf
                          ? "You cannot activate or deactivate your own account"
                        : row.original.isActive
                          ? "Deactivate user"
                          : "Activate user"}
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : null}

              {canDeleteUsers ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      isSelf || isCompanyAdminRole ? (
                        <span className="inline-flex cursor-not-allowed rounded-md">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 pointer-events-none text-muted-foreground opacity-50"
                            disabled
                            aria-label={
                              isCompanyAdminRole
                                ? "Delete user (not available for company admin)"
                                : "Delete user (not available for your account)"
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete user"
                          onClick={() =>
                            setDeleteConfirm({
                              userId: row.original.id,
                              userName: row.original.name,
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )
                    }
                  ></TooltipTrigger>
                  <TooltipContent>
                    {isCompanyAdminRole
                      ? "Company admin users cannot be deleted from Team"
                      : isSelf
                        ? "You cannot delete your own account"
                      : "Delete"}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          );
        },
      } satisfies ColumnDef<TeamMemberRow>,
    ],
    [canDeleteUsers, canEditUsers, myUserId],
  );

  const table = useReactTable({
    data: members,
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
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Team
          </h1>
          <p className="text-sm text-muted-foreground">
            Search and manage users in your organization.
          </p>
        </div>
        {canAddUser ? (
          <Link to="/team/new">
            <Button>
              <Plus className="size-4" />
              Add user
            </Button>
          </Link>
        ) : null}
      </div>

      {me.data && !canListTeam && canMutateUsers ? (
        <Card className="border-amber-500/35 bg-muted/30 p-6">
          <div className="flex gap-4">
            <ShieldAlert
              className="size-10 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                You don&apos;t have permission to browse the team list
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your role does not include{" "}
                <span className="font-medium text-foreground">
                  Users → Read
                </span>{" "}
                (<code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {P.USERS_READ}
                </code>
                ).
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {canAddUser ? (
                  <Link to="/team/new" className={cn(buttonVariants())}>
                    <Plus className="size-4" />
                    Add user
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
      ) : null}

      {me.data && !canListTeam && !canMutateUsers ? (
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have access to the Team module.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canListTeam ? (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-sm flex flex-col gap-2">
                <Label htmlFor="team-search">Search</Label>
                <Input
                  id="team-search"
                  placeholder="Search by name, username, or employee code…"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                  }}
                />
              </div>
              <div className="w-full sm:w-56 flex flex-col gap-2">
                <Label>Department</Label>
                <Select
                  value={departmentId || "__all__"}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (v === "__all__") p.delete("departmentId");
                        else p.set("departmentId", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    {(() => {
                      if (!departmentId) {
                        return (
                          <span className="text-muted-foreground">
                            All departments
                          </span>
                        );
                      }
                      const selected = departmentOptions.find(
                        (d) => d.id === departmentId,
                      );
                      if (!selected) {
                        return (
                          <span className="text-muted-foreground">
                            All departments
                          </span>
                        );
                      }
                      return <span className="truncate">{selected.name}</span>;
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All departments</SelectItem>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-56 flex flex-col gap-2">
                <Label>Role</Label>
                <Select
                  value={roleName || "__all__"}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        p.delete("roleId");
                        if (v === "__all__") p.delete("roleName");
                        else p.set("roleName", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    {(() => {
                      if (!roleName) {
                        return (
                          <span className="text-muted-foreground">
                            All roles
                          </span>
                        );
                      }
                      const selected = roleFilterOptions.find(
                        (r) => r.name.trim() === roleName,
                      );
                      return (
                        <span className="truncate">
                          {selected?.name ?? roleName}
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All roles</SelectItem>
                    {roleName &&
                    !roleFilterOptions.some(
                      (r) => r.name.trim() === roleName,
                    ) ? (
                      <SelectItem value={roleName}>{roleName}</SelectItem>
                    ) : null}
                    {roleFilterOptions.map((r) => (
                      <SelectItem key={r.id} value={r.name.trim()}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48 flex flex-col gap-2">
                <Label>Status</Label>
                <Select
                  value={status || "__all__"}
                  onValueChange={(v) => {
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        if (v === "__all__") p.delete("status");
                        else p.set("status", v);
                        p.delete("page");
                        return p;
                      },
                      { replace: true },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    {(() => {
                      if (!status) {
                        return (
                          <span className="text-muted-foreground">
                            All statuses
                          </span>
                        );
                      }
                      return (
                        <span className="truncate">
                          {status === "active" ? "Active" : "Inactive"}
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-auto rounded-md border border-border">
              <DataTable
                table={table}
                columnCount={columns.length}
                sort={tableSorting}
                onChangeSort={onChangeSort}
                isLoading={membersQuery.isLoading}
                emptyMessage="No team members match your search."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {total === 0
                    ? "0 members"
                    : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
                </span>
                <span className="hidden sm:inline">·</span>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="team-page-size"
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
                    <SelectTrigger id="team-page-size" className="h-8 w-18">
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
                  disabled={page <= 1 || membersQuery.isLoading}
                  onClick={() =>
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        const cur = parseTeamUrlParams(p).page;
                        const next = Math.max(1, cur - 1);
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
                  disabled={page >= pageCount || membersQuery.isLoading}
                  onClick={() =>
                    setSearchParams(
                      (prev) => {
                        const p = new URLSearchParams(prev);
                        const cur = parseTeamUrlParams(p).page;
                        const next = Math.min(pageCount, cur + 1);
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

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.next ? "Activate user?" : "Deactivate user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.next ? (
                <>
                  This will allow <strong>{confirm?.userName}</strong> to log in
                  again.
                </>
              ) : (
                <>
                  This will prevent <strong>{confirm?.userName}</strong> from
                  logging in.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                setUserStatus.mutate(
                  { userId: confirm.userId, isActive: confirm.next },
                  { onSettled: () => setConfirm(null) },
                );
              }}
              disabled={setUserStatus.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong>{deleteConfirm?.userName}</strong>. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirm) return;
                deleteUser.mutate(deleteConfirm.userId, {
                  onSettled: () => setDeleteConfirm(null),
                });
              }}
              disabled={deleteUser.isPending}
            >
              Confirm delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
