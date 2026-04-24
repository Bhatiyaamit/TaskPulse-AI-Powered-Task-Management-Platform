import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskOption = { id: string; title: string };

interface SearchableTaskSelectProps {
  tasks: TaskOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableTaskSelect({
  tasks,
  value,
  onChange,
  placeholder = "Select a parent task…",
  disabled = false,
}: SearchableTaskSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = tasks.find((t) => t.id === value);

  const filtered = tasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 10);
    }
  }, [open]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background/40 py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none backdrop-blur focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground/70",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? selected.title : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              aria-label="Clear parent task"
              onClick={clear}
              className="flex size-4 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-lg bg-popover/90 text-popover-foreground shadow-lg ring-1 ring-foreground/12 backdrop-blur">
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="h-7 w-full rounded-md border border-input bg-background/40 px-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            <div
              role="option"
              aria-selected={!value}
              onClick={() => select("")}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <span className="flex-1">No parent task</span>
              {!value && <Check className="size-4 shrink-0" />}
            </div>

            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No tasks found.
              </p>
            ) : (
              filtered.map((t) => (
                <div
                  key={t.id}
                  role="option"
                  aria-selected={t.id === value}
                  onClick={() => select(t.id)}
                  className="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 leading-snug">{t.title}</span>
                  {t.id === value && (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
