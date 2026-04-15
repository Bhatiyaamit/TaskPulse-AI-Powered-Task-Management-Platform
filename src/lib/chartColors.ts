export const chartPalette = [
  "#FFCF2B", // brand
  "#22C55E", // green
  "#38BDF8", // sky
  "#A78BFA", // violet
  "#FB7185", // rose
  "#F97316", // orange
  "#34D399", // emerald
  "#60A5FA", // blue
  "#FBBF24", // amber
  "#F472B6", // pink
] as const;

export function chartColor(index: number) {
  const i = Number.isFinite(index) ? Math.abs(index) : 0;
  return chartPalette[i % chartPalette.length];
}

function normalizeStatusKey(status: string) {
  return String(status || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

const STATUS_COLOR_MAP: Record<string, string> = {
  DONE: "#22C55E", // green
  IN_PROGRESS: "#FFCF2B", // brand / primary
  WIP: "#FFCF2B", // brand / primary
  WAIT_SUPPORT: "#38BDF8", // sky
  REVIEW: "#A78BFA", // violet
  SENT_BACK: "#F97316", // orange
  CLOSED: "#60A5FA", // blue
  ESCALATED: "#FB7185", // rose
  BLOCKED: "#FBBF24", // amber
};

export function statusChartColor(status: string, index = 0) {
  const key = normalizeStatusKey(status);
  return STATUS_COLOR_MAP[key] ?? chartColor(index);
}
