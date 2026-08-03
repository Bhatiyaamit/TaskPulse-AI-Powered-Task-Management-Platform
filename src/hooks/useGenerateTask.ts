/**
 * useGenerateTask.ts
 *
 * Custom hook that calls POST /api/ai/generate-task and streams the response.
 * Accumulates the partial JSON text chunks and attempts an incremental parse
 * so the UI can update fields as the model generates them.
 *
 * Returns:
 *   - generate(prompt): kicks off a generation
 *   - partial: best-effort partial parse of what's arrived so far
 *   - isStreaming: true while chunks are still arriving
 *   - error: error message if generation failed
 *   - reset: clears state back to idle
 */

import { useState, useCallback, useRef } from "react";
import { api } from "@/api/client";

export interface GeneratedTaskDraft {
  title?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  tags?: string[];
  checklistItems?: { text: string; mandatory: boolean }[];
}

/** Best-effort partial JSON parse — returns null on any parse error. */
function tryParsePartial(text: string): GeneratedTaskDraft | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Try direct parse first (complete JSON)
  try {
    return JSON.parse(trimmed) as GeneratedTaskDraft;
  } catch {
    // Try to close open braces/brackets progressively so we get partial data
    // This is a simple heuristic — it handles most streaming cases.
    let attempt = trimmed;
    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;
    const diff = opens - closes;
    if (diff > 0) attempt += "}".repeat(diff);
    try {
      return JSON.parse(attempt) as GeneratedTaskDraft;
    } catch {
      return null;
    }
  }
}

export function useGenerateTask() {
  const [partial, setPartial] = useState<GeneratedTaskDraft | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPartial(null);
    setIsStreaming(false);
    setError(null);
  }, []);

  const generate = useCallback(async (prompt: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPartial(null);
    setError(null);
    setIsStreaming(true);

    try {
      // Get CSRF token for the POST request
      const { ensureCsrf } = await import("@/api/client");
      const csrfToken = await ensureCsrf();

      const baseURL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
      const res = await fetch(`${baseURL}/api/ai/generate-task`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok || !res.body) {
        let msg = "AI generation failed.";
        try {
          const body = await res.json() as { message?: string };
          if (body.message) msg = body.message;
        } catch { /* ignore */ }
        setError(msg);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const parsed = tryParsePartial(accumulated);
        if (parsed) setPartial(parsed);
      }

      // Final parse on complete text
      const final = tryParsePartial(accumulated);
      setPartial(final);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // User cancelled
      setError((err as Error).message ?? "Generation failed.");
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { generate, partial, isStreaming, error, reset };
}
