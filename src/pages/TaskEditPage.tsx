import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { taskModuleCanUpdate } from "@/lib/permissions";
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

type TaskPayload = {
  id: string;
  title: string;
  description: string | null;
  steps: string | null;
  startDate: string | null;
  dueDate: string | null;
  escalationAt: string | null;
  estimatedMinutes: number | null;
  status: { id: string; code: string; label: string };
  assignedTo: UserOption | null;
  reviewer: UserOption | null;
  supporter: UserOption | null;
  escalationTo: UserOption | null;
};

type TaskEditFormValues = {
  title: string;
  description: string;
  steps: string;
  statusId: string;
  assignedToId: string;
  reviewerId: string;
  supporterId: string;
  escalationToId: string;
  escalationMinutesBeforeDue: string;
  startDate: string;
  dueDate: string;
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
  const { data: me, isPending: mePending } = useMe();
  const canEditTask = taskModuleCanUpdate(me?.permissions);

  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, register, reset, watch } =
    useForm<TaskEditFormValues>({
      defaultValues: {
        title: "",
        description: "",
        steps: "",
        statusId: "",
        assignedToId: UNASSIGNED,
        reviewerId: UNASSIGNED,
        supporterId: UNASSIGNED,
        escalationToId: UNASSIGNED,
        escalationMinutesBeforeDue: "",
        startDate: "",
        dueDate: "",
      },
    });

  const taskQuery = useQuery({
    queryKey: ["task", id],
    enabled: Boolean(id) && !mePending && canEditTask,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ task: TaskPayload }>>(
        `/api/tasks/${id}`,
      );
      return data.data.task;
    },
  });

  const { data: assignable } = useQuery({
    queryKey: ["task-assignable-users"],
    enabled: canEditTask,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ users: UserOption[] }>>(
        "/api/tasks/assignable-users",
      );
      return data.data.users;
    },
  });

  const task = taskQuery.data;
  const statusId = watch("statusId");
  const hasStatusId = Boolean(statusId);

  useLayoutEffect(() => {
    hydrated.current = false;
    reset({
      title: "",
      description: "",
      steps: "",
      statusId: "",
      assignedToId: UNASSIGNED,
      reviewerId: UNASSIGNED,
      supporterId: UNASSIGNED,
      escalationToId: UNASSIGNED,
      escalationMinutesBeforeDue: "",
      startDate: "",
      dueDate: "",
    });
  }, [id]);

  useLayoutEffect(() => {
    if (!task || hydrated.current) return;
    hydrated.current = true;
    const escalationMinutesBeforeDue =
      task.dueDate && task.escalationAt
        ? String(
            Math.max(
              0,
              Math.round(
                (new Date(task.dueDate).getTime() -
                  new Date(task.escalationAt).getTime()) /
                  60_000,
              ),
            ),
          )
        : "";
    reset({
      title: task.title,
      description: task.description ?? "",
      steps: task.steps ?? "",
      statusId: task.status.id,
      assignedToId: task.assignedTo?.id ?? UNASSIGNED,
      reviewerId: task.reviewer?.id ?? UNASSIGNED,
      supporterId: task.supporter?.id ?? UNASSIGNED,
      escalationToId: task.escalationTo?.id ?? UNASSIGNED,
      startDate: isoToDatetimeLocal(task.startDate),
      dueDate: isoToDatetimeLocal(task.dueDate),
      escalationMinutesBeforeDue,
    });
  }, [task]);

  function userLabelForValue(v: string) {
    if (v === UNASSIGNED) return "Unassigned";
    const u = assignable?.find((x) => x.id === v);
    return u?.name || u?.username || v;
  }

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.patch<ApiSuccess<{ task: { id: string } }>>(
        `/api/tasks/${id}`,
        payload,
      );
      return data.data.task;
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      setFormError(ax.response?.data?.message ?? "Could not save task.");
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

  function onSubmit(values: TaskEditFormValues) {
    setFormError(null);
    if (!values.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    // statusId is hydrated from the task; keep the check but avoid unused error path text
    if (!hasStatusId) return;

    const dueIso = values.dueDate ? new Date(values.dueDate).toISOString() : null;
    const minutesRaw = values.escalationMinutesBeforeDue.trim();
    let escalationAtIso: string | null = null;
    if (minutesRaw !== "") {
      const n = Number.parseInt(minutesRaw, 10);
      if (Number.isNaN(n) || n < 0) {
        setFormError("Escalation minutes must be a non-negative number.");
        return;
      }
      if (!dueIso) {
        setFormError("Set a Due time to use escalation minutes.");
        return;
      }
      const dueMs = new Date(dueIso).getTime();
      escalationAtIso = new Date(dueMs - n * 60_000).toISOString();
    }

    const toNull = (v: string) => (v === UNASSIGNED ? null : v);
    update.mutate({
      title: values.title.trim(),
      description: values.description.trim() || null,
      steps: values.steps.trim() || null,
      statusId: values.statusId,
      assignedToId: toNull(values.assignedToId),
      reviewerId: toNull(values.reviewerId),
      supporterId: toNull(values.supporterId),
      escalationToId: toNull(values.escalationToId),
      escalationAt: escalationAtIso,
      startDate: values.startDate || null,
      dueDate: dueIso,
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

  if (mePending) {
    return (
      <div className="mx-auto max-w-2xl pb-12">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (me && !canEditTask && id) {
    return <Navigate to={returnTo?.trim() || `/tasks/${id}`} replace />;
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
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
                {...register("title")}
                placeholder="Short summary of the work"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Context, acceptance criteria, links…"
              />
            </div>
            <div className="space-y-2">
              <Label>Steps (How to do)</Label>
              <Controller
                control={control}
                name="steps"
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Write the steps… Use bullets/numbering, bold, italics."
                  />
                )}
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
                <Controller
                  control={control}
                  name="assignedToId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Who owns delivery" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Reviewer</Label>
                <Controller
                  control={control}
                  name="reviewerId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Who signs off" />
                      </SelectTrigger>
                      <SelectContent>{reviewerItems()}</SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Supporter</Label>
                <Controller
                  control={control}
                  name="supporterId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Optional helper" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Escalation to whom</Label>
                <Controller
                  control={control}
                  name="escalationToId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      itemToStringLabel={userLabelForValue}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Who should be notified on escalation" />
                      </SelectTrigger>
                      <SelectContent>{userItems()}</SelectContent>
                    </Select>
                  )}
                />
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
                  {...register("startDate")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Due</Label>
                <Input
                  id="due"
                  type="datetime-local"
                  {...register("dueDate")}
                />
              </div>
            </div>
            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="escalationMinutesBeforeDue">
                Escalation (minutes before Due)
              </Label>
              <Input
                id="escalationMinutesBeforeDue"
                inputMode="numeric"
                pattern="[0-9]*"
                type="number"
                min={0}
                step={1}
                {...register("escalationMinutesBeforeDue")}
                placeholder="e.g. 20"
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
