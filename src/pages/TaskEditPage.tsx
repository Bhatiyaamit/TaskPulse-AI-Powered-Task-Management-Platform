import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "@/api/client";
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

type TaskPayload = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  taskType: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: { id: string; code: string; label: string };
  assignedTo: UserOption | null;
  reviewer: UserOption | null;
  supporter: UserOption | null;
};

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hydrated = useRef(false);
  const [sp] = useSearchParams();
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
  const [formError, setFormError] = useState<string | null>(null);

  const taskQuery = useQuery({
    queryKey: ["task", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<{ task: TaskPayload }>(`/api/tasks/${id}`);
      return data.task;
    },
  });

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

  const task = taskQuery.data;

  useLayoutEffect(() => {
    hydrated.current = false;
  }, [id]);

  useLayoutEffect(() => {
    if (!task || hydrated.current) return;
    hydrated.current = true;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatusId(task.status.id);
    setAssignedToId(task.assignedTo?.id ?? UNASSIGNED);
    setReviewerId(task.reviewer?.id ?? UNASSIGNED);
    setSupporterId(task.supporter?.id ?? UNASSIGNED);
    setStartDate(isoToDatetimeLocal(task.startDate));
    setDueDate(isoToDatetimeLocal(task.dueDate));
    setEstimatedMinutes(
      task.estimatedMinutes != null ? String(task.estimatedMinutes) : "",
    );
    setPriority(task.priority || "MEDIUM");
    setTaskType(task.taskType || "GENERAL");
  }, [task]);

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

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.patch<{ task: { id: string } }>(
        `/api/tasks/${id}`,
        payload,
      );
      return data.task;
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string } } };
      setFormError(ax.response?.data?.error ?? "Could not save task.");
    },
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
      await qc.refetchQueries({
        queryKey: ["tasks"],
        exact: false,
        type: "active",
      });
      await qc.invalidateQueries({ queryKey: ["task", t.id] });
      navigate(returnTo?.trim() || "/tasks");
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
    update.mutate({
      title: title.trim(),
      description: description.trim() || null,
      statusId,
      priority,
      taskType,
      ...(canAssignOthers
        ? {
            assignedToId: toNull(assignedToId),
            reviewerId: toNull(reviewerId),
            supporterId: toNull(supporterId),
          }
        : {}),
      startDate: startDate || null,
      dueDate: dueDate || null,
      estimatedMinutes: estimated,
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

  if (taskQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl pb-12">
        <p className="text-sm text-muted-foreground">Loading task…</p>
      </div>
    );
  }

  if (taskQuery.isError || !task) {
    return (
      <div className="mx-auto max-w-2xl pb-12">
        <p className="text-sm text-muted-foreground">Could not load task.</p>
        <Link
          to="/tasks"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to tasks
        </Link>
      </div>
    );
  }

  return (
    <CenteredFormPage
      title="Edit task"
      description="Update details, assignment, and timeline."
      back={
        <FormBackButton
          onClick={() => {
            const next = returnTo?.trim();
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
              <Label>Status</Label>
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
          </section>
        </div>

        {formError && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-border pt-6">
          <Link to={returnTo?.trim() || `/tasks/${id}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            isLoading={update.isPending}
            disabled={!statusId}
          >
            Save changes
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
