"use client";

import { useEffect, useState } from "react";
import { Download, Pause, Play, Trash, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Waveform } from "@/components/audio/waveform";
import { decodeBlob, useBlobPlayer } from "@/hooks/use-blob-player";
import { deleteAudioAsset, extensionFor, loadAudioBlob, renameAudioAsset } from "@/lib/audio/assets";
import { downloadBlob, safeFilename } from "@/lib/export/text";
import { formatClock } from "@/lib/music/timing";
import type { AudioAsset } from "@/lib/project/schema";

/** One stored audio file: waveform, playback, rename, download, delete. */
export function TakeRow({
  asset,
  onPlayWithBacking,
  selected,
  onSelect,
}: {
  asset: AudioAsset;
  onPlayWithBacking?: (blob: Blob) => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [prevName, setPrevName] = useState(asset.name);
  if (prevName !== asset.name) {
    // Sync when the asset is renamed elsewhere (adjusting state during render).
    setPrevName(asset.name);
    setName(asset.name);
  }
  const player = useBlobPlayer(blob);
  useEffect(() => {
    let alive = true;
    loadAudioBlob(asset.id).then(async (b) => {
      if (!alive) return;
      if (!b) {
        setMissing(true);
        return;
      }
      setBlob(b);
      try {
        const buf = await decodeBlob(b);
        if (alive) setBuffer(buf);
      } catch {
        /* undecodable: keep playback via <audio> if possible */
      }
    });
    return () => {
      alive = false;
    };
  }, [asset.id]);

  return (
    <li className={`flex flex-col gap-2 rounded-md border p-2.5 ${selected ? "border-mint/60 bg-mint/5" : "border-border bg-panel"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" aria-label={player.playing ? `Pause ${asset.name}` : `Play ${asset.name}`} disabled={!blob} onClick={() => (player.playing ? player.pause() : void player.play())}>
          {player.playing ? <Pause /> : <Play />}
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== asset.name && renameAudioAsset(asset.id, name.trim())}
          className="h-7 max-w-64 text-sm"
          aria-label="Take name"
        />
        <span className="text-[11px] text-muted-foreground tabular">
          {asset.kind} · {formatClock(asset.durationSec)} · {(asset.sizeBytes / 1024).toFixed(0)} KB · {new Date(asset.createdAt).toLocaleString()}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onSelect && (
            <Button size="xs" variant={selected ? "secondary" : "ghost"} onClick={onSelect}>
              {selected ? "Selected" : "Select"}
            </Button>
          )}
          {onPlayWithBacking && blob && (
            <Button size="xs" variant="ghost" onClick={() => onPlayWithBacking(blob)}>
              <Music /> With backing
            </Button>
          )}
          <Button size="icon-xs" variant="ghost" aria-label="Download" disabled={!blob} onClick={() => blob && downloadBlob(blob, `${safeFilename(asset.name)}.${extensionFor(asset.mimeType)}`)}>
            <Download />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Delete">
                <Trash />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{asset.name}”?</AlertDialogTitle>
                <AlertDialogDescription>The audio is removed from this browser and can’t be restored with undo.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void deleteAudioAsset(asset.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {missing ? (
        <p className="text-xs text-amber-200">Audio data is missing (it may have been cleared from browser storage).</p>
      ) : (
        <Waveform buffer={buffer} height={48} playheadSec={player.time} onSeek={(s) => player.seek(s)} />
      )}
    </li>
  );
}
