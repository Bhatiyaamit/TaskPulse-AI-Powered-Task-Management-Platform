export function badgeBase() {
  return "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
}

export function userStatusBadgeClass(active: boolean) {
  const base = badgeBase();
  return active
    ? `${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`
    : `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
}

export function tenantStatusBadgeClass(
  status: "INVITED" | "ACTIVE" | "INACTIVE",
) {
  const base = badgeBase();
  if (status === "ACTIVE")
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`;
  if (status === "INVITED")
    return `${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
  return `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
}

export function invitationStatusBadgeClass(status: "PENDING" | "ACCEPTED") {
  const base = badgeBase();
  if (status === "ACCEPTED")
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`;
  return `${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
}

export function roleCodeBadgeClass(roleCode: string | null | undefined) {
  const code = String(roleCode ?? "").toUpperCase();
  const base = badgeBase();
  if (code === "SUPER_ADMIN")
    return `${base} border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
  if (code === "COMPANY_ADMIN" || code === "ADMIN")
    return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
  return `${base} border-border bg-muted/40 text-muted-foreground`;
}

export function taskPriorityBadgeClass(priority: string) {
  const p = String(priority ?? "").toUpperCase();
  const base = badgeBase();
  if (p === "URGENT")
    return `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
  if (p === "HIGH")
    return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
  if (p === "LOW")
    return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`;
  return `${base} border-border bg-muted/40 text-muted-foreground`;
}

export function taskStatusBadgeClass(code: string) {
  const c = String(code ?? "").toUpperCase();
  const base = badgeBase();
  if (c === "DONE")
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`;
  if (c === "WIP" || c === "IN_PROGRESS")
    return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`;
  if (c === "REVIEW")
    return `${base} border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200`;
  if (c === "BLOCKED")
    return `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
  return `${base} border-border bg-muted/40 text-muted-foreground`;
}

export function overdueBadgeClass() {
  const base = badgeBase();
  return `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
}

export function meetingStatusBadgeClass(
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
) {
  const base = badgeBase();
  if (status === "COMPLETED")
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200`;
  if (status === "IN_PROGRESS")
    return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`;
  if (status === "CANCELLED")
    return `${base} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
  return `${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
}
