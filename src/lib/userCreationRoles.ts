import type { Me } from "@/hooks/useAuth";
import { P } from "@/lib/permissions";

/** User creation is allowed only for people who can manage users (permission-based). */
export function canCreateUsers(data: Me | undefined) {
  return Boolean(data?.permissions?.includes(P.USERS_CREATE));
}
