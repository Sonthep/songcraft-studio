"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, Info, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LabeledSlider, PageHeader, Panel } from "@/components/common/form";
import { useAIStatus, fetchAIStatus } from "@/hooks/use-ai";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type UserSettings } from "@/lib/settings";
import { setMix } from "@/lib/audio/transport-actions";
import { DB_NAME, resetDbConnection } from "@/lib/persistence/db";
import { exportProject, repository } from "@/lib/persistence/repository";
import { downloadBlob } from "@/lib/export/text";

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["Home", "Stop and return to start"],
  ["M", "Metronome on/off"],
  ["L", "Loop on/off"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Shift + Z, Ctrl + Y", "Redo"],
  ["Ctrl/⌘ + S", "Save now"],
  ["B / V", "Piano Roll: draw / select tool"],
  ["Delete", "Piano Roll: delete selected notes"],
  ["Ctrl/⌘ + C / X / V / D", "Piano Roll: copy / cut / paste at playhead / duplicate"],
  ["Ctrl/⌘ + A", "Piano Roll: select all"],
  ["↑ ↓ (Shift = octave)", "Piano Roll: transpose selection"],
  ["← →", "Piano Roll: nudge selection by grid"],
  ["Q", "Piano Roll: quantize"],
  ["Right-click note", "Piano Roll: delete note"],
  ["Ctrl/⌘ + wheel", "Piano Roll: horizontal zoom"],
  ["Enter / Backspace / ↑ ↓", "Lyrics: new line / merge with previous / move between lines"],
];

export function SettingsPage() {
  const ai = useAIStatus();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void (async () => {
      if (!navigator.storage?.estimate) return;
      const est = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, []);

  async function change(patch: Partial<UserSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setMix({ master: next.masterVolume, melody: next.melodyVolume, chords: next.chordVolume, metronome: next.metronomeVolume });
    try {
      await saveSettings(next);
    } catch {
      toast.error("Could not save settings.");
    }
  }

  async function backupAll() {
    const list = await repository.list();
    const all = [];
    for (const s of list) {
      const p = await repository.get(s.id);
      if (p) all.push(exportProject(p));
    }
    downloadBlob(new Blob([JSON.stringify({ format: "songcraft-backup", version: 1, exportedAt: Date.now(), projects: all }, null, 2)], { type: "application/json" }), `songcraft-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function wipe() {
    resetDbConnection();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
    try {
      localStorage.removeItem("songcraft:lastProject");
      localStorage.removeItem("songcraft:layout");
    } catch {
      /* ignore */
    }
    toast.success("All local data deleted");
    // Full reload so every in-memory store starts from the now-empty database.
    setTimeout(() => window.location.reload(), 400);
  }

  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader icon={Settings} title="Settings" />
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3 md:p-4">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
          <Panel title="AI provider">
            {ai?.configured ? (
              <p className="flex items-center gap-2 text-sm"><CircleCheck className="size-4 text-mint" /> {ai.provider} · {ai.model}</p>
            ) : (
              <p className="flex items-start gap-2 text-sm"><Info className="mt-0.5 size-4 text-violet" /> {ai?.reason ?? "Checking…"}</p>
            )}
            <div className="mt-3 rounded-md bg-background/60 p-2.5 font-mono text-xs">
              # .env.local (server only — never exposed to the browser)
              <br />ANTHROPIC_API_KEY=sk-ant-…
              <br /># optional: ANTHROPIC_MODEL=claude-opus-5-5
              <br /># optional: AI_PROVIDER=anthropic | none
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Restart the dev server after changing environment variables. AI features: lyrics assistant, coach, flow ideas, melody plans, Suno refinement.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void fetchAIStatus(true).then(() => window.location.reload())}>Re-check</Button>
          </Panel>
          <Panel title="Playback defaults">
            <div className="flex flex-col gap-3">
              <LabeledSlider label="Master" value={settings.masterVolume} onChange={(v) => void change({ masterVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <LabeledSlider label="Melody" value={settings.melodyVolume} onChange={(v) => void change({ melodyVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <LabeledSlider label="Chords" value={settings.chordVolume} onChange={(v) => void change({ chordVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <LabeledSlider label="Metronome" value={settings.metronomeVolume} onChange={(v) => void change({ metronomeVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <LabeledSlider label="Autosave delay" value={settings.autosaveDelayMs} min={300} max={5000} step={100} onChange={(v) => void change({ autosaveDelayMs: v })} format={(v) => `${(v / 1000).toFixed(1)} s`} />
              <p className="text-[11px] text-muted-foreground">Saved in this browser and applied when a song opens.</p>
            </div>
          </Panel>
          <Panel title="Storage">
            <p className="text-sm">
              Mode: <span className="text-mint">Local-first</span> (IndexedDB in this browser).
            </p>
            {storage && (
              <p className="mt-1 text-xs text-muted-foreground">
                Using {mb(storage.usage)} of ~{mb(storage.quota)} · {storage.persisted ? "persistent storage granted" : "browser may evict data under storage pressure"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {storage && !storage.persisted && (
                <Button size="sm" variant="outline" onClick={async () => { const ok = await navigator.storage.persist?.(); toast(ok ? "Persistent storage granted" : "The browser declined persistent storage"); setStorage((s) => (s ? { ...s, persisted: !!ok } : s)); }}>
                  Request persistent storage
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void backupAll()}>Back up all projects (.json)</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">Delete all local data</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                    <AlertDialogDescription>All songs, recordings, your custom rhyme dictionary and settings in this browser will be permanently deleted.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void wipe()}>Delete everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cloud sync (Supabase) is not enabled in this build. The database schema with row-level security is in <code>supabase/migrations</code>; see the README.
            </p>
          </Panel>
          <Panel title="Keyboard shortcuts">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt><kbd className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd></dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
