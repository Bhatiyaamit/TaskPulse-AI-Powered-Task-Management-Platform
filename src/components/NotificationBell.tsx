import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckSquare2,
  ClipboardList,
  Info,
  Mail,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { badgeBase } from "@/lib/badges";
import { SOCKET_EVENT } from "@/lib/socketEvents";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notif = {
  id: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  taskId?: string | null;
  metadata?: any;
};

function notificationKind(n: Notif): string {
  const k = String(n.metadata?.kind ?? "").toUpperCase();
  if (k) return k;
  return String(n.type ?? "").toUpperCase();
}

function isTaskDeletedNotification(n: Notif): boolean {
  return notificationKind(n) === "TASK_DELETED";
}

function isTaskEscalationNotification(n: Notif): boolean {
  return notificationKind(n) === "TASK_ESCALATION";
}

function isDeletedMeetingNotification(n: Notif): boolean {
  const action = String(n.metadata?.action ?? "").toUpperCase();
  if (action === "DELETED") return true;
  const msg = String(n.message ?? "").toLowerCase();
  return msg.includes("meeting deleted");
}

function notificationIcon(n: Notif) {
  const kind = notificationKind(n);
  if (isTaskEscalationNotification(n)) return AlertTriangle;
  if (kind === "TASK_DELETED") return Trash2;
  const t = String(n.type || "").toUpperCase();
  if (t.includes("MEETING")) return Calendar;
  if (t.includes("ASSIGNED")) return ClipboardList;
  if (t.includes("TASK")) return CheckSquare2;
  if (t.includes("MENTION")) return Mail;
  return Info;
}

function notificationBadgeClass(type: string) {
  const base = badgeBase();
  const t = String(type || "").toUpperCase();
  if (t.includes("ASSIGNED"))
    return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200`;
  if (t.includes("MEETING"))
    return `${base} border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200`;
  if (t.includes("MENTION"))
    return `${base} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200`;
  if (t.includes("TASK"))
    return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
  return `${base} border-border bg-muted/40 text-muted-foreground`;
}

function taskEscalationBadgeClass() {
  const base = badgeBase();
  return `${base} border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/15 dark:text-destructive`;
}

function notificationBadgeClassFor(n: Notif) {
  if (notificationKind(n) === "TASK_DELETED") {
    const base = badgeBase();
    return `${base} border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
  }
  if (isTaskEscalationNotification(n)) return taskEscalationBadgeClass();
  return notificationBadgeClass(n.type);
}

function notificationBadgeLabel(n: Notif) {
  if (notificationKind(n) === "TASK_DELETED") return "Task deleted";
  if (isTaskEscalationNotification(n)) return "Task Escalation";
  return String(n.type || "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function formatLocalDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [bellPulse, setBellPulse] = useState(0);
  const prevIdsRef = useRef<string[]>([]);
  const lastDismissClickAtRef = useRef(0);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{
          notifications: Notif[];
          unreadCount: number;
        }>
      >("/api/notifications");
      return data.data;
    },
  });

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || undefined, {
      withCredentials: true,
    });
    socket.on(SOCKET_EVENT.NOTIFICATION_NEW, () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [qc]);

  useEffect(() => {
    const nextIds = (data?.notifications ?? []).map((n) => n.id);
    const prevIds = prevIdsRef.current;
    prevIdsRef.current = nextIds;
    if (!nextIds.length) return;
    if (!prevIds.length) return;

    const newIds = nextIds.filter((id) => !prevIds.includes(id));
    if (!newIds.length) return;

    const newest = (data?.notifications ?? []).find((n) => n.id === newIds[0]);
    const shouldSuppressToast = Date.now() - lastDismissClickAtRef.current < 1500;
    if (newest && !shouldSuppressToast) {
      toast(newest.message, {
        description: isTaskEscalationNotification(newest)
          ? "Task Escalation"
          : String(newest.type || "").replace(/_/g, " "),
        duration: 4000,
      });
    }
    setBellPulse((x) => x + 1);
  }, [data?.notifications]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.unreadCount ?? 0;
  const items = useMemo(() => {
    const list = data?.notifications ?? [];
    const unreadOnly = list.filter((n) => n.isRead === false);
    if (!dismissed.size) return unreadOnly;
    return unreadOnly.filter((n) => !dismissed.has(n.id));
  }, [data?.notifications, dismissed]);

  const visibleItems = items.slice(0, visibleCount);
  const canShowMore = visibleCount < items.length;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setVisibleCount(5);
      }}
    >
      <DropdownMenuTrigger className="rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
        <span className="relative inline-flex cursor-pointer rounded-md p-2 hover:bg-white/10">
          <motion.span
            key={bellPulse}
            animate={
              bellPulse === 0
                ? undefined
                : {
                    rotate: [0, -12, 12, -10, 10, -6, 6, -2, 2, 0],
                  }
            }
            transition={{ duration: 2, ease: "easeInOut" }}
            className="inline-flex"
          >
            <Bell className="h-5 w-5" />
          </motion.span>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-96 max-w-[calc(100vw-2rem)] overflow-x-hidden p-0"
      >
        <div className="px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-primary/80">
            Notifications
          </div>
          <div className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </div>
        </div>
        <div className="h-px bg-border" />

        {items.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            No new notifications
          </div>
        ) : (
          <>
            <ul className="no-scrollbar max-h-112 space-y-2 overflow-y-auto px-2 py-2">
              <AnimatePresence initial={false}>
                {visibleItems.map((n) => {
                  const Icon = notificationIcon(n);
                  return (
                    <motion.li
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "group relative rounded-xl border p-3 pr-10 transition-colors",
                        !n.isRead
                          ? "border-[color-mix(in_oklab,var(--brand),transparent_70%)] bg-[color-mix(in_oklab,var(--brand),transparent_93%)]"
                          : "border-border bg-background/40 hover:bg-muted/30",
                      )}
                    >
                      <button
                        type="button"
                        className="block w-full cursor-pointer text-left"
                        onClick={() => {
                          if (!n.isRead) markRead.mutate(n.id);

                          const taskId = n.taskId ?? n.metadata?.taskId ?? null;
                          const meetingId = n.metadata?.meetingId ?? null;

                          if (taskId && !isTaskDeletedNotification(n)) {
                            nav(`/tasks/${taskId}`);
                          }
                          else if (meetingId && !isDeletedMeetingNotification(n)) {
                            nav(`/meetings/${meetingId}`);
                          }

                          setOpen(false);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 inline-flex size-9 items-center justify-center rounded-lg",
                              isTaskEscalationNotification(n)
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted/40 text-foreground",
                            )}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={notificationBadgeClassFor(n)}>
                                {notificationBadgeLabel(n)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(n.createdAt))}
                              </span>
                            </div>
                            <div className="mt-2 text-sm text-foreground">
                              {n.message}
                            </div>
                            {n.metadata?.kind === "TASK_ESCALATION" &&
                              n.metadata?.dueDate && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Due{" "}
                                  {formatLocalDateTime(
                                    String(n.metadata.dueDate),
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={cn(
                          "absolute right-2 top-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-md",
                          "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                        )}
                        aria-label="Dismiss notification"
                        onClick={() => {
                          lastDismissClickAtRef.current = Date.now();
                          if (!n.isRead) markRead.mutate(n.id);
                          setDismissed((prev) => {
                            const next = new Set(prev);
                            next.add(n.id);
                            return next;
                          });
                        }}
                      >
                        <X className="size-4" />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>

            {canShowMore ? (
              <div className="px-2 pb-2">
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground hover:bg-muted/30"
                  onClick={() => setVisibleCount((c) => c + 5)}
                >
                  Show more
                </button>
              </div>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
