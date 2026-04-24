import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCircle2, CornerDownRight, GripVertical, Lock } from "lucide-react";
import { api } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { useMe } from "@/hooks/useAuth";
import { hierarchyModuleCanUpdate } from "@/lib/permissions";

type OrgMember = {
  id: string;
  name: string;
  username: string;
  managerId: string | null;
  role: { id: string; name: string; code: string };
  department: { id: string; name: string } | null;
};

function OrgNode({
  member,
  members,
  onDropUser,
  canUpdate,
}: {
  member: OrgMember;
  members: OrgMember[];
  onDropUser: (userId: string, managerId: string | null) => void;
  canUpdate: boolean;
}) {
  const children = members.filter((m) => m.managerId === member.id);
  const [dragCounter, setDragCounter] = useState(0);
  const isDragOver = dragCounter > 0;

  const isAdmin =
    member.role.code === "COMPANY_ADMIN" || member.role.code === "SUPER_ADMIN";
  const isDraggable = canUpdate && !isAdmin;

  return (
    <div className="flex flex-col ml-7 relative">
      {/* Visual thread line to children */}
      {children.length > 0 && (
        <div className="absolute top-9 bottom-0 left-4.75 w-px bg-border/60" />
      )}

      <div
        className={`flex items-start gap-3 py-2 px-3 -mx-3 relative z-10 rounded-lg transition-all border-2 ${
          isDraggable ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isDragOver && canUpdate
            ? "border-primary border-dashed bg-primary/5"
            : isAdmin
              ? "border-amber-500/20 bg-amber-500/10 dark:bg-amber-500/15 shadow-sm"
              : "border-transparent hover:bg-muted/40"
        }`}
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => {
          e.dataTransfer.setData(
            "application/json",
            JSON.stringify({ id: member.id }),
          );
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragOver={canUpdate ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
        } : undefined}
        onDragEnter={canUpdate ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragCounter((c) => c + 1);
        } : undefined}
        onDragLeave={canUpdate ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragCounter((c) => c - 1);
        } : undefined}
        onDrop={canUpdate ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragCounter(0);
          try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            if (data.id === member.id) return;
            onDropUser(data.id, member.id);
          } catch (err) {}
        } : undefined}
      >
        <div className="flex items-center justify-center shrink-0 w-5 h-10 pointer-events-none opacity-40">
          {isAdmin ? (
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-500 opacity-60" />
          ) : isDraggable ? (
            <GripVertical className="w-4 h-4" />
          ) : null}
        </div>

        <div className="flex items-center justify-center min-w-10 h-10 rounded-full bg-muted border border-border shadow-sm text-muted-foreground/80 pointer-events-none">
          <UserCircle2 className="w-5 h-5" />
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 pointer-events-none mt-0.5">
          <span className="font-semibold text-foreground truncate block text-sm">
            {member.name}
          </span>
          <div className="flex items-center gap-2 flex-wrap mt-px">
            <span className="text-xs text-muted-foreground bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md truncate">
              {member.role.name}
            </span>
            {member.department && (
              <span className="text-xs text-blue-600/80 dark:text-blue-400/80 italic pr-2 truncate">
                {member.department.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {children.length > 0 && (
        <div className="flex flex-col mt-1">
          {children.map((child) => (
            <div key={child.id} className="relative">
              {/* Corner branch joining the thread to the child node */}
              <div className="absolute top-6 -left-1.25 text-border/60 pointer-events-none">
                <CornerDownRight className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <OrgNode
                member={child}
                members={members}
                onDropUser={onDropUser}
                canUpdate={canUpdate}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RolesPage() {
  const qc = useQueryClient();
  const me = useMe();
  const canUpdate = hierarchyModuleCanUpdate(me.data?.permissions);

  const orgQuery = useQuery({
    queryKey: ["org-team-hierarchy"],
    queryFn: async () => {
      const { data } = await api.get<{ data: OrgMember[] }>(
        "/api/team/members",
        {
          params: { pageSize: 100 },
        },
      );
      return data.data;
    },
  });

  const moveUserMutation = useMutation({
    mutationFn: async ({
      userId,
      managerId,
    }: {
      userId: string;
      managerId: string | null;
    }) => {
      await api.patch(`/api/tenant/users/${userId}`, { managerId });
    },
    onSuccess: () => {
      toast.success("Hierarchy updated successfully");
      qc.invalidateQueries({ queryKey: ["org-team-hierarchy"] });
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.data?.message) {
        toast.error(err.response.data.message);
      } else {
        toast.error("Failed to update hierarchy");
      }
    },
  });

  const handleDropUser = (userId: string, managerId: string | null) => {
    moveUserMutation.mutate({ userId, managerId });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10 pt-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Role Hierarchy
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            {canUpdate
              ? "Drag and drop team members to reassign reporting lines. Subordinates will automatically move with their managers."
              : "View the reporting structure of your organization."}
          </p>
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardContent className="p-6">
          {orgQuery.isLoading ? (
            <div className="text-center py-20 text-muted-foreground">
              Loading org chart...
            </div>
          ) : orgQuery.isError ? (
            <div className="text-center py-20 text-destructive">
              Failed to load the team structure.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto pb-8 -ml-6">
                {(() => {
                  const members = orgQuery.data || [];
                  const rootNodes = members.filter((m) => !m.managerId);

                  if (members.length === 0) {
                    return (
                      <div className="text-center py-10 text-muted-foreground ml-6">
                        No team members found.
                      </div>
                    );
                  }

                  return rootNodes.map((root) => (
                    <OrgNode
                      key={root.id}
                      member={root}
                      members={members}
                      onDropUser={handleDropUser}
                      canUpdate={canUpdate}
                    />
                  ));
                })()}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
