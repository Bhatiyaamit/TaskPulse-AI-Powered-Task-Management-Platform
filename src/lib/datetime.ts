/** `datetime-local` value: `YYYY-MM-DDTHH:mm` */
const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Form → API: keep the clock time the user picked (e.g. 14:00 → …T14:00:00.000Z).
 * Avoids `new Date(local).toISOString()` shifting by timezone offset.
 */
export function datetimeLocalToApiIso(local: string): string {
  const m = DATETIME_LOCAL_RE.exec(local.trim());
  if (!m) return new Date(local).toISOString();
  const sec = m[6] ?? "00";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${sec}.000Z`;
}

/** API → `datetime-local` input (UTC wall-clock, same as mobile). */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Compare “future” using the same wall-clock UTC instant we send to the API. */
export function datetimeLocalToUtcMs(local: string): number {
  const m = DATETIME_LOCAL_RE.exec(local.trim());
  if (!m) return new Date(local).getTime();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
}

export function minDatetimeLocalFromNow(offsetMs = 60_000): string {
  const d = new Date(Date.now() + offsetMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Display API datetimes without local timezone shift (wall-clock stored as UTC). */
export function formatApiDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return iso;
  }
}
