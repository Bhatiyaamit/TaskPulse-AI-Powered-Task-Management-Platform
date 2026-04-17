/** Mirrors backend `constants/permissions.ts` for UI gating. */
export const P = {
  PLATFORM_READ: "PLATFORM.READ",
  PLATFORM_CREATE: "PLATFORM.CREATE",
  PLATFORM_UPDATE: "PLATFORM.UPDATE",
  TASKS_ASSIGN: "TASKS.ASSIGN",
  TASKS_REVIEW: "TASKS.REVIEW",
  TASKS_READ: "TASKS.READ",
  TASKS_CREATE: "TASKS.CREATE",
  TASKS_UPDATE: "TASKS.UPDATE",
  TASKS_DELETE: "TASKS.DELETE",

  USERS_READ: "USERS.READ",
  USERS_CREATE: "USERS.CREATE",
  USERS_UPDATE: "USERS.UPDATE",
  USERS_DELETE: "USERS.DELETE",

  ROLES_READ: "ROLES.READ",
  ROLES_CREATE: "ROLES.CREATE",
  ROLES_UPDATE: "ROLES.UPDATE",
  ROLES_DELETE: "ROLES.DELETE",

  DEPARTMENTS_READ: "DEPARTMENTS.READ",
  DEPARTMENTS_CREATE: "DEPARTMENTS.CREATE",
  DEPARTMENTS_UPDATE: "DEPARTMENTS.UPDATE",
  DEPARTMENTS_DELETE: "DEPARTMENTS.DELETE",

  REPORTS_READ: "REPORTS.READ",
  REPORTS_CREATE: "REPORTS.CREATE",
  REPORTS_UPDATE: "REPORTS.UPDATE",
  REPORTS_DELETE: "REPORTS.DELETE",

  SETTINGS_READ: "SETTINGS.READ",
  SETTINGS_CREATE: "SETTINGS.CREATE",
  SETTINGS_UPDATE: "SETTINGS.UPDATE",
  SETTINGS_DELETE: "SETTINGS.DELETE",

  MEETINGS_READ: "MEETINGS.READ",
  MEETINGS_CREATE: "MEETINGS.CREATE",
  MEETINGS_UPDATE: "MEETINGS.UPDATE",
  MEETINGS_DELETE: "MEETINGS.DELETE",
} as const;

// --- Task module: same rules as backend `constants/permissions.ts` (for UI gating) ---

function permSet(permissions: readonly string[] | undefined): Set<string> {
  return new Set(permissions ?? []);
}

export function taskModuleCanList(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.TASKS_READ);
}

export const TASK_SINGLE_ACCESS_KEYS = [
  P.TASKS_READ,
  P.TASKS_CREATE,
  P.TASKS_UPDATE,
  P.TASKS_DELETE,
  P.TASKS_REVIEW,
  P.TASKS_ASSIGN,
] as const;

export const TASK_STATUS_ENDPOINT_KEYS = [
  P.TASKS_READ,
  P.TASKS_CREATE,
  P.TASKS_UPDATE,
  P.TASKS_REVIEW,
  P.TASKS_ASSIGN,
] as const;

export function taskModuleCanAccessTask(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return TASK_SINGLE_ACCESS_KEYS.some((k) => s.has(k));
}

export function taskModuleCanLoadTaskStatuses(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return TASK_STATUS_ENDPOINT_KEYS.some((k) => s.has(k));
}

export function taskModuleCanCreate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.TASKS_CREATE);
}

export function taskModuleCanUpdate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.TASKS_UPDATE);
}

export function taskModuleCanDelete(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.TASKS_DELETE);
}

// --- Meetings module: CRUD parity with tasks ---

export function meetingModuleCanList(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.MEETINGS_READ);
}

export function meetingModuleCanCreate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.MEETINGS_CREATE);
}

export function meetingModuleCanUpdate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.MEETINGS_UPDATE);
}

export function meetingModuleCanDelete(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.MEETINGS_DELETE);
}

// --- Users module (tenant team): mirror backend ---

export function userModuleCanList(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.USERS_READ);
}

export const USER_RECORD_ACCESS_KEYS = [
  P.USERS_READ,
  P.USERS_CREATE,
  P.USERS_UPDATE,
  P.USERS_DELETE,
] as const;

export function userModuleCanAccessUserRecord(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return USER_RECORD_ACCESS_KEYS.some((k) => s.has(k));
}

// --- Roles module (tenant settings): mirror backend ---

export const ROLE_SETTINGS_ACCESS_KEYS = [
  P.ROLES_READ,
  P.ROLES_CREATE,
  P.ROLES_UPDATE,
  P.ROLES_DELETE,
] as const;

export const ROLE_TENANT_LIST_KEYS = [
  P.ROLES_READ,
  P.ROLES_UPDATE,
  P.ROLES_DELETE,
] as const;

export function roleModuleCanAccessRolesSettings(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return ROLE_SETTINGS_ACCESS_KEYS.some((k) => s.has(k));
}

export function roleModuleCanList(
  permissions: readonly string[] | undefined,
  roleCode?: string | null,
): boolean {
  if (userIsTenantPrimaryAdmin(roleCode)) return true;
  const s = permSet(permissions);
  return s.has(P.ROLES_READ) || s.has(P.USERS_READ);
}

export function roleModuleCanFetchTenantRoleList(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return ROLE_TENANT_LIST_KEYS.some((k) => s.has(k));
}

export function roleModuleCanCreate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.ROLES_CREATE);
}

export function roleModuleCanUpdate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.ROLES_UPDATE);
}

export function roleModuleCanDelete(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.ROLES_DELETE);
}

// --- Departments module: mirror backend ---

export const DEPARTMENT_SETTINGS_ACCESS_KEYS = [
  P.DEPARTMENTS_READ,
  P.DEPARTMENTS_CREATE,
  P.DEPARTMENTS_UPDATE,
  P.DEPARTMENTS_DELETE,
] as const;

export const DEPARTMENT_PAGINATED_LIST_KEYS = [
  P.DEPARTMENTS_READ,
  P.DEPARTMENTS_UPDATE,
  P.DEPARTMENTS_DELETE,
] as const;

export const DEPARTMENT_SIMPLE_LIST_KEYS = [
  P.DEPARTMENTS_READ,
  P.DEPARTMENTS_CREATE,
  P.DEPARTMENTS_UPDATE,
  P.DEPARTMENTS_DELETE,
  P.USERS_CREATE,
  P.USERS_UPDATE,
  P.ROLES_READ,
  P.ROLES_CREATE,
  P.ROLES_UPDATE,
  P.ROLES_DELETE,
] as const;

export function departmentModuleCanAccessDepartmentsNav(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return DEPARTMENT_SETTINGS_ACCESS_KEYS.some((k) => s.has(k));
}

export function departmentModuleCanList(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.DEPARTMENTS_READ);
}

export function departmentModuleCanFetchDepartmentPageList(
  permissions: readonly string[] | undefined,
): boolean {
  const s = permSet(permissions);
  return DEPARTMENT_PAGINATED_LIST_KEYS.some((k) => s.has(k));
}

export function departmentModuleCanCreate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.DEPARTMENTS_CREATE);
}

export function departmentModuleCanUpdate(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.DEPARTMENTS_UPDATE);
}

export function departmentModuleCanDelete(
  permissions: readonly string[] | undefined,
): boolean {
  return permSet(permissions).has(P.DEPARTMENTS_DELETE);
}

export const PERMISSION_MATRIX_MODULES = [
  "TASKS",
  "USERS",
  "DEPARTMENTS",
  "REPORTS",
  "MEETINGS",
] as const;

export const PERMISSION_MATRIX_ACTIONS = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
] as const;

/** Bootstrap company-admin role may manage roles without ROLES.* matrix keys. */
export function userIsTenantPrimaryAdmin(
  roleCode: string | null | undefined,
): boolean {
  const c = String(roleCode ?? "").toUpperCase();
  return c === "COMPANY_ADMIN" || c === "ADMIN";
}
