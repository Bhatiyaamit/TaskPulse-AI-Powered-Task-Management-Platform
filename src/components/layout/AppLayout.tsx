import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useMe } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";
import { useTheme } from "@/providers/theme-provider";
import { useEffect } from "react";
import { roleCodeBadgeClass } from "@/lib/badges";
import { P } from "@/lib/permissions";
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
  Shield,
} from "lucide-react";

export function AppLayout() {
  const { data, isError } = useMe();
  const navigate = useNavigate();
  const { setPreference } = useTheme();
  const p = data?.permissions ?? [];

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
  const isPlatform = !tenant;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar/70 p-4 backdrop-blur supports-backdrop-filter:bg-sidebar/60">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img
            src={"/logo.png"}
            alt="TMS"
            className="h-9 w-auto select-none"
            draggable={false}
          />
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {tenant && (
            <>
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
              {p.includes(P.MEETINGS_READ) && (
                <Nav
                  to="/meetings"
                  icon={<Calendar className="h-4 w-4" />}
                  label="Meetings"
                />
              )}
              {p.includes(P.USERS_READ) && (
                <Nav
                  to="/team"
                  icon={<Users className="h-4 w-4" />}
                  label="Team"
                />
              )}
              {(p.includes(P.DEPARTMENTS_READ) ||
                p.includes(P.DEPARTMENTS_CREATE) ||
                p.includes(P.DEPARTMENTS_UPDATE) ||
                p.includes(P.DEPARTMENTS_DELETE)) && (
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
              {(p.includes(P.USERS_CREATE) ||
                p.includes(P.USERS_UPDATE) ||
                p.includes(P.USERS_DELETE) ||
                p.includes(P.ROLES_READ) ||
                p.includes(P.ROLES_CREATE) ||
                p.includes(P.ROLES_UPDATE) ||
                p.includes(P.ROLES_DELETE)) && (
                <Nav
                  to="/settings"
                  icon={<Settings className="h-4 w-4" />}
                  label="Settings"
                />
              )}
              {(p.includes(P.ROLES_READ) ||
                p.includes(P.ROLES_CREATE) ||
                p.includes(P.ROLES_UPDATE) ||
                p.includes(P.ROLES_DELETE)) && (
                <Nav
                  to="/settings/roles"
                  icon={<Shield className="h-4 w-4" />}
                  label="Roles"
                />
              )}
            </>
          )}
          {isPlatform && p.includes(P.PLATFORM_READ) && (
            <>
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
        </nav>
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
              <span className={roleCodeBadgeClass(data.user.roleCode)}>
                {data.user.roleCode ? String(data.user.roleCode) : "—"}
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
