import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import {
  P,
  PERMISSION_MATRIX_ACTIONS,
  PERMISSION_MATRIX_MODULES,
} from "@/lib/permissions";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MatrixCell = { module: string; action: string };

type UserDetail = {
  id: string;
  username: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  departmentId: string | null;
  employeeCode: string | null;
  phone: string | null;
  birthDate: string | null;
  createdAt?: string;
  role: { id: string; code: string; name: string };
};

type TenantRoleDetail = {
  id: string;
  name: string;
  departmentId: string | null;
  matrixSelections: MatrixCell[];
};

function cellKey(m: string, a: string) {
  return `${m}:${a}`;
}

const SUPPORTED_ACTIONS_BY_MODULE: Record<string, ReadonlySet<string>> = {
  REPORTS: new Set(["READ"]),
};

function isSupportedAction(module: string, action: string): boolean {
  const override = SUPPORTED_ACTIONS_BY_MODULE[module];
  if (!override) return true;
  return override.has(action);
}

export function TeamUserDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const canViewTeam = perms.has(P.USERS_READ);

  const userQuery = useQuery({
    enabled: canViewTeam && Boolean(id),
    queryKey: ["tenant-user", id],
    queryFn: async () => {
      const { data } = await api.get<{ user: UserDetail }>(
        `/api/tenant/users/${id}`,
      );
      return data.user;
    },
  });

  const rolesQuery = useQuery({
    enabled: canViewTeam,
    queryKey: ["tenant-roles", "all"],
    queryFn: async () => {
      const { data } = await api.get<{ roles: TenantRoleDetail[] }>(
        "/api/tenant/roles",
        { params: { for: "all" } },
      );
      return data.roles;
    },
  });

  const roleSelected = useMemo(() => {
    const u = userQuery.data;
    const roles = rolesQuery.data;
    if (!u || !roles) return new Set<string>();
    const r = roles.find((x) => x.id === u.role.id);
    if (!r) return new Set<string>();
    return new Set(r.matrixSelections.map((c) => cellKey(c.module, c.action)));
  }, [rolesQuery.data, userQuery.data]);

  if (!canViewTeam) {
    return (
      <CenteredFormPage
        title="User details"
        description="You don’t have permission to view users."
        back={<FormBackLink to="/team">Back to team</FormBackLink>}
      >
        <p className="text-sm text-muted-foreground">
          Contact a company admin if you need access.
        </p>
      </CenteredFormPage>
    );
  }

  if (userQuery.isLoading) {
    return (
      <CenteredFormPage
        title="User details"
        description="Loading user…"
        back={<FormBackLink to="/team">Back to team</FormBackLink>}
      >
        <div className="text-sm text-muted-foreground">Loading…</div>
      </CenteredFormPage>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <CenteredFormPage
        title="User details"
        description="Could not load this user."
        back={<FormBackLink to="/team">Back to team</FormBackLink>}
      >
        <div className="text-sm text-muted-foreground">Not found.</div>
      </CenteredFormPage>
    );
  }

  const user = userQuery.data;
  const role = rolesQuery.data?.find((r) => r.id === user.role.id) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight">
            {user.name}
          </div>
          <div className="text-sm text-muted-foreground">{user.username}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/team"
            className={cn(
              "text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline",
            )}
          >
            Back to team
          </Link>
          <Link
            to={`/team/${user.id}/edit`}
            className={cn(
              "text-sm font-medium text-primary underline-offset-4 hover:underline",
            )}
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {user.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Employee code</span>
              <span className="font-medium">{user.employeeCode ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{user.phone ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Birthdate</span>
              <span className="font-medium">
                {user.birthDate
                  ? new Date(user.birthDate).toLocaleDateString()
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Role name</span>
              <span className="font-medium">{user.role.name}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Scope</span>
              <span className="font-medium">
                {role?.departmentId ? "Department-scoped" : "Company-wide"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rolesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading role…</div>
          ) : null}

          <div className="overflow-auto rounded-md border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">Module</th>
                  {PERMISSION_MATRIX_ACTIONS.map((a) => (
                    <th key={a} className="px-3 py-2 text-left">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX_MODULES.map((m) => (
                  <tr key={m} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {PERMISSION_MATRIX_ACTIONS.map((a) => {
                      const k = cellKey(m, a);
                      const checked = roleSelected.has(k);
                      const supported = isSupportedAction(m, a);
                      return (
                        <td key={k} className="px-3 py-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              readOnly
                              disabled={!supported}
                            />
                            <span className="text-xs text-muted-foreground">
                              {checked ? "Allowed" : "—"}
                            </span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
