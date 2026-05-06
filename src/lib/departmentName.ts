/** Matches org API: department names are ASCII letters and digits only. */
export const DEPARTMENT_NAME_MAX_LENGTH = 120;

export function sanitizeDepartmentNameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, DEPARTMENT_NAME_MAX_LENGTH);
}
