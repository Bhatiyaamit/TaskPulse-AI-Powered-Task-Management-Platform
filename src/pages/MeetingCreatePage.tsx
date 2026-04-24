import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CenteredFormPage,
  FormBackLink,
  FormBackButton,
} from "@/components/layout/CenteredFormPage";
import { meetingModuleCanCreate } from "@/lib/permissions";
import { AlertTriangle } from "lucide-react";

const MEETING_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const MEETING_TYPES = ["ONLINE", "OFFLINE"] as const;

export function MeetingCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const canCreateMeetings = meetingModuleCanCreate(me.data?.permissions);
  const [priority, setPriority] =
    useState<(typeof MEETING_PRIORITIES)[number]>("MEDIUM");
  const [meetingType, setMeetingType] =
    useState<(typeof MEETING_TYPES)[number]>("ONLINE");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [formError, setFormError] = useState<string | null>(null);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [datetimeValue, setDatetimeValue] = useState("");
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());

  // Debounced values for conflict query
  const [debouncedDatetime, setDebouncedDatetime] = useState("");
  const [debouncedAttendees, setDebouncedAttendees] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedDatetime(datetimeValue);
      setDebouncedAttendees([...selectedAttendeeIds].sort());
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [datetimeValue, selectedAttendeeIds]);

  type ConflictEntry = {
    userId: string; userName: string; username: string;
    meetingId: string; meetingTitle: string; meetingDatetime: string;
    meetingDurationMinutes: number | null;
  };
  const conflictsQuery = useQuery({
    queryKey: ["meeting-conflicts", debouncedDatetime, durationMinutes, debouncedAttendees],
    enabled: Boolean(debouncedDatetime) && debouncedAttendees.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: { conflicts: ConflictEntry[] } }>(
        "/api/meetings/conflicts",
        { params: { datetime: new Date(debouncedDatetime).toISOString(), durationMinutes, attendeeIds: debouncedAttendees.join(",") } },
      );
      return data.data.conflicts;
    },
  });
  const conflicts = conflictsQuery.data ?? [];
  const { data: users } = useQuery({
    enabled: canCreateMeetings,
    queryKey: ["meeting-attendees"],
    queryFn: async () => {
      const { data } = await api.get<
        ApiSuccess<{ users: { id: string; name: string; username: string }[] }>
      >("/api/meetings/eligible-attendees");
      return data.data.users;
    },
  });

  const create = useMutation({
    mutationFn: (payload: {
      title: string;
      agenda?: string;
      meetingType?: (typeof MEETING_TYPES)[number];
      meetingLink?: string;
      meetingLocation?: string;
      preparationNotes?: string;
      priority?: (typeof MEETING_PRIORITIES)[number];
      durationMinutes?: number;
      datetime: string;
      attendeeIds: string[];
    }) => api.post("/api/meetings", payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting created");
      const mid = (res.data as ApiSuccess<{ meeting: { id: string } }>).data
        .meeting?.id;
      if (mid) navigate(`/meetings/${mid}`);
      else navigate("/meetings");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? (e.response?.data?.message ?? e.message)
        : "Could not create meeting";
      toast.error(String(msg));
    },
  });

  const filteredUsers = useMemo(() => {
    const q = attendeeSearch.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter((u) =>
      `${u.name} ${u.username}`.toLowerCase().includes(q),
    );
  }, [attendeeSearch, users]);

  if (!canCreateMeetings) {
    return (
      <CenteredFormPage
        title="New meeting"
        description="You don’t have permission to create meetings."
        back={<FormBackLink to="/meetings">Back to meetings</FormBackLink>}
      >
        <p className="text-sm text-muted-foreground">
          Contact a company admin if you need access.
        </p>
      </CenteredFormPage>
    );
  }

  return (
    <CenteredFormPage
      title="New meeting"
      description="Schedule a meeting and capture agenda, time, and attendees."
      back={<FormBackButton onClick={() => navigate("/meetings")} />}
    >
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          const fd = new FormData(e.currentTarget);
          const attendeeIds = fd.getAll("attendees") as string[];
          if (!attendeeIds.length) {
            setFormError("Select at least one attendee.");
            return;
          }
          create.mutate({
            title: String(fd.get("title")),
            agenda: String(fd.get("agenda") ?? ""),
            meetingType,
            meetingLink:
              meetingType === "ONLINE"
                ? String(fd.get("meetingLink") ?? "") || undefined
                : undefined,
            meetingLocation:
              meetingType === "OFFLINE"
                ? String(fd.get("meetingLocation") ?? "") || undefined
                : undefined,
            preparationNotes:
              String(fd.get("preparationNotes") ?? "") || undefined,
            priority,
            durationMinutes,
            datetime: new Date(String(fd.get("datetime"))).toISOString(),
            attendeeIds,
          });
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="title" required>
              Title
            </Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Q4 planning sync"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda</Label>
            <Textarea
              id="agenda"
              name="agenda"
              placeholder="What should this meeting cover?"
            />
          </div>

          <div className="space-y-2">
            <Label>Meeting type</Label>
            <Select
              value={meetingType}
              onValueChange={(v) =>
                setMeetingType(v as (typeof MEETING_TYPES)[number])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="OFFLINE">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {meetingType === "ONLINE" ? (
            <div className="space-y-2">
              <Label htmlFor="meetingLink" required>
                Meeting link
              </Label>
              <Input
                id="meetingLink"
                name="meetingLink"
                placeholder="e.g. https://meet.google.com/xxx-xxxx-xxx"
                type="url"
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="meetingLocation" required>
                Meeting location
              </Label>
              <Input
                id="meetingLocation"
                name="meetingLocation"
                placeholder="e.g. Meeting Room 2, Head Office"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="preparationNotes">Preparation notes</Label>
            <Textarea
              id="preparationNotes"
              name="preparationNotes"
              placeholder="Anything attendees should review or prepare before the meeting…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="datetime" required>
              When
            </Label>
            <Input
              id="datetime"
              name="datetime"
              type="datetime-local"
              required
              value={datetimeValue}
              onChange={(e) => setDatetimeValue(e.target.value)}
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
            <Label required>Attendees</Label>
            <Input
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="Search attendees by name or username"
            />
            <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-border bg-background/30 p-2">
              {filteredUsers.map((u) => {
                const hasConflict = conflicts.some((c) => c.userId === u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="attendees"
                      value={u.id}
                      checked={selectedAttendeeIds.has(u.id)}
                      onChange={(e) => {
                        setSelectedAttendeeIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          return next;
                        });
                      }}
                    />
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span>
                        {u.name}
                        <span className="text-muted-foreground"> · {u.username}</span>
                      </span>
                      {hasConflict && selectedAttendeeIds.has(u.id) && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3" />
                          Conflict
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendees found.</p>
              ) : null}
            </div>

            {conflicts.filter((c) => selectedAttendeeIds.has(c.userId)).length > 0 && (
              <div className="rounded-md border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-500/10">
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4" />
                  Scheduling conflicts detected
                </div>
                <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                  {conflicts
                    .filter((c) => selectedAttendeeIds.has(c.userId))
                    .map((c) => (
                      <li key={`${c.userId}-${c.meetingId}`}>
                        <span className="font-medium">{c.userName}</span> already has &quot;
                        {c.meetingTitle}&quot; at{" "}
                        {new Date(c.meetingDatetime).toLocaleString(undefined, {
                          dateStyle: "medium", timeStyle: "short",
                        })}
                        {c.meetingDurationMinutes
                          ? ` (${c.meetingDurationMinutes} min)`
                          : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {formError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-border pt-6">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Create meeting
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
