import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";

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

export function PlatformTenantEditPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const params = useParams();
  const tenantId = params.id ?? "";

  const detailsQuery = useQuery({
    queryKey: ["platform-tenant", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data } = await api.get<TenantDetailsResponse>(
        `/api/platform/tenants/${tenantId}`,
      );
      return data;
    },
  });

  const tenant = detailsQuery.data?.tenant ?? null;
  const adminUsernameDisplay = useMemo(() => {
    const u = detailsQuery.data?.adminUser?.username ?? "";
    return String(u || "");
  }, [detailsQuery.data?.adminUser?.username]);

  const [name, setName] = useState("");
  useEffect(() => {
    if (tenant?.name) setName(tenant.name);
  }, [tenant?.name]);

  const update = useMutation({
    mutationFn: async (input: { name: string }) => {
      const { data } = await api.patch<{ tenant: Tenant }>(
        `/api/platform/tenants/${tenantId}`,
        { name: input.name },
      );
      return data.tenant;
    },
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ["tenants"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["platform-tenant", tenantId],
        exact: false,
      });
      toast.success("Company updated");
      nav(`/platform/tenants/${t.id}`);
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.error ??
          e.message)
        : "Could not update company";
      toast.error(String(msg));
    },
  });

  return (
    <CenteredFormPage
      title="Edit Company"
      description="Update company details. First admin username is read-only."
      back={
        <FormBackLink
          to={tenantId ? `/platform/tenants/${tenantId}` : "/platform/tenants"}
        >
          Back
        </FormBackLink>
      }
    >
      {detailsQuery.isError ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Could not load this company.
          </p>
          <Link to="/platform/tenants">
            <Button variant="outline">Go to companies</Button>
          </Link>
        </div>
      ) : (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name });
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Company name</Label>
              <Input
                id="tenant-name"
                value={name}
                placeholder={
                  detailsQuery.isLoading ? "Loading…" : "e.g. Acme Corporation"
                }
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-admin-username">
                First admin username
              </Label>
              <Input
                id="tenant-admin-username"
                type="text"
                value={
                  detailsQuery.isLoading ? "—" : adminUsernameDisplay || "—"
                }
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Username cannot be edited from here.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6">
            <Button
              type="submit"
              disabled={update.isPending || detailsQuery.isLoading}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </CenteredFormPage>
  );
}
