import { forwardRef, useId, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Defaults to `password`. */
  type?: "password";
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ className, disabled, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [show, setShow] = useState(false);
    const [uncontrolledLen, setUncontrolledLen] = useState(0);

    const valueLen = useMemo(() => {
      const v = props.value;
      if (typeof v === "string") return v.length;
      return uncontrolledLen;
    }, [props.value, uncontrolledLen]);

    const shouldShowToggle = !disabled && valueLen >= 1;

    return (
      <div className="relative">
        <Input
          {...props}
          id={inputId}
          ref={ref}
          disabled={disabled}
          type={show ? "text" : "password"}
          className={cn("pr-10", className)}
          onChange={(e) => {
            setUncontrolledLen(e.currentTarget.value.length);
            props.onChange?.(e);
          }}
        />
        {shouldShowToggle ? (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
