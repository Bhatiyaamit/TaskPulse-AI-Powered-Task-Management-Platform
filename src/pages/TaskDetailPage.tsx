import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  GitMerge,
  ListTree,
  Paperclip,
  Shield,
  Repeat,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, deleteTaskAttachment, uploadTaskAttachment } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe, useHasPermission } from "@/hooks/useAuth";
import {
  P,
  taskModuleCanAccessTask,
  taskModuleCanLoadTaskStatuses,
  taskModuleCanUpdate,
} from "@/lib/permissions";
import { Button, buttonVariants } from "@/components/ui/button";
import { taskPriorityBadgeClass, taskStatusBadgeClass } from "@/lib/badges";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DOMPurify from "dompurify";

type UserBrief = { id: string; name: string; username: string };

type TaskActivity = {
  id: string;
  type: "COMMENT" | "STATUS_CHANGE" | "TIME_LOG";
  message: string | null;
  metadata: unknown;
  createdAt: string;
  user: UserBrief;
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  steps: string | null;
  startDate: string | null;
  dueDate: string | null;
  escalationAt: string | null;
  estimatedMinutes: number | null;
  status: { id: string; code: string; label: string; isTerminal?: boolean };
  assignedTo: UserBrief | null;
  reviewer: UserBrief | null;
  supporter: UserBrief | null;
  escalationTo: UserBrief | null;
  createdBy: UserBrief;
  activities: TaskActivity[];
  attachments: {
    id: string;
    fileUrl: string;
    fileName: string | null;
    createdAt: string;
  }[];
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  meetingId?: string | null;
  meeting?: {
    id: string;
    title: string;
    datetime: string;
    momNotes: string | null;
  } | null;
  parent?: {
    id: string;
    title: string;
    status: { label: string; code: string; isTerminal?: boolean };
  } | null;
  children?: {
    id: string;
    title: string;
    status: {
      id: string;
      label: string;
      code: string;
      isTerminal?: boolean;
    };
    assignedTo: UserBrief | null;
    dueDate: string | null;
  }[];
  recurrenceGroupId?: string | null;
};

type ChecklistItem = {
  id: string;
  text: string;
  sortOrder: number;
  mandatory: boolean;
  isChecked: boolean;
  checkedAt: string | null;
  checkedById: string | null;
  checkedBy?: UserBrief | null;
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return formatWhen(iso);
}

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function safeStepsHtml(raw: string) {
  const html = looksLikeHtml(raw)
    ? raw
    : raw
        .split("&")
        .join("&amp;")
        .split("<")
        .join("&lt;")
        .split(">")
        .join("&gt;")
        .split("\n")
        .join("<br />");

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

function escalationMinutesBeforeDue(
  dueIso: string | null,
  escalationIso: string | null,
) {
  if (!dueIso || !escalationIso) return null;
  const dueMs = new Date(dueIso).getTime();
  const escMs = new Date(escalationIso).getTime();
  if (Number.isNaN(dueMs) || Number.isNaN(escMs)) return null;
  return Math.max(0, Math.round((dueMs - escMs) / 60_000));
}

function formatEstimatedHours(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = minutes / 60;
  return `${hours.toFixed(1)} hr`;
}

function activityLabel(type: TaskActivity["type"]) {
  switch (type) {
    case "COMMENT":
      return "Comment";
    case "TIME_LOG":
      return "Time logged";
    default:
      return "Update";
  }
}

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const returnTo = sp.get("returnTo")?.trim() || "/tasks";
  const { data: me, isPending: mePending } = useMe();
  const canAccessTask = taskModuleCanAccessTask(me?.permissions);
  const canUpdate = taskModuleCanUpdate(me?.permissions);
  const canReviewPerm = useHasPermission(P.TASKS_REVIEW, me);
  const canLoadStatuses = taskModuleCanLoadTaskStatuses(me?.permissions);

  const [commentText, setCommentText] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [sendBackComment, setSendBackComment] = useState("");

  const taskQuery = useQuery({
    queryKey: ["task", id],
    enabled: Boolean(id) && !mePending && canAccessTask,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ task: TaskDetail }>>(
        `/api/tasks/${id}`,
      );
      return data.data.task;
    },
    retry: false,
  });

  const statusesQuery = useQuery({
    queryKey: ["task-statuses"],
    enabled: canLoadStatuses && (canUpdate || canReviewPerm),
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ statuses: { id: string; code: string; label: string }[] }>
      >("/api/tasks/statuses");
      return data.data.statuses;
    },
  });

  const task = taskQuery.data;
  const statuses = statusesQuery.data ?? [];
  const checklistQuery = useQuery({
    queryKey: ["task-checklist", id],
    enabled: Boolean(id) && Boolean(task),
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ items: ChecklistItem[] }>>(
        `/api/tasks/${id}/checklist`,
      );
      return data.data.items;
    },
  });
  const checklistItems = checklistQuery.data ?? [];

  const seriesQuery = useQuery({
    queryKey: ["task-series", task?.recurrenceGroupId],
    enabled: Boolean(task?.recurrenceGroupId),
    queryFn: async () => {
      const { data } = await api.get(
        `/api/tasks/series/${task!.recurrenceGroupId}`,
      );
      return data.data.tasks as { id: string; startDate: string }[];
    },
  });

  const seriesIndex = seriesQuery.data
    ? seriesQuery.data.findIndex((t) => t.id === task?.id) + 1
    : 0;
  const seriesTotal = seriesQuery.data?.length ?? 0;

  /** Parent with open subtasks: status / complete only after every child is terminal (backend enforces too). */
  const allChildrenTerminal = useMemo(() => {
    const kids = task?.children;
    if (!kids?.length) return true;
    return kids.every(
      (c) =>
        Boolean(c.status.isTerminal) ||
        String(c.status.code).toUpperCase() === "DONE",
    );
  }, [task?.children]);

  const parentBlockedByOpenSubtasks = Boolean(
    task?.children?.length && !allChildrenTerminal,
  );

  /** Only when parent has open subtasks — Done/terminal tasks can still change status (e.g. mistaken completion). */
  const statusSelectDisabled = parentBlockedByOpenSubtasks;

  /** Ensures Select shows a label: current task status may be missing from `/statuses` for some roles. */
  const statusOptionsForSelect = useMemo(() => {
    if (!task) return statuses;
    if (statuses.some((s) => s.id === task.status.id)) return statuses;
    return [
      ...statuses,
      {
        id: task.status.id,
        code: task.status.code,
        label: task.status.label,
      },
    ];
  }, [statuses, task]);

  const currentStatusLabel = useMemo(() => {
    if (!task) return "";
    return (
      statusOptionsForSelect.find((s) => s.id === task.status.id)?.label ??
      task.status.label
    );
  }, [task, statusOptionsForSelect]);

  const isReviewer = Boolean(
    me && task?.reviewer?.id && task.reviewer.id === me.user?.id,
  );
  const showReviewPanel = Boolean(
    task && canReviewPerm && isReviewer && task.status.code === "REVIEW",
  );

  const participantIds = useMemo(() => {
    if (!task || !me) return { isParticipant: false, viaHierarchy: false };
    const uid = me.user?.id;
    const isParticipant =
      task.assignedTo?.id === uid ||
      task.reviewer?.id === uid ||
      task.supporter?.id === uid ||
      task.createdBy.id === uid;
    const hasTeamView = me.permissions.includes(P.USERS_READ);
    const viaHierarchy = hasTeamView && !isParticipant;
    return { isParticipant, viaHierarchy };
  }, [task, me]);

  const patchTask = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/tasks/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task status updated");
    },
    onError: (e) => {
      toast.error(
        isAxiosError(e)
          ? String(e.response?.data?.message ?? e.message)
          : "Update failed",
      );
    },
  });

  const addComment = useMutation({
    mutationFn: (message: string) =>
      api.post(`/api/tasks/${id}/comments`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      setCommentText("");
      toast.success("Comment added");
    },
    onError: () => toast.error("Could not add comment"),
  });

  const addTime = useMutation({
    mutationFn: (minutes: number) =>
      api.post(`/api/tasks/${id}/time-log`, { minutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      setTimeMinutes("");
      toast.success("Time logged");
    },
    onError: () => toast.error("Could not log time"),
  });

  const review = useMutation({
    mutationFn: (payload: {
      decision: "approve" | "reject";
      comment?: string;
    }) => api.post(`/api/tasks/${id}/review`, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setApproveNote("");
      setSendBackComment("");
      toast.success(
        variables.decision === "approve" ? "Approved" : "Sent back for changes",
      );
    },
    onError: () => toast.error("Review action failed"),
  });

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      deleteTaskAttachment(id!, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Attachment deleted");
    },
    onError: () => toast.error("Could not delete attachment"),
  });
  const updateChecklistItem = useMutation({
    mutationFn: async (payload: { itemId: string; isChecked?: boolean }) =>
      api.patch(`/api/tasks/${id}/checklist/${payload.itemId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-checklist", id] });
    },
  });

  const recentActivities = useMemo(() => {
    return [...(task?.activities ?? [])].slice(-10).reverse();
  }, [task?.activities]);

  const recentChecklistItems = useMemo(() => {
    return checklistItems.slice(0, 10);
  }, [checklistItems]);

  const recentAttachments = useMemo(() => {
    return [...(task?.attachments ?? [])]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10);
  }, [task?.attachments]);

  async function onPickFile(files: FileList | null) {
    if (!files?.length || !id || !canUpdate) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        await uploadTaskAttachment(id, f);
      }
      qc.invalidateQueries({ queryKey: ["task", id] });
      toast.success("File(s) uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (mePending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (me && !canAccessTask) {
    return <Navigate to={returnTo} replace />;
  }

  if (taskQuery.isLoading || !id) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading task…
      </div>
    );
  }

  if (taskQuery.isError || !task) {
    return (
      <div className="space-y-4">
        <Link
          to={returnTo}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "inline-flex gap-2",
          )}
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Task unavailable</CardTitle>
            <CardDescription>
              It may not exist, or you do not have access (including hierarchy
              scope for your role).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  function applyStatus(nextId: string) {
    patchTask.mutate({ statusId: nextId });
  }

  function submitComment() {
    const t = commentText.trim();
    if (!t) return;
    addComment.mutate(t);
  }

  function submitTime() {
    const n = Number.parseInt(timeMinutes, 10);
    if (Number.isNaN(n) || n < 1) {
      toast.warning("Enter a positive number of minutes");
      return;
    }
    addTime.mutate(n);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("inline-flex gap-2 text-muted-foreground", "-ml-2")}
          onClick={() => navigate(returnTo)}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {participantIds.viaHierarchy && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
            <Shield className="size-3" />
            Visible via team hierarchy
          </span>
        )}
      </div>

      {task.recurrenceGroupId && (
        <div className="flex items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-teal-900 dark:border-teal-900/50 dark:bg-teal-900/20 dark:text-teal-200">
          <div className="flex items-center gap-2 font-medium">
            <Repeat className="size-4" />
            <span>
              Part of recurring series • Pattern:{" "}
              {task.recurrencePattern || "Custom"} • Task{" "}
              {seriesIndex > 0 ? `${seriesIndex} of ${seriesTotal}` : "..."}
            </span>
          </div>
          <Link
            to={`/tasks/series/${task.recurrenceGroupId}`}
            className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900 hover:underline dark:text-teal-400 dark:hover:text-teal-200"
          >
            View all tasks in this series &rarr;
          </Link>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(280px,340px)] lg:items-start">
        <div className="space-y-8">
          {/* 1. Header */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                  {task.title}
                </h1>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className={taskStatusBadgeClass(task.status.code)}>
                    {task.status.label}
                  </span>
                  <span className={taskPriorityBadgeClass(task.priority)}>
                    {task.priority}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    <Clock className="size-3.5 opacity-70" />
                    Start {formatDateTime(task.startDate)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    <Calendar className="size-3.5 opacity-70" />
                    Due {formatDateTime(task.dueDate)}
                  </span>
                </div>
              </div>
            </div>
          </motion.section>

          {/* 2. Task info */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase tracking-wide text-primary">
                  Task info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
                    Description / action steps
                  </h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {task.description?.trim() ? task.description : "—"}
                  </p>
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
                      Steps (How to do)
                    </h4>
                    {task.steps?.trim() ? (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        // Sanitized HTML only (see safeStepsHtml).
                        dangerouslySetInnerHTML={{
                          __html: safeStepsHtml(task.steps),
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
                      <User className="size-3.5" />
                      Assigned to
                    </div>
                    <p className="text-sm font-medium">
                      {task.assignedTo?.name ?? "—"}
                    </p>
                    {task.assignedTo?.username && (
                      <p className="text-xs text-muted-foreground">
                        {task.assignedTo.username}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Reviewer
                    </div>
                    <p className="text-sm font-medium">
                      {task.reviewer?.name ?? "—"}
                    </p>
                    {task.reviewer?.username && (
                      <p className="text-xs text-muted-foreground">
                        {task.reviewer.username}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Supporter
                    </div>
                    <p className="text-sm font-medium">
                      {task.supporter?.name ?? "—"}
                    </p>
                    {task.supporter?.username && (
                      <p className="text-xs text-muted-foreground">
                        {task.supporter.username}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Escalation time
                    </div>
                    <p className="text-sm font-medium">
                      {(() => {
                        const min = escalationMinutesBeforeDue(
                          task.dueDate,
                          task.escalationAt,
                        );
                        if (min == null) return "—";
                        return `${min} min before due`;
                      })()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDateTime(task.escalationAt)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Escalation to
                    </div>
                    <p className="text-sm font-medium">
                      {task.escalationTo?.name ?? "—"}
                    </p>
                    {task.escalationTo?.username && (
                      <p className="text-xs text-muted-foreground">
                        {task.escalationTo.username}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Estimation hours
                    </div>
                    <p className="text-sm font-medium">
                      {formatEstimatedHours(task.estimatedMinutes)}
                    </p>
                  </div>
                </div>
                {task.meetingId && task.meeting ? (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="text-sm font-semibold uppercase tracking-wide text-primary">
                        Meeting MOM (read only)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From meeting: {task.meeting.title} (
                        {formatDateTime(task.meeting.datetime)})
                      </p>
                      <Textarea
                        value={task.meeting.momNotes ?? ""}
                        readOnly
                        rows={5}
                        placeholder="No MOM added for this meeting yet."
                      />
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </motion.section>

          {/* 3a. Parent task */}
          {task.parent && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.07 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold uppercase tracking-wide text-primary">
                    <GitMerge className="size-4" />
                    Parent task
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link
                    to={`/tasks/${task.parent.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:text-primary">
                        {task.parent.title}
                      </p>
                    </div>
                    <span
                      className={cn(
                        taskStatusBadgeClass(task.parent.status.code),
                        "shrink-0",
                      )}
                    >
                      {task.parent.status.label}
                    </span>
                  </Link>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* 3b. Child tasks (sub-tasks) */}
          {task.children && task.children.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold uppercase tracking-wide text-primary">
                    <ListTree className="size-4" />
                    Sub-tasks
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      {task.children.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {task.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          to={`/tasks/${child.id}?returnTo=${encodeURIComponent(returnTo)}`}
                          className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium group-hover:text-primary">
                              {child.title}
                            </p>
                            {child.assignedTo && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <User className="size-3" />
                                {child.assignedTo.name || child.assignedTo.username}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={cn(
                                taskStatusBadgeClass(child.status.code),
                              )}
                            >
                              {child.status.label}
                            </span>
                            {child.dueDate && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="size-3" />
                                {formatDateTime(child.dueDate)}
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* 4. Activity */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase tracking-wide text-primary">
                  Activity timeline
                </CardTitle>
                <CardDescription>
                  Comments, status changes, time entries, and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {task.activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No activity yet.
                  </p>
                ) : (
                  <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {recentActivities.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
                      >
                        <div className="text-xs text-muted-foreground">
                          {formatWhen(a.createdAt)} · {a.user.name} ·{" "}
                          {activityLabel(a.type)}
                        </div>
                        {a.message && (
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {a.message}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.11 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase tracking-wide text-primary">
                  Checklist
                </CardTitle>
                <CardDescription>
                  Check and update required line items for this task.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {checklistItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No checklist items.
                  </p>
                ) : (
                  <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {recentChecklistItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={item.isChecked}
                            onChange={(e) =>
                              updateChecklistItem.mutate({
                                itemId: item.id,
                                isChecked: e.target.checked,
                              })
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {item.text}
                              </p>
                              {item.mandatory ? (
                                <span
                                  className="text-destructive"
                                  aria-label="Mandatory checklist item"
                                  title="Mandatory"
                                >
                                  *
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.isChecked && item.checkedAt
                                ? `Checked ${formatWhen(item.checkedAt)}`
                                : "Not checked yet"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>

          {/* 5. Attachments */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase tracking-wide text-primary">
                  Attachments
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Files linked to this task
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canUpdate && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="file-up"
                      className="text-sm font-semibold uppercase tracking-wide text-primary"
                    >
                      Upload
                    </Label>
                    <Input
                      id="file-up"
                      ref={fileInputRef}
                      type="file"
                      multiple
                      disabled={uploading}
                      className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                      onChange={(e) => void onPickFile(e.target.files)}
                    />
                    {uploading && (
                      <p className="text-xs text-muted-foreground">
                        Uploading…
                      </p>
                    )}
                  </div>
                )}
                {task.attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No attachments.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {recentAttachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {att.fileName ?? att.fileUrl}
                              </span>
                            </span>
                            <div className="ml-auto flex shrink-0 items-center gap-0">
                              <a
                                href={att.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                Open
                              </a>
                              {canUpdate ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Delete ${att.fileName ?? "attachment"}`}
                                  onClick={() =>
                                    deleteAttachmentMutation.mutate(att.id)
                                  }
                                  disabled={deleteAttachmentMutation.isPending}
                                >
                                  <X className="size-4" />
                                </Button>
                              ) : null}
                            </div>
                          </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>

          {/* 6. Review (manager / reviewer) */}
          {showReviewPanel && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg">Review</CardTitle>
                  <CardDescription>
                    You are the assigned reviewer. Approve to complete, or send
                    back with feedback. (Requires{" "}
                    <code className="text-xs">task.review</code> and reviewer
                    role on this task.)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="approve-note">
                      Note (optional) — approve
                    </Label>
                    <Textarea
                      id="approve-note"
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                      placeholder="Optional approval note"
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        review.mutate({
                          decision: "approve",
                          comment: approveNote.trim() || undefined,
                        })
                      }
                      disabled={review.isPending}
                    >
                      <CheckCircle2 className="mr-2 size-4" />
                      Approve
                    </Button>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="sendback">
                      Send back — comment to assignee
                    </Label>
                    <Textarea
                      id="sendback"
                      value={sendBackComment}
                      onChange={(e) => setSendBackComment(e.target.value)}
                      placeholder="What should change before approval?"
                      rows={3}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const c = sendBackComment.trim();
                      if (!c) {
                        toast.warning("Add a short comment when sending back.");
                        return;
                      }
                      review.mutate({ decision: "reject", comment: c });
                    }}
                    disabled={review.isPending}
                  >
                    Send back with comment
                  </Button>
                </CardContent>
              </Card>
            </motion.section>
          )}
        </div>

        {/* 5. Actions panel */}
        {canUpdate && (
          <motion.aside
            className="space-y-4 lg:sticky lg:top-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold uppercase tracking-wide text-primary">
                  Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Update status</Label>
                  <Select
                    value={task.status.id}
                    onValueChange={(v) => applyStatus(v)}
                    disabled={patchTask.isPending || statusSelectDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status">
                        {currentStatusLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptionsForSelect.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.label}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {parentBlockedByOpenSubtasks ? (
                    <p className="text-xs text-muted-foreground">
                      Complete all subtasks before updating status or marking this task
                      complete.
                    </p>
                  ) : null}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="new-comment">Add comment</Label>
                  <Textarea
                    id="new-comment"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Visible in the activity timeline"
                    rows={3}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={submitComment}
                    disabled={addComment.isPending || !commentText.trim()}
                  >
                    Post comment
                  </Button>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="time-min">Add time spent (minutes)</Label>
                  <Input
                    id="time-min"
                    type="number"
                    min={1}
                    step={1}
                    value={timeMinutes}
                    onChange={(e) => setTimeMinutes(e.target.value)}
                    placeholder="e.g. 30"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={submitTime}
                    disabled={addTime.isPending}
                  >
                    Log time
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.aside>
        )}
      </div>
    </div>
  );
}
