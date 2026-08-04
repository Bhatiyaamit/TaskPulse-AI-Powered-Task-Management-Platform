import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useTheme } from "@/providers/theme-provider";

const LoginPage = lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const TasksPage = lazy(() => import("@/pages/TasksPage").then(m => ({ default: m.TasksPage })));
const TaskDetailPage = lazy(() => import("@/pages/TaskDetailPage").then(m => ({ default: m.TaskDetailPage })));
const TaskCreatePage = lazy(() => import("@/pages/TaskCreatePage").then(m => ({ default: m.TaskCreatePage })));
const TaskEditPage = lazy(() => import("@/pages/TaskEditPage").then(m => ({ default: m.TaskEditPage })));
const TaskSeriesPage = lazy(() => import("@/pages/TaskSeriesPage").then(m => ({ default: m.TaskSeriesPage })));
const MeetingsPage = lazy(() => import("@/pages/MeetingsPage").then(m => ({ default: m.MeetingsPage })));
const MeetingDetailPage = lazy(() => import("@/pages/MeetingDetailPage").then(m => ({ default: m.MeetingDetailPage })));
const MeetingCreatePage = lazy(() => import("@/pages/MeetingCreatePage").then(m => ({ default: m.MeetingCreatePage })));
const MeetingEditPage = lazy(() => import("@/pages/MeetingEditPage").then(m => ({ default: m.MeetingEditPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then(m => ({ default: m.ReportsPage })));
const TeamPage = lazy(() => import("@/pages/TeamPage").then(m => ({ default: m.TeamPage })));
const TeamUserCreatePage = lazy(() => import("@/pages/TeamUserCreatePage").then(m => ({ default: m.TeamUserCreatePage })));
const TeamUserEditPage = lazy(() => import("@/pages/TeamUserEditPage").then(m => ({ default: m.TeamUserEditPage })));
const TeamUserDetailPage = lazy(() => import("@/pages/TeamUserDetailPage").then(m => ({ default: m.TeamUserDetailPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const RolesPage = lazy(() => import("@/pages/RolesPage").then(m => ({ default: m.RolesPage })));
const DepartmentsPage = lazy(() => import("@/pages/DepartmentsPage").then(m => ({ default: m.DepartmentsPage })));
const DepartmentCreatePage = lazy(() => import("@/pages/DepartmentCreatePage").then(m => ({ default: m.DepartmentCreatePage })));
const DepartmentEditPage = lazy(() => import("@/pages/DepartmentEditPage").then(m => ({ default: m.DepartmentEditPage })));
const EodPage = lazy(() => import("@/pages/EodPage").then(m => ({ default: m.EodPage })));
const PlatformTenantsPage = lazy(() => import("@/pages/PlatformTenantsPage").then(m => ({ default: m.PlatformTenantsPage })));
const PlatformDashboardPage = lazy(() => import("@/pages/PlatformDashboardPage").then(m => ({ default: m.PlatformDashboardPage })));
const PlatformTenantCreatePage = lazy(() => import("@/pages/PlatformTenantCreatePage").then(m => ({ default: m.PlatformTenantCreatePage })));
const PlatformTenantDetailPage = lazy(() => import("@/pages/PlatformTenantDetailPage").then(m => ({ default: m.PlatformTenantDetailPage })));
const PlatformTenantEditPage = lazy(() => import("@/pages/PlatformTenantEditPage").then(m => ({ default: m.PlatformTenantEditPage })));

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s — avoid refetching data that is still fresh
      refetchOnWindowFocus: false, // don't refetch just because user switched tabs
      retry: 1,                   // one retry on failure is enough
    },
  },
});

function AppShell() {
  const { resolvedTheme } = useTheme();
  return (
    <>
      <Toaster
        position="bottom-center"
        richColors
        closeButton
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
      <BrowserRouter>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/new" element={<TaskCreatePage />} />
              <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route
                path="/tasks/series/:recurrenceGroupId"
                element={<TaskSeriesPage />}
              />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/new" element={<MeetingCreatePage />} />
              <Route path="/meetings/:id/edit" element={<MeetingEditPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/team/new" element={<TeamUserCreatePage />} />
              <Route path="/team/:id" element={<TeamUserDetailPage />} />
              <Route path="/team/:id/edit" element={<TeamUserEditPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/departments/new" element={<DepartmentCreatePage />} />
              <Route
                path="/departments/:id/edit"
                element={<DepartmentEditPage />}
              />
              <Route path="/eod" element={<EodPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route
                path="/platform/dashboard"
                element={<PlatformDashboardPage />}
              />
              <Route
                path="/platform/tenants/new"
                element={<PlatformTenantCreatePage />}
              />
              <Route
                path="/platform/tenants/:id"
                element={<PlatformTenantDetailPage />}
              />
              <Route
                path="/platform/tenants/:id/edit"
                element={<PlatformTenantEditPage />}
              />
              <Route path="/platform/tenants" element={<PlatformTenantsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AppShell />
    </QueryClientProvider>
  );
}
