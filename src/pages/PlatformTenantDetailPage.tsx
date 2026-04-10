import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tenantStatusBadgeClass } from "@/lib/badges";
import {
  spotlightCardContentLayerClass,
  topLeftSpotlightCardClass,
} from "@/lib/cardFx";
import { ArrowLeft, Users } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  _count: { users: number };
};

type AdminUser = {
  id: string;
  username: string;
  name: string | null;
  createdAt: string;
};

type TenantDetailsResponse = {
  tenant: Tenant;
  adminUser: AdminUser | null;
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PlatformTenantDetailPage() {
  const params = useParams();
  const tenantId = params.id ?? "";

  const query = useQuery({
    queryKey: ["platform-tenant", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data } = await api.get<TenantDetailsResponse>(
        `/api/platform/tenants/${tenantId}`,
      );
      return data;
    },
  });

  const title = useMemo(() => {
    if (query.isLoading) return "Company details";
    if (query.isError) return "Company not found";
    return query.data?.tenant?.name
      ? query.data.tenant.name
      : "Company details";
  }, [query.data?.tenant?.name, query.isError, query.isLoading]);

  const tenant = query.data?.tenant ?? null;
  const adminUser = query.data?.adminUser ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform-level view of a single company.
          </p>
        </div>
        <Link to="/platform/dashboard">
          <Button variant="outline">
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load company</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This company may have been deleted, or you may not have access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className={`md:col-span-2 ${topLeftSpotlightCardClass}`}>
              <CardHeader>
                <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                  Company
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-3 ${spotlightCardContentLayerClass}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold">
                    {query.isLoading ? "—" : (tenant?.name ?? "—")}
                  </div>
                  {tenant?.status ? (
                    <span className={tenantStatusBadgeClass(tenant.status)}>
                      {tenant.status === "INVITED"
                        ? "Invited"
                        : tenant.status === "ACTIVE"
                          ? "Active"
                          : "Inactive"}
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Company ID
                    </div>
                    <div className="mt-1 font-mono text-sm">
                      {query.isLoading ? "—" : (tenant?.id ?? "—")}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Created
                    </div>
                    <div className="mt-1 text-sm">
                      {query.isLoading || !tenant?.createdAt
                        ? "—"
                        : formatDateTime(tenant.createdAt)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                    Users
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`text-3xl font-bold ${spotlightCardContentLayerClass}`}
              >
                {query.isLoading ? "—" : (tenant?._count?.users ?? 0)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className={topLeftSpotlightCardClass}>
              <CardHeader>
                <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                  Admin user
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-2 ${spotlightCardContentLayerClass}`}
              >
                <div className="text-sm">
                  <span className="text-muted-foreground">Name: </span>
                  <span className="font-medium">
                    {query.isLoading ? "—" : (adminUser?.name ?? "—")}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Username: </span>
                  <span className="font-medium">
                    {query.isLoading ? "—" : (adminUser?.username ?? "—")}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Created: </span>
                  <span className="font-medium">
                    {query.isLoading || !adminUser?.createdAt
                      ? "—"
                      : formatDateTime(adminUser.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
