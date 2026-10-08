import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-card shadow-card",
        interactive &&
          "transition-shadow duration-200 hover:shadow-card-hover hover:border-border-default",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-6 pt-6",
        (title || description) && "pb-4",
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="min-w-0 space-y-1">
          {title && (
            <h3 className="text-base leading-6 font-semibold tracking-[-0.025em] text-text-primary">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm leading-5 text-text-secondary">{description}</p>
          )}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
      {props.children}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border-subtle px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}
