import type { ReactNode } from "react";
import { Link } from "react-router";
import { Wordmark } from "@/app/components/logo";

export default function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-5 py-12">
      <Link to="/" className="mb-8">
        <Wordmark className="text-lg" />
      </Link>
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm">
        <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1.5 text-muted-foreground text-sm">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-muted-foreground text-sm">{footer}</div>}
    </div>
  );
}
