import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Lock,
  Search,
  UserCircle2,
} from "lucide-react";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  SearchableSelect,
  type SelectOption,
} from "@/components/SearchableSelect";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useMe } from "@/hooks/useAuth";
import { hierarchyModuleCanUpdate } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type OrgMember = {
  id: string;
  name: string;
  username: string;
  managerId: string | null;
  role: { id: string; name: string; code: string };
  department: { id: string; name: string } | null;
};

function memberMatchesQuery(m: OrgMember, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    m.name.toLowerCase().includes(s) ||
    m.username.toLowerCase().includes(s) ||
    m.role.name.toLowerCase().includes(s) ||
    (m.department?.name.toLowerCase().includes(s) ?? false)
  );
}

function directManager(
  member: OrgMember,
  byId: Map<string, OrgMember>,
): OrgMember | null {
  if (!member.managerId) return null;
  return byId.get(member.managerId) ?? null;
}

function reportingPathNames(member: OrgMember, byId: Map<string, OrgMember>): string {
  const parts: string[] = [];
  let mid: string | null = member.managerId;
  while (mid) {
    const m = byId.get(mid);
    if (!m) break;
    parts.push(`${m.name} (@${m.username})`);
    mid = m.managerId;
  }
  parts.reverse();
  return parts.join(" › ");
}

/** Everyone in `member`'s subtree (direct + indirect reports) — cannot be chosen as their manager. */
function descendantIds(memberId: string, members: OrgMember[]): Set<string> {
  const out = new Set<string>();
  const stack: string[] = [];
  for (const m of members) {
    if (m.managerId === memberId) stack.push(m.id);
  }
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const m of members) {
      if (m.managerId === id) stack.push(m.id);
    }
  }
  return out;
}

function managerPickerOptions(member: OrgMember, members: OrgMember[]): SelectOption[] {
  const blocked = descendantIds(member.id, members);
  blocked.add(member.id);
  const eligible = members.filter((m) => !blocked.has(m.id));
  const nameNorm = (m: OrgMember) =>
    (m.name || "").trim().toLowerCase() || m.username.toLowerCase();
  const nameDupCount = new Map<string, number>();
  for (const m of eligible) {
    const k = nameNorm(m);
    nameDupCount.set(k, (nameDupCount.get(k) ?? 0) + 1);
  }
  const opts: SelectOption[] = eligible.map((m) => {
    const base = (m.name || "").trim() || m.username;
    const dup = (nameDupCount.get(nameNorm(m)) ?? 0) > 1;
    return {
      value: m.id,
      label: dup ? `${base} · ${m.username}` : base,
    };
  });
  opts.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  return opts;
}

function visibleMemberIds(members: OrgMember[], q: string): Set<string> | null {
  if (!q.trim()) return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  const keep = new Set<string>();

  for (const m of members) {
    if (!memberMatchesQuery(m, q)) continue;
    keep.add(m.id);
    let mid: string | null = m.managerId;
    while (mid) {
      keep.add(mid);
      mid = byId.get(mid)?.managerId ?? null;
    }
    const stack = [m.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const c of members) {
        if (c.managerId === id) {
          keep.add(c.id);
          stack.push(c.id);
        }
      }
    }
  }
  return keep;
}

async function fetchAllTeamMembers(): Promise<OrgMember[]> {
  const pageSize = 500;
  let page = 1;
  const all: OrgMember[] = [];
  let total = Infinity;
  while (all.length < total && page <= 40) {
    const { data } = await api.get<
      ApiSuccess<OrgMember[]> & { meta?: { total: number } }
    >("/api/team/members", {
      params: {
        page,
        pageSize,
        sortBy: "name",
        sortDir: "asc",
        hierarchyScope: "all",
      },
    });
    const batch = data.data ?? [];
    const meta = data.meta as { total?: number } | undefined;
    all.push(...batch);
    total = meta?.total ?? all.length;
    if (batch.length < pageSize) break;
    page += 1;
  }
  return all;
}

function OrgNode({
  member,
  members,
  memberById,
  onManagerSelect,
  canUpdate,
  depth,
  visibleIds,
  expandedIds,
  onToggleExpand,
  managerUpdatingId,
}: {
  member: OrgMember;
  members: OrgMember[];
  memberById: Map<string, OrgMember>;
  onManagerSelect: (userId: string, managerId: string | null) => void;
  canUpdate: boolean;
  depth: number;
  visibleIds: Set<string> | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  managerUpdatingId: string | null;
}) {
  const mgr = directManager(member, memberById);
  const pathTitle = mgr ? reportingPathNames(member, memberById) : "";

  const managerOptions = useMemo(
    () => managerPickerOptions(member, members),
    [member.id, member.managerId, members],
  );

  const selectValue = member.managerId ?? "";

  const children = members.filter((m) => m.managerId === member.id);
  const filteredChildren = visibleIds
    ? children.filter((c) => visibleIds.has(c.id))
    : children;

  if (visibleIds && !visibleIds.has(member.id)) return null;

  const isAdmin =
    member.role.code === "COMPANY_ADMIN" || member.role.code === "SUPER_ADMIN";
  const isExpanded = expandedIds.has(member.id);
  const showChildren = filteredChildren.length > 0 && isExpanded;

  return (
    <div className={cn("flex flex-col relative", depth > 0 && "ml-5 sm:ml-6")}>
      {filteredChildren.length > 0 && (
        <div
          className="absolute top-8 bottom-0 left-3 w-px bg-border/50 sm:left-3.5"
          aria-hidden
        />
      )}

      <div
        title={pathTitle || undefined}
        className={cn(
          "group flex min-w-0 flex-wrap items-center gap-2 rounded-md border transition-colors sm:flex-nowrap sm:gap-2.5",
          "border-transparent py-1 px-1.5 sm:py-1.5 sm:px-2 -mx-1",
          isAdmin
            ? "border-amber-500/20 bg-amber-500/10 dark:bg-amber-500/15"
            : "hover:bg-muted/50",
        )}
      >
        <div className="flex w-6 shrink-0 items-center justify-center">
          {filteredChildren.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground"
              onClick={() => onToggleExpand(member.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          ) : (
            <span className="inline-block w-7" />
          )}
        </div>

        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          {isAdmin ? (
            <Lock className="size-3.5 text-amber-600 dark:text-amber-500" />
          ) : (
            <UserCircle2 className="size-3.5 opacity-50" />
          )}
        </div>

        <div className="min-w-0 flex-1 basis-[min(100%,14rem)] sm:basis-auto">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {member.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              @{member.username}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
            {mgr ? (
              <>
                <span className="font-medium text-foreground/80">Reports to:</span>{" "}
                <span className="text-foreground/90">{mgr.name}</span>
                <span className="text-muted-foreground"> @{mgr.username}</span>
              </>
            ) : (
              <span className="italic text-muted-foreground/90">
                Top of hierarchy — no manager
              </span>
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="max-w-40 truncate rounded border border-border/60 bg-muted/40 px-1.5 py-px text-[10px] text-muted-foreground sm:max-w-56 sm:text-xs">
              {member.role.name}
            </span>
            {member.department ? (
              <span className="max-w-32 truncate text-[10px] italic text-blue-600/80 dark:text-blue-400/80 sm:text-xs">
                {member.department.name}
              </span>
            ) : null}
          </div>
        </div>

        {canUpdate && !isAdmin ? (
          <div className="w-full min-w-0 shrink-0 sm:w-[min(100%,16rem)]">
            <SearchableSelect
              className="w-full"
              options={managerOptions}
              value={selectValue}
              disabled={managerUpdatingId === member.id}
              placeholder="Select manager"
              showSearch
              onChange={(value) => {
                if (!value) return;
                if (value === member.managerId) return;
                onManagerSelect(member.id, value);
              }}
            />
          </div>
        ) : null}
      </div>

      {showChildren ? (
        <div className="mt-0.5 flex flex-col">
          {filteredChildren.map((child) => (
            <div key={child.id} className="relative">
              <div className="pointer-events-none absolute top-4 -left-0.5 text-border/60 sm:-left-0.5">
                <CornerDownRight className="size-4" strokeWidth={1.5} />
              </div>
              <OrgNode
                member={child}
                members={members}
                memberById={memberById}
                onManagerSelect={onManagerSelect}
                canUpdate={canUpdate}
                depth={depth + 1}
                visibleIds={visibleIds}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                managerUpdatingId={managerUpdatingId}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RolesPage() {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const canUpdate = hierarchyModuleCanUpdate(meData?.permissions);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const expandedSeededRef = useRef(false);

  const orgQuery = useQuery({
    queryKey: ["org-team-hierarchy"],
    queryFn: fetchAllTeamMembers,
  });

  const members = orgQuery.data ?? [];
  const visibleIds = useMemo(
    () => visibleMemberIds(members, search),
    [members, search],
  );

  useEffect(() => {
    if (!visibleIds?.size) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [search, visibleIds]);

  useEffect(() => {
    if (!members.length || expandedSeededRef.current) return;
    expandedSeededRef.current = true;
    if (members.length <= 60) {
      setExpandedIds(new Set(members.map((m) => m.id)));
    } else {
      setExpandedIds(
        new Set(members.filter((m) => !m.managerId).map((m) => m.id)),
      );
    }
  }, [members]);

  const onToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const assignManagerMutation = useMutation({
    mutationFn: async ({
      userId,
      managerId,
    }: {
      userId: string;
      managerId: string | null;
    }) => {
      await api.patch(`/api/tenant/users/${userId}`, { managerId });
    },
    onMutate: async ({ userId, managerId }) => {
      await qc.cancelQueries({ queryKey: ["org-team-hierarchy"] });
      const prev = qc.getQueryData<OrgMember[]>(["org-team-hierarchy"]);
      if (prev) {
        qc.setQueryData(
          ["org-team-hierarchy"],
          prev.map((m) =>
            m.id === userId ? { ...m, managerId } : m,
          ),
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["org-team-hierarchy"], ctx.prev);
      }
      if (isAxiosError(err) && err.response?.data?.message) {
        toast.error(String(err.response.data.message));
      } else {
        toast.error("Failed to update reporting line");
      }
    },
    onSuccess: () => {
      toast.success("Manager updated");
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["org-team-hierarchy"] });
      await qc.invalidateQueries({ queryKey: ["team-members"], exact: false });
    },
  });

  const handleManagerSelect = (userId: string, managerId: string | null) => {
    assignManagerMutation.mutate({ userId, managerId });
  };

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const rootNodes = members.filter((m) => !m.managerId);

  const managerUpdatingId =
    assignManagerMutation.isPending && assignManagerMutation.variables
      ? assignManagerMutation.variables.userId
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-primary">
            Role hierarchy
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {canUpdate
              ? "Assign who each person reports to using the manager dropdown on each row. The tree updates as soon as you pick someone; hover a row for the full manager chain."
              : "Each row shows who that person reports to. Hover a row for the full manager chain."}
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, username, role, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search hierarchy"
        />
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-4 sm:p-5">
          {orgQuery.isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading org chart…
            </div>
          ) : orgQuery.isError ? (
            <div className="py-16 text-center text-sm text-destructive">
              Failed to load the team structure.
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No team members found.
            </div>
          ) : (
            <>
              {members.length >= 500 ? (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                  Large directory ({members.length} people loaded). Use search
                  and expand only the branches you need.
                </p>
              ) : null}
              <div className="max-h-[min(70vh,52rem)] overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-background/30 p-2 sm:p-3">
                {rootNodes.map((root) => (
                  <OrgNode
                    key={root.id}
                    member={root}
                    members={members}
                    memberById={memberById}
                    onManagerSelect={handleManagerSelect}
                    canUpdate={canUpdate}
                    depth={0}
                    visibleIds={visibleIds}
                    expandedIds={expandedIds}
                    onToggleExpand={onToggleExpand}
                    managerUpdatingId={managerUpdatingId}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
