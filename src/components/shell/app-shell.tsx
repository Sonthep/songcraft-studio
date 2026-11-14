"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { useClientValue } from "@/hooks/use-client-value";
import { Menu, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LAST_PROJECT_KEY, PRIMARY_NAV, TOOL_NAV, toolHref, type NavItem } from "./nav";

function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function useCurrentProjectId(): string | null {
  const params = useParams<{ projectId?: string }>();
  const last = useClientValue(readLastProject, null, subscribeStorage);
  return params?.projectId ?? last;
}

function resolveHref(item: NavItem, projectId: string | null) {
  return item.href ?? toolHref(projectId, item.tool!);
}

function isActive(item: NavItem, pathname: string) {
  if (item.href) return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return !!item.tool && pathname.startsWith("/studio/") && pathname.split("/")[3] === item.tool;
}

/** URL-dependent hooks must render inside Suspense when Cache Components is enabled. */
function NavLinks(props: { compact: boolean; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<div className="h-96" aria-hidden />}>
      <NavLinksInner {...props} />
    </Suspense>
  );
}

function NavLinksInner({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const projectId = useCurrentProjectId();
  const render = (item: NavItem) => {
    const active = isActive(item, pathname);
    const Icon = item.icon;
    const link = (
      <Link
        key={item.label}
        href={resolveHref(item, projectId)}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          compact && "justify-center px-0",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active ? "text-mint" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
        {!compact && <span className="truncate">{item.label}</span>}
      </Link>
    );
    if (!compact) return link;
    return (
      <Tooltip key={item.label}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {PRIMARY_NAV.map(render)}
      <div className={cn("mt-4 mb-1 px-2.5 text-[11px] font-medium tracking-wide text-sidebar-foreground/40 uppercase", compact && "sr-only")}>
        Tools
      </div>
      {compact && <div className="my-2 h-px bg-sidebar-border" />}
      {TOOL_NAV.map(render)}
    </nav>
  );
}

function Brand({ compact }: { compact: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 px-2.5 py-3", compact && "justify-center px-0")}>
      <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-mint/90 to-violet/80 text-primary-foreground">
        <AudioLines className="size-4" />
      </span>
      {!compact && (
        <span className="text-sm font-semibold tracking-tight">
          SongCraft <span className="text-muted-foreground font-normal">Studio</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Desktop rail: icons on md, labels on xl */}
      <aside className="hidden w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 md:flex xl:hidden">
        <Brand compact />
        <div className="scrollbar-thin flex-1 overflow-y-auto pb-3">
          <NavLinks compact />
        </div>
      </aside>
      <aside className="hidden w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 xl:flex">
        <Brand compact={false} />
        <div className="scrollbar-thin flex-1 overflow-y-auto pb-3">
          <NavLinks compact={false} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Brand compact={false} />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="top-0 left-0 h-dvh max-w-72 translate-x-0 translate-y-0 rounded-none border-r p-3 sm:max-w-72">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <Brand compact={false} />
          <NavLinks compact={false} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
