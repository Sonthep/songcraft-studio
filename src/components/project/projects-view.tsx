"use client";

import { useSearchParams } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/common/form";
import { ProjectList } from "./project-list";
import { TOOL_LABELS, type StudioTool } from "@/components/shell/nav";

export function ProjectsView() {
  const params = useSearchParams();
  const tool = (params.get("tool") ?? "lyrics") as StudioTool;
  const label = TOOL_LABELS[tool];
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        icon={FolderOpen}
        title="Projects"
        description={label && params.get("tool") ? `Choose a song to open in ${label}.` : "Your songs are stored locally in this browser (IndexedDB). Export a project to back it up or move it."}
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-5">
        <ProjectList tool={label ? tool : "lyrics"} />
      </div>
    </div>
  );
}
