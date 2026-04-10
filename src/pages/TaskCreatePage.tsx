import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, uploadTaskAttachment } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import { P } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CenteredFormPage,
  FormBackButton,
} from "@/components/layout/CenteredFormPage";

const UNASSIGNED = "__none__";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const TASK_TYPES = [
  { value: "GENERAL", label: "General" },
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "MEETING_FOLLOWUP", label: "Meeting follow-up" },
] as const;

type UserOption = { id: string; name: string; username: string };

export function TaskCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const meetingId = sp.get("meetingId");
  const returnTo = sp.get("returnTo");
  const { data: me } = useMe();
  const canAssignOthers = Boolean(me?.permissions?.includes(P.TASKS_ASSIGN));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState("");
  const [assignedToId, setAssignedToId] = useState(UNASSIGNED);
  const [reviewerId, setReviewerId] = useState(UNASSIGNED);
  const [supporterId, setSupporterId] = useState(UNASSIGNED);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [taskType, setTaskType] = useState<string>("GENERAL");
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: statuses } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: async () => {
      const { data } = await api.get<{
        statuses: { id: string; label: string; code: string }[];
      }>("/api/tasks/statuses");
      return data.statuses;
    },
  });

  const { data: assignable } = useQuery({
    queryKey: ["task-assignable-users"],
    queryFn: async () => {
      const { data } = await api.get<{ users: UserOption[] }>(
        "/api/tasks/assignable-users",
      );
      return data.users;
    },
  });

  useEffect(() => {
    if (!statuses?.length || statusId) return;
    const todo = statuses.find((s) => s.code === "TODO") ?? statuses[0];
    setStatusId(todo.id);
  }, [statuses, statusId]);

  function statusLabelForValue(v: string) {
    const s = statuses?.find((x) => x.id === v);
    return s?.label ?? v;
  }

  function userLabelForValue(v: string) {
    if (v === UNASSIGNED) return "Unassigned";
    const u = assignable?.find((x) => x.id === v);
    return u?.name || u?.username || v;
  }

  function priorityLabelForValue(v: string) {
    if (!v) return "";
    return v.charAt(0) + v.slice(1).toLowerCase();
  }

  function taskTypeLabelForValue(v: string) {
    return TASK_TYPES.find((t) => t.value === v)?.label ?? v;
  }

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post<{ task: { id: string } }>(
        "/api/tasks",
        payload,
      );
      return data.task;
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string } } };
      setFormError(ax.response?.data?.error ?? "Could not create task.");
    },
    onSuccess: async (task) => {
      // Ensure every task list variant (filters/sorts/queues) is refreshed before leaving.
      await qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
      await qc.refetchQueries({
        queryKey: ["tasks"],
        exact: false,
        type: "active",
      });
      const next =
        returnTo?.trim() ||
        (meetingId?.trim()
          ? `/meetings/${encodeURIComponent(meetingId)}`
          : "/tasks");
      if (files.length === 0) {
        navigate(next);
        return;
      }
      try {
        for (const f of files) {
          await uploadTaskAttachment(task.id, f);
        }
        qc.invalidateQueries({ queryKey: ["task", task.id] });
        await qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
        navigate(next);
      } catch (e) {
        setFormError(
          e instanceof Error
            ? e.message
            : "Task created but some attachments failed to upload.",
        );
        navigate(next);
      }
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!statusId) {
      setFormError("Loading statuses… try again in a moment.");
      return;
    }
    let estimated: number | null = null;
    if (estimatedMinutes.trim() !== "") {
      const n = Number.parseInt(estimatedMinutes, 10);
      if (Number.isNaN(n) || n < 0) {
        setFormError("Estimated time must be a non‑negative number (minutes).");
        return;
      }
      estimated = n;
    }
    const toNull = (v: string) => (v === UNASSIGNED ? null : v);
    create.mutate({
      title: title.trim(),
      description: description.trim() || null,
      statusId,
      priority,
      taskType,
      assignedToId: canAssignOthers ? toNull(assignedToId) : null,
      reviewerId: canAssignOthers ? toNull(reviewerId) : null,
      supporterId: canAssignOthers ? toNull(supporterId) : null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      estimatedMinutes: estimated,
      meetingId: meetingId?.trim() ? meetingId : null,
    });
  }

  function userItems() {
    const users = assignable ?? [];
    return (
      <>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name || u.username}
          </SelectItem>
        ))}
      </>
    );
  }

  return (
    <CenteredFormPage
      title="Create task"
      description="Fill in basic info, assignment, timeline, and settings in one place."
      back={
        <FormBackButton
          onClick={() => {
            const next =
              returnTo?.trim() ||
              (meetingId?.trim()
                ? `/meetings/${encodeURIComponent(meetingId)}`
                : null);
            if (next) navigate(next);
            else navigate(-1);
          }}
        />
      }
    >
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="space-y-6">
          <section className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-primary">
              Basic info
            </h4>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of the work"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context, acceptance criteria, links…"
              />
            </div>
            <div className="space-y-2">
              <Label>Initial status</Label>
              <Select
                value={statusId}
                onValueChange={setStatusId}
                disabled={!statuses?.length}
                itemToStringLabel={statusLabelForValue}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {(statuses ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          {!canAssignOthers ? null : (
            <>
              <section className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Assignment
                </h4>
                <div className="grid gap-4 sm:grid-cols-1">
                  <div className="space-y-2">
                    <Label>Responsible person</Label>
                    <Select
                      value={assignedToId}
                      onValueChange={setAssignedToId}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Who owns delivery" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reviewer</Label>
                    <Select
                      value={reviewerId}
                      onValueChange={setReviewerId}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Who signs off" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Supporter</Label>
                    <Select
                      value={supporterId}
                      onValueChange={setSupporterId}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Optional helper" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <Separator />
            </>
          )}

          <section className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-primary">
              Timeline
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start">Start</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Due</Label>
                <Input
                  id="due"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="est">Estimated time (minutes)</Label>
              <Input
                id="est"
                type="number"
                min={0}
                step={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="e.g. 120"
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-primary">
              Settings
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={setPriority}
                  itemToStringLabel={priorityLabelForValue}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Task type</Label>
                <Select
                  value={taskType}
                  onValueChange={setTaskType}
                  itemToStringLabel={taskTypeLabelForValue}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="files">Attachments</Label>
              <Input
                id="files"
                type="file"
                multiple
                className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-muted/60 file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-muted"
                onChange={(e) =>
                  setFiles(e.target.files ? Array.from(e.target.files) : [])
                }
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {files.length} file{files.length === 1 ? "" : "s"} selected —
                  uploaded after the task is created.
                </p>
              )}
            </div>
          </section>
        </div>

        {formError && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const next =
                returnTo?.trim() ||
                (meetingId?.trim()
                  ? `/meetings/${encodeURIComponent(meetingId)}`
                  : null);
              if (next) navigate(next);
              else navigate(-1);
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={create.isPending}
            disabled={!statusId}
          >
            Create task
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
