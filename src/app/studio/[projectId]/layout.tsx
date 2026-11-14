import { Suspense } from "react";
import { StudioWorkspace } from "@/components/studio/workspace";

/**
 * Studio content comes from IndexedDB in the browser, so there is nothing
 * useful to prerender per project; opt out of instant-navigation validation.
 */
export const instant = false;

function Loading() {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening song…</div>;
}

export default function StudioLayout({ children }: LayoutProps<"/studio/[projectId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <StudioWorkspace>{children}</StudioWorkspace>
    </Suspense>
  );
}
