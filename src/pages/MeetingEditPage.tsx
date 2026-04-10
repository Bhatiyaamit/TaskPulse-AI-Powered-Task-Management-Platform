import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { CheckCircle2 } from "lucide-react";

const MEETING_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

type Meeting = {
  id: string;
  title: string;
  agenda: string | null;
  meetingLink: string | null;
  preparationNotes: string | null;
  priority: string;
  durationMinutes: number | null;
  computedStatus?: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  datetime: string;
  attendees: {
    userId: string;
    user: { id: string; name: string; username: string };
  }[];
};

export function MeetingEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: users } = useQuery({
    queryKey: ["meeting-attendees"],
    queryFn: async () => {
      const { data } = await api.get<{
        users: { id: string; name: string; username: string }[];
      }>("/api/meetings/eligible-attendees");
      return data.users;
    },
  });

  const meetingQuery = useQuery({
    enabled: Boolean(id),
    queryKey: ["meeting", id],
    queryFn: async () => {
      const { data } = await api.get<{ meeting: Meeting }>(
        `/api/meetings/${id}`,
      );
      return data.meeting;
    },
  });

  const [priority, setPriority] =
    useState<(typeof MEETING_PRIORITIES)[number]>("MEDIUM");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);

  useEffect(() => {
    const m = meetingQuery.data;
    if (!m) return;
    const p = String(m.priority ?? "MEDIUM").toUpperCase();
    setPriority(
      (MEETING_PRIORITIES as readonly string[]).includes(p)
        ? (p as (typeof MEETING_PRIORITIES)[number])
        : "MEDIUM",
    );
    setDurationMinutes(m.durationMinutes ?? 30);
  }, [meetingQuery.data]);

  const update = useMutation({
    mutationFn: (payload: {
      title?: string;
      agenda?: string | null;
      meetingLink?: string | null;
      preparationNotes?: string | null;
      priority?: (typeof MEETING_PRIORITIES)[number];
      durationMinutes?: number | null;
      datetime?: string;
      attendeeIds?: string[];
    }) => api.patch(`/api/meetings/${id}`, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      navigate(`/meetings/${id}`);
    },
  });

  const markCompleted = useMutation({
    mutationFn: async () => api.post(`/api/meetings/${id}/complete`),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["meetings-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["meetings"], exact: false });
      await qc.invalidateQueries({ queryKey: ["meeting", id] });
      navigate(`/meetings/${id}`);
    },
  });

  const m = meetingQuery.data;
  if (!m) return <div className="text-muted-foreground">Loading…</div>;
  const canMarkCompleted =
    m.computedStatus !== "COMPLETED" && m.computedStatus !== "CANCELLED";

  return (
    <CenteredFormPage
      title="Edit meeting"
      description="Update meeting details, time, and attendees."
      back={<FormBackButton onClick={() => navigate(`/meetings/${id}`)} />}
    >
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const attendeeIds = fd.getAll("attendees") as string[];
          update.mutate({
            title: String(fd.get("title") ?? ""),
            agenda: String(fd.get("agenda") ?? "") || null,
            meetingLink: String(fd.get("meetingLink") ?? "") || null,
            preparationNotes: String(fd.get("preparationNotes") ?? "") || null,
            priority,
            durationMinutes,
            datetime: new Date(String(fd.get("datetime"))).toISOString(),
            attendeeIds,
          });
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Weekly ops sync"
              defaultValue={m.title}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda</Label>
            <Textarea
              id="agenda"
              name="agenda"
              placeholder="What should this meeting cover?"
              defaultValue={m.agenda ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetingLink">Meeting link</Label>
            <Input
              id="meetingLink"
              name="meetingLink"
              placeholder="e.g. https://meet.google.com/xxx-xxxx-xxx"
              type="url"
              defaultValue={m.meetingLink ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preparationNotes">Preparation notes</Label>
            <Textarea
              id="preparationNotes"
              name="preparationNotes"
              placeholder="Anything attendees should review or prepare before the meeting…"
              defaultValue={m.preparationNotes ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="datetime">When</Label>
            <Input
              id="datetime"
              name="datetime"
              type="datetime-local"
              defaultValue={new Date(m.datetime).toISOString().slice(0, 16)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duration (minutes)</Label>
              <Input
                id="durationMinutes"
                type="number"
                min={5}
                max={1440}
                step={5}
                placeholder="e.g. 30"
                value={durationMinutes}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDurationMinutes(Number.isFinite(n) ? n : 30);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border bg-background/30 p-2">
              {(users ?? []).map((u) => {
                const checked = m.attendees.some((a) => a.userId === u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="attendees"
                      value={u.id}
                      defaultChecked={checked}
                    />
                    <span>
                      {u.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {u.username}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-border pt-6">
          <Button
            type="button"
            isLoading={markCompleted.isPending}
            disabled={!canMarkCompleted || markCompleted.isPending}
            onClick={() => markCompleted.mutate()}
            className={"mr-auto"}
          >
            <CheckCircle2 className="size-4" />
            Mark as completed
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={update.isPending}
            disabled={update.isPending}
          >
            Save changes
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
