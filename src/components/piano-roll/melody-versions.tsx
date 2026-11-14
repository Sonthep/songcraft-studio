"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcwClock, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectStore } from "@/stores/project-store";
import { uid } from "@/lib/project/factory";
import type { MelodyVersion } from "@/lib/project/schema";
import { relativeTime } from "@/components/project/project-list";

export function snapshotMelody(name: string, source: MelodyVersion["source"]) {
  const { project, update } = useProjectStore.getState();
  if (!project) return;
  const version: MelodyVersion = { id: uid("mv"), name, createdAt: Date.now(), source, notes: structuredClone(project.notes) };
  update((d) => {
    d.melodyVersions.unshift(version);
    if (d.melodyVersions.length > 200) d.melodyVersions.length = 200;
  });
}

export function MelodyVersions() {
  const project = useProjectStore((s) => s.project);
  const update = useProjectStore((s) => s.update);
  const [name, setName] = useState("");
  if (!project) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcwClock /> Versions ({project.melodyVersions.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <form
          className="flex gap-2 border-b border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            snapshotMelody(name.trim() || `Version ${project.melodyVersions.length + 1}`, "manual");
            setName("");
            toast.success("Melody version saved");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Version name" className="h-7" maxLength={120} aria-label="Version name" />
          <Button type="submit" size="sm" disabled={project.notes.length === 0}>
            Save
          </Button>
        </form>
        <ul className="scrollbar-thin max-h-72 overflow-y-auto p-1">
          {project.melodyVersions.length === 0 && <li className="p-3 text-xs text-muted-foreground">No saved versions yet.</li>}
          {project.melodyVersions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{v.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {v.notes.length} notes · {v.source} · {relativeTime(v.createdAt)}
                </div>
              </div>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  snapshotMelody(`Before restoring “${v.name}”`, "manual");
                  update((d) => void (d.notes = structuredClone(v.notes)));
                  toast.success(`Restored “${v.name}” (previous melody saved as a version)`);
                }}
              >
                Restore
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete version ${v.name}`}
                onClick={() => update((d) => void (d.melodyVersions = d.melodyVersions.filter((x) => x.id !== v.id)))}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
