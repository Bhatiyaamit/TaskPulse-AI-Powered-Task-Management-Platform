import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CenteredFormPage,
  FormBackLink,
} from "@/components/layout/CenteredFormPage";

export function DepartmentCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ department: { id: string } }>(
        "/api/org/departments",
        {
          name: name.trim(),
          code: code.trim() ? code.trim() : null,
          branchId: null,
        },
      );
      return data.department;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["org-departments"],
        exact: false,
      });
      await qc.invalidateQueries({
        queryKey: ["org-departments-paginated"],
        exact: false,
      });
      toast.success("Department created");
      navigate("/departments");
    },
    onError: (e) => {
      const msg = isAxiosError(e)
        ? ((e.response?.data as { error?: string } | undefined)?.error ??
          (e.response?.data as { error?: { message?: string } } | undefined)
            ?.error?.message ??
          e.message)
        : "Could not create department";
      toast.error(String(msg));
    },
  });

  return (
    <CenteredFormPage
      title="Add department"
      description="Create a department to organize users and work."
      back={<FormBackLink to="/departments">Back to departments</FormBackLink>}
      maxWidthClassName="max-w-xl"
    >
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="dept-name" required>
              Department name
            </Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Operations"
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
              placeholder="e.g. OPS"
              maxLength={50}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end border-t border-border pt-6">
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create department"}
          </Button>
        </div>
      </form>
    </CenteredFormPage>
  );
}
