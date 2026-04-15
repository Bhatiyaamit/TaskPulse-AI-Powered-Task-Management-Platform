import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
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

type TaskCreateFormValues = {
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

export function TaskCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const meetingId = sp.get("meetingId");
  const returnTo = sp.get("returnTo");
  const { data: me, isPending: mePending } = useMe();
  const canCreateTask = taskModuleCanCreate(me?.permissions);

  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, register, setValue, watch } =
    useForm<TaskCreateFormValues>({
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
  const statusId = watch("statusId");

  const { data: statuses } = useQuery({
    queryKey: ["task-statuses"],
    enabled: canCreateTask,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ statuses: { id: string; label: string; code: string }[] }>
      >("/api/tasks/statuses");
      return data.data.statuses;
    },
  });

  const { data: assignable } = useQuery({
    queryKey: ["task-assignable-users"],
    enabled: canCreateTask,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ users: UserOption[] }>>(
        "/api/tasks/assignable-users",
      );
      return data.data.users;
    },
  });

  useEffect(() => {
    if (!statuses?.length || statusId) return;
    const todo = statuses.find((s) => s.code === "TODO") ?? statuses[0];
    setValue("statusId", todo.id, { shouldDirty: false });
  }, [statuses, statusId, setValue]);

  function userLabelForValue(v: string) {
    if (v === UNASSIGNED) return "Unassigned";
    const u = assignable?.find((x) => x.id === v);
    return u?.name || u?.username || v;
  }

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post<ApiSuccess<{ task: { id: string } }>>(
        "/api/tasks",
        payload,
      );
      return data.data.task;
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      setFormError(ax.response?.data?.message ?? "Could not create task.");
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

  function onSubmit(values: TaskCreateFormValues) {
    setFormError(null);
    if (!values.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!values.statusId) {
      setFormError("Loading statuses… try again in a moment.");
      return;
    }

    const startIso = values.startDate
      ? new Date(values.startDate).toISOString()
      : null;
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
    create.mutate({
      title: values.title.trim(),
      description: values.description.trim() || null,
      steps: values.steps.trim() || null,
      statusId: values.statusId,
      assignedToId: toNull(values.assignedToId),
      reviewerId: toNull(values.reviewerId),
      supporterId: toNull(values.supporterId),
      escalationToId: toNull(values.escalationToId),
      escalationAt: escalationAtIso,
      startDate: startIso,
      dueDate: dueIso,
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
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
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
                    placeholder="Write the steps…"
                  />
                )}
              />
            </div>
          </section>

          <Separator />

          <>
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
          </>

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
