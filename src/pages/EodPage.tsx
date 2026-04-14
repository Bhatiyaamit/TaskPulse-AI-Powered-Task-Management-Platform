import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardList,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { taskModuleCanList } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overdueBadgeClass, taskStatusBadgeClass } from "@/lib/badges";
import {
  spotlightCardContentLayerClass,
  topLeftSpotlightCardClass,
} from "@/lib/cardFx";

type TaskSummary = {
  id: string;
  title: string;
  dueDate: string | null;
  updatedAt: string;
  status: { code: string; label: string; isTerminal: boolean };
};

type EodTodayResponse = {
  meta: { rangeUtc: { start: string; end: string } };
  completedToday: TaskSummary[];
  workedOnToday: TaskSummary[];
  inProgress: TaskSummary[];
  overdue: TaskSummary[];
  focusNext: TaskSummary[];
};

const eodSectionCardClass = topLeftSpotlightCardClass;
const eodSectionCardLayerClass = spotlightCardContentLayerClass;

function TaskList({
  items,
  emptyText,
  kind = "default",
}: {
  items: TaskSummary[];
  emptyText: string;
  kind?: "default" | "overdue";
}) {
  if (!items.length) {
    return <div className="text-sm text-muted-foreground">{emptyText}</div>;
  }
  const now = Date.now();
  return (
    <div className="space-y-2">
      {items.map((t) => {
        const isOverdue =
          t.dueDate != null &&
          new Date(t.dueDate).getTime() < now &&
          t.status.isTerminal === false &&
          String(t.status.code).toUpperCase() !== "DONE";

        return (
          <Link
            key={t.id}
            to={`/tasks/${t.id}`}
            className={cn(
              "group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
              kind === "overdue"
                ? "border-rose-500/25 bg-rose-500/8 hover:bg-rose-500/10"
                : "border-border bg-background/30 hover:bg-[color-mix(in_oklab,var(--brand),transparent_92%)]",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {t.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={taskStatusBadgeClass(t.status.code)}>
                  {t.status.label}
                </span>
                {isOverdue ? (
                  <span className={overdueBadgeClass()}>Overdue</span>
                ) : null}
                {t.dueDate ? (
                  <span>
                    Due{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(new Date(t.dueDate))}
                  </span>
                ) : null}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        );
      })}
    </div>
  );
}

export function EodPage() {
  const [workedOnOpen, setWorkedOnOpen] = useState(false);
  const me = useMe();
  const canEod = taskModuleCanList(me.data?.permissions);

  const q = useQuery({
    queryKey: ["eod", "today"],
    enabled: canEod,
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<
          {
            completedToday: TaskSummary[];
            workedOnToday: TaskSummary[];
            inProgress: TaskSummary[];
            overdue: TaskSummary[];
            focusNext: TaskSummary[];
          },
          { rangeUtc: { start: string; end: string } }
        >
      >("/api/eod/today");
      return {
        meta: data.meta ?? {
          rangeUtc: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
          },
        },
        completedToday: data.data.completedToday ?? [],
        workedOnToday: data.data.workedOnToday ?? [],
        inProgress: data.data.inProgress ?? [],
        overdue: data.data.overdue ?? [],
        focusNext: data.data.focusNext ?? [],
      } satisfies EodTodayResponse;
    },
  });

  const title = useMemo(() => {
    if (!q.data) return "End of day";
    const d = new Date(q.data.meta.rangeUtc.start);
    return `EOD · ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
    }).format(d)}`;
  }, [q.data]);

  const summaryText = useMemo(() => {
    if (!q.data) return "Generating your summary…";
    const completed = q.data.completedToday?.length ?? 0;
    const worked = q.data.workedOnToday?.length ?? 0;
    const overdue = q.data.overdue?.length ?? 0;
    const focus = q.data.focusNext[0]?.title;
    const parts = [
      `You completed ${completed} task${completed === 1 ? "" : "s"} today`,
      `worked on ${worked} task${worked === 1 ? "" : "s"}`,
      overdue > 0
        ? `and have ${overdue} overdue task${overdue === 1 ? "" : "s"} to address`
        : "and have no overdue tasks",
    ];
    return `${parts.join(" ")}. ${
      focus
        ? `Your next focus could be “${focus}”.`
        : "Pick your next focus from the list below."
    }`;
  }, [q.data]);

  const workedOnPreview = useMemo(
    () => (q.data?.workedOnToday ?? []).slice(0, 3),
    [q.data],
  );
  const workedOnMoreCount = Math.max(
    0,
    (q.data?.workedOnToday.length ?? 0) - workedOnPreview.length,
  );

  if (me.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (me.data && !canEod) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            <ClipboardList className="size-5" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-generated summary from your tasks and today’s activity.
          </p>
        </div>
        <Link to="/tasks" className={cn(buttonVariants())}>
          Go to tasks
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <Card
        className={cn("border-border bg-background/30", eodSectionCardClass)}
      >
        <CardHeader className={eodSectionCardLayerClass}>
          <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
            <ListChecks className="size-4 text-primary" />
            Summary
          </CardTitle>
        </CardHeader>
        <CardContent className={eodSectionCardLayerClass}>
          <p className="text-sm text-muted-foreground">{summaryText}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={eodSectionCardClass}>
          <CardHeader className={eodSectionCardLayerClass}>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Completed today{" "}
              <span className="text-muted-foreground">
                ({q.data?.completedToday.length ?? 0})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className={eodSectionCardLayerClass}>
            <TaskList
              items={q.data?.completedToday ?? []}
              emptyText={q.isLoading ? "Loading…" : "No completed tasks today."}
            />
          </CardContent>
        </Card>

        <Card className={eodSectionCardClass}>
          <CardHeader className={eodSectionCardLayerClass}>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              Worked on today{" "}
              <span className="text-muted-foreground">
                ({q.data?.workedOnToday.length ?? 0})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className={eodSectionCardLayerClass}>
            <TaskList
              items={workedOnPreview}
              emptyText={
                q.isLoading ? "Loading…" : "No activity tracked today."
              }
            />
            {workedOnMoreCount > 0 ? (
              <div className="pt-3">
                <AlertDialog open={workedOnOpen} onOpenChange={setWorkedOnOpen}>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                      />
                    }
                  >
                    More items ({workedOnMoreCount}) available
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Worked on today</AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="max-h-[70vh] overflow-auto pr-1">
                      <TaskList
                        items={q.data?.workedOnToday ?? []}
                        emptyText="No activity tracked today."
                      />
                    </div>
                    <div className="flex justify-end pt-3">
                      <AlertDialogCancel>Close</AlertDialogCancel>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={eodSectionCardClass}>
          <CardHeader className={eodSectionCardLayerClass}>
            <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
              In progress{" "}
              <span className="text-muted-foreground">
                ({q.data?.inProgress.length ?? 0})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className={eodSectionCardLayerClass}>
            <TaskList
              items={q.data?.inProgress ?? []}
              emptyText={q.isLoading ? "Loading…" : "No in-progress tasks."}
            />
          </CardContent>
        </Card>
      </div>

      <Card className={eodSectionCardClass}>
        <CardHeader className={eodSectionCardLayerClass}>
          <CardTitle className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
            Next focus{" "}
            <span className="text-muted-foreground">
              ({q.data?.focusNext.length ?? 0})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className={eodSectionCardLayerClass}>
          <TaskList
            items={q.data?.focusNext ?? []}
            emptyText={q.isLoading ? "Loading…" : "Nothing to focus next."}
          />
        </CardContent>
      </Card>
    </div>
  );
}
