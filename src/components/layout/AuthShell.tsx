import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AuthShell({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <motion.div
        className={cn("relative z-10 w-full max-w-md", className)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="border-border/80 shadow-lg shadow-black/15">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto mb-1 grid place-items-center">
              <img
                src={"/logo.png"}
                alt="TaskPulse"
                className="h-14 w-auto select-none"
                draggable={false}
              />
            </div>
            <CardTitle className="font-heading text-2xl tracking-tight">
              {title}
            </CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {children}
            {footer ? <div className="pt-1">{footer}</div> : null}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
