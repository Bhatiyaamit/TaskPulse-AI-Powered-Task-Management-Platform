import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { semanticTaskSearch } from "@/api/client";

export function AiTaskSearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounce the query for the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const { data: results, isLoading, isError } = useQuery({
    queryKey: ["semanticSearch", debouncedQuery],
    queryFn: () => semanticTaskSearch(debouncedQuery),
    enabled: debouncedQuery.trim().length > 0 && isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center border-b border-border px-3">
          <Sparkles className="mr-2 size-5 text-indigo-500 shrink-0" />
          <input
            ref={inputRef}
            className="flex h-14 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search tasks using AI (e.g. 'urgent marketing bugs')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          <button 
            onClick={onClose}
            className="ml-2 shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Type naturally to find semantically related tasks.
            </div>
          )}

          {query.trim() && isLoading && !results && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Searching with AI...
            </div>
          )}

          {query.trim() && isError && (
            <div className="p-6 text-center text-sm text-destructive">
              Failed to perform search. Please try again.
            </div>
          )}

          {results && results.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No tasks found.
            </div>
          )}

          {results && results.length > 0 && (
            <div className="flex flex-col gap-1">
              {results.map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    navigate(`/tasks/${task.id}`);
                    onClose();
                  }}
                  className="flex flex-col items-start gap-1 rounded-lg px-4 py-3 text-left hover:bg-muted transition-colors"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium">{task.title}</span>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {(task.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  {task.description && (
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground w-full">
                      {task.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
