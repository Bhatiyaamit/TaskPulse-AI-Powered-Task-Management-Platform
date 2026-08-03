/**
 * AiTaskGeneratorPanel.tsx
 *
 * A collapsible panel that sits at the top of TaskCreatePage.
 * The user types a natural language prompt, clicks "Generate", and the AI
 * streams back a structured task draft. When satisfied, clicking
 * "Use this draft" calls onApply() which pre-fills the parent form.
 *
 * The panel never saves anything to the DB — it just calls onApply()
 * with the generated values and lets the user review/edit before
 * submitting through the normal Create Task flow.
 */

import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useGenerateTask, type GeneratedTaskDraft } from "@/hooks/useGenerateTask";

interface AiTaskGeneratorPanelProps {
  /** Called when the user accepts the draft — parent should setValue() each field. */
  onApply: (draft: GeneratedTaskDraft) => void;
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

function minutesToDisplay(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function AiTaskGeneratorPanel({ onApply }: AiTaskGeneratorPanelProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const { generate, partial, isStreaming, error, reset } = useGenerateTask();

  function handleGenerate() {
    if (!prompt.trim() || isStreaming) return;
    generate(prompt.trim());
  }

  function handleApply() {
    if (!partial) return;
    onApply(partial);
    setOpen(false);
    reset();
    setPrompt("");
  }

  function handleDiscard() {
    reset();
    setPrompt("");
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-primary/10"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Sparkles className="size-4 text-primary shrink-0" />
        <span className="flex-1 text-sm font-medium text-primary">
          Generate with AI
        </span>
        <span className="text-xs text-muted-foreground mr-1">
          {isStreaming ? "Generating…" : open ? "Close" : "Describe your task in plain English"}
        </span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expandable body */}
      {open && (
        <div className="border-t border-primary/10 px-4 pb-4 pt-3 space-y-4">
          {/* Prompt input */}
          {!partial && (
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">Describe the task</Label>
              <Textarea
                id="ai-prompt"
                rows={3}
                placeholder='e.g. "Prepare for React interview in 2 weeks" or "Fix login page bug before Friday release"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate();
                }}
                disabled={isStreaming}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Press <kbd className="rounded border bg-muted px-1 font-mono text-xs">Ctrl+Enter</kbd> to generate
              </p>
              {error && (
                <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/10 px-2 py-1">
                  {error}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isStreaming}
                isLoading={isStreaming}
                className="gap-1.5"
              >
                <Sparkles className="size-3.5" />
                {isStreaming ? "Generating…" : "Generate"}
              </Button>
            </div>
          )}

          {/* Streaming / result preview */}
          {isStreaming && !partial && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse py-1">
              <Sparkles className="size-4 text-primary" />
              Thinking…
            </div>
          )}

          {partial && (
            <div className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {isStreaming ? "Generating preview…" : "Generated draft"}
                </p>
                {!isStreaming && (
                  <button
                    type="button"
                    aria-label="Discard draft"
                    onClick={handleDiscard}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Title */}
              {partial.title && (
                <div>
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="text-sm font-medium">{partial.title}</p>
                </div>
              )}

              {/* Description */}
              {partial.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm text-foreground/80">{partial.description}</p>
                </div>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap gap-3 text-xs">
                {partial.priority && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {PRIORITY_LABEL[partial.priority] ?? partial.priority}
                  </span>
                )}
                {partial.dueDate && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    Due {partial.dueDate}
                  </span>
                )}
                {partial.estimatedMinutes != null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    ~{minutesToDisplay(partial.estimatedMinutes)}
                  </span>
                )}
              </div>

              {/* Tags */}
              {partial.tags && partial.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {partial.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Checklist */}
              {partial.checklistItems && partial.checklistItems.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Checklist</p>
                  <ul className="space-y-1">
                    {partial.checklistItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm">
                        <span className="mt-0.5 text-primary">•</span>
                        <span>{item.text}</span>
                        {item.mandatory && (
                          <span
                            className="ml-auto text-[10px] text-muted-foreground"
                            title="Mandatory"
                          >
                            req
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!isStreaming && (
                <div className="flex gap-2 pt-1 border-t border-border">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApply}
                    className="gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    Use this draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDiscard}
                  >
                    Regenerate
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
