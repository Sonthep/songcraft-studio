"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash, WholeWord } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, PageHeader, Panel, SimpleSelect } from "@/components/common/form";
import { RhymeFinder } from "./rhyme-finder";
import { useDictionaryStore } from "@/stores/dictionary-store";
import { customRhymeEntrySchema, type CustomRhymeEntry } from "@/lib/lyrics/custom-dictionary";
import { ISAN_WORDS } from "@/lib/lyrics/data/thai-words";
import { analyzeThaiWordForRhyme } from "@/lib/lyrics/rhyme-finder";
import { containsThai, thaiRhymeLabel } from "@/lib/lyrics/thai";
import { uid } from "@/lib/project/factory";

const VOWELS = ["", "a", "i", "ɯ", "u", "e", "ɛ", "o", "ɔ", "ɤ", "ia", "ɯa", "ua"] as const;
const CODAS = ["auto", "", "k", "t", "p", "m", "n", "ng", "j", "w"] as const;

function emptyEntry(word = ""): CustomRhymeEntry {
  return { id: uid("cr"), word, language: "th", group: "", vowel: "", long: false, coda: "auto", syllables: "", meaning: "", createdAt: Date.now() };
}

function EntryDialog({ entry, onClose }: { entry: CustomRhymeEntry; onClose: () => void }) {
  const upsert = useDictionaryStore((s) => s.upsert);
  const [e, setE] = useState<CustomRhymeEntry>(entry);
  const auto = containsThai(e.word) ? analyzeThaiWordForRhyme(e.word) : null;
  const set = (patch: Partial<CustomRhymeEntry>) => setE({ ...e, ...patch });

  async function save() {
    const parsed = customRhymeEntrySchema.safeParse(e);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid entry");
      return;
    }
    await upsert(parsed.data);
    toast.success(`Saved “${parsed.data.word}”`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom dictionary entry</DialogTitle>
          <DialogDescription>Override how a word is split and how it rhymes, or group words you consider rhymes.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Word" className="col-span-2">
            <Input value={e.word} maxLength={80} onChange={(ev) => set({ word: ev.target.value })} autoFocus />
          </Field>
          {auto && (
            <p className="col-span-2 text-xs text-muted-foreground">
              Automatic reading: {auto.syllables.map((s) => s.text).join("-")} → /{auto.syllables.map(thaiRhymeLabel).join(" | ")}/
            </p>
          )}
          <Field label="Language">
            <SimpleSelect value={e.language} onChange={(v) => set({ language: v as CustomRhymeEntry["language"] })} options={[{ value: "th", label: "Thai" }, { value: "isan", label: "Isan" }, { value: "en", label: "English" }]} />
          </Field>
          <Field label="Rhyme group (optional)" hint="Entries with the same group always count as rhymes.">
            <Input value={e.group} maxLength={60} onChange={(ev) => set({ group: ev.target.value })} placeholder="e.g. ออน-group" />
          </Field>
          <Field label="Syllable split (optional)" className="col-span-2" hint="Hyphen-separated, e.g. อุ-ดร">
            <Input value={e.syllables} maxLength={200} onChange={(ev) => set({ syllables: ev.target.value })} />
          </Field>
          <Field label="Final vowel override">
            <SimpleSelect value={e.vowel || "none"} onChange={(v) => set({ vowel: (v === "none" ? "" : v) as CustomRhymeEntry["vowel"] })} options={VOWELS.map((v) => ({ value: v || "none", label: v || "— automatic —" }))} />
          </Field>
          <Field label="Final consonant sound">
            <SimpleSelect value={e.coda || "open"} onChange={(v) => set({ coda: (v === "open" ? "" : v) as CustomRhymeEntry["coda"] })} options={CODAS.map((c) => ({ value: c || "open", label: c === "auto" ? "— automatic —" : c || "open (none)" }))} />
          </Field>
          <label className="col-span-2 flex items-center justify-between text-sm">
            Long vowel <Switch checked={e.long} onCheckedChange={(v) => set({ long: v })} disabled={!e.vowel} />
          </label>
          <Field label="Meaning / note" className="col-span-2">
            <Input value={e.meaning} maxLength={300} onChange={(ev) => set({ meaning: ev.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!e.word.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RhymesPage() {
  const { entries, load, remove, error } = useDictionaryStore();
  const [editing, setEditing] = useState<CustomRhymeEntry | null>(null);
  const [query, setQuery] = useState("อุดร");
  useEffect(() => void load(), [load]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader icon={WholeWord} title="Rhyme Finder" description="Thai, Isan and English rhymes by sound, with explanations. Add your own words and rhyme groups to the custom dictionary." />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Find rhymes">
            <RhymeFinder initialQuery={query} onPick={(w) => setQuery(w)} />
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel
              title={`My dictionary (${entries.length})`}
              actions={<Button size="xs" onClick={() => setEditing(emptyEntry())}><Plus /> Add</Button>}
            >
              {error && <p className="text-xs text-destructive">{error}</p>}
              {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add words the analyser misreads, slang, Isan vocabulary, or groups of words you want treated as rhymes. Entries also affect syllables and rhyme colouring in the Lyrics Studio.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setQuery(e.word)}>
                        <span className="text-sm">{e.word}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {e.language}
                          {e.group && ` · group ${e.group}`}
                          {e.vowel && ` · /${e.vowel}${e.long ? "ː" : ""}${e.coda !== "auto" && e.coda ? ` ${e.coda}` : ""}/`}
                          {e.syllables && ` · ${e.syllables}`}
                        </span>
                      </button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Edit ${e.word}`} onClick={() => setEditing(e)}><Pencil /></Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Delete ${e.word}`} onClick={() => void remove(e.id)}><Trash /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Isan starter vocabulary">
              <p className="mb-2 text-[11px] text-muted-foreground">Common glosses; pronunciation and tone vary by province. Tones are estimated with Central Thai rules.</p>
              <ul className="grid grid-cols-1 gap-1 text-xs">
                {ISAN_WORDS.map((w) => (
                  <li key={w.word}>
                    <button type="button" className="hover:text-mint" onClick={() => setQuery(w.word)}>{w.word}</button>
                    <span className="text-muted-foreground"> — {w.meaning}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
      {editing && <EntryDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
