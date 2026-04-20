import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "@/hooks/useAuth";
import { DashboardPage } from "./DashboardPage";

export function HomePage() {
  const { data } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.user.tenantId == null && !data?.selectedTenantId) {
      navigate("/platform/dashboard", { replace: true });
    }
  }, [data, navigate]);

  // For Super Admin: if a company is selected, treat "/" as company dashboard.
  if (data?.user.tenantId == null && !data?.selectedTenantId) {
    return null;
  }
  return <DashboardPage />;
}
