import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { useMe } from "@/hooks/useAuth";
import { taskModuleCanCreate } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/RichTextEditor";
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

type UserOption = {
  id: string;
  name: string;
  username: string;
  isReviewer?: boolean;
};

export function TaskCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const meetingId = sp.get("meetingId");
  const returnTo = sp.get("returnTo");
  const { data: me, isPending: mePending } = useMe();
  const canCreateTask = taskModuleCanCreate(me?.permissions);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [statusId, setStatusId] = useState("");
  const [assignedToId, setAssignedToId] = useState(UNASSIGNED);
  const [reviewerId, setReviewerId] = useState(UNASSIGNED);
  const [supporterId, setSupporterId] = useState(UNASSIGNED);
  const [escalationToId, setEscalationToId] = useState(UNASSIGNED);
  const [escalationAt, setEscalationAt] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: statuses } = useQuery({
    queryKey: ["task-statuses"],
    enabled: canCreateTask,
    queryFn: async () => {
      const { data } = await api.get<{
        statuses: { id: string; label: string; code: string }[];
      }>("/api/tasks/statuses");
      return data.statuses;
    },
  });

  const { data: assignable } = useQuery({
    queryKey: ["task-assignable-users"],
    enabled: canCreateTask,
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

  function userLabelForValue(v: string) {
    if (v === UNASSIGNED) return "Unassigned";
    const u = assignable?.find((x) => x.id === v);
    return u?.name || u?.username || v;
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
    onSuccess: async (_task) => {
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
      navigate(next);
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
    const toNull = (v: string) => (v === UNASSIGNED ? null : v);
    create.mutate({
      title: title.trim(),
      description: description.trim() || null,
      steps: steps.trim() || null,
      statusId,
      assignedToId: toNull(assignedToId),
      reviewerId: toNull(reviewerId),
      supporterId: toNull(supporterId),
      escalationToId: toNull(escalationToId),
      escalationAt: escalationAt || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
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

  function reviewerItems() {
    const users = (assignable ?? []).filter((u) => Boolean(u.isReviewer));
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

  if (mePending) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (me && !canCreateTask) {
    const fallback =
      returnTo?.trim() ||
      (meetingId?.trim()
        ? `/meetings/${encodeURIComponent(meetingId)}`
        : "/tasks");
    return <Navigate to={fallback} replace />;
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
              <Label htmlFor="title" required>
                Title
              </Label>
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
              <Label>Steps (How to do)</Label>
              <RichTextEditor
                value={steps}
                onChange={setSteps}
                placeholder="Write the steps…"
              />
            </div>
          </section>

          <Separator />

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
                  <SelectContent>{reviewerItems()}</SelectContent>
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
              <div className="space-y-2">
                <Label>Escalation to whom</Label>
                <Select
                  value={escalationToId}
                  onValueChange={setEscalationToId}
                  itemToStringLabel={userLabelForValue}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Who should be notified on escalation" />
                  </SelectTrigger>
                  <SelectContent>{userItems()}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

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
              <Label htmlFor="escalationAt">Escalation time</Label>
              <Input
                id="escalationAt"
                type="datetime-local"
                value={escalationAt}
                onChange={(e) => setEscalationAt(e.target.value)}
                placeholder="Select escalation time"
              />
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
