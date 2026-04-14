import { useEffect, useState } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { api } from "@/api/client";
import type { ApiSuccess } from "@/api/types";
import { useMe } from "@/hooks/useAuth";
import { departmentModuleCanUpdate } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";

type DepartmentDetail = {
  id: string;
  name: string;
  code: string | null;
  usersCount: number;
};

export function DepartmentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const canEdit = departmentModuleCanUpdate(me.data?.permissions);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const deptQuery = useQuery({
    queryKey: ["org-department", id],
    enabled: Boolean(id) && canEdit,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<{ department: DepartmentDetail }>>(
        `/api/org/departments/${id}`,
      );
      return data.data.department;
    },
  });

  useEffect(() => {
    const d = deptQuery.data;
    if (!d) return;
    setName(d.name);
    setCode(d.code ?? "");
  }, [deptQuery.data]);

  const update = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/org/departments/${id}`, {
        name: name.trim(),
        code: code.trim() ? code.trim() : null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["org-departments"], exact: false });
      await qc.invalidateQueries({
        queryKey: ["org-departments-paginated"],
        exact: false,
      });
      await qc.invalidateQueries({ queryKey: ["org-department", id] });
      toast.success("Department updated");
      navigate("/departments");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? String(
            (e.response?.data as { message?: string } | undefined)?.message ??
              e.message,
          )
        : "Could not update department";
      toast.error(msg);
    },
  });

  if (me.isPending) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (me.data && !canEdit) {
    return <Navigate to="/departments" replace />;
  }

  if (deptQuery.isLoading) {
    return (
      <CenteredFormPage
        title="Edit department"
        description="Loading…"
        back={<FormBackLink to="/departments">Back to departments</FormBackLink>}
        maxWidthClassName="max-w-xl"
      >
        <p className="text-sm text-muted-foreground">Loading department…</p>
      </CenteredFormPage>
    );
  }

  if (deptQuery.isError || !deptQuery.data) {
    return (
      <CenteredFormPage
        title="Edit department"
        description="Department not found."
        back={<FormBackLink to="/departments">Back to departments</FormBackLink>}
        maxWidthClassName="max-w-xl"
      >
        <p className="text-sm text-muted-foreground">
          This department may have been removed.
        </p>
      </CenteredFormPage>
    );
  }

  const d = deptQuery.data;

  return (
    <CenteredFormPage
      title="Edit department"
      description={`${d.usersCount} user(s) assigned. Update name or code.`}
      back={<FormBackLink to="/departments">Back to departments</FormBackLink>}
      maxWidthClassName="max-w-xl"
    >
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Department name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-code">Code (optional)</Label>
            <Input
              id="dept-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={50}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6">
          <Button type="submit" disabled={update.isPending || !name.trim()}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
