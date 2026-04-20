import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CenteredFormPage } from "@/components/layout/CenteredFormPage";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { roleCodeBadgeClass } from "@/lib/badges";

/** Show up to 10 digits from stored value (strips +91 etc.). */
function phoneDigitsForInput(stored: string | null | undefined): string {
  if (!stored) return "";
  const digits = stored.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits.slice(0, 10);
}

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
  const [phone, setPhone] = useState(() =>
    phoneDigitsForInput(data.user.phone),
  );
  const [birthDate, setBirthDate] = useState(initialBirth);

  const phoneOk = phone.length === 0 || phone.length === 10;
  const phoneHint =
    phone.length > 0 && phone.length < 10
      ? `Enter all 10 digits (${phone.length}/10).`
      : null;

  const update = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        phone: phone.length === 10 ? phone : null,
        birthDate: birthDate ? new Date(birthDate) : null,
      };
      const { data } = await api.patch<ApiSuccess<{ user: unknown }>>(
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
        ? ((e.response?.data as { message?: string } | undefined)?.message ??
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
            setPhone(phoneDigitsForInput(data.user.phone));
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
            <span className={roleCodeBadgeClass(data.user.roleCode)}>
              {data.user.roleCode ? String(data.user.roleCode) : "—"}
            </span>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!phoneOk) return;
            update.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="profile-username" required>
              Username
            </Label>
            <Input id="profile-username" value={data.user.username} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-name" required>
              Full name
            </Label>
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
                const digitsOnly = e.target.value
                  .replace(/\D/g, "")
                  .slice(0, 10);
                setPhone(digitsOnly);
              }}
              onKeyDown={(e) => {
                const mod = e.ctrlKey || e.metaKey;
                const allowed =
                  e.key === "Backspace" ||
                  e.key === "Delete" ||
                  e.key === "Tab" ||
                  e.key === "Escape" ||
                  e.key === "Enter" ||
                  e.key === "ArrowLeft" ||
                  e.key === "ArrowRight" ||
                  e.key === "Home" ||
                  e.key === "End" ||
                  (mod && ["a", "c", "v", "x"].includes(e.key.toLowerCase()));
                if (allowed) return;
                if (/^\d$/.test(e.key)) return;
                e.preventDefault();
              }}
              placeholder="10-digit number"
              autoComplete="tel"
              inputMode="numeric"
              maxLength={10}
              aria-invalid={Boolean(phoneHint)}
              aria-describedby={
                phoneHint ? "profile-phone-hint" : "profile-phone-help"
              }
            />
            {phoneHint ? (
              <p
                id="profile-phone-hint"
                className="text-xs text-amber-600 dark:text-amber-400"
                role="status"
              >
                {phoneHint}
              </p>
            ) : (
              <p
                id="profile-phone-help"
                className="text-xs text-muted-foreground"
              >
                Digits only, up to 10 characters. Leave empty if you have no
                phone.
              </p>
            )}
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
              disabled={
                !isEditing || update.isPending || !name.trim() || !phoneOk
              }
            >
              <Save className="size-4 shrink-0" />
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </CenteredFormPage>
  );
}
