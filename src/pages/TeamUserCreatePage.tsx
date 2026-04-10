import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import { canCreateUsers } from "@/lib/userCreationRoles";
import {
  P,
  PERMISSION_MATRIX_ACTIONS,
  PERMISSION_MATRIX_MODULES,
} from "@/lib/permissions";
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
import { PasswordInput } from "@/components/ui/password-input";

type ManagerOption = { id: string; name: string; username: string };
type DepartmentOption = { id: string; name: string; code: string | null };
type MatrixCell = { module: string; action: string };

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().trim().min(1, "Username is required"),
  roleName: z.string().trim().min(1, "Role name is required"),
  roleDepartmentId: z.string().default("none").catch("none"),
  employeeCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  birthDate: z.string().optional(),
  password: z
    .string()
    .min(8, "Temporary password must be at least 8 characters"),
  managerId: z.string().default("__none__"),
  departmentId: z.string().default("__none__"),
});
type UserFormValues = z.input<typeof userSchema>;

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

export function TeamUserCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const canAddUser = canCreateUsers(me.data);
  const perms = new Set(me.data?.permissions ?? []);
  const canCreateRoleInline = perms.has(P.ROLES_CREATE);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      username: "",
      roleName: "",
      roleDepartmentId: "none",
      employeeCode: "",
      phone: "",
      birthDate: "",
      password: "",
      managerId: "__none__",
      departmentId: "__none__",
    },
  });

  const [roleSelected, setRoleSelected] = useState<Set<string>>(new Set());

  const managersQuery = useQuery({
    queryKey: ["team-managers-options"],
    enabled: canAddUser,
    queryFn: async () => {
      const { data } = await api.get<{
        items: {
          id: string;
          name: string;
          username: string;
          role: { code: string; name: string };
        }[];
      }>("/api/team/members", {
        params: { page: 1, pageSize: 100, sortBy: "name", sortDir: "asc" },
      });
      return data.items.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
      })) as ManagerOption[];
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["org-departments", "options"],
    enabled: canAddUser,
    queryFn: async () => {
      const { data } = await api.get<{ departments: DepartmentOption[] }>(
        "/api/org/departments",
      );
      return data.departments;
    },
  });

  const managerOptions = managersQuery.data ?? [];
  const departmentOptions = departmentsQuery.data ?? [];

  const selectedDepartmentId = watch("departmentId");
  const selectedManagerId = watch("managerId");
  const roleDepartmentId = watch("roleDepartmentId");

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

  const create = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const v = userSchema.parse(values);
      if (!canCreateRoleInline) {
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
        username: v.username.trim().toLowerCase(),
        password: v.password,
        roleId: roleRes.role.id,
        managerId: v.managerId === "__none__" ? null : v.managerId,
        departmentId: v.departmentId === "__none__" ? null : v.departmentId,
        employeeCode: v.employeeCode?.trim() ? v.employeeCode.trim() : null,
        phone: v.phone?.trim() ? v.phone.trim() : null,
        birthDate: v.birthDate ? new Date(v.birthDate) : null,
      };
      const { data } = await api.post<{ user: { id: string } }>(
        "/api/tenant/users",
        payload,
      );
      return data.user;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      toast.success("User created");
      navigate("/team");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.error ??
          e.message)
        : e instanceof Error
          ? e.message
          : "Could not create user";
      toast.error(String(msg));
    },
  });

  if (!canAddUser) {
    return (
      <CenteredFormPage
        title="Add user"
        description="You don’t have access to add users."
        back={<FormBackLink to="/team">Back to team</FormBackLink>}
      >
        <p className="text-sm text-muted-foreground">
          Only Company Admin / Director, VP / GM, and Managers can add users
          (with role limits).
        </p>
      </CenteredFormPage>
    );
  }

  return (
    <CenteredFormPage
      title="Add user"
      description="Create a new team member and assign a role."
      back={<FormBackLink to="/team">Back to team</FormBackLink>}
    >
      <form
        className="space-y-8"
        onSubmit={handleSubmit((values) => create.mutate(values))}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="e.g. Priya Patel"
              autoComplete="name"
              required
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="e.g. priya.patel"
              autoComplete="username"
              required
              {...register("username")}
            />
            {errors.username ? (
              <p className="text-xs text-destructive">
                {errors.username.message}
              </p>
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
                      if (!selected) {
                        return (
                          <span className="text-muted-foreground">
                            Select department
                          </span>
                        );
                      }
                      return <span className="truncate">{selected.name}</span>;
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
                      if (field.value === "__none__") {
                        return (
                          <span className="text-muted-foreground">
                            No manager
                          </span>
                        );
                      }
                      const selected = managerOptions.find(
                        (m) => m.id === field.value,
                      );
                      if (!selected) {
                        return (
                          <span className="text-muted-foreground">
                            Select manager
                          </span>
                        );
                      }
                      return (
                        <span className="truncate">
                          {selected.name} ({selected.username})
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No manager</SelectItem>
                    {managerOptions.map((m) => (
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
              disabled={!canCreateRoleInline}
              {...register("roleName")}
            />
            {errors.roleName ? (
              <p className="text-xs text-destructive">
                {errors.roleName.message}
              </p>
            ) : null}
            {!canCreateRoleInline ? (
              <p className="text-xs text-muted-foreground">
                You don’t have permission to create roles.
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label>Role department scope (optional)</Label>
            <Controller
              control={control}
              name="roleDepartmentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
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
                                disabled={!canCreateRoleInline || !supported}
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
                            disabled={!canCreateRoleInline}
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

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="password">Temporary password</Label>
            <PasswordInput
              id="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6 gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={create.isPending || !canCreateRoleInline}
          >
            {create.isPending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
