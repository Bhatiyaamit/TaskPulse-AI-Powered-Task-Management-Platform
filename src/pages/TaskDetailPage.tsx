import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  Link,
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
  GitBranch,
  MessageSquare,
  Paperclip,
  Shield,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { api, uploadTaskAttachment } from "@/api/client";
import { useMe, useHasPermission } from "@/hooks/useAuth";
import { P } from "@/lib/permissions";
import { Button, buttonVariants } from "@/components/ui/button";
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
  taskType: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: { id: string; code: string; label: string };
  assignedTo: UserBrief | null;
  reviewer: UserBrief | null;
  supporter: UserBrief | null;
  createdBy: UserBrief;
  activities: TaskActivity[];
  attachments: {
    id: string;
    fileUrl: string;
    fileName: string | null;
    createdAt: string;
  }[];
};

type ChecklistAttachment = {
  id: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
};

type TaskChecklistItem = {
  id: string;
  text: string;
  sortOrder: number;
  mandatory: boolean;
  isChecked: boolean;
  checkedAt: string | null;
  remarks: string | null;
  checkedBy?: UserBrief | null;
  attachments: ChecklistAttachment[];
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

function formatDay(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function activityIcon(type: TaskActivity["type"]) {
  switch (type) {
    case "COMMENT":
      return <MessageSquare className="size-4 text-muted-foreground" />;
    case "TIME_LOG":
      return <Clock className="size-4 text-muted-foreground" />;
    default:
      return <GitBranch className="size-4 text-muted-foreground" />;
  }
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
  const { data: me } = useMe();
  const canUpdate = useHasPermission(P.TASKS_UPDATE, me);
  const canReviewPerm = useHasPermission(P.TASKS_REVIEW, me);

  const [commentText, setCommentText] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [sendBackComment, setSendBackComment] = useState("");

  const taskQuery = useQuery({
    queryKey: ["task", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<{ task: TaskDetail }>(`/api/tasks/${id}`);
      return data.task;
    },
    retry: false,
  });

  const statusesQuery = useQuery({
    queryKey: ["task-statuses"],
    queryFn: async () => {
      const { data } = await api.get<{
        statuses: { id: string; code: string; label: string }[];
      }>("/api/tasks/statuses");
      return data.statuses;
    },
  });

  const task = taskQuery.data;
  const statuses = statusesQuery.data ?? [];

  const checklistQuery = useQuery({
    queryKey: ["task", id, "checklist"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<{ items: TaskChecklistItem[] }>(
        `/api/tasks/${id}/checklist`,
      );
      return data.items;
    },
    retry: false,
  });

  const checklistItems = checklistQuery.data ?? [];

  const updateChecklistItem = useMutation({
    mutationFn: (payload: {
      itemId: string;
      isChecked?: boolean;
      remarks?: string | null;
    }) =>
      api.patch(`/api/tasks/${id}/checklist/${payload.itemId}`, {
        isChecked: payload.isChecked,
        remarks: payload.remarks,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id, "checklist"] });
    },
    onError: () => toast.error("Could not update checklist item"),
  });

  const doneStatusId = useMemo(
    () => statuses.find((s) => s.code === "DONE")?.id,
    [statuses],
  );

  const isReviewer = Boolean(
    me && task?.reviewer?.id && task.reviewer.id === me.user.id,
  );
  const showReviewPanel = Boolean(
    task && canReviewPerm && isReviewer && task.status.code === "REVIEW",
  );

  const participantIds = useMemo(() => {
    if (!task || !me) return { isParticipant: false, viaHierarchy: false };
    const uid = me.user.id;
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
      toast.success("Task updated");
    },
    onError: (e) => {
      toast.error(
        isAxiosError(e)
          ? String(e.response?.data?.error ?? e.message)
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

  async function onPickFile(files: FileList | null) {
    if (!files?.length || !id) return;
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
    }
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

  function markComplete() {
    if (!doneStatusId) {
      toast.error("No “Done” status configured for this tenant.");
      return;
    }
    applyStatus(doneStatusId);
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

  const priorityLabel =
    task.priority.charAt(0) + task.priority.slice(1).toLowerCase();

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
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    {task.status.label}
                  </span>
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    {priorityLabel}
                  </span>
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    {task.taskType.replace(/_/g, " ")}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5">
                    <Calendar className="size-3.5 opacity-70" />
                    Due {formatDay(task.dueDate)}
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
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    Start:{" "}
                    <span className="text-foreground">
                      {formatDay(task.startDate)}
                    </span>
                  </div>
                  <div>
                    Est. time:{" "}
                    <span className="text-foreground">
                      {task.estimatedMinutes != null
                        ? `${task.estimatedMinutes} min`
                        : "—"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 3. Checklist */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase tracking-wide text-primary">
                  Checklist
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Check items, add remarks, and attach proof where required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {checklistQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading checklist…
                  </p>
                ) : checklistItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No checklist items yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {checklistItems.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-md border border-border p-3"
                      >
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={it.isChecked}
                            disabled={
                              !canUpdate || updateChecklistItem.isPending
                            }
                            onChange={(e) =>
                              updateChecklistItem.mutate({
                                itemId: it.id,
                                isChecked: e.target.checked,
                              })
                            }
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {it.text}
                              {it.mandatory ? (
                                <span className="ml-2 text-xs text-destructive">
                                  Mandatory
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {it.isChecked
                                ? `Checked${
                                    it.checkedBy?.name
                                      ? ` by ${it.checkedBy.name}`
                                      : ""
                                  }`
                                : "Not checked"}
                            </div>
                          </div>
                        </label>

                        <div className="mt-3 space-y-2">
                          <Label htmlFor={`remarks-${it.id}`}>Remarks</Label>
                          <Textarea
                            id={`remarks-${it.id}`}
                            value={it.remarks ?? ""}
                            disabled={
                              !canUpdate || updateChecklistItem.isPending
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              qc.setQueryData<TaskChecklistItem[]>(
                                ["task", id, "checklist"],
                                (prev) =>
                                  (prev ?? []).map((x) =>
                                    x.id === it.id ? { ...x, remarks: v } : x,
                                  ),
                              );
                            }}
                            onBlur={(e) =>
                              updateChecklistItem.mutate({
                                itemId: it.id,
                                remarks: e.target.value.trim()
                                  ? e.target.value
                                  : null,
                              })
                            }
                            placeholder="Optional remarks…"
                          />

                          {it.attachments.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No checklist attachments.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {it.attachments.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-xs text-primary underline-offset-4 hover:underline"
                                >
                                  {a.fileName ?? a.fileUrl}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>

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
                  <ul className="relative space-y-0 border-l border-border pl-6">
                    {task.activities.map((a) => (
                      <li key={a.id} className="pb-6 last:pb-0">
                        <span className="absolute -left-2.25 mt-1.5 flex size-4.5 items-center justify-center rounded-full border border-border bg-background">
                          {activityIcon(a.type)}
                        </span>
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
                  <ul className="space-y-2">
                    {task.attachments.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {att.fileName ?? att.fileUrl}
                          </span>
                        </span>
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-primary underline-offset-4 hover:underline"
                        >
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
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
                    value={task.status.code}
                    onValueChange={(v) => applyStatus(v)}
                    disabled={patchTask.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Separator />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200"
                  onClick={markComplete}
                  disabled={
                    patchTask.isPending ||
                    task.status.code === "DONE" ||
                    !doneStatusId
                  }
                >
                  <CheckCircle2 className="mr-2 size-4" />
                  Mark complete
                </Button>
              </CardContent>
            </Card>
          </motion.aside>
        )}
      </div>
    </div>
  );
}
