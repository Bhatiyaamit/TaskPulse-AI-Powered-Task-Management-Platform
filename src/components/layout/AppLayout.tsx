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
import { useEffect, useRef, useState } from "react";
import {
  meetingModuleCanCreate,
  meetingModuleCanList,
  P,
  departmentModuleCanAccessDepartmentsNav,
  taskModuleCanCreate,
  taskModuleCanList,
  userModuleCanList,
  hierarchyModuleCanRead,
} from "@/lib/permissions";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  BarChart3,
  Building2,
  Calendar,
  Layers,
  ClipboardList,
  X,
  ShieldHalf,
  ChevronDown,
  Search,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CompanyOption = { id: string; name: string };

function CompanySelector({
  options,
  value,
  disabled,
  onSelect,
  onClear,
}: {
  options: CompanyOption[];
  value: string | null | undefined;
  disabled: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedName = options.find((o) => o.id === value)?.name;

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  function select(id: string) {
    onSelect(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background/40 px-2.5 text-sm transition-colors outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          !selectedName && "text-muted-foreground/70",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedName ?? "Select company…"}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {value && (
            <span
              role="button"
              aria-label="Clear selected company"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="h-7 w-full rounded-md border border-input bg-background/60 py-1 pr-2.5 pl-7 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/40"
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No companies found.</p>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.id}
                  role="option"
                  aria-selected={o.id === value}
                  onClick={() => select(o.id)}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.id === value && <Check className="size-4 shrink-0 text-primary" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="flex h-screen overflow-hidden">
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
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar/70 p-4 backdrop-blur supports-backdrop-filter:bg-sidebar/60">
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
              {(userModuleCanList(p) || p.includes(P.USERS_CREATE)) && (
                <Nav
                  to="/team"
                  icon={<Users className="h-4 w-4" />}
                  label="Team"
                />
              )}
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
              {hierarchyModuleCanRead(p) && (
                <Nav
                  to="/roles"
                  icon={<ShieldHalf className="h-4 w-4" />}
                  label="Hierarchy"
                />
              )}
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
                label="Companies"
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
              {hierarchyModuleCanRead(p) && (
                <Nav
                  to="/roles"
                  icon={<ShieldHalf className="h-4 w-4" />}
                  label="Hierarchy"
                />
              )}
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
            <CompanySelector
              options={tenantOptionsQuery.data ?? []}
              value={effectiveTenantId}
              disabled={
                tenantOptionsQuery.isLoading ||
                tenantContext.setTenant.isPending
              }
              onSelect={(v) => {
                setUiTenantId(v);
                tenantContext.setTenant.mutate(v);
              }}
              onClear={() => {
                setUiTenantId(null);
                tenantContext.clearTenant.mutate();
              }}
            />
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
