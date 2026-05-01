import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoleNameComboboxRole = {
  id: string;
  name: string;
  level: number;
  departmentId: string | null;
  matrixSelections: { module: string; action: string }[];
  /** Used to pick a single row when several roles share the same display name. */
  createdAt?: string;
};

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  roles: RoleNameComboboxRole[];
  onPickRole?: (role: RoleNameComboboxRole) => void;
  onClear?: () => void;
  error?: string;
  className?: string;
};

const MAX_SUGGESTIONS = 50;

export function RoleNameCombobox({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  placeholder,
  roles,
  onPickRole,
  onClear,
  error,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  /** Filters the dropdown list only; role name `value` stays in the main field. */
  const [listQuery, setListQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const showClear = Boolean(!disabled && value.trim());

  useEffect(() => {
    if (!open) setListQuery("");
  }, [open]);

  const displayed = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return roles.slice(0, MAX_SUGGESTIONS);
    return roles
      .filter((r) => r.name.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [roles, listQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hasError = Boolean(error);
  const canToggleList = !disabled && roles.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-background/40 text-sm shadow-none backdrop-blur transition-colors outline-none dark:bg-input/30",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/60",
          disabled && "cursor-not-allowed opacity-50",
          hasError &&
            "border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:border-destructive/50",
        )}
      >
        <input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            onBlur?.();
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-invalid={hasError || undefined}
          role="combobox"
          className="min-h-0 min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:ring-0 disabled:cursor-not-allowed md:text-sm"
        />
        <div className="flex shrink-0 items-center gap-0.5 pr-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4">
          {showClear ? (
            <button
              type="button"
              tabIndex={-1}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear role name"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                onClear?.();
                setListQuery("");
                setOpen(true);
              }}
            >
              <X className="size-3.5" strokeWidth={2.25} />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            disabled={!canToggleList}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
              canToggleList && "hover:bg-muted hover:text-foreground",
              !canToggleList && "cursor-default opacity-40",
            )}
            aria-label={open ? "Close role list" : "Open role list"}
            onMouseDown={(e) => {
              e.preventDefault();
              if (!canToggleList) return;
              setOpen((o) => !o);
            }}
          >
            {open ? (
              <ChevronUpIcon className="text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
      {open && !disabled && roles.length > 0 ? (
        <div className="absolute z-50 mt-1 flex max-h-60 w-full flex-col overflow-hidden rounded-lg border border-border bg-popover/80 text-popover-foreground shadow-lg ring-1 ring-foreground/12 backdrop-blur">
          <div className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-popover/95 p-2 backdrop-blur">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                onMouseDown={(e) => e.preventDefault()}
                placeholder="Search roles…"
                autoComplete="off"
                className="h-8 w-full rounded-md border border-input bg-background/80 py-1 pl-8 pr-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Search roles"
              />
            </div>
          </div>
          <ul
            className="min-h-0 flex-1 overflow-y-auto py-0"
            role="listbox"
            aria-label="Role suggestions"
          >
            {displayed.length === 0 ? (
              <li
                className="px-3 py-2 text-sm text-muted-foreground"
                role="presentation"
              >
                No matches — adjust search or type a new role name above (set
                permissions below).
              </li>
            ) : (
              displayed.map((r) => (
                <li key={r.id} role="presentation">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    role="option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(r.name);
                      onPickRole?.(r);
                      setListQuery("");
                      setOpen(false);
                    }}
                  >
                    {r.name}
                    {r.level > 0 ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        L{r.level}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
