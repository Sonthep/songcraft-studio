import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectsView } from "@/components/project/projects-view";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ProjectsView />
    </Suspense>
  );
}
