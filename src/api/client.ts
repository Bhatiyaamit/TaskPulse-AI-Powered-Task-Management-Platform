import axios from "axios";
import type { ApiFailure, ApiResponse, ApiSuccess } from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "";

export const api = axios.create({
  baseURL: baseURL || undefined,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let csrfToken: string | null = null;

export async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const { data } = await api.get<{ csrfToken: string }>("/api/csrf");
  csrfToken = data.csrfToken;
  return csrfToken;
}

api.interceptors.request.use(async (config) => {
  if (
    config.method &&
    ["post", "put", "patch", "delete"].includes(config.method) &&
    !config.url?.includes("/auth/login") &&
    !config.url?.includes("/auth/refresh")
  ) {
    const t = await ensureCsrf();
    config.headers["X-CSRF-Token"] = t;
  }
  return config;
});

function isApiResponseShape(v: unknown): v is { success: boolean } {
  return Boolean(v) && typeof v === "object" && "success" in (v as any);
}

api.interceptors.response.use(
  (response) => {
    const data = response.data as unknown;
    if (!isApiResponseShape(data)) return response;
    if ((data as ApiSuccess<unknown>).success === true) return response;

    const err = data as ApiFailure;
    const e = new Error(err.message || "Request failed") as Error & {
      api?: ApiFailure["error"];
      status?: number;
    };
    e.api = err.error;
    e.status = response.status;
    throw e;
  },
  (error) => {
    // Preserve existing axios error shape; pages can still use isAxiosError.
    throw error;
  },
);

/** Multipart upload (avoids forcing JSON Content-Type from the axios instance). */
export async function uploadTaskAttachment(taskId: string, file: File) {
  const token = await ensureCsrf();
  const path = `${baseURL || ""}/api/tasks/${taskId}/attachments`;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": token },
    body: fd,
  });
  if (!res.ok) {
    try {
      const body = (await res.json()) as ApiResponse<unknown>;
      if (body && typeof body === "object" && "success" in body && body.success === false) {
        throw new Error(body.message || res.statusText);
      }
    } catch {
      // fall back to plain text
    }
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  const body = (await res.json()) as ApiResponse<{ attachment: { id: string } }>;
  if (body && typeof body === "object" && "success" in body && body.success === true) {
    return body.data;
  }
  // Legacy/fallback
  return body as any;
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string) {
  await api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`);
}

export async function uploadTaskChecklistAttachment(
  taskId: string,
  itemId: string,
  file: File,
) {
  const token = await ensureCsrf();
  const path = `${baseURL || ""}/api/tasks/${taskId}/checklist/${itemId}/attachments`;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": token },
    body: fd,
  });
  if (!res.ok) throw new Error("Checklist attachment upload failed");
  return res.json();
}
