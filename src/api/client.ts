import axios from "axios";

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
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<{ attachment: { id: string } }>;
}
