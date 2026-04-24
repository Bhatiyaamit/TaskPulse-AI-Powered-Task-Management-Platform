import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import { SearchableTaskSelect } from "@/components/SearchableTaskSelect";

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
  estimatedHours: string;
  isRecurring: boolean;
  recurrencePattern: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  checklistItems: { text: string; mandatory: boolean }[];
  parentTaskId: string;
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
  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } =
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
        estimatedHours: "",
        isRecurring: false,
        recurrencePattern: "DAILY",
        checklistItems: [{ text: "", mandatory: true }],
        parentTaskId: "",
      },
    });
  const statusId = watch("statusId");
  const startDateValue = watch("startDate");
  const isRecurring = watch("isRecurring");
  const checklistItemsValue = watch("checklistItems");
  const { fields: checklistFields, append, remove } = useFieldArray({
    control,
    name: "checklistItems",
  });

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

  const { data: parentCandidates } = useQuery({
    queryKey: ["tasks-for-parent-selector"],
    enabled: canCreateTask,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ tasks: { id: string; title: string }[] }>
      >("/api/tasks/for-parent-selector");
      return data.data.tasks;
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
    if (startIso && dueIso) {
      const startMs = new Date(startIso).getTime();
      const dueMs = new Date(dueIso).getTime();
      if (dueMs < startMs) {
        setFormError("Due date/time cannot be earlier than Start date/time.");
        return;
      }
    }
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
    const cleanedChecklistItems = (values.checklistItems ?? [])
      .map((item) => ({
        text: item.text.trim(),
        mandatory: Boolean(item.mandatory),
      }))
      .filter((item) => item.text);
    if (values.isRecurring && cleanedChecklistItems.length === 0) {
      setFormError("Add at least one checklist item for recurring task.");
      return;
    }
    const estimatedHoursRaw = values.estimatedHours.trim();
    let estimatedMinutes: number | null = null;
    if (estimatedHoursRaw !== "") {
      const hours = Number(estimatedHoursRaw);
      if (!Number.isFinite(hours) || hours <= 0) {
        setFormError("Estimated time must be a positive number of hours.");
        return;
      }
      if (hours > 999) {
        setFormError("Estimated time is too large.");
        return;
      }
      estimatedMinutes = Math.round(hours * 60);
      if (estimatedMinutes <= 0) {
        setFormError("Estimated time must be at least 1 minute.");
        return;
      }
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
      estimatedMinutes,
      meetingId: meetingId?.trim() ? meetingId : null,
      checklistItems: cleanedChecklistItems,
      isRecurring: values.isRecurring,
      recurrencePattern: values.isRecurring ? values.recurrencePattern : null,
      parentTaskId: values.parentTaskId.trim() || null,
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
            <div className="space-y-2">
              <Label htmlFor="parentTaskId">Parent task</Label>
              <p className="text-xs text-muted-foreground">
                Link this task as a sub-task of an existing task.
              </p>
              <Controller
                control={control}
                name="parentTaskId"
                render={({ field }) => (
                  <SearchableTaskSelect
                    tasks={parentCandidates ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="No parent task (optional)"
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
                  min={startDateValue || undefined}
                  {...register("dueDate", {
                    validate: (value) => {
                      const start = startDateValue;
                      if (!start || !value) return true;
                      const startMs = new Date(start).getTime();
                      const dueMs = new Date(value).getTime();
                      if (Number.isNaN(startMs) || Number.isNaN(dueMs)) return true;
                      return (
                        dueMs >= startMs ||
                        "Due date/time cannot be earlier than Start date/time."
                      );
                    },
                  })}
                />
                {errors.dueDate?.message ? (
                  <p className="text-xs text-destructive">
                    {errors.dueDate.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="estimatedHours">Estimated time (hours)</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  step="any"
                  placeholder="e.g. 1.5"
                  {...register("estimatedHours", {
                    validate: (value) => {
                      const v = String(value ?? "").trim();
                      if (!v) return true;
                      const n = Number(v);
                      if (!Number.isFinite(n) || n <= 0) {
                        return "Enter a positive number in hours.";
                      }
                      if (n > 999) return "Estimated time is too large.";
                      return true;
                    },
                  })}
                />
                {errors.estimatedHours?.message ? (
                  <p className="text-xs text-destructive">
                    {errors.estimatedHours.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
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
            </div>
            <div className="pt-2">
              <Label className="inline-flex items-center gap-2">
                <input type="checkbox" {...register("isRecurring")} />
                Create as recurring task
              </Label>
            </div>
          </section>

          {isRecurring ? (
            <>
              <Separator />

              <section className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Recurrence & Checklist
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Recurring pattern</Label>
                    <Controller
                      control={control}
                      name="recurrencePattern"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAILY">Daily</SelectItem>
                            <SelectItem value="WEEKLY">Weekly</SelectItem>
                            <SelectItem value="MONTHLY">Monthly</SelectItem>
                            <SelectItem value="YEARLY">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-3 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Checklist line items</Label>
                        <p className="text-xs text-muted-foreground">
                          Add items users can check or uncheck on each recurring task.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append({ text: "", mandatory: false })}
                      >
                        Add item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {checklistFields.map((field, index) => (
                        <div
                          key={field.id}
                          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                        >
                          <Input
                            {...register(`checklistItems.${index}.text`)}
                            placeholder="Line item text"
                          />
                          <Label className="inline-flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              {...register(`checklistItems.${index}.mandatory`)}
                            />
                            <span
                              className="text-destructive"
                              aria-label="Mandatory checklist item"
                              title="Mandatory"
                            >
                              *
                            </span>
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            disabled={
                              checklistFields.length === 1 &&
                              !checklistItemsValue?.[0]?.text?.trim()
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
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
