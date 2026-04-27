import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { isAxiosError } from "axios";
import { toast } from "sonner";
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
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  CenteredFormPage,
  FormBackButton,
} from "@/components/layout/CenteredFormPage";
import { SearchableTaskSelect } from "@/components/SearchableTaskSelect";

const UNASSIGNED = "__none__";
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

type UserOption = {
  id: string;
  name: string;
  username: string;
  isReviewer?: boolean;
};

type TaskCreateFormValues = {
  title: string;
  description: string;
  priority: (typeof TASK_PRIORITIES)[number];
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
  recurrenceInterval: string;
  recurrenceEndsAt: string;
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
  const [nowMin] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskCreateFormValues>({
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
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
      recurrenceInterval: "1",
      recurrenceEndsAt: "",
      checklistItems: [{ text: "", mandatory: true }],
        parentTaskId: "",
    },
  });
  const statusId = watch("statusId");
  const startDateValue = watch("startDate");
  const isRecurring = watch("isRecurring");
  const recurrencePattern = watch("recurrencePattern");
  const recurrenceInterval = watch("recurrenceInterval");
  const recurrenceEndsAt = watch("recurrenceEndsAt");
  const checklistItemsValue = watch("checklistItems");
  const {
    fields: checklistFields,
    append,
    remove,
  } = useFieldArray({
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


  // Compute estimated series size for live preview
  function estimateSeriesCount(): number | null {
    if (!isRecurring || !startDateValue || !recurrenceEndsAt) return null;
    const start = new Date(startDateValue);
    const until = new Date(recurrenceEndsAt);
    if (isNaN(start.getTime()) || isNaN(until.getTime()) || until <= start)
      return null;
    const interval = Math.max(1, parseInt(recurrenceInterval) || 1);
    let count = 0;
    let cur = new Date(start);
    const MAX = 366;
    while (cur <= until && count < MAX) {
      count++;
      const d = new Date(cur);
      switch (recurrencePattern) {
        case "DAILY":
          d.setDate(d.getDate() + interval);
          break;
        case "WEEKLY":
          d.setDate(d.getDate() + interval * 7);
          break;
        case "MONTHLY":
          d.setMonth(d.getMonth() + interval);
          break;
        case "YEARLY":
          d.setFullYear(d.getFullYear() + interval);
          break;
      }
      cur = d;
    }
    return count;
  }

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post<
        ApiSuccess<{
          task?: { id: string };
          tasks?: { id: string }[];
          createdCount?: number;
        }>
      >("/api/tasks", payload);
      return data.data;
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (err.response?.data?.message ?? err.message)
        : "Could not create task.";
      setFormError(String(msg));
      toast.error(String(msg));
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["tasks"], exact: false });
      await qc.refetchQueries({
        queryKey: ["tasks"],
        exact: false,
        type: "active",
      });
      if (result.createdCount && result.createdCount > 1) {
        setFormError(null);
        toast.success(
          `Created ${result.createdCount} tasks in recurring series.`,
        );
      } else {
        toast.success("Task created");
      }
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
    const dueIso = values.dueDate
      ? new Date(values.dueDate).toISOString()
      : null;
    const nowMs = Date.now();
    if (startIso && new Date(startIso).getTime() < nowMs - 60_000) {
      setFormError("Start date/time cannot be in the past.");
      return;
    }
    if (dueIso && new Date(dueIso).getTime() < nowMs - 60_000) {
      setFormError("Due date/time cannot be in the past.");
      return;
    }
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
    if (values.isRecurring) {
      if (!values.startDate) {
        setFormError("Start date is required for a recurring series.");
        return;
      }
      if (!values.dueDate) {
        setFormError("Due date is required for a recurring series.");
        return;
      }
      if (!values.recurrenceEndsAt) {
        setFormError('"Repeat until" date is required for a recurring series.');
        return;
      }
      const endsAt = new Date(values.recurrenceEndsAt);
      if (endsAt <= new Date(values.startDate)) {
        setFormError('"Repeat until" must be after the start date.');
        return;
      }
      const est = estimateSeriesCount();
      if (est !== null && est < 1) {
        setFormError("No occurrences found in the selected date range.");
        return;
      }
    }
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
      priority: values.priority,
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
      recurrenceInterval: values.isRecurring
        ? Math.max(1, parseInt(values.recurrenceInterval) || 1)
        : null,
      recurrenceEndsAt: values.isRecurring && values.recurrenceEndsAt
        ? new Date(values.recurrenceEndsAt).toISOString()
        : null,
    });
  }

  const userOptions = useMemo(() => [
    { value: UNASSIGNED, label: "Unassigned" },
    ...(assignable ?? []).map((u) => ({ value: u.id, label: u.name || u.username })),
  ], [assignable]);

  const reviewerOptions = useMemo(() => [
    { value: UNASSIGNED, label: "Unassigned" },
    ...(assignable ?? []).filter((u) => Boolean(u.isReviewer)).map((u) => ({
      value: u.id,
      label: u.name || u.username,
    })),
  ], [assignable]);

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
              <Label>Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <SearchableSelect
                    showSearch={false}
                    value={field.value}
                    onChange={(v) => field.onChange(v as (typeof TASK_PRIORITIES)[number])}
                    options={TASK_PRIORITIES.map((p) => ({
                      value: p,
                      label: p.charAt(0) + p.slice(1).toLowerCase(),
                    }))}
                  />
                )}
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
                      <SearchableSelect
                        showSearch
                        value={field.value}
                        onChange={field.onChange}
                        options={userOptions}
                        placeholder="Who owns delivery"
                      />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reviewer</Label>
                  <Controller
                    control={control}
                    name="reviewerId"
                    render={({ field }) => (
                      <SearchableSelect
                        showSearch
                        value={field.value}
                        onChange={field.onChange}
                        options={reviewerOptions}
                        placeholder="Who signs off"
                      />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supporter</Label>
                  <Controller
                    control={control}
                    name="supporterId"
                    render={({ field }) => (
                      <SearchableSelect
                        showSearch
                        value={field.value}
                        onChange={field.onChange}
                        options={userOptions}
                        placeholder="Optional helper"
                      />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Escalation to whom</Label>
                  <Controller
                    control={control}
                    name="escalationToId"
                    render={({ field }) => (
                      <SearchableSelect
                        showSearch
                        value={field.value}
                        onChange={field.onChange}
                        options={userOptions}
                        placeholder="Who should be notified on escalation"
                      />
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
                  min={nowMin}
                  {...register("startDate", {
                    validate: (value) => {
                      if (!value) return true;
                      const picked = new Date(value).getTime();
                      const now = new Date().getTime();
                      if (Number.isNaN(picked)) return true;
                      return (
                        picked >= now - 60_000 ||
                        "Start date/time cannot be in the past."
                      );
                    },
                  })}
                />
                {errors.startDate?.message ? (
                  <p className="text-xs text-destructive">
                    {errors.startDate.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Due</Label>
                <Input
                  id="due"
                  type="datetime-local"
                  min={startDateValue || nowMin}
                  {...register("dueDate", {
                    validate: (value) => {
                      if (!value) return true;
                      const dueMs = new Date(value).getTime();
                      if (Number.isNaN(dueMs)) return true;
                      const now = new Date().getTime();
                      if (dueMs < now - 60_000)
                        return "Due date/time cannot be in the past.";
                      const start = startDateValue;
                      if (!start) return true;
                      const startMs = new Date(start).getTime();
                      if (Number.isNaN(startMs)) return true;
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
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Repeat pattern</Label>
                    <Controller
                      control={control}
                      name="recurrencePattern"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
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
                  <div className="space-y-2">
                    <Label htmlFor="recurrenceInterval">Repeat every (N)</Label>
                    <Input
                      id="recurrenceInterval"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={365}
                      step={1}
                      {...register("recurrenceInterval")}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recurrenceEndsAt">Repeat until</Label>
                    <Input
                      id="recurrenceEndsAt"
                      type="datetime-local"
                      {...register("recurrenceEndsAt")}
                    />
                  </div>
                </div>
                {(() => {
                  const est = estimateSeriesCount();
                  if (est === null) return null;
                  return (
                    <p className="text-xs font-medium text-primary">
                      ≈ {est} task{est !== 1 ? "s" : ""} will be created
                    </p>
                  );
                })()}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Checklist line items</Label>
                      <p className="text-xs text-muted-foreground">
                        Add items users can check or uncheck on each recurring
                        task.
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
