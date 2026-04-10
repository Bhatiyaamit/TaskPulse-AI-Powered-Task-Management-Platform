import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CenteredFormPage } from "@/components/layout/CenteredFormPage";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ProfilePage() {
  const { data } = useMe();
  if (!data) return null;

  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();

  const initialBirth = useMemo(() => {
    if (!data.user.birthDate) return "";
    try {
      return new Date(data.user.birthDate).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }, [data.user.birthDate]);

  const [name, setName] = useState(data.user.name);
  const [phone, setPhone] = useState(data.user.phone ?? "");
  const [birthDate, setBirthDate] = useState(initialBirth);

  const update = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        phone: phone.trim() ? phone.trim() : null,
        birthDate: birthDate ? new Date(birthDate) : null,
      };
      const { data } = await api.patch<{ user: unknown }>(
        "/api/auth/me",
        payload,
      );
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
      setIsEditing(false);
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? ((e.response?.data as { error?: string } | undefined)?.error ??
          e.message)
        : "Could not update profile";
      toast.error(String(msg));
    },
  });

  return (
    <CenteredFormPage
      title="Profile"
      description="Update your account details."
      back={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setIsEditing(false);
            setName(data.user.name);
            setPhone(data.user.phone ?? "");
            setBirthDate(initialBirth);
            navigate(-1);
          }}
        >
          <ArrowLeft className="size-4 shrink-0 -mt-0.5" />
          {isEditing ? "Cancel editing" : "Back"}
        </Button>
      }
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">
              Role
            </span>
            <span className="font-medium">{data.user.roleCode ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">
              Workspace
            </span>
            <span className="font-medium">
              {data.user.tenantId ? "Tenant user" : "Platform"}
            </span>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input id="profile-username" value={data.user.username} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => {
                setIsEditing(true);
                setName(e.target.value);
              }}
              placeholder="Your name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => {
                setIsEditing(true);
                setPhone(e.target.value);
              }}
              placeholder="e.g. +91 98765 43210"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-birthDate">Birthdate</Label>
            <Input
              id="profile-birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => {
                setIsEditing(true);
                setBirthDate(e.target.value);
              }}
            />
          </div>

          <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6">
            <Button
              type="submit"
              isLoading={update.isPending}
              disabled={!isEditing || update.isPending || !name.trim()}
            >
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </CenteredFormPage>
  );
}
