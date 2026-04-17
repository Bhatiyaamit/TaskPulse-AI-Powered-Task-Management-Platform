import { useQuery } from "@tanstack/react-query";
import { UserCircle2, CornerDownRight } from "lucide-react";
import { api } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";

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
}: {
  member: OrgMember;
  members: OrgMember[];
}) {
  const children = members.filter((m) => m.managerId === member.id);

  return (
    <div className="flex flex-col ml-6 relative">
      {/* Visual thread line to children */}
      {children.length > 0 && (
        <div className="absolute top-9 bottom-0 left-4.75 w-px bg-border/60" />
      )}

      <div className="flex items-start gap-4 py-3 relative z-10">
        <div className="flex items-center justify-center min-w-10 h-10 rounded-full bg-muted border border-border shadow-sm text-muted-foreground/80">
          <UserCircle2 className="w-5 h-5" />
        </div>

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-semibold text-foreground truncate block">
            {member.name}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex flex-col">
          {children.map((child) => (
            <div key={child.id} className="relative">
              {/* Corner branch joining the thread to the child node */}
              <div className="absolute top-6 left-[-5px] text-border/60 pointer-events-none">
                <CornerDownRight className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <OrgNode member={child} members={members} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RolesPage() {
  const orgQuery = useQuery({
    queryKey: ["org-team-hierarchy"],
    queryFn: async () => {
      const { data } = await api.get<{ data: OrgMember[] }>(
        "/api/team/members",
        {
          params: { pageSize: 100 }, // Backend limit is 100
        },
      );
      return data.data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10 pt-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Role Hierarchy
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            View your company's organization chart based on reporting lines.
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
                  <OrgNode key={root.id} member={root} members={members} />
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
