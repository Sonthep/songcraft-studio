"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, EllipsisVertical, FolderOpen, Pencil, Search, Trash, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, SimpleSelect } from "@/components/common/form";
import { NewProjectDialog } from "./new-project-dialog";
import { exportProject, parseProjectImport, repository, type ProjectSummary } from "@/lib/persistence/repository";
import { keyLabel } from "@/lib/music/theory";
import { LANGUAGE_LABELS } from "@/lib/project/schema";
import { downloadBlob, safeFilename } from "@/lib/export/text";
import { cn } from "@/lib/utils";

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}

export function useProjectSummaries() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setItems(await repository.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    repository
      .list()
      .then((list) => alive && setItems(list))
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { items, error, reload };
}

export function ProjectList({ tool = "lyrics", limit, compact = false }: { tool?: string; limit?: number; compact?: boolean }) {
  const router = useRouter();
  const { items, error, reload } = useProjectSummaries();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const genres = Array.from(new Set((items ?? []).map((p) => p.genre))).sort();
  const filtered = (items ?? [])
    .filter((p) => genre === "all" || p.genre === genre)
    .filter((p) => !query.trim() || `${p.title} ${p.mood} ${p.genre}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, limit ?? Infinity);

  async function onDuplicate(p: ProjectSummary) {
    try {
      const copy = await repository.duplicate(p.id);
      toast.success(`Duplicated as “${copy.title}” (recordings are not copied)`);
      await reload();
    } catch (err) {
      toast.error(`Duplicate failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onExport(p: ProjectSummary) {
    const full = await repository.get(p.id);
    if (!full) return;
    downloadBlob(new Blob([JSON.stringify(exportProject(full), null, 2)], { type: "application/json" }), `${safeFilename(full.title)}.songcraft.json`);
  }

  async function onRename() {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title) return;
    const full = await repository.get(renaming.id);
    if (full) await repository.save({ ...full, title });
    setRenaming(null);
    await reload();
  }

  async function onDelete() {
    if (!deleting) return;
    await repository.remove(deleting.id);
    try {
      if (localStorage.getItem("songcraft:lastProject") === deleting.id) localStorage.removeItem("songcraft:lastProject");
    } catch {
      /* ignore */
    }
    toast.success(`Deleted “${deleting.title}”`);
    setDeleting(null);
    await reload();
  }

  async function onImport(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Project file is too large (limit 20 MB).");
      return;
    }
    try {
      const json = JSON.parse(await file.text());
      const project = parseProjectImport(json);
      await repository.save(project);
      toast.success(`Imported “${project.title}”`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  }

  if (items === null) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading projects…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search songs" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search songs" />
          </div>
          <SimpleSelect
            className="w-44"
            value={genre}
            onChange={setGenre}
            ariaLabel="Filter by genre"
            options={[{ value: "all", label: "All genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </Button>
          <NewProjectDialog tool={tool} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">Storage error: {error}</p>}
      {filtered.length === 0 ? (
        <EmptyState icon={FolderOpen} title={items.length ? "No songs match" : "No songs yet"} action={!items.length ? <NewProjectDialog tool={tool} /> : undefined}>
          {items.length ? "Try a different search or genre filter." : "Create your first song to start writing lyrics, melodies and flows. Everything is saved in this browser."}
        </EmptyState>
      ) : (
        <ul className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3")}>
          {filtered.map((p) => (
            <li key={p.id} className="group relative flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-mint/40">
              <Link href={`/studio/${p.id}/${tool}`} className="min-w-0 flex-1 focus-visible:outline-none">
                <span className="absolute inset-0 rounded-lg group-has-[a:focus-visible]:ring-2 group-has-[a:focus-visible]:ring-ring" aria-hidden />
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-normal">{p.genre}</Badge>
                  <span>{keyLabel(p.key, p.scale)}</span>
                  <span>·</span>
                  <span className="tabular">{p.bpm} BPM</span>
                  <span>·</span>
                  <span>{LANGUAGE_LABELS[p.language]}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-muted-foreground/80">
                  {p.lineCount} lines · {p.noteCount} notes · {p.takeCount} audio · edited {relativeTime(p.updatedAt)}
                </div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Actions for ${p.title}`}>
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => router.push(`/studio/${p.id}/${tool}`)}>
                    <FolderOpen /> Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenaming(p);
                      setRenameValue(p.title);
                    }}
                  >
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void onDuplicate(p)}>
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void onExport(p)}>
                    <Download /> Export project (.json)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}>
                    <Trash /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onRename();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Rename song</DialogTitle>
            </DialogHeader>
            <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={160} aria-label="Song title" />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the song, its lyrics and melody versions, and its recordings from this browser. Export it first if you may need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
