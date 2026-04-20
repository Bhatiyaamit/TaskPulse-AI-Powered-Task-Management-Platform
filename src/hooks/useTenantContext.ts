import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";

export type PlatformTenantOption = { id: string; name: string; slug: string };

type PlatformTenantsResponse = ApiSuccess<PlatformTenantOption[]> & {
  meta?: { page: number; limit: number; total: number };
};

export function usePlatformTenantsOptions(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-tenants", "options"],
    queryFn: async () => {
      const { data } = await api.get<PlatformTenantsResponse>(
        "/api/platform/tenants",
        {
          params: { page: 1, pageSize: 200, sortBy: "name", sortDir: "asc" },
        },
      );
      return data.data;
    },
  });
}

export function useTenantContext() {
  const qc = useQueryClient();
  const refreshAllCompanyData = async () => {
    // Company switch should refresh all tenant-scoped module data.
    await qc.invalidateQueries();
    await qc.refetchQueries({ type: "active" });
  };

  const setTenant = useMutation({
    mutationFn: async (tenantId: string) => {
      const { data } = await api.post<
        ApiSuccess<{ tenant: PlatformTenantOption }>
      >("/api/platform/tenant-context", { tenantId });
      return data.data.tenant;
    },
    onSuccess: async () => {
      await refreshAllCompanyData();
    },
  });

  const clearTenant = useMutation({
    mutationFn: async () => {
      await api.delete("/api/platform/tenant-context");
    },
    onSuccess: async () => {
      await refreshAllCompanyData();
    },
  });

  return { setTenant, clearTenant };
}
