export function matrixSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

export type RoleMatrixSource = {
  name: string;
  departmentId: string | null;
  matrixSelections: { module: string; action: string }[];
};

function matrixCellKey(m: string, a: string) {
  return `${m}:${a}`;
}

/** True when name, department scope, and matrix match an existing role row. */
export function roleFormMatchesExisting(
  existing: RoleMatrixSource,
  roleName: string,
  formDeptId: string | null,
  formMatrixSet: Set<string>,
): boolean {
  if (existing.name.trim() !== roleName.trim()) return false;
  if ((existing.departmentId ?? null) !== (formDeptId ?? null)) return false;
  const fromRole = new Set(
    existing.matrixSelections.map((c) =>
      matrixCellKey(c.module, c.action),
    ),
  );
  return matrixSetsEqual(formMatrixSet, fromRole);
}

/** First role in the list that matches the form (name, scope, matrix). */
export function findRoleMatchingForm<T extends RoleMatrixSource>(
  roles: T[],
  roleName: string,
  formDeptId: string | null,
  formMatrixSet: Set<string>,
): T | undefined {
  return roles.find((r) =>
    roleFormMatchesExisting(r, roleName, formDeptId, formMatrixSet),
  );
}

/**
 * One entry per display name (case-insensitive). When several DB rows share a
 * name, keeps the newest by createdAt so the dropdown is not full of repeats.
 */
export function dedupeRolesByDisplayName<
  T extends { name: string; createdAt?: string },
>(roles: T[]): T[] {
  const byName = new Map<string, T>();
  for (const r of roles) {
    const key = r.name.trim().toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, r);
      continue;
    }
    const pt = prev.createdAt ? Date.parse(prev.createdAt) : 0;
    const ct = r.createdAt ? Date.parse(r.createdAt) : 0;
    if (ct >= pt) byName.set(key, r);
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
