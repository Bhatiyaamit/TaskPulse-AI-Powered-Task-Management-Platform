import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

interface SearchableFilterSelectProps {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  allValue?: string;
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  showSearch?: boolean;
  className?: string;
}

export function SearchableFilterSelect({
  options,
  value,
  onChange,
  allValue = "__all__",
  allLabel = "All",
  placeholder,
  disabled = false,
  showSearch = true,
  className,
}: SearchableFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isAll = !value || value === allValue;
  const selectedLabel = isAll
    ? null
    : options.find((o) => o.value === value)?.label;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
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
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          isAll && "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedLabel ?? placeholder ?? allLabel}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 z-9999 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {showSearch && (
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-7 w-full rounded-md border border-input bg-background/60 py-1 pr-2.5 pl-7 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/40"
                />
              </div>
            </div>
          )}

          <div className="max-h-[260px] overflow-y-auto p-1">
            <div
              role="option"
              aria-selected={isAll}
              onClick={() => select(allValue)}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span className="min-w-0 flex-1 text-muted-foreground">
                {allLabel}
              </span>
              {isAll && <Check className="size-4 shrink-0 text-primary" />}
            </div>

            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No results found.
              </p>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => select(o.value)}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && (
                    <Check className="size-4 shrink-0 text-primary" />
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
