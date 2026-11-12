import { type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/** The admin is one page with a few views, picked by ?view=. No view = the hub. */
export type AdminView = "universal" | "more" | "episodes" | "library" | "spotlight" | "new" | "details" | "bulk" | "servers" | "announcements";
export type AdminSearch = { view?: AdminView; anime?: number; from?: number };

export const inputCls =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";

export const panel = "rounded-2xl border border-border bg-surface/60 p-4 md:p-5";

export function AdminLink({
  s,
  className,
  children,
  ...rest
}: {
  s: AdminSearch;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <Link to="/admin" search={s as never} className={className} {...rest}>
      {children}
    </Link>
  );
}

export function useAdminNav() {
  const navigate = useNavigate();
  return (s: AdminSearch, replace = false) => void navigate({ to: "/admin", search: s as never, replace });
}

/** Back arrow + title for every view except the hub. */
export function AdminHeader({
  title,
  subtitle,
  back = {},
  right,
}: {
  title: string;
  subtitle?: string;
  back?: AdminSearch;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mb-5 flex items-start gap-3">
      {/* Goes back to where you were (for example the anime's admin page); the Overview is only the fallback. */}
      <Link
        to="/admin"
        search={back as never}
        aria-label="Back"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          if (router.history.canGoBack()) {
            e.preventDefault();
            router.history.back();
          }
        }}
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "warn" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] font-medium text-foreground/80",
        tone === "warn" && "bg-amber-500/15 text-amber-300",
        tone === "primary" && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </span>
  );
}

/* The title last opened, so the hub can offer "Continue". */
const LAST = "tyshi-admin-last";
export type LastOpened = { id: number; title: string; poster: string | null };

export function rememberOpened(v: LastOpened) {
  try {
    window.localStorage.setItem(LAST, JSON.stringify(v));
  } catch {
    /* not remembered */
  }
}

export function lastOpened(): LastOpened | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAST) ?? "null") as LastOpened | null;
    return v && Number.isSafeInteger(v.id) ? v : null;
  } catch {
    return null;
  }
}

/** Season-aware name for the next entry: "Show Season 2" -> "Show Season 3". */
export function nextSeasonTitle(title: string): string {
  const m = title.match(/(season\s*)(\d+)/i);
  if (m) return title.replace(m[0], `${m[1]}${Number(m[2]) + 1}`);
  const t = title.match(/(\d+)(st|nd|rd|th)(\s+season)/i);
  if (t) return title.replace(t[0], `${Number(t[1]) + 1}th${t[3]}`);
  return `${title} Season 2`;
}
