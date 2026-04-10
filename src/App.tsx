import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { HomePage } from "@/pages/HomePage";
import { TasksPage } from "@/pages/TasksPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TaskCreatePage } from "@/pages/TaskCreatePage";
import { TaskEditPage } from "@/pages/TaskEditPage";
import { MeetingsPage } from "@/pages/MeetingsPage";
import { MeetingDetailPage } from "@/pages/MeetingDetailPage";
import { MeetingCreatePage } from "@/pages/MeetingCreatePage";
import { MeetingEditPage } from "@/pages/MeetingEditPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { TeamPage } from "@/pages/TeamPage";
import { TeamUserCreatePage } from "@/pages/TeamUserCreatePage";
import { TeamUserEditPage } from "@/pages/TeamUserEditPage";
import { TeamUserDetailPage } from "@/pages/TeamUserDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { RolesPage } from "@/pages/RolesPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { DepartmentsPage } from "@/pages/DepartmentsPage";
import { DepartmentCreatePage } from "@/pages/DepartmentCreatePage";
import { EodPage } from "@/pages/EodPage";
import { PlatformTenantsPage } from "@/pages/PlatformTenantsPage";
import { PlatformDashboardPage } from "@/pages/PlatformDashboardPage";
import { PlatformTenantCreatePage } from "@/pages/PlatformTenantCreatePage";
import { PlatformTenantDetailPage } from "@/pages/PlatformTenantDetailPage";
import { PlatformTenantEditPage } from "@/pages/PlatformTenantEditPage";
import { useTheme } from "@/providers/theme-provider";

const qc = new QueryClient();

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
            <Route path="/eod" element={<EodPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/roles" element={<RolesPage />} />
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
