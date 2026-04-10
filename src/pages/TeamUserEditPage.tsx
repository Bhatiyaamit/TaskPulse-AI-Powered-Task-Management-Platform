import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import {
  P,
  PERMISSION_MATRIX_ACTIONS,
  PERMISSION_MATRIX_MODULES,
} from "@/lib/permissions";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

type ManagerOption = { id: string; name: string; username: string };
type DepartmentOption = { id: string; name: string; code: string | null };
type MatrixCell = { module: string; action: string };
type TenantRoleDetail = {
  id: string;
  name: string;
  departmentId: string | null;
  matrixSelections: MatrixCell[];
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  employeeCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  birthDate: z.string().optional(),
  managerId: z.string().default("__none__"),
  departmentId: z.string().default("__none__"),
  roleName: z.string().trim().min(1, "Role name is required"),
  roleDepartmentId: z.string().default("none").catch("none"),
});
type FormValues = z.input<typeof schema>;

function cellKey(m: string, a: string) {
  return `${m}:${a}`;
}

const SUPPORTED_ACTIONS_BY_MODULE: Record<string, ReadonlySet<string>> = {
  REPORTS: new Set(["READ"]),
};

function getSupportedActions(module: string): readonly string[] {
  const override = SUPPORTED_ACTIONS_BY_MODULE[module];
  return override ? [...override] : [...PERMISSION_MATRIX_ACTIONS];
}

function roleCodeFromName(name: string) {
  const base = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || "ROLE"}_${suffix}`;
}

type UserDetail = {
  id: string;
  username: string;
  name: string;
  managerId: string | null;
  departmentId: string | null;
  employeeCode: string | null;
  phone: string | null;
  birthDate: string | null;
  role: { id: string; code: string; name: string };
};

export function TeamUserEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const me = useMe();
  const perms = new Set(me.data?.permissions ?? []);
  const canViewUsers = perms.has(P.USERS_READ);
  const canUpdateUsers = perms.has(P.USERS_UPDATE);
  const canCreateRoles = perms.has(P.ROLES_CREATE);

  const userQuery = useQuery({
    enabled: canViewUsers && Boolean(id),
    queryKey: ["tenant-user", id],
    queryFn: async () => {
      const { data } = await api.get<{ user: UserDetail }>(
        `/api/tenant/users/${id}`,
      );
      return data.user;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["tenant-roles", "all"],
    enabled: canViewUsers && canCreateRoles,
    queryFn: async () => {
      const { data } = await api.get<{ roles: TenantRoleDetail[] }>(
        "/api/tenant/roles",
        { params: { for: "all" } },
      );
      return data.roles;
    },
  });

  const managersQuery = useQuery({
    queryKey: ["team-managers-options"],
    enabled: canViewUsers,
    queryFn: async () => {
      const { data } = await api.get<{
        items: { id: string; name: string; username: string }[];
      }>("/api/team/members", {
        params: { page: 1, pageSize: 100, sortBy: "name", sortDir: "asc" },
      });
      return data.items as ManagerOption[];
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["org-departments", "options"],
    enabled: canViewUsers,
    queryFn: async () => {
      const { data } = await api.get<{ departments: DepartmentOption[] }>(
        "/api/org/departments",
      );
      return data.departments;
    },
  });

  const managerOptions = managersQuery.data ?? [];
  const departmentOptions = departmentsQuery.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: "",
      employeeCode: "",
      phone: "",
      birthDate: "",
      managerId: "__none__",
      departmentId: "__none__",
      roleName: "",
      roleDepartmentId: "none",
    },
  });

  const [roleSelected, setRoleSelected] = useState<Set<string>>(new Set());
  const selectedManagerId = watch("managerId");
  const selectedDepartmentId = watch("departmentId");
  const roleDepartmentId = watch("roleDepartmentId");

  useEffect(() => {
    const u = userQuery.data;
    if (!u) return;
    setValue("name", u.name);
    setValue("employeeCode", u.employeeCode ?? "");
    setValue("phone", u.phone ?? "");
    setValue("managerId", u.managerId ?? "__none__");
    setValue("departmentId", u.departmentId ?? "__none__");
    if (u.birthDate) {
      try {
        setValue("birthDate", new Date(u.birthDate).toISOString().slice(0, 10));
      } catch {
        setValue("birthDate", "");
      }
    } else {
      setValue("birthDate", "");
    }
  }, [userQuery.data]);

  useEffect(() => {
    if (!canCreateRoles) return;
    const u = userQuery.data;
    const roles = rolesQuery.data;
    if (!u || !roles) return;
    const r = roles.find((x) => x.id === u.role.id);
    if (!r) return;
    setValue("roleName", r.name);
    setValue("roleDepartmentId", r.departmentId ?? "none");
    setRoleSelected(
      new Set(r.matrixSelections.map((c) => cellKey(c.module, c.action))),
    );
  }, [canCreateRoles, rolesQuery.data, userQuery.data, setValue]);

  useEffect(() => {
    if (!departmentsQuery.isSuccess) return;
    if (selectedDepartmentId === "__none__") return;
    if (!departmentOptions.some((d) => d.id === selectedDepartmentId)) {
      setValue("departmentId", "__none__");
    }
  }, [
    departmentsQuery.isSuccess,
    departmentOptions,
    selectedDepartmentId,
    setValue,
  ]);

  useEffect(() => {
    if (!departmentsQuery.isSuccess) return;
    if (roleDepartmentId === "none") return;
    if (!departmentOptions.some((d) => d.id === roleDepartmentId)) {
      setValue("roleDepartmentId", "none");
    }
  }, [
    departmentsQuery.isSuccess,
    departmentOptions,
    roleDepartmentId,
    setValue,
  ]);

  useEffect(() => {
    if (!managersQuery.isSuccess) return;
    if (selectedManagerId === "__none__") return;
    if (!managerOptions.some((m) => m.id === selectedManagerId)) {
      setValue("managerId", "__none__");
    }
  }, [managersQuery.isSuccess, managerOptions, selectedManagerId, setValue]);

  const toggleRoleCell = (module: string, action: string) => {
    if (!getSupportedActions(module).includes(action)) return;
    const k = cellKey(module, action);
    setRoleSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const isModuleAllChecked = useMemo(() => {
    return (module: string) =>
      getSupportedActions(module).every((a) =>
        roleSelected.has(cellKey(module, a)),
      );
  }, [roleSelected]);

  const setModuleAll = (module: string, checked: boolean) => {
    setRoleSelected((prev) => {
      const next = new Set(prev);
      for (const a of getSupportedActions(module)) {
        const k = cellKey(module, a);
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const update = useMutation({
    mutationFn: async (values: FormValues) => {
      const v = schema.parse(values);
      if (!canUpdateUsers) {
        throw new Error("You don’t have permission to update users.");
      }
      if (!canCreateRoles) {
        throw new Error("You don’t have permission to create roles.");
      }
      if (roleSelected.size === 0) {
        throw new Error("Select at least one permission for the role.");
      }

      const permissions: MatrixCell[] = [...roleSelected].map((k) => {
        const [module, action] = k.split(":");
        return { module, action };
      });

      const { data: roleRes } = await api.post<{ role: { id: string } }>(
        "/api/tenant/roles",
        {
          code: roleCodeFromName(v.roleName),
          name: v.roleName.trim(),
          departmentId:
            v.roleDepartmentId === "none" ? null : v.roleDepartmentId,
          permissions,
        },
      );

      const payload = {
        name: v.name.trim(),
        roleId: roleRes.role.id,
        managerId: v.managerId === "__none__" ? null : v.managerId,
        departmentId: v.departmentId === "__none__" ? null : v.departmentId,
        employeeCode: v.employeeCode?.trim() ? v.employeeCode.trim() : null,
        phone: v.phone?.trim() ? v.phone.trim() : null,
        birthDate: v.birthDate ? new Date(v.birthDate) : null,
      };
      const { data } = await api.patch<{ user: UserDetail }>(
        `/api/tenant/users/${id}`,
        payload,
      );
      return data.user;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["tenant-user", id],
        exact: false,
      });
      toast.success("User updated");
      navigate("/team");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.error ??
          e.message)
        : "Could not update user";
      toast.error(String(msg));
    },
  });

  if (!canViewUsers) {
    return (
      <CenteredFormPage
        title="Edit user"
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
        title="Edit user"
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
        title="Edit user"
        description="Could not load this user."
        back={<FormBackLink to="/team">Back to team</FormBackLink>}
      >
        <div className="text-sm text-muted-foreground">Not found.</div>
      </CenteredFormPage>
    );
  }

  const user = userQuery.data;

  return (
    <CenteredFormPage
      title="Edit user"
      description="Update user details. Username cannot be changed."
      back={<FormBackLink to="/team">Back to team</FormBackLink>}
    >
      <form
        className="space-y-8"
        onSubmit={handleSubmit((values) => update.mutate(values))}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={user.username} disabled />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="e.g. Priya Patel"
              required
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="employeeCode">Employee code</Label>
            <Input
              id="employeeCode"
              placeholder="e.g. EMP-1024"
              {...register("employeeCode")}
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="e.g. +91 98765 43210"
              autoComplete="tel"
              {...register("phone")}
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="birthDate">Birthdate</Label>
            <Input id="birthDate" type="date" {...register("birthDate")} />
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="departmentId">Department (optional)</Label>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="departmentId"
                    className="w-full min-w-0 justify-between"
                  >
                    {(() => {
                      if (field.value === "__none__") {
                        return (
                          <span className="text-muted-foreground">
                            No department
                          </span>
                        );
                      }
                      const selected = departmentOptions.find(
                        (d) => d.id === field.value,
                      );
                      return selected ? (
                        <span className="truncate">{selected.name}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Select department
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No department</SelectItem>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="managerId">Reports to</Label>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="managerId"
                    className="w-full min-w-0 justify-between"
                  >
                    {(() => {
                      if (field.value === "__none__")
                        return (
                          <span className="text-muted-foreground">
                            No manager
                          </span>
                        );
                      const selected = managerOptions.find(
                        (m) => m.id === field.value,
                      );
                      return selected ? (
                        <span className="truncate">
                          {selected.name} ({selected.username})
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Select manager
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No manager</SelectItem>
                    {managerOptions
                      .filter((m) => m.id !== user.id)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.username})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="roleName">Role name</Label>
            <Input
              id="roleName"
              placeholder="e.g. Manager"
              disabled={!canCreateRoles || !canUpdateUsers}
              {...register("roleName")}
            />
            {errors.roleName ? (
              <p className="text-xs text-destructive">
                {errors.roleName.message}
              </p>
            ) : null}
            {!canCreateRoles ? (
              <p className="text-xs text-muted-foreground">
                You don’t have permission to update roles.
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label>Role department scope (optional)</Label>
            <Controller
              control={control}
              name="roleDepartmentId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!canCreateRoles || !canUpdateUsers}
                >
                  <SelectTrigger className="w-full min-w-0 justify-between">
                    {field.value === "none"
                      ? "Company-wide"
                      : (departmentOptions.find((d) => d.id === field.value)
                          ?.name ?? "Select department")}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Company-wide</SelectItem>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4 sm:col-span-2 space-y-3">
            <div>
              <div className="font-medium">Role permissions</div>
              <div className="text-xs text-muted-foreground">
                Use the ALL column to grant all actions for a module.
              </div>
            </div>

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
                    <th className="px-3 py-2 text-left">ALL</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MATRIX_MODULES.map((m) => (
                    <tr key={m} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{m}</td>
                      {PERMISSION_MATRIX_ACTIONS.map((a) => {
                        const k = cellKey(m, a);
                        const supported = getSupportedActions(m).includes(a);
                        return (
                          <td key={k} className="px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={roleSelected.has(k)}
                                onChange={() => toggleRoleCell(m, a)}
                                disabled={
                                  !canCreateRoles ||
                                  !canUpdateUsers ||
                                  !supported
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                Allow
                              </span>
                            </label>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isModuleAllChecked(m)}
                            onChange={(e) => setModuleAll(m, e.target.checked)}
                            disabled={!canCreateRoles || !canUpdateUsers}
                          />
                          <span className="text-xs text-muted-foreground">
                            All
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6 gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={update.isPending || !canUpdateUsers || !canCreateRoles}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
