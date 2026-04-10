import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { motion } from "motion/react";
import { api } from "@/api/client";
import { useMe, useHasPermission } from "@/hooks/useAuth";
import {
  P,
  PERMISSION_MATRIX_ACTIONS,
  PERMISSION_MATRIX_MODULES,
} from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Navigate } from "react-router-dom";

type MatrixCell = { module: string; action: string };

type TenantRole = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  departmentId: string | null;
  matrixSelections: MatrixCell[];
  permissionKeys: string[];
};

type DepartmentOpt = { id: string; name: string };

function cellKey(m: string, a: string) {
  return `${m}:${a}`;
}

export function RolesPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canRoles =
    useHasPermission(P.ROLES_READ, me) ||
    useHasPermission(P.ROLES_CREATE, me) ||
    useHasPermission(P.ROLES_UPDATE, me) ||
    useHasPermission(P.ROLES_DELETE, me);
  const canOrg =
    useHasPermission(P.DEPARTMENTS_READ, me) ||
    useHasPermission(P.DEPARTMENTS_CREATE, me) ||
    useHasPermission(P.DEPARTMENTS_UPDATE, me) ||
    useHasPermission(P.DEPARTMENTS_DELETE, me);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<string | "none">("none");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rolesQuery = useQuery({
    queryKey: ["tenant-roles", "all"],
    queryFn: async () => {
      const { data } = await api.get<{ roles: TenantRole[] }>(
        "/api/tenant/roles",
      );
      return data.roles;
    },
    enabled: Boolean(canRoles),
  });

  const deptQuery = useQuery({
    queryKey: ["org-departments", "roles-page"],
    queryFn: async () => {
      const { data } = await api.get<{ departments: DepartmentOpt[] }>(
        "/api/org/departments",
      );
      return data.departments;
    },
    enabled: Boolean(canOrg),
  });

  const matrixModules = useMemo(() => [...PERMISSION_MATRIX_MODULES], []);
  const matrixActions = useMemo(() => [...PERMISSION_MATRIX_ACTIONS], []);

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setName("");
    setDepartmentId("none");
    setSelected(new Set());
  };

  const openNew = () => {
    setEditingId("new");
    setCode("");
    setName("");
    setDepartmentId("none");
    setSelected(new Set());
  };

  const openEdit = (r: TenantRole) => {
    setEditingId(r.id);
    setCode(r.code);
    setName(r.name);
    setDepartmentId(r.departmentId ?? "none");
    setSelected(
      new Set(r.matrixSelections.map((c) => cellKey(c.module, c.action))),
    );
  };

  const toggleCell = (module: string, action: string) => {
    const k = cellKey(module, action);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const createRole = useMutation({
    mutationFn: async () => {
      const permissions: MatrixCell[] = [...selected].map((k) => {
        const [module, action] = k.split(":");
        return { module, action };
      });
      await api.post("/api/tenant/roles", {
        code: code.trim(),
        name: name.trim(),
        departmentId: departmentId === "none" ? null : departmentId,
        permissions,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenant-roles"] });
      toast.success("Role created");
      resetForm();
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? String(e.response?.data?.error ?? e.message)
          : "Failed",
      ),
  });

  const patchRole = useMutation({
    mutationFn: async (id: string) => {
      const permissions: MatrixCell[] = [...selected].map((k) => {
        const [module, action] = k.split(":");
        return { module, action };
      });
      await api.patch(`/api/tenant/roles/${id}`, {
        name: name.trim(),
        departmentId: departmentId === "none" ? null : departmentId,
        permissions,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenant-roles"] });
      toast.success("Role updated");
      resetForm();
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? String(e.response?.data?.error ?? e.message)
          : "Failed",
      ),
  });

  if (!me) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }
  if (!canRoles) {
    return <Navigate to="/" replace />;
  }

  return (
    <motion.div
      className="space-y-6 p-4 sm:p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight uppercase text-primary">
          Roles & permissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Use any role name your organization needs. Permissions use a module ×
          action matrix; you cannot grant permissions you do not have.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="font-heading text-base uppercase text-primary">
            Tenant roles
          </CardTitle>
          <Button type="button" size="sm" onClick={openNew}>
            New custom role
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rolesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading roles…</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(rolesQuery.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                >
                  <div>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-muted-foreground">({r.code})</span>
                    {r.isSystem ? (
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        system
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(r)}
                  >
                    {r.permissionKeys.length === 0 ? "Set permissions" : "Edit"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editingId ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base uppercase text-primary">
              {editingId === "new" ? "Create role" : "Edit role"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-code">Code</Label>
                <Input
                  id="role-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={editingId !== "new"}
                  placeholder="e.g. DEPT_LEAD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-name">Display name</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Role name"
                />
              </div>
            </div>

            {canOrg ? (
              <div className="space-y-2 max-w-md">
                <Label>Department scope (optional)</Label>
                <Select
                  value={departmentId}
                  onValueChange={(v) =>
                    setDepartmentId(v as typeof departmentId)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Company-wide" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Company-wide</SelectItem>
                    {(deptQuery.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Department-scoped roles limit assignable users and data
                  visibility for holders.
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-130 border-collapse text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th className="border border-border p-2 text-left">
                      Module
                    </th>
                    {matrixActions.map((a) => (
                      <th
                        key={a}
                        className="border border-border p-2 text-center"
                      >
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixModules.map((m) => (
                    <tr key={m}>
                      <td className="border border-border p-2 font-medium">
                        {m}
                      </td>
                      {matrixActions.map((a) => (
                        <td
                          key={a}
                          className="border border-border p-2 text-center"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={selected.has(cellKey(m, a))}
                            onChange={() => toggleCell(m, a)}
                            aria-label={`${m} ${a}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              {editingId === "new" ? (
                <Button
                  type="button"
                  isLoading={createRole.isPending}
                  disabled={!code.trim() || !name.trim() || selected.size === 0}
                  onClick={() => createRole.mutate()}
                >
                  Create
                </Button>
              ) : (
                <Button
                  type="button"
                  isLoading={patchRole.isPending}
                  disabled={!name.trim()}
                  onClick={() => patchRole.mutate(editingId)}
                >
                  Save
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </motion.div>
  );
}
