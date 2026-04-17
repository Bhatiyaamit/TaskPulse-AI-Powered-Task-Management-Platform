import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Settings, User } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { api } from "@/api/client";
import type { Me } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UserMenu({ me }: { me: Me }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // --- Logout state ---
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // --- Change Password state ---
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const passwordsMatch =
    newPassword.length > 0 &&
    confirmNewPassword.length > 0 &&
    newPassword === confirmNewPassword;

  const sameAsCurrentPassword =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    currentPassword === newPassword;

  function resetPasswordFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  const changePassword = useMutation({
    mutationFn: async () =>
      api.post("/api/auth/change-password", { currentPassword, newPassword }),
    onSuccess: async () => {
      resetPasswordFields();
      setChangePassOpen(false);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Password updated successfully.");
    },
    onError: (e) =>
      toast.error(
        isAxiosError(e)
          ? ((
              e.response?.data as
                | { error?: { details?: { reason?: string } } }
                | undefined
            )?.error?.details?.reason ??
              e.response?.data?.error?.message ??
              e.response?.data?.message ??
              e.message)
          : "Failed to update password.",
      ),
  });

  async function confirmLogout() {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout");
      qc.clear();
      toast.success("Signed out");
      navigate("/login");
    } catch {
      toast.error("Could not sign out. Try again.");
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  }

  return (
    <>
      {/* ── Dropdown ── */}
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
          <motion.span
            className="inline-flex cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/15 text-sm font-medium text-primary">
                {initials(me.user.name)}
              </AvatarFallback>
            </Avatar>
          </motion.span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
          {/* User info label */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{me.user.name}</span>
                <span className="text-xs text-muted-foreground">
                  {me.user.username}
                </span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* 3 main actions */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => navigate("/profile")}
              className="cursor-pointer gap-2"
            >
              <User className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate("/settings")}
              className="cursor-pointer gap-2"
            >
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                resetPasswordFields();
                setChangePassOpen(true);
              }}
              className="cursor-pointer gap-2"
            >
              <KeyRound className="size-4" />
              Reset password
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Log out */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-2"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Change Password Dialog ── */}
      <AlertDialog
        open={changePassOpen}
        onOpenChange={(open) => {
          if (!open) resetPasswordFields();
          setChangePassOpen(open);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Change password</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your current password and choose a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="um-currentPassword">Current password</Label>
              <PasswordInput
                id="um-currentPassword"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="um-newPassword">New password</Label>
              <PasswordInput
                id="um-newPassword"
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="um-confirmPassword">Confirm new password</Label>
              <PasswordInput
                id="um-confirmPassword"
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
              {confirmNewPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">
                  Passwords do not match.
                </p>
              )}
              {sameAsCurrentPassword && (
                <p className="text-xs text-destructive">
                  New password must be different from the current one.
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              variant="outline"
              size="default"
              disabled={changePassword.isPending}
              onClick={resetPasswordFields}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              isLoading={changePassword.isPending}
              disabled={
                !currentPassword ||
                newPassword.length < 8 ||
                !passwordsMatch ||
                sameAsCurrentPassword ||
                changePassword.isPending
              }
              onClick={() => changePassword.mutate()}
            >
              Save password
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Logout Confirm Dialog ── */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="outline"
              size="default"
              disabled={loggingOut}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={loggingOut}
              onClick={() => void confirmLogout()}
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
