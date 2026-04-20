import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { canCreateUsers } from "@/lib/userCreationRoles";
import {
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
import {
  RoleNameCombobox,
  type RoleNameComboboxRole,
} from "@/components/RoleNameCombobox";
import {
  dedupeRolesByDisplayName,
  findRoleMatchingForm,
} from "@/lib/roleFormMatch";

type ManagerOption = { id: string; name: string; username: string };
type DepartmentOption = { id: string; name: string; code: string | null };
type MatrixCell = { module: string; action: string };

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(64)
    .transform((v) => v.toLowerCase())
    .refine((v) => /^[a-z0-9._-]{3,64}$/.test(v), {
      message:
        "Username cannot have spaces and must use only letters, numbers, dots, underscores, or hyphens",
    }),
  roleName: z.string().trim().min(1, "Role name is required"),
  roleLevel: z.coerce.number().int().min(0).max(999).default(0),
  employeeCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  birthDate: z.string().optional(),
  password: z
    .string()
    .min(8, "Temporary password must be at least 8 characters")
    .refine((v) => !v.includes(" "), {
      message: "Password cannot contain spaces",
    }),
  managerId: z.string().default("__none__"),
  departmentId: z.string().default("__none__"),
  isReviewer: z.boolean().default(false).catch(false),
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

function humanizeCreateUserValidationMessage(field: string, message: string) {
  const f = String(field || "").toLowerCase();
  const m = String(message || "").toLowerCase();
  if (f === "username") {
    if (m.includes("at least 3")) {
      return "Username must be at least 3 characters.";
    }
    if (m.includes("letters") || m.includes("numbers") || m.includes("hyphens")) {
      return "Username can use letters, numbers, dots, underscores, and hyphens only.";
    }
    return "Please enter a valid username.";
  }
  if (f === "name") return "Please enter full name.";
  if (f === "password") return "Temporary password must be at least 8 characters.";
  if (f === "phone") return "Please enter a valid phone number.";
  return message || "Please check the form fields.";
}

export function TeamUserCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const canAddUser = canCreateUsers(me.data);
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
      roleLevel: 0,
      employeeCode: "",
      phone: "",
      birthDate: "",
      password: "",
      managerId: "__none__",
      departmentId: "__none__",
      isReviewer: false,
    },
  });

  const [roleSelected, setRoleSelected] = useState<Set<string>>(new Set());

  const rolesQuery = useQuery({
    queryKey: ["tenant-roles", "assignment"],
    enabled: canAddUser,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ roles: RoleNameComboboxRole[] }>
      >("/api/tenant/roles", { params: { for: "assignment" } });
      return data.data.roles;
    },
  });

  const roleOptions = rolesQuery.data ?? [];
  const roleOptionsForCombobox = useMemo(
    () => dedupeRolesByDisplayName(roleOptions),
    [roleOptions],
  );

  const managersQuery = useQuery({
    queryKey: ["team-managers-options"],
    enabled: canAddUser,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<
          {
            id: string;
            name: string;
            username: string;
            role: { code: string; name: string };
          }[],
          { page: number; limit: number; total: number }
        >
      >("/api/team/members", {
        params: { page: 1, pageSize: 100, sortBy: "name", sortDir: "asc" },
      });
      return data.data.map((u) => ({
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
      const { data } = await api.get<
        ApiSuccess<{ departments: DepartmentOption[] }>
      >("/api/org/departments");
      return data.data.departments;
    },
  });

  const managerOptions = managersQuery.data ?? [];
  const departmentOptions = departmentsQuery.data ?? [];

  const selectedDepartmentId = watch("departmentId");
  const selectedManagerId = watch("managerId");
  const phoneValue = watch("phone") ?? "";
  const phoneOk = phoneValue.length === 0 || phoneValue.length === 10;
  const phoneHint =
    phoneValue.length > 0 && phoneValue.length < 10
      ? `Enter all 10 digits (${phoneValue.length}/10).`
      : null;

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
      // if (!canCreateRoleInline) {
      //   throw new Error("You don’t have permission to create roles.");
      // }
      if (roleSelected.size === 0) {
        throw new Error("Select at least one permission for the role.");
      }

      const formDeptId = null;
      const allRoles = rolesQuery.data ?? [];
      const existing = findRoleMatchingForm(
        allRoles,
        v.roleName.trim(),
        formDeptId,
        roleSelected,
      );

      let roleId: string;
      if (existing) {
        roleId = existing.id;
      } else {
        const permissions: MatrixCell[] = [...roleSelected].map((k) => {
          const [module, action] = k.split(":");
          return { module, action };
        });
        const { data: roleRes } = await api.post<
          ApiSuccess<{ role: { id: string } }>
        >("/api/tenant/roles", {
          code: roleCodeFromName(v.roleName),
          name: v.roleName.trim(),
          level: v.roleLevel ?? 0,
          departmentId: formDeptId,
          permissions,
        });
        roleId = roleRes.data.role.id;
      }

      const payload = {
        name: v.name.trim(),
        username: v.username.trim().toLowerCase(),
        password: v.password,
        roleId,
        managerId: v.managerId === "__none__" ? null : v.managerId,
        departmentId: v.departmentId === "__none__" ? null : v.departmentId,
        employeeCode: v.employeeCode?.trim() ? v.employeeCode.trim() : null,
        phone: v.phone?.trim() ? v.phone.trim() : null,
        birthDate: v.birthDate ? new Date(v.birthDate) : null,
        isReviewer: Boolean(v.isReviewer),
      };
      const { data } = await api.post<ApiSuccess<{ user: { id: string } }>>(
        "/api/tenant/users",
        payload,
      );
      return data.data.user;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      await qc.invalidateQueries({ queryKey: ["tenant-roles"], exact: false });
      toast.success("User created");
      navigate("/team");
    },
    onError: (e) => {
      if (isAxiosError(e)) {
        const body = e.response?.data as
          | {
              message?: string;
              error?: {
                message?: string;
                details?: {
                  formErrors?: string[];
                  fieldErrors?: Record<string, string[]>;
                };
              };
            }
          | undefined;
        const details = body?.error?.details;
        const fieldMsg = details?.fieldErrors
          ? Array.from(
              new Set(
                Object.entries(details.fieldErrors)
                  .flatMap(([field, msgs]) =>
                    (msgs ?? []).map((m) =>
                      humanizeCreateUserValidationMessage(field, m),
                    ),
                  )
                  .filter(Boolean),
              ),
            ).join(" ")
          : "";
        const formMsg = (details?.formErrors ?? []).filter(Boolean).join(" ");
        const msg =
          fieldMsg ||
          formMsg ||
          body?.error?.message ||
          body?.message ||
          e.message ||
          "Could not create user";
        toast.error(String(msg));
        return;
      }
      const msg = e instanceof Error ? e.message : "Could not create user";
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
        onSubmit={handleSubmit((values) => {
          if (!phoneOk) return;
          create.mutate(values);
        })}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="name" required>
              Full name
            </Label>
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
            <Label htmlFor="username" required>
              Username
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="e.g. priya.patel"
              autoComplete="username"
              required
              {...register("username", {
                onChange: (e) => {
                  if (e.target.value.includes(" ")) {
                    toast.error("Username cannot contain spaces");
                    e.target.value = e.target.value.replace(/ /g, "");
                  }
                },
              })}
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
            <Label htmlFor="isReviewer">Reviewer for others</Label>
            <div className="flex items-center gap-2">
              <Input
                id="isReviewer"
                type="checkbox"
                className="h-4 w-4"
                {...register("isReviewer")}
              />
              <span className="text-sm text-muted-foreground">
                Allow this user to appear in the Task “Reviewer” dropdown.
              </span>
            </div>
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="10-digit number"
              autoComplete="tel"
              inputMode="numeric"
              maxLength={10}
              aria-invalid={Boolean(phoneHint)}
              aria-describedby={phoneHint ? "phone-hint" : "phone-help"}
              {...register("phone", {
                onChange: (e) => {
                  const next = String(e.target.value ?? "")
                    .replace(/\D/g, "")
                    .slice(0, 10);
                  e.target.value = next;
                },
                onBlur: (e) => {
                  e.target.value = String(e.target.value ?? "")
                    .replace(/\D/g, "")
                    .slice(0, 10);
                },
              })}
              onKeyDown={(e) => {
                const mod = e.ctrlKey || e.metaKey;
                const allowed =
                  e.key === "Backspace" ||
                  e.key === "Delete" ||
                  e.key === "Tab" ||
                  e.key === "Escape" ||
                  e.key === "Enter" ||
                  e.key === "ArrowLeft" ||
                  e.key === "ArrowRight" ||
                  e.key === "Home" ||
                  e.key === "End" ||
                  (mod && ["a", "c", "v", "x"].includes(e.key.toLowerCase()));
                if (allowed) return;
                if (/^\d$/.test(e.key)) return;
                e.preventDefault();
              }}
            />
            {phoneHint ? (
              <p
                id="phone-hint"
                className="text-xs text-amber-600 dark:text-amber-400"
                role="status"
              >
                {phoneHint}
              </p>
            ) : (
              <p id="phone-help" className="text-xs text-muted-foreground">
                Digits only, up to 10 characters. Leave empty if you have no
                phone.
              </p>
            )}
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
            <Label htmlFor="roleName" required>
              Role name
            </Label>
            <Controller
              control={control}
              name="roleName"
              render={({ field }) => (
                <RoleNameCombobox
                  id="roleName"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  // disabled={!canCreateRoleInline}
                  placeholder="e.g. Manager"
                  roles={roleOptionsForCombobox}
                  onPickRole={(r) => {
                    setRoleSelected(
                      new Set(
                        r.matrixSelections.map((c) =>
                          cellKey(c.module, c.action),
                        ),
                      ),
                    );
                  }}
                  onClear={() => {
                    setRoleSelected(new Set());
                  }}
                  error={errors.roleName?.message}
                />
              )}
            />

            {rolesQuery.isError ? (
              <p className="text-xs text-destructive">
                Could not load the role list.
              </p>
            ) : null}
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
                                disabled={!supported}
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
                            // disabled={!canCreateRoleInline}
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
            <Label htmlFor="password" required>
              Temporary password
            </Label>
            <PasswordInput
              id="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              {...register("password", {
                onChange: (e) => {
                  if (e.target.value.includes(" ")) {
                    toast.error("Password cannot contain spaces");
                    e.target.value = e.target.value.replace(/ /g, "");
                  }
                },
              })}
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
          <Button type="submit" disabled={create.isPending || !phoneOk}>
            {create.isPending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
