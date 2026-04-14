import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";

export type Me = {
  user: {
    id: string;
    username: string;
    name: string;
    phone?: string | null;
    birthDate?: string | null;
    notificationEnabled?: boolean;
    themePreference?: "light" | "dark";
    tenantId: string | null;
    roleCode?: string;
  };
  permissions: string[];
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<Me>>("/api/auth/me");
      return data.data;
    },
    retry: false,
  });
}

export function useHasPermission(action: string, data: Me | undefined) {
  return Boolean(data?.permissions?.includes(action));
}
