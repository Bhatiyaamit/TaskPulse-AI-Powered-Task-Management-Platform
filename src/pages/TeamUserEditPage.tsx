import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import {
  P,
  PERMISSION_MATRIX_ACTIONS,
  PERMISSION_MATRIX_MODULES,
  userIsTenantPrimaryAdmin,
} from "@/lib/permissions";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  dedupeRolesByDisplayName,
  findRoleMatchingForm,
  roleFormMatchesExisting,
} from "@/lib/roleFormMatch";
import {
  RoleNameCombobox,
  type RoleNameComboboxRole,
} from "@/components/RoleNameCombobox";

type ManagerOption = { id: string; name: string; username: string };
type DepartmentOption = { id: string; name: string; code: string | null };
type MatrixCell = { module: string; action: string };
type TenantRoleDetail = RoleNameComboboxRole;

const RESERVED_ROLE_NAMES = [
  "company admin",
  "company_admin",
  "companyadmin",
  "admin",
];

function isReservedRoleName(name: string) {
  return RESERVED_ROLE_NAMES.includes(
    name.trim().toLowerCase().replace(/\s+/g, " "),
  );
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  employeeCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  birthDate: z.string().optional(),
  managerId: z
    .string()
    .min(1, "Reports to is required")
    .refine((v) => v !== "__none__", {
      message: "Reports to is required",
    }),
  departmentId: z.string().default("__none__"),
  roleName: z
    .string()
    .trim()
    .min(1, "Role name is required")
    .refine((v) => !isReservedRoleName(v), {
      message: '"Company Admin" is a reserved name and cannot be used.',
    }),
  isReviewer: z.boolean().default(false).catch(false),
});
type FormValues = z.input<typeof schema>;

function cellKey(m: string, a: string) {
  return `${m}:${a}`;
}

const SUPPORTED_ACTIONS_BY_MODULE: Record<string, ReadonlySet<string>> = {
  REPORTS: new Set(["READ"]),
  HIERARCHY: new Set(["READ", "UPDATE"]),
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
  isReviewer?: boolean;
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
  const isTenantAdmin = userIsTenantPrimaryAdmin(me.data?.user?.roleCode);
  const canUpdateUsers = perms.has(P.USERS_UPDATE);
  const userQuery = useQuery({
    enabled: canUpdateUsers && Boolean(id),
    queryKey: ["tenant-user", id],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ user: UserDetail }>>(
        `/api/tenant/users/${id}`,
      );
      return data.data.user;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ["tenant-roles", "assignment"],
    enabled: canUpdateUsers,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ roles: TenantRoleDetail[] }>>(
        "/api/tenant/roles",
        { params: { for: "assignment" } },
      );
      return data.data.roles;
    },
  });

  const isSelf = Boolean(me.data?.user?.id && id && me.data.user.id === id);

  const managersQuery = useQuery({
    queryKey: ["team-managers-options"],
    enabled: canUpdateUsers && Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<
          { id: string; name: string; username: string }[],
          { page: number; limit: number; total: number }
        >
      >("/api/team/members", {
        params: { page: 1, pageSize: 100, sortBy: "name", sortDir: "asc" },
      });
      return data.data as ManagerOption[];
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["org-departments", "options"],
    enabled: canUpdateUsers && Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ departments: DepartmentOption[] }>
      >("/api/org/departments");
      return data.data.departments;
    },
  });

  const managerOptions = managersQuery.data ?? [];
  const departmentOptions = departmentsQuery.data ?? [];

  const managerSelectOptions = useMemo(
    () =>
      managerOptions
        .filter((m) => m.id !== userQuery.data?.id)
        .map((m) => ({ value: m.id, label: `${m.name} (${m.username})` })),
    [managerOptions, userQuery.data?.id],
  );

  const roleOptionsForCombobox = useMemo(
    () => dedupeRolesByDisplayName(rolesQuery.data ?? []),
    [rolesQuery.data],
  );

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
      managerId: "",
      departmentId: "__none__",
      roleName: "",
      isReviewer: false,
    },
  });

  const [roleSelected, setRoleSelected] = useState<Set<string>>(new Set());
  const selectedManagerId = watch("managerId");
  const selectedDepartmentId = watch("departmentId");
  const phoneValue = watch("phone") ?? "";
  const phoneOk = phoneValue.length === 0 || phoneValue.length === 10;
  const phoneHint =
    phoneValue.length > 0 && phoneValue.length < 10
      ? `Enter all 10 digits (${phoneValue.length}/10).`
      : null;
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const resetPasswordsMatch =
    resetPassword.length > 0 &&
    resetPasswordConfirm.length > 0 &&
    resetPassword === resetPasswordConfirm;
  const hasPasswordInput =
    resetPassword.length > 0 || resetPasswordConfirm.length > 0;
  const passwordSectionValid =
    !hasPasswordInput || (resetPassword.length >= 8 && resetPasswordsMatch);

  useEffect(() => {
    const u = userQuery.data;
    if (!u) return;
    setValue("name", u.name);
    setValue("employeeCode", u.employeeCode ?? "");
    setValue("phone", u.phone ?? "");
    setValue("managerId", u.managerId ?? "");
    setValue("departmentId", u.departmentId ?? "__none__");
    setValue("isReviewer", Boolean(u.isReviewer));
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
    // if (!canManageRoleOnUser) return;
    const u = userQuery.data;
    const roles = rolesQuery.data;
    if (!u || !roles) return;
    const r = roles.find((x) => x.id === u.role.id);
    if (!r) return;
    setValue("roleName", r.name);
    setRoleSelected(
      new Set(r.matrixSelections.map((c) => cellKey(c.module, c.action))),
    );
  }, [rolesQuery.data, userQuery.data, setValue]);

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
    if (!selectedManagerId || selectedManagerId === "__none__") return;
    if (!managerOptions.some((m) => m.id === selectedManagerId)) {
      setValue("managerId", "");
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
      // if (!canManageRoleOnUser) {
      //   throw new Error("You don’t have permission to manage roles for users.");
      // }
      if (roleSelected.size === 0) {
        throw new Error("Select at least one permission for the role.");
      }

      const userRow = userQuery.data;
      const rolesList = rolesQuery.data;
      if (!userRow || !id) {
        throw new Error("Missing user.");
      }
      if (rolesList === undefined) {
        throw new Error("Role directory is still loading.");
      }

      const formDeptId = null;
      const currentRoleDetail = rolesList.find((x) => x.id === userRow.role.id);

      let roleId: string;
      if (
        currentRoleDetail &&
        roleFormMatchesExisting(
          currentRoleDetail,
          v.roleName,
          formDeptId,
          roleSelected,
        )
      ) {
        roleId = userRow.role.id;
      } else {
        const reuse = findRoleMatchingForm(
          rolesList,
          v.roleName.trim(),
          formDeptId,
          roleSelected,
        );
        if (reuse) {
          roleId = reuse.id;
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
            departmentId: formDeptId,
            permissions,
          });
          roleId = roleRes.data.role.id;
        }
      }

      const payload = {
        name: v.name.trim(),
        roleId,
        managerId: v.managerId,
        departmentId: v.departmentId === "__none__" ? null : v.departmentId,
        employeeCode: v.employeeCode?.trim() ? v.employeeCode.trim() : null,
        phone: v.phone?.trim() ? v.phone.trim() : null,
        birthDate: v.birthDate ? new Date(v.birthDate) : null,
        isReviewer: Boolean(v.isReviewer),
        ...(isTenantAdmin && resetPassword.trim().length > 0
          ? { password: resetPassword }
          : {}),
      };
      const { data } = await api.patch<ApiSuccess<{ user: UserDetail }>>(
        `/api/tenant/users/${id}`,
        payload,
      );
      return data.data.user;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
      await qc.invalidateQueries({ queryKey: ["tenant-roles"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["tenant-user", id],
        exact: false,
      });
      setResetPassword("");
      setResetPasswordConfirm("");
      toast.success("User updated");
      navigate("/team");
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

  if (!canUpdateUsers) {
    return (
      <CenteredFormPage
        title="Edit user"
        description="You don’t have permission to update users."
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
        onSubmit={handleSubmit((values) => {
          if (!phoneOk) return;
          if (!values.managerId || values.managerId === "__none__") {
            toast.error("Reports to is required.");
            return;
          }
          if (!passwordSectionValid) {
            toast.error(
              "Password must be at least 8 characters and both password fields must match.",
            );
            return;
          }
          update.mutate(values);
        })}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={user.username} disabled />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="name" required>
              Full name
            </Label>
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
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  showSearch={departmentOptions.length > 5}
                  options={[
                    { value: "__none__", label: "No department" },
                    ...departmentOptions.map((d) => ({
                      value: d.id,
                      label: d.name,
                    })),
                  ]}
                />
              )}
            />
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="managerId" required>
              Reports to
            </Label>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  showSearch={managerSelectOptions.length > 5}
                  options={managerSelectOptions}
                />
              )}
            />
            {errors.managerId?.message ? (
              <p className="text-xs text-destructive">
                {errors.managerId.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="roleName">Role name</Label>
            <Controller
              control={control}
              name="roleName"
              render={({ field }) => (
                <RoleNameCombobox
                  id="roleName"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={!canUpdateUsers || isSelf}
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
            {isSelf ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                ⚠ You cannot change your own role.
              </p>
            ) : canUpdateUsers ? (
              <p className="text-xs text-muted-foreground">
                Pick a role to copy its setup, or type a new name. An existing
                role is reused when name, scope, and permissions match;
                otherwise a new role is created.
              </p>
            ) : null}
            {/* {!canManageRoleOnUser ? (
              <p className="text-xs text-muted-foreground">
                You don’t have permission to update roles.
              </p>
            ) : null} */}
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
                                disabled={
                                  !canUpdateUsers || isSelf || !supported
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
                            disabled={!canUpdateUsers || isSelf}
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

          {isTenantAdmin ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 sm:col-span-2 space-y-4">
              <div>
                <div className="font-medium">Reset password</div>
                <div className="text-xs text-muted-foreground">
                  Set a new password for this user. This overrides the old one
                  and clears active sessions.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resetPassword">New password</Label>
                  <PasswordInput
                    id="resetPassword"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetPasswordConfirm">Confirm password</Label>
                  <PasswordInput
                    id="resetPasswordConfirm"
                    value={resetPasswordConfirm}
                    onChange={(e) => setResetPasswordConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    aria-invalid={
                      resetPasswordConfirm.length > 0 && !resetPasswordsMatch
                        ? true
                        : undefined
                    }
                  />
                  {resetPasswordConfirm.length > 0 && !resetPasswordsMatch ? (
                    <p className="text-xs text-destructive">
                      Passwords do not match.
                    </p>
                  ) : null}
                  {resetPassword.length > 0 && resetPassword.length < 8 ? (
                    <p className="text-xs text-destructive">
                      Password must be at least 8 characters.
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Password update will be applied when you click Save changes.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6 gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              update.isPending ||
              !canUpdateUsers ||
              !phoneOk ||
              !selectedManagerId ||
              selectedManagerId === "__none__" ||
              !passwordSectionValid ||
              rolesQuery.isLoading ||
              rolesQuery.isError
            }
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
