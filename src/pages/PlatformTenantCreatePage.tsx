import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";
import { Copy } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

export function PlatformTenantCreatePage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [created, setCreated] = useState<null | {
    username: string;
    password: string;
  }>(null);

  function slugify(value: string) {
    const s = value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return s || "tenant";
  }

  const create = useMutation({
    mutationFn: () =>
      api.post<{ tenant: { id: string } }>("/api/platform/tenants", {
        name,
        slug: slugify(name),
        adminUsername: adminUsername.trim().toLowerCase(),
        tempPassword,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenants"], exact: false });
      setCreated({
        username: adminUsername.trim().toLowerCase(),
        password: tempPassword,
      });
      setName("");
      setAdminUsername("");
      setTempPassword("");
      toast.success("Company created.");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.error?.message ??
          e.response?.data?.error ??
          e.message)
        : "Could not create tenant";
      toast.error(String(msg));
    },
  });

  return (
    <CenteredFormPage
      title="Create Company"
      description="Provision a company and create the first admin user (username + temporary password)."
      back={
        <FormBackLink to="/platform/tenants">
          Back to companies list
        </FormBackLink>
      }
    >
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Company name</Label>
            <Input
              id="tenant-name"
              value={name}
              placeholder="e.g. Acme Corporation"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-admin-username">First admin username</Label>
            <Input
              id="tenant-admin-username"
              type="text"
              value={adminUsername}
              placeholder="e.g. acme.admin"
              autoComplete="off"
              onChange={(e) => setAdminUsername(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              3–64 characters: letters, numbers, dots, underscores, hyphens.
              Stored in lowercase.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-admin-temp-password">
              Temporary password
            </Label>
            <PasswordInput
              id="tenant-admin-temp-password"
              value={tempPassword}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              onChange={(e) => setTempPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </div>

        {created ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium">Admin credentials (copy now)</p>
              <button
                type="button"
                className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                onClick={async () => {
                  try {
                    const text = `username: ${created.username}\npassword: ${created.password}`;
                    await navigator.clipboard.writeText(text);
                    toast.success("Copied to clipboard");
                  } catch {
                    toast.error("Could not copy. Please copy manually.");
                  }
                }}
                aria-label="Copy admin credentials"
              >
                <Copy className="size-3.5" />
                Copy
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Username and temporary password won’t be shown again.
            </p>
            <div className="mt-2 space-y-1 font-mono text-xs">
              <div>
                <span className="text-muted-foreground">username:</span>{" "}
                <span>{created.username}</span>
              </div>
              <div>
                <span className="text-muted-foreground">password:</span>{" "}
                <span>{created.password}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6">
          <Button type="submit" disabled={create.isPending}>
            Create company
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
