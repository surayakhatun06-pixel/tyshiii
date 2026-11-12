import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bookmark,
  Compass,
  Flame,
  History,
  Home,
  LogIn,
  Play,
  Search,
} from "lucide-react";

import { AnnouncementsPopover } from "@/components/announcements-popover";
import { HeaderSearch } from "@/components/header-search";
import { SettingsPanel } from "@/components/settings-panel";
import { useAppearance } from "@/hooks/use-appearance";
import { useBackdropValue } from "@/hooks/use-backdrop";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { recordSiteVisit, startPresence } from "@/lib/public-activity";
import {
  DEFAULT_FOOTER_TEXT,
  onFooterTextUpdate,
  readFooterText,
} from "@/lib/site-footer";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  {
    to: "/browse",
    label: "Trending",
    icon: Flame,
    search: { sort: "TRENDING_DESC" },
  },
  { to: "/browse", label: "Browse", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/watch", label: "My videos", icon: Play },
  { to: "/watchlist", label: "My list", icon: Bookmark },
  { to: "/history", label: "History", icon: History },
] as const;

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[5], NAV[6]] as const;

const railItem =
  "grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-surface-2/70 hover:text-foreground";
const railActive =
  "bg-foreground/10 text-foreground hover:bg-foreground/15 hover:text-foreground";

/**
 * The art behind the top of a page (details and watch pages). It fades out smoothly into the
 * plain dark page colour, so there is one tone and no hard edge. Home has no ambient art:
 * its hero is the art, running full-width under the sidebar and top bar.
 */
function AmbientBackdrop() {
  const art = useBackdropValue();
  const { blackEverywhere } = useAppearance();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (art) setShown(art);
  }, [art]);
  const fade =
    "linear-gradient(to bottom, black 0%, black 40%, transparent 100%)";
  if (blackEverywhere)
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-black/84"
      />
    );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80vh] min-h-[420px] overflow-hidden"
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      {shown && (
        <img
          src={shown}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-opacity duration-1000",
            art ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 bg-linear-to-r from-background/70 via-transparent to-transparent" />
    </div>
  );
}

type NavItem = (typeof NAV)[number];
type Loc = { pathname: string; search: unknown };

/**
 * Which sidebar button is lit. Trending and Browse are the same page with a different sort,
 * so the sort in the address decides between them; "/watch" must not light up on "/watchlist".
 */
function isActive(item: NavItem, loc: Loc) {
  const path = loc.pathname.replace(/\/+$/, "") || "/";
  const sort = (loc.search as { sort?: string } | undefined)?.sort;
  if (item.label === "Trending")
    return path === "/browse" && sort === "TRENDING_DESC";
  if (item.label === "Browse")
    return path === "/browse" && sort !== "TRENDING_DESC";
  if (item.to === "/") return path === "/";
  return path === item.to || path.startsWith(`${item.to}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      search={
        item.label === "Trending"
          ? ({ sort: "TRENDING_DESC" } as never)
          : undefined
      }
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(railItem, active && railActive)}
    >
      <Icon className="size-6" />
    </Link>
  );
}

/**
 * Page frame: a slim icon rail on the left, a search bar across the top, content to
 * the right. `overlay` lets a page (home, details) slide its banner under the top bar.
 */
export function SiteShell({
  children,
  overlay = false,
}: {
  children: ReactNode;
  overlay?: boolean;
}) {
  const location = useRouterState({ select: (st) => st.location });
  const isWatchPage = /^\/anime\/[^/]+\/watch\/?$/.test(location.pathname);
  const isAdmin = useIsAdmin();
  const [footerText, setFooterText] = useState(DEFAULT_FOOTER_TEXT);

  useEffect(() => {
    void recordSiteVisit().catch(() => undefined);
    // Start the "watching now" heartbeat a little later so it never competes with first paint.
    const t = window.setTimeout(() => {
      stop = startPresence();
    }, 4000);
    let stop: (() => void) | undefined;
    return () => {
      window.clearTimeout(t);
      stop?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const stop = onFooterTextUpdate(setFooterText);
    void readFooterText()
      .then((text) => {
        if (active && text !== null) setFooterText(text);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop();
    };
  }, []);

  return (
    <div className="site-app-shell relative isolate min-h-screen min-h-dvh bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[60px]">
      <AmbientBackdrop />
      {/* Left rail (desktop) */}
      <aside className="site-desktop-rail fixed inset-y-0 left-0 z-50 hidden w-[60px] flex-col items-center gap-1 bg-transparent py-3 md:flex">
        <Link
          to="/"
          aria-label="TYSHI ZONE home"
          className="mb-3 grid size-12 place-items-center"
        >
          <img
            src="/favicon.svg"
            alt=""
            width={48}
            height={48}
            className="size-12 object-contain drop-shadow-[0_0_6px_rgb(255_255_255/0.25)]"
          />
        </Link>
        {NAV.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            active={isActive(item, location)}
          />
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <SettingsPanel />
          {isAdmin && (
            <Link
              to="/admin"
              aria-label="Admin"
              title="Admin"
              className={railItem}
            >
              <LogIn className="size-6" />
            </Link>
          )}
        </div>
      </aside>

      {/* Top bar */}
      {/* Only the controls float here: no bar behind them, so nothing blurs while you scroll. */}
      <header className="site-header pointer-events-none fixed inset-x-0 top-0 z-40 md:left-[60px]">
        <div className="pointer-events-none relative flex h-12 items-center gap-2 px-3 md:h-14 md:gap-3 md:px-8 [&>*]:pointer-events-auto">
          <Link
            to="/"
            className={cn(
              "grid shrink-0 place-items-center md:hidden",
              isWatchPage ? "size-7" : "size-8",
            )}
            aria-label="TYSHI ZONE home"
          >
            <img
              src="/favicon.svg"
              alt=""
              width={isWatchPage ? 28 : 32}
              height={isWatchPage ? 28 : 32}
              className="size-full object-contain"
            />
          </Link>

          <div
            className={cn(
              "mx-auto min-w-0 max-w-none flex-1 md:mx-0 md:max-w-none md:flex-1",
              isWatchPage && "mx-0",
              !isWatchPage && "md:mx-auto md:max-w-[448px]",
            )}
          >
            <HeaderSearch shrink={isWatchPage} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
            <SettingsPanel side="bottom" />
          </div>
          <AnnouncementsPopover />
        </div>
      </header>

      <main className={cn("site-main", !overlay && "pt-12 md:pt-14")}>
        {children}
      </main>

      <footer className="mt-16 border-t border-border/60 px-4 py-10 text-xs leading-relaxed text-muted-foreground md:px-8">
        <p className="max-w-3xl whitespace-pre-line">
          {footerText.replace("© 2026", `© ${new Date().getFullYear()}`)}
        </p>
      </footer>

      {/* Bottom bar (phones): small, icons only, plain background */}
      <nav
        aria-label="Main"
        className="site-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/50 bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-12 grid-cols-6 items-center">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, location);
            return (
              <Link
                key={item.label}
                to={item.to}
                search={
                  item.label === "Trending"
                    ? ({ sort: "TRENDING_DESC" } as never)
                    : undefined
                }
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className="grid h-12 place-items-center"
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-lg transition-colors",
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
