import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useMe } from "@/hooks/useAuth";
import {
  usePlatformTenantsOptions,
  useTenantContext,
} from "@/hooks/useTenantContext";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { useTheme } from "@/providers/theme-provider";
import { useEffect, useMemo, useState } from "react";
import {
  meetingModuleCanCreate,
  meetingModuleCanList,
  P,
  departmentModuleCanAccessDepartmentsNav,
  taskModuleCanCreate,
  taskModuleCanList,
} from "@/lib/permissions";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  BarChart3,
  Settings,
  Building2,
  Calendar,
  Layers,
  ClipboardList,
  X,
  ShieldHalf,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppLayout() {
  const { data, isError } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const { setPreference } = useTheme();
  const p = data?.permissions ?? [];

  const isPlatform = data?.user?.tenantId == null;
  const isSuperAdmin = isPlatform && data?.user?.roleCode === "SUPER_ADMIN";
  const tenantOptionsQuery = usePlatformTenantsOptions(Boolean(isSuperAdmin));
  const tenantContext = useTenantContext();

  const selectedTenantId = data?.selectedTenantId ?? null;
  const [uiTenantId, setUiTenantId] = useState<string | null>(null);
  const selectedTenantName = useMemo(() => {
    const effectiveId = uiTenantId ?? selectedTenantId;
    if (!effectiveId) return null;
    return (
      data?.selectedTenant?.name ??
      (tenantOptionsQuery.data ?? []).find((t) => t.id === effectiveId)?.name ??
      "Selected company"
    );
  }, [
    data?.selectedTenant?.name,
    selectedTenantId,
    tenantOptionsQuery.data,
    uiTenantId,
  ]);

  const isSwitchingCompany =
    tenantContext.setTenant.isPending || tenantContext.clearTenant.isPending;

  // Keep UI stable: reflect server value when not actively switching.
  useEffect(() => {
    if (isSwitchingCompany) return;
    setUiTenantId(selectedTenantId);
  }, [isSwitchingCompany, selectedTenantId]);

  const effectiveTenantId = uiTenantId ?? selectedTenantId;
  const showCompanyModules = Boolean(isSuperAdmin && effectiveTenantId);

  useEffect(() => {
    // If Super Admin clears company context while on a tenant page, bounce back to platform dashboard.
    if (!data) return;
    if (!isSuperAdmin) return;
    if (effectiveTenantId) return;
    const path = location.pathname || "/";
    if (
      path.startsWith("/platform") ||
      path.startsWith("/login") ||
      path.startsWith("/profile") ||
      path.startsWith("/settings")
    )
      return;
    navigate("/platform/dashboard", { replace: true });
  }, [data, effectiveTenantId, isSuperAdmin, location.pathname, navigate]);

  useEffect(() => {
    const pref = data?.user?.themePreference;
    if (pref === "light" || pref === "dark") {
      setPreference(pref);
    }
  }, [data?.user?.themePreference, setPreference]);

  if (isError) {
    navigate("/login");
    return null;
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const tenant = data.user.tenantId != null;

  return (
    <div className="flex min-h-screen">
      {isSwitchingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur transition-opacity duration-200 animate-in fade-in">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/80 px-4 py-3 shadow-lg">
            <span className="inline-flex size-2 rounded-full bg-(--brand)" />
            <div className="text-sm font-medium uppercase tracking-wide text-primary/80">
              Switching company data…
            </div>
          </div>
        </div>
      ) : null}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar/70 p-4 backdrop-blur supports-backdrop-filter:bg-sidebar/60">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img
            src={"/logo.png"}
            alt="TMS"
            className="h-9 w-auto select-none"
            draggable={false}
          />
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          {tenant && (
            <>
              <Nav
                to="/"
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
              />
              {taskModuleCanList(p) || taskModuleCanCreate(p) ? (
                <Nav
                  to="/tasks"
                  icon={<CheckSquare className="h-4 w-4" />}
                  label="Tasks"
                />
              ) : null}
              {taskModuleCanList(p) ? (
                <Nav
                  to="/eod"
                  icon={<ClipboardList className="h-4 w-4" />}
                  label="EOD"
                />
              ) : null}
              {(meetingModuleCanList(p) || meetingModuleCanCreate(p)) && (
                <Nav
                  to="/meetings"
                  icon={<Calendar className="h-4 w-4" />}
                  label="Meetings"
                />
              )}
              <Nav
                to="/team"
                icon={<Users className="h-4 w-4" />}
                label="Team"
              />
              {departmentModuleCanAccessDepartmentsNav(p) && (
                <Nav
                  to="/departments"
                  icon={<Layers className="h-4 w-4" />}
                  label="Departments"
                />
              )}
              {p.includes(P.REPORTS_READ) && (
                <Nav
                  to="/reports"
                  icon={<BarChart3 className="h-4 w-4" />}
                  label="Reports"
                />
              )}
              <Nav
                to="/roles"
                icon={<ShieldHalf className="h-4 w-4" />}
                label="Hierarchy"
              />
              <Nav
                to="/settings"
                icon={<Settings className="h-4 w-4" />}
                label="Settings"
              />
            </>
          )}
          {isPlatform && p.includes(P.PLATFORM_READ) && (
            <>
              {showCompanyModules ? (
                <div className="mt-3 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Super admin modules
                </div>
              ) : null}
              <Nav
                to="/platform/dashboard"
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
              />
              <Nav
                to="/platform/tenants"
                icon={<Building2 className="h-4 w-4" />}
                label="Tenants"
              />
            </>
          )}
          {showCompanyModules && (
            <>
              <div className="mt-3 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Company Modules
              </div>
              <Nav
                to="/"
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
              />
              <Nav
                to="/tasks"
                icon={<CheckSquare className="h-4 w-4" />}
                label="Tasks"
              />
              <Nav
                to="/eod"
                icon={<ClipboardList className="h-4 w-4" />}
                label="EOD"
              />
              <Nav
                to="/meetings"
                icon={<Calendar className="h-4 w-4" />}
                label="Meetings"
              />
              <Nav
                to="/team"
                icon={<Users className="h-4 w-4" />}
                label="Team"
              />
              <Nav
                to="/departments"
                icon={<Layers className="h-4 w-4" />}
                label="Departments"
              />
              <Nav
                to="/reports"
                icon={<BarChart3 className="h-4 w-4" />}
                label="Reports"
              />
              {/* <Nav
                to="/settings"
                icon={<Settings className="h-4 w-4" />}
                label="Settings"
              /> */}
            </>
          )}
        </nav>

        {isSuperAdmin ? (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Company selector
            </div>
            <Select
              // Base UI Select becomes uncontrolled when `value` is undefined.
              // Force a remount when cleared so it doesn't keep the previous selection.
              key={effectiveTenantId ?? "__none__"}
              value={effectiveTenantId ?? undefined}
              onValueChange={(v) => {
                setUiTenantId(v);
                tenantContext.setTenant.mutate(v);
              }}
              disabled={
                tenantOptionsQuery.isLoading ||
                tenantContext.setTenant.isPending
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select company…">
                  {selectedTenantName ?? undefined}
                </SelectValue>
                {selectedTenantId ? (
                  <button
                    type="button"
                    className="ml-1 inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUiTenantId(null);
                      tenantContext.clearTenant.mutate();
                    }}
                    aria-label="Clear selected company"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                ) : null}
              </SelectTrigger>
              <SelectContent>
                {(tenantOptionsQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <motion.header
          className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/40 px-4 backdrop-blur supports-backdrop-filter:bg-background/30 sm:px-6"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full flex flex-row gap-2 items-center">
            <div className="text-sm mt-0.5 font-medium uppercase tracking-wide text-primary/80">
              Welcome back,
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {data.user.name}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell />
            <UserMenu me={data} />
          </div>
        </motion.header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Nav({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        [
          "flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ring-1 ring-transparent",
          isActive
            ? "bg-sidebar-accent/70 text-foreground ring-[color-mix(in_oklab,var(--brand),transparent_70%)]"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground hover:ring-[color-mix(in_oklab,var(--brand),transparent_80%)]",
        ].join(" ")
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
