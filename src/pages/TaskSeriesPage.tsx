import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Repeat } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { taskStatusBadgeClass } from "@/lib/badges";

function formatDay(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function TaskSeriesPage() {
  const { recurrenceGroupId } = useParams<{ recurrenceGroupId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const seriesQuery = useQuery({
    queryKey: ["task-series", recurrenceGroupId],
    enabled: Boolean(recurrenceGroupId),
    queryFn: async () => {
      const { data } = await api.get(`/api/tasks/series/${recurrenceGroupId}`);
      return data.data.tasks as any[];
    },
  });

  const cancelRemaining = useMutation({
    mutationFn: async () => {
      // "delete all tasks where startDate >= today"
      // since scope="future" requires fromTaskId, let's find the first task >= today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tasks = seriesQuery.data || [];
      const futureTask = tasks.find((t) => new Date(t.startDate) >= today);
      if (!futureTask) {
        throw new Error("No remaining tasks found to cancel");
      }
      return api.delete(`/api/tasks/series/${recurrenceGroupId}`, {
        data: { scope: "future", fromTaskId: futureTask.id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-series", recurrenceGroupId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Remaining tasks cancelled");
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message || "Failed to cancel remaining tasks",
      ),
  });

  const tasks = seriesQuery.data || [];
  if (seriesQuery.isLoading)
    return <div className="p-8">Loading series...</div>;
  if (!tasks.length) return <div className="p-8">Series not found</div>;

  const firstTask = tasks[0];
  const pattern = firstTask.recurrencePattern || "Custom";
  const createdBy = firstTask.createdBy?.name || "—";
  const total = tasks.length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-8 px-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 inline-flex gap-2 text-muted-foreground"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl flex items-center gap-2">
          <Repeat className="size-6 text-primary" />
          RECURRING SERIES: {firstTask.title}
        </h1>
        <p className="text-muted-foreground mt-2">
          Pattern: {pattern} • Created by: {createdBy} • Total: {total} tasks
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task, idx) => (
                  <tr key={task.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">{formatDay(task.startDate)}</td>
                    <td className="px-4 py-3">
                      <span className={taskStatusBadgeClass(task.status.code)}>
                        {task.status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {task.assignedTo?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/tasks/${task.id}`}
                        className="text-primary hover:underline hover:text-primary/80 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 border-t border-border pt-6">
        <Button
          onClick={() => navigate(`/tasks/${firstTask.id}/edit?scope=all`)}
          variant="default"
        >
          Edit entire series
        </Button>
        <Button
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to cancel all future remaining tasks in this series?",
              )
            ) {
              cancelRemaining.mutate();
            }
          }}
          disabled={cancelRemaining.isPending}
          variant="destructive"
        >
          Cancel remaining tasks
        </Button>
      </div>
    </div>
  );
}
