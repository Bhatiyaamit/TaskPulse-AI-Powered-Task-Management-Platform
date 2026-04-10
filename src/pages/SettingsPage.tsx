import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import { useTheme, type ThemePreference } from "@/providers/theme-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PasswordInput } from "@/components/ui/password-input";

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();

  const [notificationEnabled, setNotificationEnabled] = useState<boolean>(
    me?.user.notificationEnabled ?? true,
  );
  const [notificationDraft, setNotificationDraft] = useState<boolean>(
    me?.user.notificationEnabled ?? true,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    setNotificationEnabled(me?.user.notificationEnabled ?? true);
    setNotificationDraft(me?.user.notificationEnabled ?? true);
  }, [me?.user.notificationEnabled]);

  const saveNotifications = useMutation({
    mutationFn: async (enabled: boolean) =>
      api.patch("/api/auth/me", { notificationEnabled: enabled }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Notification preference saved");
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? (e.response?.data?.error?.message ?? e.message)
          : "Failed",
      ),
  });

  const saveThemePreference = useMutation({
    mutationFn: async (next: "light" | "dark") =>
      api.patch("/api/auth/me", { themePreference: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Theme updated");
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? (e.response?.data?.error?.message ?? e.message)
          : "Failed",
      ),
  });

  const changePassword = useMutation({
    mutationFn: async () =>
      api.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("Password updated. Please sign in again.");
      api
        .post("/api/auth/logout")
        .catch(() => {
          // If logout fails, we still navigate away to avoid leaving the user in a weird state.
        })
        .finally(() => {
          qc.clear();
          navigate("/login");
        });
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? (e.response?.data?.error?.message ?? e.message)
          : "Failed",
      ),
  });

  const passwordsMatch =
    newPassword.length > 0 &&
    confirmNewPassword.length > 0 &&
    newPassword === confirmNewPassword;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight uppercase text-primary">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Workspace and account preferences
        </p>
      </div>

      <Tabs defaultValue="preferences" className="w-full max-w-3xl">
        <TabsList variant="pills">
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="password">Change password</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences" className="mt-4 outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                Appearance
              </CardTitle>
              <CardDescription>
                Choose how TMS looks on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={preference}
                onValueChange={(v) => {
                  const next = v as ThemePreference;
                  setPreference(next);
                  if (next === "light" || next === "dark") {
                    saveThemePreference.mutate(next);
                  }
                }}
              >
                <SelectTrigger id="theme" className="w-full max-w-xs">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System default</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                System follows your OS light or dark mode. Default for new
                visits is dark.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="mt-4 outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                Change password
              </CardTitle>
              <CardDescription>Update your account password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <PasswordInput
                  id="currentPassword"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <PasswordInput
                  id="newPassword"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmNewPassword">Confirm new password</Label>
                <PasswordInput
                  id="confirmNewPassword"
                  placeholder="Re-enter new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={
                    confirmNewPassword.length > 0 && !passwordsMatch
                      ? true
                      : undefined
                  }
                />
                {confirmNewPassword.length > 0 && !passwordsMatch ? (
                  <p className="text-xs text-destructive">
                    Passwords do not match.
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  isLoading={changePassword.isPending}
                  disabled={
                    !currentPassword ||
                    newPassword.length < 8 ||
                    !passwordsMatch ||
                    changePassword.isPending
                  }
                  onClick={() => changePassword.mutate()}
                >
                  Save password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
                Notifications
              </CardTitle>
              <CardDescription>
                Enable or disable in-app notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/30 px-3 py-3">
                <div>
                  <div className="font-medium text-foreground">
                    You want notifications
                  </div>
                  <div className="text-xs text-muted-foreground">
                    When enabled, you’ll receive notifications for tasks and
                    meeting activity.
                  </div>
                </div>
                <Switch
                  checked={notificationDraft}
                  onCheckedChange={(v) => setNotificationDraft(Boolean(v))}
                  disabled={saveNotifications.isPending}
                />
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  isLoading={saveNotifications.isPending}
                  disabled={
                    saveNotifications.isPending ||
                    notificationDraft === notificationEnabled
                  }
                  onClick={() => saveNotifications.mutate(notificationDraft)}
                >
                  Apply changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
