"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, SimpleSelect } from "@/components/common/form";
import {
  GENRE_OPTIONS,
  KEY_OPTIONS,
  LANGUAGE_OPTIONS,
  SCALE_OPTIONS,
  TIME_SIGNATURE_OPTIONS,
  parseTimeSignature,
} from "@/components/common/music-options";
import { createProject } from "@/lib/project/factory";
import { repository } from "@/lib/persistence/repository";
import type { Language } from "@/lib/project/schema";
import type { ScaleName } from "@/lib/music/theory";

export function NewProjectDialog({ tool = "lyrics", trigger }: { tool?: string; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("R&B");
  const [mood, setMood] = useState("");
  const [language, setLanguage] = useState<Language>("th");
  const [bpm, setBpm] = useState("80");
  const [key, setKey] = useState("9");
  const [scale, setScale] = useState<ScaleName>("minor");
  const [ts, setTs] = useState("4/4");
  const [starter, setStarter] = useState(true);

  const bpmNum = Number(bpm);
  const bpmValid = Number.isFinite(bpmNum) && bpmNum >= 30 && bpmNum <= 300;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bpmValid) return;
    setBusy(true);
    try {
      const t = parseTimeSignature(ts);
      const project = createProject({
        title: title || "Untitled Song",
        genre,
        mood,
        language,
        bpm: bpmNum,
        key: Number(key),
        scale,
        numerator: t.numerator,
        denominator: t.denominator,
        withStarterChords: starter,
      });
      await repository.save(project);
      setOpen(false);
      router.push(`/studio/${project.id}/${tool}`);
    } catch (err) {
      toast.error(`Could not create project: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New song
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New song</DialogTitle>
            <DialogDescription>All of these can be changed later in the inspector.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="np-title">
            <Input id="np-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled Song" maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Genre">
              <SimpleSelect value={genre} onChange={setGenre} options={GENRE_OPTIONS} ariaLabel="Genre" />
            </Field>
            <Field label="Language">
              <SimpleSelect value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} ariaLabel="Language" />
            </Field>
            <Field label="Mood" htmlFor="np-mood" className="col-span-2">
              <Input id="np-mood" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Heartbroken, intimate, melancholic" maxLength={120} />
            </Field>
            <Field label="BPM" htmlFor="np-bpm">
              <Input id="np-bpm" type="number" min={30} max={300} value={bpm} onChange={(e) => setBpm(e.target.value)} aria-invalid={!bpmValid} />
            </Field>
            <Field label="Time signature">
              <SimpleSelect value={ts} onChange={setTs} options={TIME_SIGNATURE_OPTIONS} ariaLabel="Time signature" />
            </Field>
            <Field label="Key">
              <SimpleSelect value={key} onChange={setKey} options={KEY_OPTIONS} ariaLabel="Key" />
            </Field>
            <Field label="Scale">
              <SimpleSelect value={scale} onChange={setScale} options={SCALE_OPTIONS} ariaLabel="Scale" />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span>
              Start with a chord loop
              <span className="block text-xs text-muted-foreground">vi–IV–I–V in the chosen key (editable in Chord Studio)</span>
            </span>
            <Switch checked={starter} onCheckedChange={setStarter} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !bpmValid}>
              {busy ? "Creating…" : "Create song"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
