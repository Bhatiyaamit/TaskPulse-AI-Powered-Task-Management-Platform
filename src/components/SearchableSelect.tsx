import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show search box. Defaults to true when options.length > 6. */
  showSearch?: boolean;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  /** Associates the trigger with `<Label htmlFor="…">`. */
  id?: string;
}

type PanelPos = { top: number; left: number; width: number; maxH: number };

function computePanelMaxHeight(triggerBottom: number) {
  const margin = 12;
  return Math.max(120, window.innerHeight - triggerBottom - margin);
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  showSearch,
  disabled = false,
  className,
  emptyMessage = "No results found.",
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<PanelPos>({
    top: 0,
    left: 0,
    width: 0,
    maxH: 220,
  });

  const shouldShowSearch = showSearch ?? options.length > 6;
  const selectedOption = options.find((o) => o.value === value);
  const isPlaceholder = !selectedOption;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const positionPanel = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    setPanelPos({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxH: computePanelMaxHeight(r.bottom + gap),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
    const onMove = () => positionPanel();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, positionPanel]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch("");
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
  }

  const panel = open && (
    <div
      ref={panelRef}
      className="fixed z-10000 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
      style={{
        top: panelPos.top,
        left: panelPos.left,
        width: Math.max(panelPos.width, 0),
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      {shouldShowSearch && (
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

      <div
        className="overflow-y-auto p-1"
        style={{ maxHeight: Math.min(220, panelPos.maxH) }}
      >
        {filtered.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          filtered.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => select(o.value)}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                o.value === value && "bg-accent/40",
              )}
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
  );

  return (
    <div className={cn("relative w-full", className)}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors outline-none select-none",
          "hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          isPlaceholder && "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
